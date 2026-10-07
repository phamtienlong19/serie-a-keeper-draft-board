import { buildHistoricalEligibility, buildKeeperPage } from "../presentation/keeper-page.js";
import { renderKeeperPage } from "./render-keeper-page.js";
import canonicalTeams from "../../data/teams.json";
import identityMap from "../../data/player_identity_map.json";
import yahooPayload from "../../data/external/yahoo/players.json";
import declarations from "../../data/pre_draft.json";
import { createPreDraftInput, declarationProvenance } from "../domain/pre-draft.js";
import { resolveDraftState } from "../domain/engine.js";
import { newScenario, renameScenario, resetScenario, loadScenarios, saveScenarios, autosaveScenario, serializeScenario, deserializeScenario } from "../scenario/storage.js";
import { buildDraftPool, filterDraftPool } from "../presentation/draft-pool.js";
import { buildExportSheets } from "../exports/report-data.js";
import { buildXlsx } from "../exports/xlsx.js";
import { renderNavigation, renderPool, renderTrades } from "./render-surfaces.js";
import { addTradeAsset, previewTradePackage, tradeAssetKey, tradeAssetOptions } from "../presentation/trade-builder.js";
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

const baselineInput = createPreDraftInput(canonicalTeams, declarations);
let scenario = null;
let saved = [];
let notice = "";
let dirty = false;
let storageUnavailable = false;
let activeView = "BOARD";
let lastRenderedView = "BOARD";
let tradeBuilder = { teamA: "dontrick-devilteam", teamB: baselineInput.teams.find((team) => team.teamId !== "dontrick-devilteam").teamId, a: [], b: [], picker: null, search: "" };
let tradePreview = null;
let boardPreview = false;
let keeperMode = "DECISIONS";
let keeperSearch = "";
const historicalEligibility = buildHistoricalEligibility(baselineInput);
const filters = { search: "", position: "", nbaTeam: "", availability: "AVAILABLE" };
try { saved = loadScenarios(localStorage, baselineInput); }
catch (error) { notice = `Local scenarios unavailable: ${error.message} Stored data was left intact. Backup export is still available.`; storageUnavailable = true; }
function baseResolution() { return { input: baselineInput, resolvedState: resolveDraftState(baselineInput) }; }
let scenarioOverrides = createEmptyScenarioOverrides();
let uiState = createBoardUiState();
let currentResolution = baseResolution();
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
    view: active.dataset?.view ?? null,
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
        (descriptor.mode ? control.dataset.mode === descriptor.mode : true) &&
        (descriptor.view ? control.dataset.view === descriptor.view : true),
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
  const previousPaneScroll = activeView === lastRenderedView ? root.querySelector(".data-surface")?.scrollTop ?? 0 : 0;
  const libraryOpen = root.querySelector(".scenario-library")?.open ?? false;
  const advancedOpen = root.querySelector(".advanced-backup")?.open ?? false;
  const exportOpen = root.querySelector(".export-menu")?.open ?? false;
  const boardScroll = document.querySelector("#board-scroll");
  const previousScroll = boardScroll
    ? { left: boardScroll.scrollLeft, top: boardScroll.scrollTop }
    : { left: 0, top: 0 };
  const changeCount = countScenarioChanges(scenarioOverrides);
  const renderedResolution = boardPreview && tradePreview && activeView === "BOARD" ? { input: currentResolution.input, resolvedState: tradePreview.resolvedState } : currentResolution;
  const baseResolved = resolveDraftState(baselineInput);
  const baseStatus = `${baseResolved.confirmedDeclarationCount} / ${baselineInput.teams.length} declarations confirmed`;
  const pendingNames = baselineInput.teams.filter((t) => baselineInput.keeperSelections.find((r) => r.teamId === t.teamId)?.status !== "CONFIRMED").map((t) => t.name);
  const stateLabel = boardPreview && tradePreview ? "TRADE PREVIEW" : scenario ? `SCENARIO · ${changeCount} CHANGES` : baseResolved.publicationStatus === "FINALIZED" ? "FINALIZED" : `PRE-DRAFT / ${pendingNames.length ? "INCOMPLETE" : "AWAITING VERIFICATION"}`;
  const viewModel = buildDraftBoardViewModel({
    resolvedState: renderedResolution.resolvedState,
    teams: renderedResolution.input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
    stateLabel,
    scenarioChangeCount: changeCount,
    assumedEligibilityCount: scenarioOverrides.assumedEligiblePlayerIds.length,
    selectedTeamId: uiState.selectedTeamId,
    movedTeamIds,
    hypotheticalTradeKeys: [...(scenarioOverrides.trades ?? []), ...(boardPreview && tradePreview ? [tradePreview.trade] : [])].flatMap((trade) => trade.transfers.map((transfer) => `${transfer.originTeamId}:R${transfer.round}`)),
    proposedPlayerMoves: [...(currentResolution.input.trades ?? []), ...(boardPreview && tradePreview ? [tradePreview.trade] : [])]
      .filter((trade) => trade.status === "HYPOTHETICAL")
      .flatMap((trade) => trade.playerMoves ?? []),
  });
  viewModel.isTradePreview = boardPreview && Boolean(tradePreview) && activeView === "BOARD";
  if (viewModel.isTradePreview) for (const column of viewModel.columns) column.isReadOnlyPreview = true;
  const teamPanel = !boardPreview && uiState.isTeamPanelOpen
    ? buildTeamScenarioViewModel({
        baselineInput,
        scenarioOverrides,
        resolvedState: currentResolution.resolvedState,
        teamId: uiState.selectedTeamId,
        identityMap,
        yahooPlayers: yahooPayload.players,
      })
    : null;

  for (const column of viewModel.columns) column.provenance = declarationProvenance(baselineInput, scenarioOverrides, column.teamId);
  for (const team of viewModel.pendingTeams) team.provenance = declarationProvenance(baselineInput, scenarioOverrides, team.teamId);
  viewModel.teamOptions = baselineInput.teams.map((t) => ({ teamId: t.teamId, teamName: t.name, isSelected: t.teamId === uiState.selectedTeamId,
    r1PickNumber: renderedResolution.resolvedState.picks.find((p) => p.round === 1 && p.originTeamId === t.teamId)?.pickNumber }));
  viewModel.navigation = renderNavigation({ activeView, scenario, saved, notice, baseStatus, pendingNames, dirty });
  if (viewModel.isTradePreview) viewModel.navigation += `<div class="board-preview-banner"><strong>HYPOTHETICAL BOARD · NOT SAVED</strong><span>Proposed player owners are marked on keeper slots. Receiving-team keeper placement needs commissioner confirmation.</span><button type="button" data-action="back-to-trade">Back to trade</button></div>`;
  viewModel.generatedAt = new Date().toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" }) + " ICT";
  viewModel.printTitle = `${viewModel.isTradePreview ? "Hypothetical trade board preview" : activeView === "DECISIONS" ? keeperMode === "ELIGIBILITY" ? "Keeper Eligibility" : "Keeper Decisions" : "Draft Board"} · ${scenario ? scenario.name : "Current league inputs"} · ${baseStatus}`;
  root.innerHTML = renderDraftBoard(viewModel, teamPanel, uiState.drawerMode);
  document.body.dataset.activeView = activeView;
  document.body.dataset.keeperMode = keeperMode;
  root.querySelector(".scenario-library").open = libraryOpen;
  root.querySelector(".advanced-backup").open = advancedOpen;
  root.querySelector(".export-menu").open = exportOpen;
  if (activeView !== "BOARD") {
    const pane = root.querySelector(".board-pane");
    const pool = poolData();
    pane.innerHTML = activeView === "POOL" ? renderPool({ pool, visibleRows: filterDraftPool(pool.rows, filters), filters })
      : activeView === "DECISIONS" ? renderKeeperPage(buildKeeperPage(reportContext(), identityMap, yahooPayload.players, historicalEligibility), { mode: keeperMode, search: keeperSearch })
      : renderTrades(currentResolution.input, currentResolution.resolvedState, scenario, tradeBuilder, tradePreview);
    pane.querySelector(".data-surface").scrollTop = previousPaneScroll;
  }
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
  lastRenderedView = activeView;
}

function updateScenario(update) {
  ensureScenario();
  dirty = true;
  const beforeSlots = allocationSlots(currentResolution.resolvedState);
  scenarioOverrides = update(scenarioOverrides);
  scenario = { ...scenario, overrides: scenarioOverrides };
  currentResolution = resolveScenario(baselineInput, scenarioOverrides);
  tradePreview = null;
  boardPreview = false;
  autosave();
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

root.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  const teamId = control.dataset.teamId;
  const playerId = control.dataset.playerId;
  if (await handleWorkspaceAction(action, control)) return;

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
    if (scenario) scenario = resetScenario(scenario, baselineInput);
    scenarioOverrides = scenario?.overrides ?? createEmptyScenarioOverrides();
    dirty = Boolean(scenario);
    currentResolution = scenario ? resolveScenario(baselineInput, scenarioOverrides) : baseResolution();
    tradePreview = null; boardPreview = false; autosave();
    render({ followSelectedTeam: true });
  } else if (action === "no-keepers") {
    updateScenario((overrides) => ({ ...overrides, keeperSelections: { ...overrides.keeperSelections, [teamId]: [] } }));
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
      setScenarioKeeperSelection(overrides, teamId, playerId, true, baselineInput),
    );
  } else if (action === "remove-keeper") {
    updateScenario((overrides) => {
      let next = setScenarioKeeperSelection(overrides, teamId, playerId, false, baselineInput);
      if (canonicalPlayer(playerId)?.consecutiveYearKeeperEligibility === "UNKNOWN") {
        next = setScenarioEligibilityAssumption(next, playerId, false);
      }
      return next;
    });
  }
});

root.addEventListener("change", async (event) => {
  const id = event.target.id;
  if (id === "keeper-jump" && event.target.value) {
    const teamId = event.target.value;
    keeperSearch = ""; render();
    root.querySelector(`#keeper-card-${CSS.escape(teamId)}`)?.scrollIntoView({ block: "start" }); return;
  }
  if (id.startsWith("pool-")) {
    const key = { "pool-position": "position", "pool-team": "nbaTeam", "pool-availability": "availability" }[id];
    if (key) { filters[key] = event.target.value; render(); }
    return;
  }
  if (id === "saved-scenario" && event.target.value) {
    const selected = saved.find((s) => s.id === event.target.value) ?? (scenario?.id === event.target.value ? scenario : null);
    if (!selected) return;
    if (selected.baseRevision !== baselineInput.baseRevision) {
      if (confirm("League inputs changed since this scenario was saved. Create a fresh copy using the current league inputs? The older scenario will stay saved.")) {
        activateScenario(newScenario(`${selected.name} · updated`, baselineInput)); autosave();
        notice = "Fresh copy saved. The older scenario remains available in the menu.";
      } else notice = "Older scenario left unchanged.";
      render(); return;
    }
    activateScenario(structuredClone(selected)); return;
  }
  if (id === "saved-scenario") {
    scenario = null; scenarioOverrides = createEmptyScenarioOverrides(); currentResolution = baseResolution(); dirty = false; notice = ""; tradePreview = null; boardPreview = false; render(); return;
  }
  if (id === "trade-team-a" || id === "trade-team-b") {
    const key = id.endsWith("a") ? "teamA" : "teamB";
    tradeBuilder = { ...tradeBuilder, [key]: event.target.value, [key === "teamA" ? "a" : "b"]: [], picker: null, search: "" };
    tradePreview = null; boardPreview = false; render(); return;
  }
  if (id === "import-scenario") {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1000000) throw new Error("Backup exceeds the 1 MB limit.");
      const imported = deserializeScenario(await file.text(), baselineInput);
      if (imported.baseRevision !== baselineInput.baseRevision) throw new Error("Scenario base revision differs from current inputs; import has not been applied.");
      imported.id = crypto.randomUUID(); // Imports never overwrite another saved scenario.
      activateScenario(imported); autosave(); notice = "Backup imported and saved in this browser."; render();
    } catch (error) { notice = error.message; render(); }
    return;
  }
  if (id !== "team-jump") return;
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

function reportContext() {
  return boardPreview && tradePreview
    ? { input: { ...currentResolution.input, trades: [...currentResolution.input.trades, tradePreview.trade] }, resolvedState: tradePreview.resolvedState, baselineInput, overrides: scenarioOverrides }
    : { ...currentResolution, baselineInput, overrides: scenarioOverrides };
}
function poolData() { return buildDraftPool({ ...reportContext(), yahooPlayers: yahooPayload.players, identityMap }); }
function ensureScenario() {
  if (!scenario) {
    scenario = newScenario("New scenario", baselineInput);
    currentResolution = resolveScenario(baselineInput, scenarioOverrides);
    autosave();
  }
}
function activateScenario(value) {
  scenario = value; scenarioOverrides = value.overrides; dirty = false; notice = "";
  currentResolution = resolveScenario(baselineInput, scenarioOverrides); tradePreview = null; boardPreview = false; render();
}
function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function persist(next) {
  if (storageUnavailable) throw new Error("Local storage is unavailable or invalid. Existing data is preserved; use Export backup.");
  saveScenarios(localStorage, next, baselineInput); saved = next;
}
function autosave() {
  if (!scenario) return;
  try {
    if (storageUnavailable) throw new Error("Local storage is unavailable or invalid. Existing data is preserved; use Export backup.");
    const result = autosaveScenario(localStorage, saved, { ...scenario, overrides: scenarioOverrides }, baselineInput);
    scenario = result.scenario; saved = result.saved;
    dirty = false;
  } catch (error) { dirty = true; notice = `Could not save locally: ${error.message}`; }
}
async function handleWorkspaceAction(action, control) {
  try {
    if (action === "keeper-mode") { keeperMode = control.dataset.mode; }
    else if (action === "view") { activeView = control.dataset.view; boardPreview = false; uiState = closeTeamPanel(uiState); }
    else if (action === "view-preview-board") { if (!tradePreview) throw new Error("Preview the trade first."); activeView = "BOARD"; boardPreview = true; uiState = closeTeamPanel(uiState); }
    else if (action === "back-to-trade") { activeView = "TRADES"; boardPreview = false; }
    else if (action === "new-scenario") {
      const name = prompt("Name this scenario", scenario ? `${scenario.name} copy` : "New scenario");
      if (!name?.trim()) return true;
      const next = { ...newScenario(name.trim(), baselineInput), overrides: structuredClone(scenarioOverrides) };
      activateScenario(next); autosave();
    }
    else if (action === "base-state") { scenario = null; dirty = false; scenarioOverrides = createEmptyScenarioOverrides(); currentResolution = baseResolution(); tradePreview = null; boardPreview = false; }
    else if (action === "save-scenario") { ensureScenario(); autosave(); }
    else if (action === "rename-scenario") {
      const name = prompt("Scenario name", scenario.name);
      if (!name?.trim()) return true;
      const next = renameScenario(scenario, name);
      scenario = next; autosave();
    } else if (action === "duplicate-scenario") {
      const next = { ...newScenario(`${scenario.name} copy`, baselineInput), overrides: structuredClone(scenarioOverrides) };
      activateScenario(next); autosave();
    } else if (action === "delete-scenario") {
      persist(saved.filter((s) => s.id !== scenario.id)); scenario = null; scenarioOverrides = createEmptyScenarioOverrides(); currentResolution = baseResolution(); dirty = false;
    } else if (action === "export-scenario") {
      download(serializeScenario({ ...scenario, overrides: scenarioOverrides }, baselineInput), "serie-a-scenario.json", "application/json");
    } else if (action === "export-xlsx") {
      const sheets = buildExportSheets(reportContext(), poolData().rows, { title: boardPreview ? "HYPOTHETICAL TRADE PREVIEW" : scenario ? `SCENARIO: ${scenario.name}` : `${currentResolution.resolvedState.publicationStatus} · ${currentResolution.resolvedState.confirmedDeclarationCount} / 18 confirmed`, generatedAt: new Date().toISOString() });
      download(buildXlsx(sheets), "serie-a-pre-draft.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } else if (action === "print-board" || action === "print-keepers" || action === "print-eligibility") {
      activeView = action === "print-board" ? "BOARD" : "DECISIONS";
      if (action !== "print-board") boardPreview = false;
      if (action === "print-eligibility") keeperMode = "ELIGIBILITY";
      else if (action === "print-keepers") keeperMode = "DECISIONS";
      uiState = closeTeamPanel(uiState); render();
      document.body.dataset.printView = activeView;
      window.print(); return true;
    } else if (action === "open-asset-picker") {
      tradeBuilder = { ...tradeBuilder, picker: tradeBuilder.picker === control.dataset.side ? null : control.dataset.side, search: "" };
    } else if (action === "choose-asset") {
      const side = control.dataset.side;
      const options = tradeAssetOptions(currentResolution.input, currentResolution.resolvedState, side === "a" ? tradeBuilder.teamA : tradeBuilder.teamB);
      const asset = [...options.players, ...options.picks].find((item) => tradeAssetKey(item) === control.dataset.assetKey);
      if (!asset) throw new Error("This asset is no longer available.");
      tradeBuilder = { ...addTradeAsset(tradeBuilder, side, asset), picker: null, search: "" }; tradePreview = null;
    } else if (action === "remove-asset") {
      const side = control.dataset.side; const index = Number(control.dataset.index);
      tradeBuilder = { ...tradeBuilder, [side]: tradeBuilder[side].filter((_, i) => i !== index) }; tradePreview = null;
    } else if (action === "move-asset") {
      const side = control.dataset.side; const index = Number(control.dataset.index);
      const destination = index + (control.dataset.direction === "up" ? -1 : 1);
      const assets = [...tradeBuilder[side]];
      if (destination >= 0 && destination < assets.length) [assets[index], assets[destination]] = [assets[destination], assets[index]];
      tradeBuilder = { ...tradeBuilder, [side]: assets }; tradePreview = null;
    } else if (action === "preview-trade") {
      tradePreview = previewTradePackage(tradeBuilder, baselineInput, scenarioOverrides, currentResolution);
      boardPreview = false;
    } else if (action === "save-trade") {
      if (!tradePreview) throw new Error("Preview the current package first.");
      const proposal = { ...tradePreview.trade, tradeId: crypto.randomUUID() };
      updateScenario((o) => ({ ...o, trades: [...(o.trades ?? []), proposal] }));
      tradeBuilder = { ...tradeBuilder, a: [], b: [], picker: null, search: "" }; tradePreview = null; render(); return true;
    } else if (action === "remove-trade") {
      updateScenario((o) => ({ ...o, trades: o.trades.filter((t) => t.tradeId !== control.dataset.tradeId) })); return true;
    } else return false;
  } catch (error) { notice = error.message; }
  render(); return true;
}
root.addEventListener("input", (event) => {
  if (event.target.id === "trade-asset-search") {
    const position = event.target.selectionStart;
    tradeBuilder = { ...tradeBuilder, search: event.target.value }; render();
    const search = root.querySelector("#trade-asset-search"); search?.focus(); search?.setSelectionRange(position, position); return;
  }
  if (event.target.id === "keeper-search") {
    const position = event.target.selectionStart;
    keeperSearch = event.target.value; render();
    const search = root.querySelector("#keeper-search"); search.focus(); search.setSelectionRange(position, position); return;
  }
  if (event.target.id !== "pool-search") return;
  const position = event.target.selectionStart;
  filters.search = event.target.value; render();
  const search = root.querySelector("#pool-search"); search.focus(); search.setSelectionRange(position, position);
});
window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
render();
