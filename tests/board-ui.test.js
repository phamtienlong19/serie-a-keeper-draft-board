import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createDemoDraftInput,
  createTradedEntitlementDemoInput,
  demoFixtureDescription,
} from "../src/demo/demo-state.js";
import { resolveDraftState } from "../src/domain/engine.js";
import { buildDraftBoardViewModel } from "../src/presentation/board-view-model.js";
import { renderDraftBoard } from "../src/ui/render-board.js";

const canonicalTeams = JSON.parse(fs.readFileSync("data/teams.json", "utf8"));
const yahooPayload = JSON.parse(fs.readFileSync("data/external/yahoo/players.json", "utf8"));
const identityMap = JSON.parse(fs.readFileSync("data/player_identity_map.json", "utf8"));

function buildDemo() {
  const input = createDemoDraftInput(canonicalTeams);
  const resolvedState = resolveDraftState(input);
  const viewModel = buildDraftBoardViewModel({
    resolvedState,
    teams: input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
    stateLabel: demoFixtureDescription.label,
  });
  return { input, resolvedState, viewModel, html: renderDraftBoard(viewModel) };
}

function buildKeeperVariant() {
  const input = createDemoDraftInput(canonicalTeams);
  input.keeperSelections.find((selection) => selection.teamId === "sup-fam").selectedPlayerIds = [
    "cooper-flagg",
  ];
  const resolvedState = resolveDraftState(input);
  const viewModel = buildDraftBoardViewModel({
    resolvedState,
    teams: input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
    stateLabel: "TEST KEEPER VARIANT",
  });
  return { input, resolvedState, viewModel, html: renderDraftBoard(viewModel) };
}

test("canonical teams contain exactly one unique finish from 1 through 18", () => {
  assert.equal(canonicalTeams.teams.length, 18);
  assert.deepEqual(
    [...new Set(canonicalTeams.teams.map((team) => team.previousFinish))].sort((a, b) => a - b),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
});

test("primary demo creates zero-keeper and EARLY declarations for every canonical team", () => {
  const input = createDemoDraftInput(canonicalTeams);
  const canonicalIds = canonicalTeams.teams.map((team) => team.teamId).sort();

  assert.deepEqual(input.teams.map((team) => team.teamId).sort(), canonicalIds);
  assert.deepEqual(input.keeperSelections.map((selection) => selection.teamId).sort(), canonicalIds);
  assert.deepEqual(input.stealDeclarations.map((declaration) => declaration.teamId).sort(), canonicalIds);
  assert.ok(input.keeperSelections.every((selection) => selection.selectedPlayerIds.length === 0));
  assert.ok(input.stealDeclarations.every((declaration) => declaration.direction === "EARLY"));
});

test("all-zero-keeper all-EARLY baseline maps previous finish directly to R1 slot", () => {
  const { resolvedState } = buildDemo();

  for (const team of canonicalTeams.teams) {
    const allocation = resolvedState.allocations.find((item) => item.teamId === team.teamId);
    assert.equal(allocation.r1Slot, team.previousFinish, team.teamId);
    assert.equal(allocation.bucket, "NO_KEEPER", team.teamId);
  }
  assert.equal(resolvedState.allocations.find((item) => item.teamId === "sup-fam").r1Slot, 1);
  assert.equal(resolvedState.allocations.find((item) => item.teamId === "under-armour").r1Slot, 2);
  assert.equal(resolvedState.allocations.find((item) => item.teamId === "angry-bird").r1Slot, 3);
  assert.equal(resolvedState.allocations.find((item) => item.teamId === "chicken-wings").r1Slot, 18);
});

test("reconciled consecutive-year eligibility does not block a zero-keeper declaration", () => {
  const { resolvedState } = buildDemo();

  assert.equal(
    canonicalTeams.teams
      .flatMap((team) => team.priorDraft)
      .some((player) => player.consecutiveYearKeeperEligibility === "UNKNOWN"),
    false,
  );
  assert.equal(
    resolvedState.validation.some((item) => item.code === "KEEPER_CONSECUTIVE_YEAR_UNKNOWN"),
    false,
  );
  assert.ok(resolvedState.allocations.every((allocation) => allocation.r1Slot !== null));
});

test("fully resolved demo renders 18 columns and 198 pick cells", () => {
  const { resolvedState, viewModel, html } = buildDemo();

  assert.equal(resolvedState.picks.length, 198);
  assert.equal(viewModel.columns.length, 18);
  assert.equal(viewModel.resolvedPickCount, 198);
  assert.equal((html.match(/data-pick-cell/g) ?? []).length, 198);
});

test("every rendered cell uses an exact resolver-provided pick number", () => {
  const { resolvedState, html } = buildDemo();

  for (const pick of resolvedState.picks) {
    assert.ok(html.includes(`data-pick-number="${pick.pickNumber}"`), pick.pickNumber);
  }
});

test("columns remain ordered by resolved R1 slot", () => {
  const { viewModel } = buildDemo();
  assert.deepEqual(
    viewModel.columns.map((column) => column.r1Slot),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    viewModel.columns.map((column) => column.r1PickNumber),
    Array.from({ length: 18 }, (_, index) => `1.${String(index + 1).padStart(2, "0")}`),
  );
});

test("board headers preserve resolver slot order and include all canonical teams", () => {
  const { resolvedState, viewModel, html } = buildDemo();
  const expectedBySlot = [...resolvedState.allocations]
    .sort((a, b) => a.r1Slot - b.r1Slot)
    .map((allocation) => allocation.teamId);

  assert.deepEqual(viewModel.columns.map((column) => column.teamId), expectedBySlot);
  assert.deepEqual(new Set(viewModel.columns.map((column) => column.teamId)), new Set(expectedBySlot));
  assert.equal((html.match(/data-team-column=/g) ?? []).length, 18);
});

test("view-model orders only by resolver slot, independent of insertion, names, and Yahoo coverage", () => {
  const { input, resolvedState } = buildDemo();
  const reorderedState = structuredClone(resolvedState);
  reorderedState.allocations.reverse();
  reorderedState.picks.reverse();
  const teamsByName = [...input.teams].sort((a, b) => a.name.localeCompare(b.name));
  const viewModel = buildDraftBoardViewModel({
    resolvedState: reorderedState,
    teams: teamsByName,
    identityMap: { matches: [] },
    yahooPlayers: [],
  });

  assert.deepEqual(
    viewModel.columns.map((column) => column.r1Slot),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    viewModel.columns.map((column) => column.teamId),
    canonicalTeams.teams
      .slice()
      .sort((a, b) => a.previousFinish - b.previousFinish)
      .map((team) => team.teamId),
  );
});

test("traded entitlement displays owner while preserving origin column", () => {
  const input = createTradedEntitlementDemoInput(canonicalTeams);
  const resolvedState = resolveDraftState(input);
  const viewModel = buildDraftBoardViewModel({
    resolvedState,
    teams: input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });
  const html = renderDraftBoard(viewModel);
  const originColumn = viewModel.columns.find((column) => column.teamId === "sup-fam");
  const tradedCell = originColumn.cells.find((cell) => cell.round === 6);

  assert.equal(tradedCell.originTeamId, "sup-fam");
  assert.equal(tradedCell.currentOwnerTeamId, "mnqa");
  assert.equal(tradedCell.isTraded, true);
  assert.ok(html.includes("OWNER: MNQA"));
  assert.ok(html.includes("FROM: sup fam"));
});

test("keeper is rendered on the resolver-designated consumed pick", () => {
  const { resolvedState, viewModel, html } = buildKeeperVariant();
  const keeper = resolvedState.keepers.find((item) => item.playerId === "cooper-flagg");
  const keeperCell = viewModel.columns
    .flatMap((column) => column.cells)
    .find((cell) => cell.pickNumber === keeper.consumedPickNumber);

  assert.equal(keeperCell.keeper.playerId, "cooper-flagg");
  assert.equal(keeperCell.keeper.oldRound, 2);
  assert.equal(keeperCell.keeper.resolvedCostRound, 2);
  assert.ok(html.includes("COOPER FLAGG"));
  assert.ok(html.includes("R2 → R2"));
});

test("Yahoo metadata joins by stable identity even if display text differs", () => {
  const { input, resolvedState } = buildKeeperVariant();
  const stateClone = structuredClone(resolvedState);
  const cooperPick = stateClone.picks.find((pick) => pick.keeper?.playerId === "cooper-flagg");
  cooperPick.keeper.playerName = "Changed presentation name";
  const viewModel = buildDraftBoardViewModel({
    resolvedState: stateClone,
    teams: input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });
  const keeperCell = viewModel.columns
    .flatMap((column) => column.cells)
    .find((cell) => cell.keeper?.playerId === "cooper-flagg");

  assert.equal(keeperCell.yahooMetadata.yahooPlayerId, "10468");
  assert.equal(keeperCell.yahooMetadata.nbaTeamAbbreviation, "DAL");
  assert.equal(keeperCell.yahooMetadata.oRank, 13);
});

test("missing Yahoo metadata leaves keeper rendering intact", () => {
  const { input, resolvedState } = buildKeeperVariant();
  const viewModel = buildDraftBoardViewModel({
    resolvedState,
    teams: input.teams,
    identityMap: { matches: [] },
    yahooPlayers: [],
  });
  const html = renderDraftBoard(viewModel);
  const keeperCell = viewModel.columns
    .flatMap((column) => column.cells)
    .find((cell) => cell.keeper?.playerId === "cooper-flagg");

  assert.equal(keeperCell.yahooMetadata, null);
  assert.ok(html.includes("COOPER FLAGG"));
  assert.ok(html.includes("KEEPER"));
});

test("O-Rank is rendered with correct semantics and never as XRank", () => {
  const { html } = buildKeeperVariant();
  assert.ok(html.includes("O-RANK 13"));
  assert.equal(html.includes("XRank"), false);
  assert.equal(html.includes("X-RANK"), false);
});

test("unresolved teams receive pending entries and no fabricated slots", () => {
  const teams = structuredClone(canonicalTeams.teams);
  const partialState = resolveDraftState({
    stateType: "WORKING",
    season: canonicalTeams.season,
    teams,
    keeperSelections: [{ teamId: teams[0].teamId, selectedPlayerIds: [] }],
    stealDeclarations: [{ teamId: teams[0].teamId, direction: "EARLY" }],
  });
  const viewModel = buildDraftBoardViewModel({
    resolvedState: partialState,
    teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });

  assert.equal(viewModel.columns.length, 0);
  assert.equal(viewModel.resolvedPickCount, 0);
  assert.equal(viewModel.pendingTeams.length, 18);
  assert.ok(partialState.allocations.every((allocation) => allocation.r1Slot === null));
});

test("presentation transformation does not mutate resolver output", () => {
  const input = createDemoDraftInput(canonicalTeams);
  const resolvedState = resolveDraftState(input);
  const before = structuredClone(resolvedState);

  buildDraftBoardViewModel({
    resolvedState,
    teams: input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });

  assert.deepEqual(resolvedState, before);
});
