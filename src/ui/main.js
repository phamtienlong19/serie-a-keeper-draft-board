import canonicalTeams from "../../data/teams.json";
import identityMap from "../../data/player_identity_map.json";
import yahooPayload from "../../data/external/yahoo/players.json";
import { createDemoDraftInput, demoFixtureDescription } from "../demo/demo-state.js";
import { buildDraftBoardViewModel } from "../presentation/board-view-model.js";
import { buildTeamScenarioViewModel } from "../presentation/team-scenario-view-model.js";
import {
  countScenarioChanges,
  createEmptyScenarioOverrides,
  resolveScenario,
  setScenarioEligibilityAssumption,
  setScenarioKeeperSelection,
  setScenarioStealDirection,
} from "../scenario/scenario-state.js";
import {
  calculateColumnScrollLeft,
  closeTeamPanel,
  createBoardUiState,
  openTeamPanel,
  setDrawerMode,
} from "./board-interaction.js";
import { renderDraftBoard } from "./render-board.js";
import "./styles.css";

const baselineInput = createDemoDraftInput(canonicalTeams);
let scenarioOverrides = createEmptyScenarioOverrides();
let uiState = createBoardUiState();
let currentResolution = resolveScenario(baselineInput, scenarioOverrides);
const root = document.querySelector("#app");

function allocationSlots(resolvedState) {
  return new Map(
    resolvedState.allocations.map((allocation) => [allocation.teamId, allocation.r1Slot]),
  );
}

function activeControlDescriptor() {
  const active = document.activeElement;
  if (!active || !root.contains(active)) return null;
  return {
    id: active.id || null,
    action: active.dataset?.action ?? null,
    teamId: active.dataset?.teamId ?? null,
    playerId: active.dataset?.playerId ?? null,
    direction: active.dataset?.direction ?? null,
    mode: active.dataset?.mode ?? null,
  };
}

function restoreControlFocus(descriptor, focusTarget) {
  let target = null;
  if (focusTarget === "drawer-close") {
    target = root.querySelector('[data-action="close-drawer"]');
  } else if (focusTarget === "selected-team-header") {
    target = [...root.querySelectorAll('[data-action="select-team"]')].find(
      (control) => control.dataset.teamId === uiState.selectedTeamId,
    );
  } else if (descriptor) {
    target = [...root.querySelectorAll("button, select")].find(
      (control) =>
        (descriptor.id ? control.id === descriptor.id : true) &&
        (descriptor.action ? control.dataset.action === descriptor.action : true) &&
        (descriptor.teamId ? control.dataset.teamId === descriptor.teamId : true) &&
        (descriptor.playerId ? control.dataset.playerId === descriptor.playerId : true) &&
        (descriptor.direction ? control.dataset.direction === descriptor.direction : true) &&
        (descriptor.mode ? control.dataset.mode === descriptor.mode : true),
    );
    if (!target && descriptor.playerId) {
      target = [...root.querySelectorAll("button[data-player-id]")].find(
        (control) => control.dataset.playerId === descriptor.playerId,
      );
    }
  }
  if (!target && uiState.isTeamPanelOpen) {
    target = root.querySelector('[data-action="close-drawer"]');
  }
  target?.focus({ preventScroll: true });
}

function scrollBoardToSelectedTeam(behavior = "smooth") {
  if (!uiState.selectedTeamId) return;
  const boardScroll = document.querySelector("#board-scroll");
  if (!boardScroll) return;
  const column = [...boardScroll.querySelectorAll("[data-team-column]")].find(
    (candidate) => candidate.dataset.teamColumn === uiState.selectedTeamId,
  );
  if (!column) return;
  const stickyWidth = boardScroll.querySelector(".board-corner")?.offsetWidth ?? 0;
  const left = calculateColumnScrollLeft({
    scrollLeft: boardScroll.scrollLeft,
    clientWidth: boardScroll.clientWidth,
    scrollWidth: boardScroll.scrollWidth,
    stickyWidth,
    columnLeft: column.offsetLeft,
    columnWidth: column.offsetWidth,
  });
  boardScroll.scrollTo({ left, top: boardScroll.scrollTop, behavior });
}

function afterLayout(callback) {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

function render({ movedTeamIds = [], followSelectedTeam = false, focusTarget = null } = {}) {
  const focusDescriptor = activeControlDescriptor();
  const boardScroll = document.querySelector("#board-scroll");
  const previousScroll = boardScroll
    ? { left: boardScroll.scrollLeft, top: boardScroll.scrollTop }
    : { left: 0, top: 0 };
  const changeCount = countScenarioChanges(scenarioOverrides);
  const stateLabel =
    changeCount > 0
      ? `SCENARIO · ${changeCount} CHANGE${changeCount === 1 ? "" : "S"}`
      : demoFixtureDescription.label;
  const viewModel = buildDraftBoardViewModel({
    resolvedState: currentResolution.resolvedState,
    teams: currentResolution.input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
    stateLabel,
    scenarioChangeCount: changeCount,
    assumedEligibilityCount: scenarioOverrides.assumedEligiblePlayerIds.length,
    selectedTeamId: uiState.selectedTeamId,
    movedTeamIds,
  });
  const teamPanel = uiState.isTeamPanelOpen
    ? buildTeamScenarioViewModel({
        baselineInput,
        scenarioOverrides,
        resolvedState: currentResolution.resolvedState,
        teamId: uiState.selectedTeamId,
        identityMap,
        yahooPlayers: yahooPayload.players,
      })
    : null;

  root.innerHTML = renderDraftBoard(viewModel, teamPanel, uiState.drawerMode);
  const nextBoardScroll = document.querySelector("#board-scroll");
  if (nextBoardScroll) {
    nextBoardScroll.scrollLeft = previousScroll.left;
    nextBoardScroll.scrollTop = previousScroll.top;
  }
  afterLayout(() => {
    if (followSelectedTeam) {
      scrollBoardToSelectedTeam();
    }
    restoreControlFocus(focusDescriptor, focusTarget);
  });
}

function updateScenario(update) {
  const beforeSlots = allocationSlots(currentResolution.resolvedState);
  scenarioOverrides = update(scenarioOverrides);
  currentResolution = resolveScenario(baselineInput, scenarioOverrides);
  const afterSlots = allocationSlots(currentResolution.resolvedState);
  const movedTeamIds = [...afterSlots]
    .filter(([teamId, slot]) => beforeSlots.get(teamId) !== slot)
    .map(([teamId]) => teamId);
  render({ movedTeamIds, followSelectedTeam: true });
}

function canonicalPlayer(playerId) {
  return baselineInput.teams
    .flatMap((team) => team.priorDraft)
    .find((player) => player.playerId === playerId);
}

root.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  const teamId = control.dataset.teamId;
  const playerId = control.dataset.playerId;

  if (action === "select-team") {
    uiState = openTeamPanel(uiState, teamId);
    render({ followSelectedTeam: true, focusTarget: "drawer-close" });
  } else if (action === "close-drawer") {
    uiState = closeTeamPanel(uiState);
    render({ followSelectedTeam: true, focusTarget: "selected-team-header" });
  } else if (action === "set-drawer-mode") {
    uiState = setDrawerMode(uiState, control.dataset.mode);
    render();
  } else if (action === "reset-scenario") {
    scenarioOverrides = createEmptyScenarioOverrides();
    currentResolution = resolveScenario(baselineInput, scenarioOverrides);
    render({ followSelectedTeam: true });
  } else if (action === "set-steal") {
    updateScenario((overrides) =>
      setScenarioStealDirection(overrides, teamId, control.dataset.direction),
    );
  } else if (action === "assume-eligible") {
    updateScenario((overrides) => setScenarioEligibilityAssumption(overrides, playerId, true));
  } else if (action === "clear-assumption") {
    updateScenario((overrides) => setScenarioEligibilityAssumption(overrides, playerId, false));
  } else if (action === "select-keeper") {
    updateScenario((overrides) =>
      setScenarioKeeperSelection(overrides, teamId, playerId, true),
    );
  } else if (action === "remove-keeper") {
    updateScenario((overrides) => {
      let next = setScenarioKeeperSelection(overrides, teamId, playerId, false);
      if (canonicalPlayer(playerId)?.consecutiveYearKeeperEligibility === "UNKNOWN") {
        next = setScenarioEligibilityAssumption(next, playerId, false);
      }
      return next;
    });
  }
});

root.addEventListener("change", (event) => {
  if (event.target.id !== "team-jump") return;
  if (!event.target.value) return;
  uiState = openTeamPanel(uiState, event.target.value);
  render({ followSelectedTeam: true, focusTarget: "drawer-close" });
});

root.addEventListener("keydown", (event) => {
  const tab = event.target.closest('[role="tab"][data-action="set-drawer-mode"]');
  if (!tab || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const mode = tab.dataset.mode === "KEEPERS" ? "DRAFT_PATH" : "KEEPERS";
  uiState = setDrawerMode(uiState, mode);
  render();
});

render();
