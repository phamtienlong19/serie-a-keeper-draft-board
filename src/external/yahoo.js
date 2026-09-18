const COMBINING_MARKS = /\p{Mark}+/gu;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/**
 * Name normalization is used only to bootstrap the persisted identity map.
 * Runtime enrichment joins by stable local/Yahoo IDs, never by this value.
 */
export function normalizePlayerName(name) {
  if (typeof name !== "string") return "";

  return name
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[’‘`ʻ]/g, "'")
    // Yahoo commonly punctuates initials (T.J., P.J.) while canonical draft
    // sheets do not. Removing periods also normalizes Jr. without dropping it.
    .replace(/\./g, "")
    .replace(/&/g, " and ")
    .replace(NON_ALPHANUMERIC, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bjunior$/, "jr")
    .replace(/\bthird$/, "iii");
}

function nullableString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extractRank(rawPlayer, rankType) {
  const rank = (rawPlayer.player_ranks ?? [])
    .map((entry) => entry?.player_rank)
    .find((entry) => entry?.rank_type === rankType);
  return nullableNumber(rank?.rank_value);
}

export function normalizeYahooPlayer(rawPlayer) {
  const analysis = rawPlayer?.draft_analysis ?? {};
  return {
    yahooPlayerId: nullableString(rawPlayer?.player_id),
    playerKey: nullableString(rawPlayer?.player_key),
    fullName: nullableString(rawPlayer?.name?.full),
    firstName: nullableString(rawPlayer?.name?.first),
    lastName: nullableString(rawPlayer?.name?.last),
    nbaTeamAbbreviation: nullableString(rawPlayer?.editorial_team_abbr),
    nbaTeamFullName: nullableString(rawPlayer?.editorial_team_full_name),
    displayPosition: nullableString(rawPlayer?.display_position),
    primaryPosition: nullableString(rawPlayer?.primary_position),
    eligiblePositions: (rawPlayer?.eligible_positions ?? [])
      .map((entry) => nullableString(entry?.position))
      .filter(Boolean),
    status: nullableString(rawPlayer?.status),
    statusFull: nullableString(rawPlayer?.status_full),
    injuryNote: nullableString(rawPlayer?.injury_note),
    headshotUrl: nullableString(rawPlayer?.headshot?.url ?? rawPlayer?.image_url),
    oRank: extractRank(rawPlayer ?? {}, "OR"),
    // The supplied snapshot contains ORank only. XRank must come from a future,
    // explicitly identified source rather than being inferred from ORank.
    xRank: extractRank(rawPlayer ?? {}, "XR") ?? extractRank(rawPlayer ?? {}, "XRank"),
    projectedAuctionValue: nullableNumber(rawPlayer?.projected_auction_value),
    averageAuctionCost: nullableNumber(rawPlayer?.average_auction_cost),
    averagePick: nullableNumber(analysis.average_pick),
    averageRound: nullableNumber(analysis.average_round),
    preseasonAveragePick: nullableNumber(analysis.preseason_average_pick),
    preseasonAverageRound: nullableNumber(analysis.preseason_average_round),
    percentDrafted: nullableNumber(analysis.percent_drafted),
  };
}

export function extractYahooPlayers(snapshot) {
  const playerEntries = snapshot?.fantasy_content?.league?.players;
  if (!Array.isArray(playerEntries)) {
    throw new TypeError("Yahoo snapshot does not contain fantasy_content.league.players[].");
  }

  return playerEntries
    .map((entry) => normalizeYahooPlayer(entry?.player))
    .sort((a, b) => {
      const aId = Number(a.yahooPlayerId);
      const bId = Number(b.yahooPlayerId);
      if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
      return (a.playerKey ?? "").localeCompare(b.playerKey ?? "");
    });
}

export function describeYahooSource(snapshot) {
  const rawPlayers = (snapshot?.fantasy_content?.league?.players ?? []).map((entry) => entry?.player ?? {});
  const rankTypes = [
    ...new Set(
      rawPlayers.flatMap((player) =>
        (player.player_ranks ?? []).map((entry) => entry?.player_rank?.rank_type).filter(Boolean),
      ),
    ),
  ].sort();

  const fieldChecks = {
    yahooPlayerId: (player) => player.player_id,
    playerKey: (player) => player.player_key,
    fullName: (player) => player.name?.full,
    firstName: (player) => player.name?.first,
    lastName: (player) => player.name?.last,
    nbaTeamAbbreviation: (player) => player.editorial_team_abbr,
    nbaTeamFullName: (player) => player.editorial_team_full_name,
    displayPosition: (player) => player.display_position,
    primaryPosition: (player) => player.primary_position,
    eligiblePositions: (player) => player.eligible_positions,
    status: (player) => player.status,
    statusFull: (player) => player.status_full,
    injuryNote: (player) => player.injury_note,
    headshotUrl: (player) => player.headshot?.url ?? player.image_url,
    oRank: (player) =>
      (player.player_ranks ?? []).find((entry) => entry?.player_rank?.rank_type === "OR")
        ?.player_rank?.rank_value,
    projectedAuctionValue: (player) => player.projected_auction_value,
    averageAuctionCost: (player) => player.average_auction_cost,
    averagePick: (player) => player.draft_analysis?.average_pick,
    averageRound: (player) => player.draft_analysis?.average_round,
    preseasonAveragePick: (player) => player.draft_analysis?.preseason_average_pick,
    preseasonAverageRound: (player) => player.draft_analysis?.preseason_average_round,
    percentDrafted: (player) => player.draft_analysis?.percent_drafted,
  };

  const fieldsFound = Object.entries(fieldChecks)
    .filter(([, getValue]) => rawPlayers.some((player) => getValue(player) !== undefined))
    .map(([field]) => field);

  return {
    provider: "Yahoo Fantasy",
    snapshotFile: "draft_analysis.json",
    gameKey: nullableString(snapshot?.fantasy_content?.league?.league_key?.split(".")[0]),
    season: nullableString(snapshot?.fantasy_content?.league?.season),
    playerCount: rawPlayers.length,
    rankTypes,
    fieldsFound,
  };
}

/**
 * Build the only name-based artifact in the integration. The returned map is
 * persisted, reviewed, and then used as an ID-to-ID runtime join.
 */
export function buildPlayerIdentityMap(teams, yahooPlayers) {
  const yahooByNormalizedName = new Map();
  for (const player of yahooPlayers) {
    const normalizedName = normalizePlayerName(player.fullName);
    if (!yahooByNormalizedName.has(normalizedName)) yahooByNormalizedName.set(normalizedName, []);
    yahooByNormalizedName.get(normalizedName).push(player);
  }

  const matches = [];
  const unresolved = [];
  const ambiguousMatches = [];

  for (const team of teams) {
    for (const localPlayer of team.priorDraft ?? []) {
      const normalizedName = normalizePlayerName(localPlayer.playerName);
      const candidates = yahooByNormalizedName.get(normalizedName) ?? [];
      const localIdentity = {
        playerId: localPlayer.playerId,
        playerName: localPlayer.playerName,
        normalizedName,
      };

      if (candidates.length === 1) {
        matches.push({
          ...localIdentity,
          yahooPlayerId: candidates[0].yahooPlayerId,
          yahooPlayerKey: candidates[0].playerKey,
          matchMethod: "NORMALIZED_NAME_EXACT",
        });
        continue;
      }

      const unresolvedEntry = {
        ...localIdentity,
        reason:
          candidates.length === 0
            ? "NO_EXACT_NORMALIZED_NAME_MATCH"
            : "AMBIGUOUS_EXACT_NORMALIZED_NAME_MATCH",
        candidates: candidates.map((candidate) => ({
          yahooPlayerId: candidate.yahooPlayerId,
          yahooPlayerKey: candidate.playerKey,
          fullName: candidate.fullName,
        })),
      };
      unresolved.push(unresolvedEntry);
      if (candidates.length > 1) ambiguousMatches.push(unresolvedEntry);
    }
  }

  return {
    schemaVersion: 1,
    source: "data/external/yahoo/players.json",
    matchMethod: "NORMALIZED_NAME_EXACT_BOOTSTRAP_ONLY",
    summary: {
      canonicalPlayerCount: matches.length + unresolved.length,
      matchCount: matches.length,
      unmatchedCount: unresolved.length,
      ambiguousCount: ambiguousMatches.length,
    },
    matches,
    unresolved,
    ambiguousMatches,
  };
}

export function createYahooMetadataIndex(identityMap, yahooPlayers) {
  const yahooById = new Map(yahooPlayers.map((player) => [player.yahooPlayerId, player]));
  return new Map(
    identityMap.matches.map((identity) => [
      identity.playerId,
      {
        identity: {
          playerId: identity.playerId,
          yahooPlayerId: identity.yahooPlayerId,
          yahooPlayerKey: identity.yahooPlayerKey,
        },
        metadata: yahooById.get(identity.yahooPlayerId) ?? null,
      },
    ]),
  );
}

export function getYahooMetadataForLocalPlayer(localPlayerId, metadataIndex) {
  return metadataIndex.get(localPlayerId) ?? null;
}
