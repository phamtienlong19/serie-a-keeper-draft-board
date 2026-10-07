import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createPreDraftInput } from "../src/domain/pre-draft.js";
import { resolveDraftState } from "../src/domain/engine.js";
import { extractYahooPlayers, createYahooMetadataIndex } from "../src/external/yahoo.js";
import { createEmptyScenarioOverrides, resolveScenario, setScenarioKeeperSelection, setScenarioStealDirection, evaluateKeeperCandidates } from "../src/scenario/scenario-state.js";
import { newScenario, resetScenario, serializeScenario, deserializeScenario, saveScenarios, loadScenarios } from "../src/scenario/storage.js";
import { buildDraftPool, filterDraftPool } from "../src/presentation/draft-pool.js";
import { buildKeeperDecisions, buildDraftOrder, buildAvailableXRank, buildExportSheets } from "../src/exports/report-data.js";
import { buildXlsx } from "../src/exports/xlsx.js";
import { renderNavigation, renderPool, renderDecisions } from "../src/ui/render-surfaces.js";
const read = (p) => JSON.parse(fs.readFileSync(p));
const canonical = read("data/teams.json"), declarations = read("data/pre_draft.json");
const yahoo = read("data/external/yahoo/players.json").players, identities = read("data/player_identity_map.json");
const base = createPreDraftInput(canonical, declarations);
const empty = createEmptyScenarioOverrides();
const resolution = { input: base, resolvedState: resolveDraftState(base) };
const context = (overrides = empty) => ({ ...(overrides === empty ? resolution : resolveScenario(base, overrides)), baselineInput: base, overrides });
const pool = (overrides = empty, identityMap = identities) => buildDraftPool({ ...context(overrides), yahooPlayers: yahoo, identityMap });
const expected = {
  "sup-fam": [[], "EARLY"], "dontrick-devilteam": [["jayson-tatum"], "EARLY"],
  "rising-rockets": [[], "LATE"], "chicken-wings": [[], "EARLY"], "mnqa": [["fred-vanvleet"], "LATE"],
  "cuckoo": [["donovan-clingan", "kyrie-irving"], "EARLY"], "seattle-supersonics": [["scottie-barnes"], "EARLY"],
  "jinple": [[], "EARLY"], "dial-square": [[], "EARLY"], "to-kinh": [[], "EARLY"], "ecstasy": [["onyeka-okongwu"], "LATE"],
  "tien-delay": [[], "LATE"], "rip-city-remix": [["rui-hachimura", "kel-el-ware"], "LATE"], "angry-bird": [[], "EARLY"],
  "abcxyz": [[], "EARLY"], "bounce-island": [["dejounte-murray", "dylan-harper"], "EARLY"],
  "under-armour": [["shai-gilgeous-alexander", "tyrese-haliburton"], "LATE"],
  "run-and-gun": [[], "EARLY"],
};
function completeScenario() {
  return { ...empty, keeperSelections: { "run-and-gun": [] }, stealDirections: { "run-and-gun": "EARLY" } };
}
test("all 18 final declarations include Run and Gun Early and Rising Rockets Late", () => {
  assert.equal(resolution.resolvedState.confirmedDeclarationCount, 18);
  for (const [teamId, [keepers, direction]] of Object.entries(expected)) {
    assert.deepEqual(base.keeperSelections.find((r) => r.teamId === teamId), { teamId, status: "CONFIRMED", selectedPlayerIds: keepers });
    assert.deepEqual(base.stealDeclarations.find((r) => r.teamId === teamId), { teamId, status: "CONFIRMED", direction });
  }
  assert.equal(base.keeperSelections.filter((r) => r.status === "CONFIRMED" && r.selectedPlayerIds.length === 0).length, 10);
  assert.equal(base.keeperSelections.filter((r) => r.status !== "CONFIRMED").length, 0);
  assert.equal(base.stealDeclarations.filter((r) => r.status !== "CONFIRMED").length, 0);
  assert.equal(resolution.resolvedState.keepers.length, 12);
  assert.deepEqual(resolution.resolvedState.validation, []);
  assert.equal(resolution.resolvedState.picks.length, 198);
  assert.equal(resolution.resolvedState.publicationStatus, "FINALIZED");
});
test("finalization is explicit and blocked for incomplete or scenario states", () => {
  const incomplete = structuredClone(base);
  incomplete.keeperSelections.find((r) => r.teamId === "run-and-gun").status = "PENDING";
  incomplete.stealDeclarations.find((r) => r.teamId === "run-and-gun").status = "PENDING";
  const blocked = resolveDraftState(incomplete);
  assert.equal(blocked.publicationStatus, "PRE_DRAFT");
  assert.ok(blocked.validation.some((v) => v.code === "FINALIZATION_BLOCKED"));
  const complete = resolveScenario(base, completeScenario());
  assert.equal(complete.resolvedState.picks.length, 198);
  assert.equal(complete.resolvedState.publicationStatus, "PRE_DRAFT");
  assert.equal(resolveDraftState({ ...complete.input, publicationStatus: "FINALIZED" }).publicationStatus, "PRE_DRAFT");
  const confirmed = structuredClone(complete.input);
  confirmed.stateType = "WORKING";
  confirmed.keeperSelections.forEach((r) => r.status = "CONFIRMED");
  confirmed.stealDeclarations.forEach((r) => r.status = "CONFIRMED");
  assert.equal(resolveDraftState(confirmed).publicationStatus, "PRE_DRAFT");
  assert.equal(resolveDraftState({ ...confirmed, publicationStatus: "FINALIZED" }).publicationStatus, "FINALIZED");
});
test("missing selectedPlayerIds cannot become a zero-keeper declaration", () => {
  const input = structuredClone(base);
  delete input.keeperSelections[0].selectedPlayerIds;
  const result = resolveDraftState(input);
  assert.ok(result.validation.some((v) => v.code === "INVALID_KEEPER_SELECTION"));
  assert.equal(result.teamKeeperStates[0].bucket, null);
});
test("XRank follows each player's Yahoo OR rank, independent of average-pick array order", () => {
  const raw = read("data/external/yahoo/draft_analysis.json");
  const parsed = extractYahooPlayers(raw);
  assert.deepEqual(parsed, yahoo);
  assert.equal(parsed.length, 300);
  parsed.forEach((p, i) => {
    assert.equal(p.xrank, Number(raw.fantasy_content.league.players[i].player.player_ranks.find((rank) => rank.player_rank.rank_type === "OR").player_rank.rank_value));
    assert.equal(p.yahooPlayerId, raw.fantasy_content.league.players[i].player.player_id);
  });
  assert.ok(parsed.every((p) => p.xrank === p.oRank));
  assert.equal(parsed.find((p) => p.fullName === "Stephen Curry").xrank, 25);
  assert.equal(parsed.find((p) => p.fullName === "Stephen Curry").oRank, 25);
  assert.equal(parsed.find((p) => p.fullName === "Dejounte Murray").xrank, 55);
  assert.equal(parsed.find((p) => p.fullName === "Bronny James").xrank, 467);
  const duplicate = structuredClone(raw);
  duplicate.fantasy_content.league.players[1] = duplicate.fantasy_content.league.players[0];
  assert.throws(() => extractYahooPlayers(duplicate), /duplicate/);
  const duplicateRank = structuredClone(raw);
  duplicateRank.fantasy_content.league.players[1].player.player_ranks[0].player_rank.rank_value = "1";
  assert.throws(() => extractYahooPlayers(duplicateRank), /duplicate OR\/XRank/);
  assert.throws(() => extractYahooPlayers({}), /does not contain/);
});
test("all declared keeper identities are stable and unambiguous", () => {
  const index = createYahooMetadataIndex(identities, yahoo);
  for (const k of resolution.resolvedState.keepers) assert.ok(index.get(k.playerId)?.metadata, k.playerId);
  assert.deepEqual(pool().issues, []);
  const duplicate = structuredClone(identities); duplicate.matches.push(duplicate.matches[0]);
  assert.throws(() => pool(empty, duplicate), /Ambiguous/);
  const missing = structuredClone(identities); missing.matches = missing.matches.filter((r) => r.playerId !== "jayson-tatum");
  assert.match(pool(empty, missing).issues.join(""), /Jayson Tatum/);
});
test("available pool excludes 12 resolved keepers without compressing XRank", () => {
  const all = pool().rows, available = filterDraftPool(all), kept = filterDraftPool(all, { availability: "KEPT" });
  assert.equal(available.length, 288); assert.equal(kept.length, 12);
  assert.deepEqual(filterDraftPool(all, { availability: "" }).map((r) => r.xrank), [...yahoo].map((r) => r.xrank).sort((a, b) => a - b));
  for (const row of available) assert.equal(row.xrank, yahoo.find((p) => p.yahooPlayerId === row.yahooPlayerId).xrank);
  for (const row of kept) {
    const keeper = resolution.resolvedState.keepers.find((k) => k.playerId === row.playerId);
    assert.equal(row.keeperTeamId, keeper.teamId); assert.equal(row.resolvedCostRound, keeper.resolvedCostRound); assert.equal(row.provenance, "CONFIRMED");
  }
  const tatum = kept.find((p) => p.playerId === "jayson-tatum");
  assert.equal(filterDraftPool(all, { availability: "", search: "tatum", nbaTeam: tatum.nbaTeamAbbreviation, position: tatum.eligiblePositions[0] }).length, 1);
});
test("scenario deselection releases base keeper and retains other base keepers", () => {
  const before = structuredClone(base);
  const overrides = setScenarioKeeperSelection(empty, "cuckoo", "kyrie-irving", false, base);
  assert.deepEqual(overrides.keeperSelections.cuckoo, ["donovan-clingan"]);
  assert.equal(pool(overrides).rows.find((r) => r.playerId === "kyrie-irving").availability, "AVAILABLE");
  assert.equal(pool(overrides).rows.find((r) => r.playerId === "donovan-clingan").provenance, "SCENARIO OVERRIDE");
  const none = setScenarioKeeperSelection(overrides, "cuckoo", "donovan-clingan", false, base);
  assert.deepEqual(none.keeperSelections.cuckoo, []);
  const early = setScenarioStealDirection(empty, "mnqa", "EARLY");
  assert.equal(resolveScenario(base, early).resolvedState.allocations.find((r) => r.teamId === "mnqa").stealDirection, "EARLY");
  assert.deepEqual(base, before);
  const candidates = evaluateKeeperCandidates({ baselineInput: base, overrides: empty, teamId: "cuckoo" });
  assert.equal(candidates.filter((c) => c.selected).length, 2);
});
test("scenario wire format and localStorage round-trip only input overrides", () => {
  const scenario = newScenario("My room", base);
  scenario.overrides = completeScenario();
  const serialized = serializeScenario(scenario, base);
  assert.deepEqual(deserializeScenario(serialized, base), scenario);
  assert.doesNotMatch(serialized, /pickNumber|r1Slot|resolvedCostRound|availablePlayers/);
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => stored = value };
  saveScenarios(storage, [scenario], base); assert.deepEqual(loadScenarios(storage, base), [scenario]);
  const reset = resetScenario(scenario, base);
  assert.deepEqual(reset.overrides, empty);
  assert.deepEqual(resolveScenario(base, reset.overrides).resolvedState.picks, resolution.resolvedState.picks);
  assert.throws(() => deserializeScenario("no json", base), /Malformed/);
  for (const invalid of [{ ...scenario, schemaVersion: 2 }, { ...scenario, picks: [] }, { ...scenario, overrides: { ...empty, keeperSelections: { fake: [] } } }, { ...scenario, overrides: { ...empty, keeperSelections: { cuckoo: ["jayson-tatum"] } } }, { ...scenario, overrides: { ...empty, stealDirections: { cuckoo: "maybe" } } }]) {
    assert.throws(() => deserializeScenario(JSON.stringify(invalid), base));
  }
  assert.throws(() => saveScenarios({ setItem() { throw new Error("quota"); } }, [scenario], base), /quota/);
});
test("confirmed trades apply to baseline; hypothetical trades only affect scenarios", () => {
  const trade = { tradeId: "test", status: "HYPOTHETICAL", transfers: [{ originTeamId: "sup-fam", round: 6, fromTeamId: "sup-fam", toTeamId: "mnqa" }] };
  const owner = (r) => r.entitlements.find((e) => e.originTeamId === "sup-fam" && e.round === 6).currentOwnerTeamId;
  assert.equal(owner(resolveDraftState({ ...base, trades: [trade] })), "sup-fam");
  assert.equal(owner(resolveDraftState({ ...base, trades: [{ ...trade, status: "CONFIRMED" }] })), "mnqa");
  const overrides = { ...completeScenario(), trades: [trade] };
  const first = resolveScenario(base, overrides);
  const second = resolveScenario(base, setScenarioStealDirection(overrides, "sup-fam", "LATE"));
  const pick = (r) => r.resolvedState.picks.find((p) => p.originTeamId === "sup-fam" && p.round === 6);
  assert.equal(pick(first).currentOwnerTeamId, "mnqa");
  assert.notEqual(pick(first).pickNumber, pick(second).pickNumber);
  assert.deepEqual(base.trades, []);
  const s = newScenario("Trade", base); s.overrides = overrides;
  assert.deepEqual(deserializeScenario(serializeScenario(s, base), base).overrides.trades, [trade]);
  s.overrides.trades[0].transfers[0].pickNumber = "6.18";
  assert.throws(() => serializeScenario(s, base), /Invalid/);
});
test("reports derive final slots, declarations and available rank", () => {
  const rows = buildKeeperDecisions(context());
  assert.equal(rows.length, 18);
  assert.equal(rows.find((r) => r.Team === "Run and Gun")["Declaration status"], "NO KEEPERS CONFIRMED");
  assert.equal(rows.find((r) => r.Team === "Run and Gun")["EARLY / LATE"], "EARLY");
  assert.equal(rows.find((r) => r.Team === "Rising Rockets")["EARLY / LATE"], "LATE");
  assert.equal(rows.find((r) => r.Team === "sup fam")["Declaration status"], "NO KEEPERS CONFIRMED");
  assert.ok(rows.every((r) => r["R1 slot"] !== "PENDING"));
  assert.ok(buildDraftOrder(context()).every((r) => r["R1 slot"] !== "PENDING"));
  assert.deepEqual(buildAvailableXRank(pool().rows).map((r) => r.XRank), filterDraftPool(pool().rows).map((r) => r.xrank));
  assert.deepEqual(buildAvailableXRank(pool().rows).map((r) => r.Rank), Array.from({ length: 288 }, (_, i) => i + 1));
  const resolved = context(completeScenario());
  assert.equal(buildKeeperDecisions(resolved).find((r) => r.Team === "Run and Gun")["Declaration status"], "SCENARIO OVERRIDE");
  const sheets = buildExportSheets(resolved, pool().rows, { title: "Scenario", generatedAt: "2026-10-06T00:00:00Z" });
  assert.equal(sheets.find((s) => s.name === "Full Draft Board").rows.length, 198);
  assert.deepEqual(sheets.map((s) => s.name), ["State", "Keeper Decisions", "Draft Order", "Pick Trades", "Available Rankings", "Full Draft Board"]);
  const workbook = buildXlsx(sheets);
  assert.equal(new DataView(workbook.buffer).getUint32(0, true), 0x04034b50);
  const text = new TextDecoder().decode(workbook);
  assert.match(text, /xl\/worksheets\/sheet6.xml/);
  assert.doesNotMatch(text, /<f>/); // Strings are never interpreted as spreadsheet formulas.
});
test("UI surfaces display provenance, kept filters and input-only scenario controls", () => {
  const navigation = renderNavigation({ activeView: "BOARD", scenario: null, saved: [], notice: "", baseStatus: "18 / 18 declarations confirmed", pendingNames: [], dirty: false });
  assert.match(navigation, /18 \/ 18 declarations confirmed/); assert.doesNotMatch(navigation, /PENDING/);
  const all = pool();
  const html = renderPool({ pool: all, visibleRows: filterDraftPool(all.rows, { availability: "" }), filters: { availability: "" } });
  assert.match(html, /Show kept/); assert.match(html, /KEPT/); assert.doesNotMatch(html, /Auction/);
  assert.match(renderDecisions(buildKeeperDecisions(context())), /Rising Rockets/);
});
