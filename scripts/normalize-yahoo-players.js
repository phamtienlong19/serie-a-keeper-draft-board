import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPlayerIdentityMap,
  describeYahooSource,
  extractYahooPlayers,
} from "../src/external/yahoo.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yahooDirectory = path.join(repositoryRoot, "data", "external", "yahoo");
const rawSnapshotPath = path.join(yahooDirectory, "draft_analysis.json");
const normalizedPlayersPath = path.join(yahooDirectory, "players.json");
const canonicalTeamsPath = path.join(repositoryRoot, "data", "teams.json");
const identityMapPath = path.join(repositoryRoot, "data", "player_identity_map.json");

const snapshot = JSON.parse(fs.readFileSync(rawSnapshotPath, "utf8"));
const canonicalTeams = JSON.parse(fs.readFileSync(canonicalTeamsPath, "utf8"));
const source = describeYahooSource(snapshot);
const players = extractYahooPlayers(snapshot);
const identityMap = buildPlayerIdentityMap(canonicalTeams.teams, players);

const normalizedPayload = {
  schemaVersion: 1,
  source,
  players,
};

fs.writeFileSync(normalizedPlayersPath, `${JSON.stringify(normalizedPayload, null, 2)}\n`);
fs.writeFileSync(identityMapPath, `${JSON.stringify(identityMap, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify(
    {
      normalizedPlayerCount: players.length,
      ...identityMap.summary,
      unresolved: identityMap.unresolved.map((player) => ({
        playerId: player.playerId,
        playerName: player.playerName,
        reason: player.reason,
      })),
    },
    null,
    2,
  )}\n`,
);

