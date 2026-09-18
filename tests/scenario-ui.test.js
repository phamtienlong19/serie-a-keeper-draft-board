import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createDemoDraftInput } from "../src/demo/demo-state.js";
import { buildDraftBoardViewModel } from "../src/presentation/board-view-model.js";
import { buildTeamScenarioViewModel } from "../src/presentation/team-scenario-view-model.js";
import {
  applyScenarioOverrides,
  createEmptyScenarioOverrides,
  evaluateKeeperCandidates,
  resolveScenario,
  setScenarioEligibilityAssumption,
  setScenarioKeeperSelection,
  setScenarioStealDirection,
} from "../src/scenario/scenario-state.js";
import { renderDraftBoard } from "../src/ui/render-board.js";

const canonicalTeams = JSON.parse(fs.readFileSync("data/teams.json", "utf8"));
const yahooPayload = JSON.parse(fs.readFileSync("data/external/yahoo/players.json", "utf8"));
const identityMap = JSON.parse(fs.readFileSync("data/player_identity_map.json", "utf8"));
const baselineInput = createDemoDraftInput(canonicalTeams);

function selectKeeper(overrides, teamId, playerId) {
  return setScenarioKeeperSelection(overrides, teamId, playerId, true);
}

function inputWithUnknownHistory(teamId, playerId) {
  const input = structuredClone(baselineInput);
  const player = input.teams
    .find((team) => team.teamId === teamId)
    .priorDraft.find((candidate) => candidate.playerId === playerId);
  player.consecutiveYearKeeperEligibility = "UNKNOWN";
  return input;
}

function allocation(result, teamId) {
  return result.resolvedState.allocations.find((item) => item.teamId === teamId);
}

function playerAtRound(teamId, round) {
  return baselineInput.teams
    .find((team) => team.teamId === teamId)
    .priorDraft.find((player) => player.oldRound === round);
}

function buildPanel(result, overrides, teamId, yahooPlayers = yahooPayload.players) {
  return buildTeamScenarioViewModel({
    baselineInput,
    scenarioOverrides: overrides,
    resolvedState: result.resolvedState,
    teamId,
    identityMap,
    yahooPlayers,
  });
}

test("selecting a first keeper changes NO_KEEPER to KEEPER", () => {
  const overrides = selectKeeper(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "alex-sarr",
  );
  const result = resolveScenario(baselineInput, overrides);

  assert.equal(allocation(result, "sup-fam").bucket, "KEEPER");
});

test("removing the last keeper returns the team to NO_KEEPER", () => {
  let overrides = selectKeeper(createEmptyScenarioOverrides(), "sup-fam", "alex-sarr");
  overrides = setScenarioKeeperSelection(overrides, "sup-fam", "alex-sarr", false);
  const result = resolveScenario(baselineInput, overrides);

  assert.equal(allocation(result, "sup-fam").bucket, "NO_KEEPER");
});

test("keeper bucket change globally moves multiple teams", () => {
  const baseline = resolveScenario(baselineInput, createEmptyScenarioOverrides());
  const overrides = selectKeeper(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "alex-sarr",
  );
  const changed = resolveScenario(baselineInput, overrides);
  const moved = changed.resolvedState.allocations.filter(
    (item) => item.r1Slot !== allocation(baseline, item.teamId).r1Slot,
  );

  assert.equal(moved.length, 18);
  assert.equal(allocation(changed, "sup-fam").r1Slot, 18);
  assert.equal(allocation(changed, "under-armour").r1Slot, 1);
});

test("EARLY to LATE reruns global allocation", () => {
  const baseline = resolveScenario(baselineInput, createEmptyScenarioOverrides());
  const overrides = setScenarioStealDirection(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "LATE",
  );
  const changed = resolveScenario(baselineInput, overrides);
  const moved = changed.resolvedState.allocations.filter(
    (item) => item.r1Slot !== allocation(baseline, item.teamId).r1Slot,
  );

  assert.ok(moved.length > 1);
  assert.equal(allocation(changed, "sup-fam").r1Slot, 18);
  assert.equal(allocation(changed, "under-armour").r1Slot, 1);
});

test("keeper selection occupies the resolver-designated pick", () => {
  const overrides = selectKeeper(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "alex-sarr",
  );
  const result = resolveScenario(baselineInput, overrides);
  const keeper = result.resolvedState.keepers.find((item) => item.playerId === "alex-sarr");
  const occupied = result.resolvedState.picks.find(
    (pick) => pick.pickNumber === keeper.consumedPickNumber,
  );

  assert.equal(occupied.status, "KEEPER");
  assert.equal(occupied.keeper.playerId, "alex-sarr");
});

test("keeper deselection returns the consumed pick to OPEN", () => {
  let overrides = selectKeeper(createEmptyScenarioOverrides(), "sup-fam", "alex-sarr");
  const selected = resolveScenario(baselineInput, overrides);
  const consumedPick = selected.resolvedState.keepers.find(
    (item) => item.playerId === "alex-sarr",
  ).consumedPickNumber;
  overrides = setScenarioKeeperSelection(overrides, "sup-fam", "alex-sarr", false);
  const deselected = resolveScenario(baselineInput, overrides);
  const reopened = deselected.resolvedState.picks.find(
    (pick) => pick.originTeamId === "sup-fam" && pick.round === 4,
  );

  assert.notEqual(reopened.pickNumber, consumedPick);
  assert.equal(reopened.status, "OPEN");
});

test("R5 to R4 mapping is displayed from resolver output", () => {
  const overrides = selectKeeper(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "alex-sarr",
  );
  const result = resolveScenario(baselineInput, overrides);
  const panel = buildPanel(result, overrides, "sup-fam");
  const row = panel.roster.find((candidate) => candidate.playerId === "alex-sarr");
  const board = buildDraftBoardViewModel({
    resolvedState: result.resolvedState,
    teams: result.input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });
  const html = renderDraftBoard(board, panel);

  assert.equal(row.baseCostRound, 4);
  assert.equal(row.resolvedCostRound, 4);
  assert.equal(row.costLabel, "R5 → R4");
  assert.ok(html.includes("R5 → R4"));
});

test("same-cost collision displays deterministic resolved costs", () => {
  const teamId = "under-armour";
  const first = playerAtRound(teamId, 7);
  const second = playerAtRound(teamId, 8);
  let overrides = selectKeeper(createEmptyScenarioOverrides(), teamId, first.playerId);
  overrides = selectKeeper(overrides, teamId, second.playerId);
  const result = resolveScenario(baselineInput, overrides);
  const panel = buildPanel(result, overrides, teamId);
  const selectedRows = panel.roster.filter((candidate) => candidate.selected);

  assert.deepEqual(result.resolvedState.keeperCollisions[0].resolvedRounds, [6, 5]);
  assert.equal(result.resolvedState.keeperCollisions[0].assignmentStatus, "RESOLVED");
  assert.deepEqual(selectedRows.map((row) => row.resolvedCostRound), [6, 5]);
  assert.deepEqual(selectedRows.map((row) => row.collisionDepth), [0, 1]);
  assert.deepEqual(selectedRows.map((row) => row.costLabel), ["R7 → R6", "R8 → R6 → R5"]);
});

test("8th-11th candidate actions respect one-R2+ versus two-R3+ modes", () => {
  const teamId = "rip-city-remix";
  const round2 = playerAtRound(teamId, 2);
  const round3 = playerAtRound(teamId, 3);
  const round4 = playerAtRound(teamId, 4);
  const oneR2 = selectKeeper(createEmptyScenarioOverrides(), teamId, round2.playerId);
  const afterR2Candidates = evaluateKeeperCandidates({
    baselineInput,
    overrides: oneR2,
    teamId,
  });
  assert.equal(
    afterR2Candidates.find((candidate) => candidate.playerId === round3.playerId).canSelect,
    false,
  );

  let twoR3 = selectKeeper(createEmptyScenarioOverrides(), teamId, round3.playerId);
  twoR3 = selectKeeper(twoR3, teamId, round4.playerId);
  const resolvedTwoR3 = resolveScenario(baselineInput, twoR3);
  assert.equal(allocation(resolvedTwoR3, teamId).bucket, "KEEPER");
  assert.equal(
    resolvedTwoR3.resolvedState.teamKeeperStates.find((state) => state.teamId === teamId)
      .entitlementMode,
    "TWO_R3_PLUS",
  );
});

test("17th and 18th place teams cannot select keepers", () => {
  for (const teamId of ["abcxyz", "chicken-wings"]) {
    const candidates = evaluateKeeperCandidates({
      baselineInput,
      overrides: createEmptyScenarioOverrides(),
      teamId,
    });
    assert.ok(candidates.every((candidate) => candidate.canSelect === false));
    assert.ok(candidates.every((candidate) => candidate.deterministicError === true));
  }
});

test("UNKNOWN history is unresolved until an explicit scenario assumption", () => {
  const unknownInput = inputWithUnknownHistory("sup-fam", "alex-sarr");
  const selectedWithoutAssumption = setScenarioKeeperSelection(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "alex-sarr",
    true,
  );
  const unresolved = resolveScenario(unknownInput, selectedWithoutAssumption);
  assert.ok(
    unresolved.resolvedState.validation.some(
      (item) => item.code === "KEEPER_CONSECUTIVE_YEAR_UNKNOWN",
    ),
  );
  assert.equal(allocation(unresolved, "sup-fam").bucket, null);

  const assumed = setScenarioEligibilityAssumption(
    selectedWithoutAssumption,
    "alex-sarr",
    true,
  );
  const resolved = resolveScenario(unknownInput, assumed);
  assert.equal(allocation(resolved, "sup-fam").bucket, "KEEPER");
});

test("scenario eligibility assumption never mutates its UNKNOWN baseline or canonical teams", () => {
  const unknownInput = inputWithUnknownHistory("sup-fam", "alex-sarr");
  const unknownBefore = structuredClone(unknownInput);
  const canonicalBefore = structuredClone(canonicalTeams);
  const overrides = setScenarioEligibilityAssumption(
    setScenarioKeeperSelection(
      createEmptyScenarioOverrides(),
      "sup-fam",
      "alex-sarr",
      true,
    ),
    "alex-sarr",
    true,
  );
  const scenarioInput = applyScenarioOverrides(unknownInput, overrides);

  assert.deepEqual(unknownInput, unknownBefore);
  assert.deepEqual(canonicalTeams, canonicalBefore);
  assert.equal(
    canonicalTeams.teams[0].priorDraft.find((player) => player.playerId === "alex-sarr")
      .consecutiveYearKeeperEligibility,
    "ELIGIBLE",
  );
  assert.equal(
    scenarioInput.teams[0].priorDraft.find((player) => player.playerId === "alex-sarr")
      .consecutiveYearKeeperEligibility,
    "ELIGIBLE",
  );
});

test("reset scenario reproduces exact baseline resolver output", () => {
  const baseline = resolveScenario(baselineInput, createEmptyScenarioOverrides());
  const changed = selectKeeper(
    setScenarioStealDirection(createEmptyScenarioOverrides(), "under-armour", "LATE"),
    "sup-fam",
    "alex-sarr",
  );
  assert.notDeepEqual(resolveScenario(baselineInput, changed).resolvedState, baseline.resolvedState);

  const reset = resolveScenario(baselineInput, createEmptyScenarioOverrides());
  assert.deepEqual(reset.resolvedState, baseline.resolvedState);
});

test("missing Yahoo metadata does not block keeper interaction", () => {
  const overrides = selectKeeper(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "alex-sarr",
  );
  const result = resolveScenario(baselineInput, overrides);
  const panel = buildPanel(result, overrides, "sup-fam", []);
  const row = panel.roster.find((candidate) => candidate.playerId === "alex-sarr");

  assert.equal(row.yahooMetadata, null);
  assert.equal(row.selected, true);
  assert.equal(allocation(result, "sup-fam").bucket, "KEEPER");
});

test("scenario state stores only input overrides, never resolved cells or slots", () => {
  const overrides = selectKeeper(
    setScenarioStealDirection(createEmptyScenarioOverrides(), "sup-fam", "LATE"),
    "sup-fam",
    "alex-sarr",
  );
  const serialized = JSON.stringify(overrides);

  assert.deepEqual(Object.keys(overrides).sort(), [
    "assumedEligiblePlayerIds",
    "keeperSelections",
    "stealDirections",
  ]);
  assert.equal(serialized.includes("r1Slot"), false);
  assert.equal(serialized.includes("pickNumber"), false);
  assert.equal(serialized.includes("picks"), false);
});
