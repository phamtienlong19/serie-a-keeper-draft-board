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
import { renderDraftBoard } from "./render-board.js";
import "./styles.css";

const baselineInput = createDemoDraftInput(canonicalTeams);
let scenarioOverrides = createEmptyScenarioOverrides();
let selectedTeamId = null;
let currentResolution = resolveScenario(baselineInput, scenarioOverrides);
const root = document.querySelector("#app");

function allocationSlots(resolvedState) {
  return new Map(
    resolvedState.allocations.map((allocation) => [allocation.teamId, allocation.r1Slot]),
  );
}

function render({ movedTeamIds = [], focusSelectedTeam = false } = {}) {
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
    selectedTeamId,
    movedTeamIds,
  });
  const teamPanel = buildTeamScenarioViewModel({
    baselineInput,
    scenarioOverrides,
    resolvedState: currentResolution.resolvedState,
    teamId: selectedTeamId,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });

  root.innerHTML = renderDraftBoard(viewModel, teamPanel);
  const nextBoardScroll = document.querySelector("#board-scroll");
  if (nextBoardScroll) {
    nextBoardScroll.scrollLeft = previousScroll.left;
    nextBoardScroll.scrollTop = previousScroll.top;
  }
  if (focusSelectedTeam && selectedTeamId) {
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-team-column="${CSS.escape(selectedTeamId)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  }
}

function updateScenario(update) {
  const beforeSlots = allocationSlots(currentResolution.resolvedState);
  scenarioOverrides = update(scenarioOverrides);
  currentResolution = resolveScenario(baselineInput, scenarioOverrides);
  const afterSlots = allocationSlots(currentResolution.resolvedState);
  const movedTeamIds = [...afterSlots]
    .filter(([teamId, slot]) => beforeSlots.get(teamId) !== slot)
    .map(([teamId]) => teamId);
  render({ movedTeamIds, focusSelectedTeam: true });
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
    selectedTeamId = teamId;
    render({ focusSelectedTeam: true });
  } else if (action === "close-drawer") {
    selectedTeamId = null;
    render();
  } else if (action === "reset-scenario") {
    scenarioOverrides = createEmptyScenarioOverrides();
    currentResolution = resolveScenario(baselineInput, scenarioOverrides);
    render({ focusSelectedTeam: true });
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
  selectedTeamId = event.target.value || null;
  render({ focusSelectedTeam: true });
});

render();
