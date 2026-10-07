import { createYahooMetadataIndex } from "../external/yahoo.js";
import { declarationProvenance } from "../domain/pre-draft.js";

/** Ranked capacity follows occupied board cells, never keeper XRank. */
export function buildBoardRanges(resolvedState, teamCount) {
  const ranges = [];
  let previousEnd = 0;
  for (let round = 1; round <= resolvedState.draftRounds; round++) {
    const picks = resolvedState.picks.filter((pick) => pick.round === round);
    if (picks.length !== teamCount || picks.some((pick) => !["OPEN", "KEEPER"].includes(pick.status))) return [];
    const keepers = picks.filter((pick) => pick.keeper).map((pick) => pick.keeper.playerName);
    const openSlots = picks.filter((pick) => pick.status === "OPEN").length;
    ranges.push({ round, openSlots, keepers, start: previousEnd + 1, end: previousEnd + openSlots });
    previousEnd += openSlots;
  }
  return ranges;
}

/** Extend the resolver's authoritative availability to the full external pool. */
export function buildDraftPool({ resolvedState, yahooPlayers, identityMap, baselineInput, overrides }) {
  createYahooMetadataIndex(identityMap, yahooPlayers); // Reject ambiguous stable-ID joins.
  const localByYahoo = new Map(identityMap.matches.map((row) => [row.yahooPlayerId, row.playerId]));
  const availability = new Map(resolvedState.playerPool.map((row) => [row.playerId, row]));
  const keepers = new Map(resolvedState.keepers.map((row) => [row.playerId, row]));
  const teams = new Map(baselineInput.teams.map((team) => [team.teamId, team.name]));
  const yahooIds = new Set(yahooPlayers.map((row) => row.yahooPlayerId));
  const identities = new Map(identityMap.matches.map((row) => [row.playerId, row.yahooPlayerId]));
  const issues = resolvedState.keepers.filter((keeper) => !yahooIds.has(identities.get(keeper.playerId)))
    .map((keeper) => `${keeper.playerName ?? keeper.playerId}: Yahoo identity/metadata unresolved; no guessed exclusion.`);
  const roundBands = buildBoardRanges(resolvedState, baselineInput.teams.length);
  let availableCount = 0;
  const rows = [...yahooPlayers].sort((a, b) => a.xrank - b.xrank).map((metadata) => {
    const playerId = localByYahoo.get(metadata.yahooPlayerId) ?? null;
    const pool = availability.get(playerId);
    const keeper = keepers.get(playerId);
    const keeperTeamId = pool?.keeperTeamId ?? null;
    const playerAvailability = pool?.availability ?? "AVAILABLE";
    const availableRank = playerAvailability === "AVAILABLE" ? ++availableCount : null;
    const boardRange = roundBands.find((range) => availableRank >= range.start && availableRank <= range.end);
    return { ...metadata, playerId, availability: playerAvailability, availableRank,
      boardRange: availableRank == null ? null : boardRange ? `R${boardRange.round}` : roundBands.length ? `Beyond R${resolvedState.draftRounds}` : null,
      keeperTeamId,
      keeperTeam: teams.get(keeperTeamId) ?? null,
      resolvedCostRound: keeper?.resolvedCostRound ?? null,
      provenance: keeperTeamId ? declarationProvenance(baselineInput, overrides, keeperTeamId) : null };
  });
  return { rows, issues, roundBands, boardCapacity: roundBands.at(-1)?.end ?? null, availableCount };
}

export function filterDraftPool(rows, { search = "", position = "", nbaTeam = "", availability = "AVAILABLE" } = {}) {
  return rows.filter((row) =>
    (!availability || row.availability === availability) &&
    row.fullName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (!position || row.eligiblePositions.includes(position) || row.displayPosition?.split(",").includes(position)) &&
    (!nbaTeam || row.nbaTeamAbbreviation === nbaTeam));
}
