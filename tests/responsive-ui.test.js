import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createDemoDraftInput } from "../src/demo/demo-state.js";
import { buildDraftBoardViewModel } from "../src/presentation/board-view-model.js";
import { buildTeamScenarioViewModel } from "../src/presentation/team-scenario-view-model.js";
import {
  createEmptyScenarioOverrides,
  resolveScenario,
  setScenarioStealDirection,
} from "../src/scenario/scenario-state.js";
import {
  calculateColumnScrollLeft,
  closeTeamPanel,
  createBoardUiState,
  getSelectedTeamColumn,
  openTeamPanel,
  setDrawerMode,
} from "../src/ui/board-interaction.js";
import { renderDraftBoard } from "../src/ui/render-board.js";

const canonicalTeams = JSON.parse(fs.readFileSync("data/teams.json", "utf8"));
const yahooPayload = JSON.parse(fs.readFileSync("data/external/yahoo/players.json", "utf8"));
const identityMap = JSON.parse(fs.readFileSync("data/player_identity_map.json", "utf8"));
const styles = fs.readFileSync("src/ui/styles.css", "utf8");
const baselineInput = createDemoDraftInput(canonicalTeams);

function boardFor(result, selectedTeamId) {
  return buildDraftBoardViewModel({
    resolvedState: result.resolvedState,
    teams: result.input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
    selectedTeamId,
  });
}

function panelFor(result, overrides, teamId) {
  return buildTeamScenarioViewModel({
    baselineInput,
    scenarioOverrides: overrides,
    resolvedState: result.resolvedState,
    teamId,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });
}

function lateSupFam() {
  const overrides = setScenarioStealDirection(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "LATE",
  );
  return { overrides, result: resolveScenario(baselineInput, overrides) };
}

test("selected team remains selected by teamId after its R1 slot changes", () => {
  const uiState = openTeamPanel(createBoardUiState(), "sup-fam");
  const baseline = boardFor(
    resolveScenario(baselineInput, createEmptyScenarioOverrides()),
    uiState.selectedTeamId,
  );
  const changed = boardFor(lateSupFam().result, uiState.selectedTeamId);

  assert.equal(getSelectedTeamColumn(baseline.columns, uiState.selectedTeamId).r1Slot, 1);
  assert.equal(getSelectedTeamColumn(changed.columns, uiState.selectedTeamId).r1Slot, 18);
  assert.equal(changed.columns.filter((column) => column.isSelected).length, 1);
  assert.equal(changed.columns.find((column) => column.isSelected).teamId, "sup-fam");
});

test("1.01 to 1.18 movement targets the selected team's new complete column", () => {
  const changed = boardFor(lateSupFam().result, "sup-fam");
  const selected = getSelectedTeamColumn(changed.columns, "sup-fam");
  const columnWidth = 220;
  const stickyWidth = 76;
  const columnLeft = stickyWidth + (selected.r1Slot - 1) * columnWidth;
  const target = calculateColumnScrollLeft({
    scrollLeft: 0,
    clientWidth: 900,
    scrollWidth: stickyWidth + 18 * columnWidth,
    stickyWidth,
    columnLeft,
    columnWidth,
  });

  assert.equal(selected.r1Slot, 18);
  assert.equal(target, 3136);
  assert.ok(columnLeft + columnWidth <= target + 900);
  assert.ok(columnLeft >= target + stickyWidth);
});

test("scenario recomputation replaces stale slot targeting with current teamId lookup", () => {
  const baseline = boardFor(
    resolveScenario(baselineInput, createEmptyScenarioOverrides()),
    "sup-fam",
  );
  const changed = boardFor(lateSupFam().result, "sup-fam");
  const oldTarget = getSelectedTeamColumn(baseline.columns, "sup-fam");
  const newTarget = getSelectedTeamColumn(changed.columns, "sup-fam");

  assert.equal(oldTarget.teamId, newTarget.teamId);
  assert.equal(oldTarget.r1Slot, 1);
  assert.equal(newTarget.r1Slot, 18);
  assert.equal(changed.columns.indexOf(newTarget), 17);
});

test("desktop drawer is a layout pane and does not render a board-covering scrim", () => {
  const overrides = createEmptyScenarioOverrides();
  const result = resolveScenario(baselineInput, overrides);
  const board = boardFor(result, "sup-fam");
  const html = renderDraftBoard(board, panelFor(result, overrides, "sup-fam"));

  assert.match(html, /class="workspace has-team-panel"/);
  assert.match(html, /class="board-pane"[\s\S]*class="team-drawer"/);
  assert.match(html, /data-team-id="sup-fam" aria-pressed="true"/);
  assert.doesNotMatch(html, /drawer-scrim/);
  assert.match(styles, /\.team-drawer \{[\s\S]*position: relative;[\s\S]*flex: 0 0 clamp\(420px, 32vw, 520px\)/);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*\.team-drawer \{[\s\S]*position: fixed;/);
});

test("selected team's current draft path is copied from resolver output", () => {
  const { overrides, result } = lateSupFam();
  const panel = panelFor(result, overrides, "sup-fam");

  assert.equal(panel.r1Slot, 18);
  assert.equal(panel.pickPath.find((pick) => pick.round === 1).pickNumber, "1.18");
  for (const pathPick of panel.pickPath) {
    const resolverPick = result.resolvedState.picks.find(
      (pick) => pick.pickNumber === pathPick.pickNumber,
    );
    assert.ok(resolverPick);
    assert.equal(pathPick.status, resolverPick.status);
    assert.equal(pathPick.occupant, resolverPick.keeper?.playerName ?? null);
  }
});

test("KEEPERS and DRAFT PATH switching is UI-only and does not mutate scenario state", () => {
  const overrides = setScenarioStealDirection(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "LATE",
  );
  const before = structuredClone(overrides);
  let uiState = openTeamPanel(createBoardUiState(), "sup-fam");
  uiState = setDrawerMode(uiState, "DRAFT_PATH");
  const result = resolveScenario(baselineInput, overrides);
  const html = renderDraftBoard(
    boardFor(result, "sup-fam"),
    panelFor(result, overrides, "sup-fam"),
    uiState.drawerMode,
  );

  assert.deepEqual(overrides, before);
  assert.match(html, /id="draft-path-tab"[^>]*aria-selected="true"/);
  assert.match(html, /id="draft-path-panel"/);
  assert.doesNotMatch(html, /id="keepers-panel"/);
});

test("mobile panel close preserves the current selected-team return target", () => {
  let uiState = openTeamPanel(createBoardUiState(), "sup-fam");
  uiState = closeTeamPanel(uiState);
  const changed = boardFor(lateSupFam().result, uiState.selectedTeamId);

  assert.equal(uiState.isTeamPanelOpen, false);
  assert.equal(uiState.selectedTeamId, "sup-fam");
  assert.equal(getSelectedTeamColumn(changed.columns, uiState.selectedTeamId).r1Slot, 18);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*width: 100vw;[\s\S]*height: 100dvh;/);
});

test("reset follows the selected team from its scenario slot back to baseline", () => {
  const uiState = openTeamPanel(createBoardUiState(), "sup-fam");
  const changed = boardFor(lateSupFam().result, uiState.selectedTeamId);
  const reset = boardFor(
    resolveScenario(baselineInput, createEmptyScenarioOverrides()),
    uiState.selectedTeamId,
  );

  assert.equal(getSelectedTeamColumn(changed.columns, uiState.selectedTeamId).r1Slot, 18);
  assert.equal(getSelectedTeamColumn(reset.columns, uiState.selectedTeamId).r1Slot, 1);
  assert.equal(reset.columns.find((column) => column.isSelected).teamId, "sup-fam");
});
