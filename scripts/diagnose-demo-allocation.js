import fs from "node:fs";

import { createDemoDraftInput } from "../src/demo/demo-state.js";
import { resolveDraftState } from "../src/domain/engine.js";

const canonicalTeams = JSON.parse(fs.readFileSync("data/teams.json", "utf8"));
const input = createDemoDraftInput(canonicalTeams);
const result = resolveDraftState(input);

console.table(
  result.allocations
    .map((allocation) => ({
      teamId: allocation.teamId,
      previousFinish: allocation.previousFinish,
      keeperCount: result.keepers.filter((keeper) => keeper.teamId === allocation.teamId).length,
      stealDirection: allocation.stealDirection,
      bucket: allocation.bucket,
      r1Slot: allocation.r1Slot,
    }))
    .sort((a, b) => a.previousFinish - b.previousFinish),
);

