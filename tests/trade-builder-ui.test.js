import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPreDraftInput } from "../src/domain/pre-draft.js";
import { resolveDraftState } from "../src/domain/engine.js";
import { createEmptyScenarioOverrides, resolveScenario, setScenarioStealDirection } from "../src/scenario/scenario-state.js";
import { newScenario, saveScenarios, loadScenarios, autosaveScenario } from "../src/scenario/storage.js";
import { addTradeAsset, createTradePackage, previewTradePackage, tradeAssetOptions } from "../src/presentation/trade-builder.js";
import { renderNavigation, renderTrades } from "../src/ui/render-surfaces.js";
import { buildDraftBoardViewModel } from "../src/presentation/board-view-model.js";
import { renderDraftBoard } from "../src/ui/render-board.js";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const base = createPreDraftInput(read("data/teams.json"), read("data/pre_draft.json"));
const baseline = resolveDraftState(base);
const teamA = "dontrick-devilteam", teamB = "sup-fam";
const empty = () => ({ teamA, teamB, a: [], b: [], picker: null, search: "" });

function referencePackage() {
  let builder = empty();
  const a = tradeAssetOptions(base, baseline, teamA);
  const b = tradeAssetOptions(base, baseline, teamB);
  builder = addTradeAsset(builder, "a", a.players.find((player) => player.playerId === "jayson-tatum"));
  builder = addTradeAsset(builder, "a", a.picks.find((pick) => pick.round === 2 && pick.originTeamId === teamA));
  builder = addTradeAsset(builder, "b", b.picks.find((pick) => pick.round === 1 && pick.originTeamId === teamB));
  return builder;
}

test("human-readable asset selection constructs Tatum and Dontrick R2 for the opposing R1", () => {
  const options = tradeAssetOptions(base, baseline, teamA);
  const tatum = options.players.find((player) => player.playerId === "jayson-tatum");
  assert.equal(tatum.label, "Jayson Tatum");
  assert.equal(tatum.isKeeper, true);
  assert.equal(tatum.keeperCost, 4);
  assert.equal(options.players.length, 1);
  assert.ok(options.players.every((player) => player.isKeeper));
  assert.equal(options.picks.find((pick) => pick.round === 2).label, "Dontrick DevilTeam · R2");
  assert.equal(options.picks.find((pick) => pick.round === 2).pickNumber, "2.07");
  assert.equal(options.picks.find((pick) => pick.round === 2).overallPick, 25);
  const builder = referencePackage();
  assert.deepEqual(builder.a.map((asset) => asset.label), ["Jayson Tatum", "Dontrick DevilTeam · R2"]);
  assert.equal(builder.b[0].label, "sup fam · R1");
  const trade = createTradePackage(builder, base, baseline, "test-package");
  assert.deepEqual(trade.transfers, [
    { originTeamId: teamA, round: 2, fromTeamId: teamA, toTeamId: teamB },
    { originTeamId: teamB, round: 1, fromTeamId: teamB, toTeamId: teamA },
  ]);
  assert.deepEqual(trade.playerMoves, [{ playerId: "jayson-tatum", fromTeamId: teamA, toTeamId: teamB }]);
  assert.equal(addTradeAsset(builder, "a", builder.a[0]), builder);
});

test("Tatum's proposed owner appears on his current keeper slot without changing official placement", () => {
  const builder = referencePackage();
  const before = structuredClone(base);
  const preview = previewTradePackage(builder, base, createEmptyScenarioOverrides(), { input: base, resolvedState: baseline });
  assert.match(preview.impact.join(" "), /Dontrick DevilTeam receives sup fam's first-round pick/);
  assert.match(preview.warnings.join(" "), /Keeper transfer rule requires commissioner confirmation/);
  assert.deepEqual(preview.keeperMoves.map((move) => [move.playerName, move.fromTeamName, move.toTeamName, move.costRound, move.pickNumber, move.overallPick]), [
    ["Jayson Tatum", "Dontrick DevilTeam", "sup fam", 4, "4.07", 61],
  ]);
  assert.deepEqual(preview.boardChanges.map((row) => [row.pickNumber, row.overallPick, row.beforeOwnerName, row.afterOwnerName]), [
    ["1.01", 1, "sup fam", "Dontrick DevilTeam"],
    ["2.07", 25, "Dontrick DevilTeam", "sup fam"],
  ]);
  const owner = (state, team, round) => state.entitlements.find((row) => row.originTeamId === team && row.round === round).currentOwnerTeamId;
  assert.equal(owner(preview.resolvedState, teamB, 1), teamA);
  assert.equal(owner(resolveDraftState(base), teamB, 1), teamB);
  assert.deepEqual(base, before);
  const overrides = { ...createEmptyScenarioOverrides(), trades: [{ ...preview.trade, tradeId: "saved" }] };
  assert.equal(resolveScenario(base, overrides).resolvedState.keepers.find((keeper) => keeper.playerId === "jayson-tatum").teamId, teamA);
  const board = buildDraftBoardViewModel({
    resolvedState: preview.resolvedState, teams: base.teams, identityMap: { matches: [] }, yahooPlayers: [],
    proposedPlayerMoves: preview.trade.playerMoves,
  });
  const tatumSlot = board.columns.find((column) => column.teamId === teamA).cells.find((cell) => cell.keeper?.playerId === "jayson-tatum");
  assert.equal(tatumSlot.currentOwnerTeamId, teamA);
  assert.equal(tatumSlot.proposedPlayerOwnerName, "sup fam");
  assert.match(renderDraftBoard(board), /OWNER: sup fam · proposed<\/span><span>PICK: Dontrick DevilTeam/);
  const baseBoard = buildDraftBoardViewModel({ resolvedState: baseline, teams: base.teams, identityMap: { matches: [] }, yahooPlayers: [] });
  assert.equal(baseBoard.columns.find((column) => column.teamId === teamA).cells.find((cell) => cell.keeper?.playerId === "jayson-tatum").proposedPlayerOwnerName, null);
  const scenario = { ...newScenario("Trade idea", base), overrides };
  let bytes;
  const storage = { getItem: () => bytes, setItem: (_, value) => { bytes = value; } };
  saveScenarios(storage, [scenario], base);
  assert.deepEqual(loadScenarios(storage, base)[0].overrides.trades[0].playerMoves, preview.trade.playerMoves);
  const html = renderTrades(base, baseline, null, builder, preview);
  assert.match(html, /Draft board after trade/);
  assert.match(html, /PROPOSED OWNER/);
  assert.match(html, /Current board: Dontrick DevilTeam · 4\.07 \(61\) · R4 keeper cost/);
  assert.match(html, /1\.01 \(1\)/);
  assert.match(html, /2\.07 \(25\)/);
  assert.match(html, /data-action="view-preview-board"/);
  assert.match(html, /Dontrick DevilTeam[^<]*<b aria-label="becomes">→<\/b> sup fam/);
  const recorded = renderTrades({ ...base, trades: [preview.trade] }, preview.resolvedState, { id: "scenario" }, empty());
  assert.match(recorded, /Dontrick DevilTeam · R2 · 2\.07 \(25\)/);
  assert.match(recorded, /PROPOSED OWNER/);
});

test("pick numbers follow the active scenario's resolved snake slots", () => {
  const changed = setScenarioStealDirection(createEmptyScenarioOverrides(), "sup-fam", "LATE");
  const scenario = resolveScenario(base, changed);
  const dontrickR2 = tradeAssetOptions(scenario.input, scenario.resolvedState, teamA).picks.find((pick) => pick.round === 2);
  const supR1 = tradeAssetOptions(scenario.input, scenario.resolvedState, teamB).picks.find((pick) => pick.round === 1);
  assert.equal(dontrickR2.pickNumber, "2.08");
  assert.equal(dontrickR2.overallPick, 26);
  assert.equal(supR1.pickNumber, "1.18");
  const html = renderTrades(scenario.input, scenario.resolvedState, null, referencePackage());
  assert.match(html, /Dontrick DevilTeam · R2<small class="trade-pick-number">2\.08 \(26\)<\/small>/);
  assert.match(html, /sup fam · R1<small class="trade-pick-number">1\.18 \(18\)<\/small>/);
  assert.equal(resolveDraftState(base).picks.find((pick) => pick.originTeamId === teamB && pick.round === 1).pickNumber, "1.01");
});

test("normal navigation hides backup controls under Advanced and trade builder uses manager labels", () => {
  const nav = renderNavigation({ activeView: "TRADES", scenario: null, saved: [], notice: "", baseStatus: "17 / 18 confirmed", pendingNames: ["Run and Gun"], dirty: false });
  assert.deepEqual([...nav.matchAll(/data-action="view"/g)].length, 4);
  assert.match(nav, /League Base/);
  assert.match(nav, /Save Copy/);
  assert.match(nav, /data-action="print-eligibility"/);
  assert.match(nav, /<details class="advanced-backup"><summary>Advanced \/ Backup<\/summary>/);
  assert.doesNotMatch(nav, /JSON|originTeamId|baseRevision/);
  const html = renderTrades(base, baseline, null, { ...referencePackage(), picker: "b" });
  assert.match(html, /Jayson Tatum/);
  assert.match(html, /drafted R5 → 2026 cost R4/);
  assert.doesNotMatch(html, /2025 roster|Players \/ Keepers/);
  assert.match(html, /Dontrick DevilTeam · R2/);
  assert.match(html, /sup fam · R1/);
  assert.match(html, /\+ Add asset/);
  assert.doesNotMatch(html, /originTeamId|currentOwnerTeamId/);
});

test("scenario changes autosave locally without replacing another workspace or baseline", () => {
  let bytes;
  const storage = { getItem: () => bytes, setItem: (_, value) => { bytes = value; } };
  const first = newScenario("First", base), other = newScenario("Other", base);
  saveScenarios(storage, [first, other], base);
  const changed = { ...first, overrides: { ...first.overrides, keeperSelections: { "run-and-gun": [] } } };
  const result = autosaveScenario(storage, loadScenarios(storage, base), changed, base, "2026-10-07T00:00:00.000Z");
  assert.equal(result.scenario.updatedAt, "2026-10-07T00:00:00.000Z");
  assert.deepEqual(loadScenarios(storage, base).find((s) => s.id === first.id).overrides.keeperSelections, { "run-and-gun": [] });
  assert.deepEqual(loadScenarios(storage, base).find((s) => s.id === other.id), other);
  assert.equal(resolveDraftState(base).confirmedDeclarationCount, 18);
});
