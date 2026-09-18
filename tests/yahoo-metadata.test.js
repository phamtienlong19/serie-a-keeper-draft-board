import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildPlayerIdentityMap,
  createYahooMetadataIndex,
  getYahooMetadataForLocalPlayer,
  normalizePlayerName,
  normalizeYahooPlayer,
} from "../src/index.js";

const canonicalTeamsPayload = JSON.parse(fs.readFileSync("data/teams.json", "utf8"));
const normalizedYahooPayload = JSON.parse(
  fs.readFileSync("data/external/yahoo/players.json", "utf8"),
);
const persistedIdentityMap = JSON.parse(fs.readFileSync("data/player_identity_map.json", "utf8"));

test("normalizes Unicode diacritics and apostrophe variants", () => {
  assert.equal(normalizePlayerName("Nikola Jokić"), normalizePlayerName("Nikola Jokic"));
  assert.equal(normalizePlayerName("D’Angelo Russell"), normalizePlayerName("D'Angelo Russell"));
});

test("normalizes Jr. and III suffix punctuation without dropping the suffix", () => {
  assert.equal(normalizePlayerName("Gary Trent Jr."), "gary trent jr");
  assert.equal(normalizePlayerName("Gary Trent Jr"), "gary trent jr");
  assert.equal(normalizePlayerName("Example Player III"), "example player iii");
  assert.equal(normalizePlayerName("Example Player Third"), "example player iii");
  assert.notEqual(normalizePlayerName("Gary Trent Jr."), normalizePlayerName("Gary Trent"));
});

test("normalizes punctuated initials used by Yahoo", () => {
  assert.equal(normalizePlayerName("T.J. McConnell"), normalizePlayerName("TJ McConnell"));
  assert.equal(normalizePlayerName("P.J. Washington"), normalizePlayerName("PJ Washington"));
});

test("reconciles a local player to exact Yahoo IDs through the bootstrap map", () => {
  const teams = [
    {
      teamId: "local-team",
      priorDraft: [{ playerId: "nikola-jokic", playerName: "Nikola Jokic" }],
    },
  ];
  const yahooPlayers = [
    {
      yahooPlayerId: "5352",
      playerKey: "478.p.5352",
      fullName: "Nikola Jokić",
    },
  ];
  const identityMap = buildPlayerIdentityMap(teams, yahooPlayers);

  assert.deepEqual(identityMap.matches[0], {
    playerId: "nikola-jokic",
    playerName: "Nikola Jokic",
    normalizedName: "nikola jokic",
    yahooPlayerId: "5352",
    yahooPlayerKey: "478.p.5352",
    matchMethod: "NORMALIZED_NAME_EXACT",
  });
});

test("keeps unmatched and ambiguous players explicit instead of guessing", () => {
  const teams = [
    {
      teamId: "local-team",
      priorDraft: [
        { playerId: "missing-player", playerName: "Missing Player" },
        { playerId: "duplicate-name", playerName: "Same Name" },
      ],
    },
  ];
  const yahooPlayers = [
    { yahooPlayerId: "1", playerKey: "478.p.1", fullName: "Same Name" },
    { yahooPlayerId: "2", playerKey: "478.p.2", fullName: "Same Name" },
  ];
  const identityMap = buildPlayerIdentityMap(teams, yahooPlayers);

  assert.equal(identityMap.matches.length, 0);
  assert.equal(identityMap.unresolved[0].reason, "NO_EXACT_NORMALIZED_NAME_MATCH");
  assert.equal(identityMap.unresolved[1].reason, "AMBIGUOUS_EXACT_NORMALIZED_NAME_MATCH");
  assert.equal(identityMap.unresolved[1].candidates.length, 2);
  assert.equal(identityMap.ambiguousMatches.length, 1);
});

test("metadata refresh/reconciliation cannot mutate canonical keeper or ownership data", () => {
  const governanceState = {
    teams: canonicalTeamsPayload.teams,
    keeperSelections: {
      "sup-fam": { selectedPlayerIds: ["cooper-flagg"], status: "ENTERED" },
    },
    entitlements: [
      { originTeamId: "sup-fam", round: 6, currentOwnerTeamId: "mnqa" },
    ],
    trades: [
      {
        tradeId: "existing-trade",
        status: "CONFIRMED",
        transfers: [
          { originTeamId: "sup-fam", round: 6, fromTeamId: "sup-fam", toTeamId: "mnqa" },
        ],
      },
    ],
  };
  const canonicalBefore = structuredClone(governanceState);
  const identityMap = buildPlayerIdentityMap(
    governanceState.teams,
    normalizedYahooPayload.players,
  );
  const metadataIndex = createYahooMetadataIndex(identityMap, normalizedYahooPayload.players);
  const cooper = getYahooMetadataForLocalPlayer("cooper-flagg", metadataIndex);

  assert.deepEqual(governanceState, canonicalBefore);
  assert.equal(cooper.identity.yahooPlayerId, "10468");
  assert.equal(cooper.metadata.nbaTeamAbbreviation, "DAL");
  assert.equal(cooper.metadata.displayPosition, "SG,SF,PF");
  assert.equal(cooper.metadata.oRank, 13);
  assert.equal(governanceState.teams[0].priorDraft[1].oldRound, 2);
  assert.equal(governanceState.teams[0].priorDraft[1].originalDrafterTeamId, "sup-fam");
  assert.equal(
    governanceState.teams[0].priorDraft[1].consecutiveYearKeeperEligibility,
    "UNKNOWN",
  );
});

test("OR rank is stored as oRank and never mislabeled as xRank", () => {
  const normalized = normalizeYahooPlayer({
    player_id: "10468",
    player_key: "478.p.10468",
    name: { full: "Cooper Flagg", first: "Cooper", last: "Flagg" },
    player_ranks: [{ player_rank: { rank_type: "OR", rank_value: "13" } }],
  });

  assert.equal(normalized.oRank, 13);
  assert.equal(normalized.xRank, null);
  assert.ok(normalizedYahooPayload.players.every((player) => player.xRank === null));
  assert.deepEqual(normalizedYahooPayload.source.rankTypes, ["OR"]);
});

test("persisted identity map is reproducible from canonical and normalized inputs", () => {
  const rebuilt = buildPlayerIdentityMap(
    canonicalTeamsPayload.teams,
    normalizedYahooPayload.players,
  );
  assert.deepEqual(rebuilt, persistedIdentityMap);
});
