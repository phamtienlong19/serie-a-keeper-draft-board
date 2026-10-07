import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createPreDraftInput } from "../src/domain/pre-draft.js";
import { resolveDraftState } from "../src/domain/engine.js";
import { buildBoardRanges, buildDraftPool, filterDraftPool } from "../src/presentation/draft-pool.js";
import { createEmptyScenarioOverrides, resolveScenario, setScenarioKeeperSelection } from "../src/scenario/scenario-state.js";
import { buildAvailableXRank, buildExportSheets } from "../src/exports/report-data.js";
import { renderPool } from "../src/ui/render-surfaces.js";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const base = createPreDraftInput(read("data/teams.json"), read("data/pre_draft.json"));
const yahoo = read("data/external/yahoo/players.json").players;
const identityMap = read("data/player_identity_map.json");
const resolvedState = resolveDraftState(base);
const overrides = createEmptyScenarioOverrides();
const poolFor = (state = resolvedState, changes = overrides) => buildDraftPool({ resolvedState: state, yahooPlayers: yahoo, identityMap, baselineInput: base, overrides: changes });

test("finalized declarations resolve the asserted R1 order without a presentation override", () => {
  const expected = ["sup fam", "Angry Bird", "TO KINH", "jinple", "Dial Square", "Run and Gun", "abcxyz", "Chicken Wings", "Bounce Island", "Cuckoo", "Seattle SuperSonics", "Dontrick DevilTeam", "MNQA", "ecstasy", "Rip City Remix", "Under Armour", "Tien Delay", "Rising Rockets"];
  const names = new Map(base.teams.map((team) => [team.teamId, team.name]));
  assert.equal(resolvedState.publicationStatus, "FINALIZED");
  assert.equal(resolvedState.finalizationAllowed, true);
  assert.equal(resolvedState.confirmedDeclarationCount, base.teams.length);
  assert.equal(base.keeperSelections.filter((row) => row.status !== "CONFIRMED").length, 0);
  assert.equal(base.stealDeclarations.filter((row) => row.status !== "CONFIRMED").length, 0);
  assert.deepEqual(base.keeperSelections.find((row) => row.teamId === "run-and-gun").selectedPlayerIds, []);
  assert.equal(base.stealDeclarations.find((row) => row.teamId === "run-and-gun").direction, "EARLY");
  assert.deepEqual(base.keeperSelections.find((row) => row.teamId === "rising-rockets").selectedPlayerIds, []);
  assert.equal(base.stealDeclarations.find((row) => row.teamId === "rising-rockets").direction, "LATE");
  assert.equal(resolvedState.keepers.length, 12);
  assert.deepEqual(resolvedState.validation, []);
  assert.deepEqual([...resolvedState.allocations].sort((a, b) => a.r1Slot - b.r1Slot).map((row) => names.get(row.teamId)), expected);
});

test("available rank is gapless; kept rows retain source XRank and have no available rank", () => {
  const pool = poolFor();
  const available = filterDraftPool(pool.rows);
  const kept = filterDraftPool(pool.rows, { availability: "KEPT" });
  assert.equal(yahoo.length, 300);
  assert.equal(available.length, 288);
  assert.equal(kept.length, 12);
  assert.deepEqual(available.map((row) => row.availableRank), Array.from({ length: available.length }, (_, i) => i + 1));
  assert.ok(available.every((row, index) => index === 0 || available[index - 1].xrank < row.xrank));
  assert.deepEqual(pool.rows.map((row) => row.xrank), [...yahoo].sort((a, b) => a.xrank - b.xrank).map((row) => row.xrank));
  assert.ok(kept.every((row) => row.availableRank === null && row.boardRange === null));
  assert.equal(pool.rows.find((row) => row.playerId === "shai-gilgeous-alexander").xrank, 4);
  assert.equal(pool.rows.find((row) => row.xrank === 5).availableRank, 4);
  assert.equal(filterDraftPool(pool.rows, { search: "Giannis" })[0].availableRank, 5);
});

test("board ranges follow keeper pick placement and cumulative open capacity", () => {
  const ranges = buildBoardRanges(resolvedState, base.teams.length);
  assert.deepEqual(ranges.map((range) => range.openSlots), [17, 17, 18, 16, 15, 16, 17, 17, 17, 18, 18]);
  assert.deepEqual(ranges.map((range) => range.end), [17, 34, 52, 68, 83, 99, 116, 133, 150, 168, 186]);
  assert.equal(ranges.reduce((sum, range) => sum + range.openSlots, 0), 186);
  assert.deepEqual(ranges[0].keepers, ["Shai Gilgeous-Alexander"]);
  assert.deepEqual(ranges[1].keepers, ["Scottie Barnes"]);
  assert.deepEqual(new Set(ranges[3].keepers), new Set(["Jayson Tatum", "Donovan Clingan"]));
  assert.deepEqual(new Set(ranges[4].keepers), new Set(["Tyrese Haliburton", "Onyeka Okongwu", "Kel'El Ware"]));
  for (const range of ranges) {
    const picks = resolvedState.picks.filter((pick) => pick.round === range.round);
    assert.equal(range.openSlots, picks.filter((pick) => pick.status === "OPEN").length);
    assert.equal(range.openSlots + range.keepers.length, base.teams.length);
  }
  const pool = poolFor();
  assert.equal(pool.boardCapacity, 186);
  assert.equal(pool.rows.find((row) => row.availableRank === 186).boardRange, "R11");
  assert.equal(pool.rows.find((row) => row.availableRank === 187).boardRange, "Beyond R11");
  assert.equal(pool.availableCount - pool.boardCapacity, 102);
});

test("rankings render dashed board separators, kept rows and filtered source ranks", () => {
  const pool = poolFor();
  const all = renderPool({ pool, visibleRows: filterDraftPool(pool.rows, { availability: "" }), filters: { availability: "" } });
  assert.match(all, /<th>Rank<\/th><th>Player<\/th><th>XRank<\/th>/);
  assert.match(all, /ROUND 4 · 16 OPEN PICKS/);
  assert.match(all, /Jayson Tatum, Donovan Clingan|Donovan Clingan, Jayson Tatum/);
  assert.match(all, /BEYOND CURRENT 11-ROUND BOARD · 102 PLAYERS/);
  assert.match(all, /<td class="available-rank">—<\/td><td class="rank-player">Shai Gilgeous-Alexander<\/td><td class="xrank">4<\/td>/);
  assert.doesNotMatch(all, /Projected Round|Auction/);
  const filtered = renderPool({ pool, visibleRows: filterDraftPool(pool.rows, { search: "Giannis" }), filters: { search: "Giannis", availability: "AVAILABLE" } });
  assert.match(filtered, /<td class="available-rank">5<\/td>/);
  assert.match(filtered, /ROUND 1 · 17 OPEN PICKS/);
  const css = fs.readFileSync("src/ui/styles.css", "utf8");
  assert.match(css, /\.pool-table \.rank-band-row td \{[^}]*border-top: 1px dashed/);
  assert.match(css, /\.pool-table thead th:first-child[^}]*top: 0/);
});

test("scenario keeper edits recompute ranks and bands while leaving finalized base unchanged", () => {
  const baseBefore = structuredClone(base);
  const changed = setScenarioKeeperSelection(overrides, "under-armour", "shai-gilgeous-alexander", false, base);
  const scenario = resolveScenario(base, changed);
  const scenarioPool = poolFor(scenario.resolvedState, changed);
  assert.equal(scenario.resolvedState.publicationStatus, "PRE_DRAFT");
  assert.equal(scenarioPool.availableCount, 289);
  assert.equal(scenarioPool.roundBands[0].openSlots, 18);
  assert.equal(scenarioPool.roundBands[0].end, 18);
  assert.equal(scenarioPool.boardCapacity, 187);
  assert.equal(scenarioPool.rows.find((row) => row.playerId === "shai-gilgeous-alexander").availableRank, 4);
  const added = setScenarioKeeperSelection(overrides, "sup-fam", "alex-sarr", true, base);
  const addedPool = poolFor(resolveScenario(base, added).resolvedState, added);
  assert.equal(addedPool.availableCount, 287);
  assert.equal(addedPool.roundBands[3].openSlots, 15);
  assert.equal(addedPool.roundBands[3].end, 67);
  assert.equal(poolFor().roundBands[3].openSlots, 16);
  assert.deepEqual(base, baseBefore);
});

test("a normal pick transfer changes ownership without changing ranking round capacity", () => {
  const trade = { tradeId: "pick-only", status: "HYPOTHETICAL", transfers: [{ originTeamId: "sup-fam", round: 6, fromTeamId: "sup-fam", toTeamId: "mnqa" }] };
  const changed = { ...overrides, trades: [trade] };
  const scenario = resolveScenario(base, changed);
  assert.equal(scenario.resolvedState.entitlements.find((row) => row.originTeamId === "sup-fam" && row.round === 6).currentOwnerTeamId, "mnqa");
  assert.deepEqual(buildBoardRanges(scenario.resolvedState, base.teams.length).map((range) => range.openSlots), buildBoardRanges(resolvedState, base.teams.length).map((range) => range.openSlots));
  assert.deepEqual(poolFor(scenario.resolvedState, changed).rows.map((row) => row.availableRank), poolFor().rows.map((row) => row.availableRank));
});

test("Available Rankings export carries rank, source XRank and board range", () => {
  const pool = poolFor();
  const report = buildAvailableXRank(pool.rows);
  assert.deepEqual(Object.keys(report[0]), ["Rank", "XRank", "Player", "Pos", "NBA", "Board Range"]);
  assert.equal(report.length, 288);
  assert.deepEqual(report.map((row) => row.Rank), Array.from({ length: 288 }, (_, i) => i + 1));
  assert.equal(report[185]["Board Range"], "R11");
  assert.equal(report[186]["Board Range"], "Beyond R11");
  const sheets = buildExportSheets({ input: base, resolvedState, baselineInput: base, overrides }, pool.rows, { title: "Final", generatedAt: "2026-10-07T00:00:00Z" });
  assert.deepEqual(sheets.find((sheet) => sheet.name === "Available Rankings").rows, report);
  assert.equal(sheets.find((sheet) => sheet.name === "State").rows[0]["Confirmed declarations"], "18 / 18");
  assert.equal(sheets.find((sheet) => sheet.name === "Full Draft Board").rows.length, 198);
  const tatum = sheets.find((sheet) => sheet.name === "Full Draft Board").rows.find((row) => row.Keeper === "Jayson Tatum");
  assert.equal(tatum["Keeper XRank"], yahoo.find((row) => row.fullName === "Jayson Tatum").xrank);
  assert.equal(sheets.find((sheet) => sheet.name === "Full Draft Board").rows.find((row) => row.Pick === "2.17")["Overall pick"], 35);
});
