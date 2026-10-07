import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPreDraftInput } from "../src/domain/pre-draft.js";
import { resolveDraftState } from "../src/domain/engine.js";
import { buildHistoricalEligibility, buildKeeperPage } from "../src/presentation/keeper-page.js";
import { renderKeeperPage } from "../src/ui/render-keeper-page.js";
import { buildKeeperDecisions } from "../src/exports/report-data.js";
import { createEmptyScenarioOverrides, resolveScenario } from "../src/scenario/scenario-state.js";
import { buildPlayerIdentityMap } from "../src/external/yahoo.js";
const read = (p) => JSON.parse(fs.readFileSync(p));
const base = createPreDraftInput(read("data/teams.json"), read("data/pre_draft.json"));
const identity = read("data/player_identity_map.json"), yahoo = read("data/external/yahoo/players.json").players;
const context = { input: base, baselineInput: base, overrides: createEmptyScenarioOverrides(), resolvedState: resolveDraftState(base) };
const historical = buildHistoricalEligibility(base);
const cards = buildKeeperPage(context, identity, yahoo, historical);
const mappings = { "shai-gilgeous-alexander": [1,1], "tyrese-haliburton": [6,5], "jayson-tatum": [5,4], "fred-vanvleet": [10,8], "donovan-clingan": [5,4], "kyrie-irving": [8,6], "scottie-barnes": [2,2], "onyeka-okongwu": [6,5], "kel-el-ware": [6,5], "rui-hachimura": [9,7], "dejounte-murray": [8,6], "dylan-harper": [11,9] };

test("all 12 actual keeper cards and costs use the report/resolver declarations", () => {
  const selected = cards.flatMap((c) => c.roster).filter((r) => r.selected);
  assert.equal(selected.length, 12);
  assert.deepEqual(Object.fromEntries(selected.map((r) => [r.playerId, [r.oldRound, r.selectedCostRound]])), mappings);
  assert.ok(selected.every((r) => r.presentationState === "actual-keeper"));
  assert.equal(cards.find((c) => c.teamId === "run-and-gun").roster.filter((r) => r.selected).length, 0);
  assert.equal(cards.find((c) => c.teamId === "run-and-gun").declarationLabel, "DECLARED · NO KEEPERS");
  assert.equal(cards.filter((c) => c.declarationLabel === "DECLARED · NO KEEPERS").length, 10);
  assert.deepEqual(cards.map((c) => c.report), buildKeeperDecisions(context));
  assert.ok(cards.every((c) => c.report["R1 slot"] !== "PENDING"));
});
test("reference HTML selected keeper round chips agree with canonical resolver", () => {
  const html = fs.readFileSync("public/keeper-eligibility/index.html", "utf8");
  const rows = [...html.matchAll(/<div class="player-row[^>]*data-player="([^"]+)"[\s\S]*?<div class="cost-chip"[^>]*>R(\d+)<\/div>/g)];
  const reference = new Map(rows.map((m) => [m[1].replaceAll("&#x27;", "'"), Number(m[2])]));
  for (const row of cards.flatMap((c) => c.roster).filter((r) => r.selected)) {
    assert.equal(reference.get(row.playerName.toLowerCase()), row.selectedCostRound, row.playerName);
  }
});
test("historical locks and conditional paths are derived through resolver probes", () => {
  assert.equal(historical.get("josh-giddey").historyLock, true);
  assert.equal(historical.get("donovan-mitchell").roundLock, true);
  assert.equal(historical.get("jalen-johnson").conditional, true);
  assert.equal(historical.get("scottie-barnes").conditional, true);
  assert.equal([...historical.values()].filter((r) => r.historyLock).length, 7);
  assert.ok(cards.find((c) => c.teamId === "abcxyz").roster.every((r) => r.roundLock));
  const before = structuredClone(base);
  const decisions = renderKeeperPage(cards), eligibility = renderKeeperPage(cards, { mode: "ELIGIBILITY" });
  assert.match(decisions, /data-action="print-keepers"/);
  assert.match(eligibility, /data-action="print-eligibility"/);
  assert.match(decisions, /Print Decisions \/ PDF/);
  assert.match(eligibility, /Print Eligibility \/ PDF/);
  const printedOrder = [...decisions.matchAll(/<article id="keeper-card-([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(printedOrder, [...context.resolvedState.allocations].sort((a, b) => a.r1Slot - b.r1Slot).map((row) => row.teamId));
  assert.match(decisions, /class="keeper-print-slot">R1 1\.01<\/span>/);
  assert.equal((decisions.match(/class="actual-keeper /g) ?? []).length, 12);
  assert.match(decisions, /✓ KEPT/);
  assert.match(eligibility, /KEPT LAST YEAR/); assert.match(eligibility, /KEEP 1 ONLY/); assert.match(eligibility, /ROUND LOCK/);
  assert.equal((eligibility.match(/class="keeper-roster-table"/g) ?? []).length, 18);
  assert.deepEqual(base, before);
});
test("scenario rows never masquerade as confirmed actual keepers", () => {
  const overrides = { ...createEmptyScenarioOverrides(), keeperSelections: { cuckoo: ["kyrie-irving"] }, stealDirections: { cuckoo: "LATE" } };
  const before = structuredClone(base);
  const c = { ...resolveScenario(base, overrides), baselineInput: base, overrides };
  const page = buildKeeperPage(c, identity, yahoo, historical);
  const cuckoo = page.find((t) => t.teamId === "cuckoo");
  assert.equal(cuckoo.declarationLabel, "SCENARIO OVERRIDE");
  assert.equal(cuckoo.roster.find((r) => r.playerId === "kyrie-irving").presentationState, "scenario-keeper");
  assert.equal(cuckoo.roster.find((r) => r.playerId === "donovan-clingan").selected, false);
  assert.deepEqual(page.map((t) => t.report), buildKeeperDecisions(c));
  assert.deepEqual(base, before);
});
test("established Yahoo IDs survive name changes, without fuzzy name matching", () => {
  const team = [{ priorDraft: [{ playerId: "bobby-portis", playerName: "Bobby Portis" }] }];
  const previous = { matches: [{ playerId: "bobby-portis", yahooPlayerId: "5482", matchMethod: "NORMALIZED_NAME_EXACT" }] };
  const player = { yahooPlayerId: "5482", fullName: "Bobby Portis Jr.", playerKey: "478.p.5482" };
  assert.equal(buildPlayerIdentityMap(team, [player]).matches.length, 0);
  const reconciled = buildPlayerIdentityMap(team, [player], previous);
  assert.equal(reconciled.matches[0].yahooPlayerId, "5482");
  assert.equal(reconciled.matches[0].matchMethod, "PERSISTED_YAHOO_ID");
  assert.equal(buildPlayerIdentityMap(team, [player, { ...player, yahooPlayerId: "other", fullName: "Bobby Portis" }], previous).unresolved[0].reason, "PERSISTED_ID_NAME_CONFLICT");
});

test("local scenario lifecycle preserves input-only saved copies across reload, duplicate/delete and reset", async () => {
  const { newScenario, renameScenario, saveScenarios, loadScenarios, resetScenario, serializeScenario, deserializeScenario } = await import("../src/scenario/storage.js");
  const initial = JSON.stringify(base);
  let text;
  const storage = { getItem: () => text, setItem: (_, value) => text = value };
  let scenario = renameScenario(newScenario("Original", base), "Renamed test");
  scenario.overrides = { ...createEmptyScenarioOverrides(), keeperSelections: { cuckoo: ["kyrie-irving"], "run-and-gun": [] }, stealDirections: { cuckoo: "LATE", "run-and-gun": "EARLY" } };
  saveScenarios(storage, [scenario], base);
  const reopened = loadScenarios(storage, base)[0];
  assert.equal(reopened.name, "Renamed test");
  assert.deepEqual(reopened.overrides, scenario.overrides);
  const resolved = resolveScenario(base, reopened.overrides);
  assert.equal(resolved.resolvedState.picks.length, 198);
  assert.doesNotMatch(text, /r1Slot|pickNumber|resolvedCostRound|playerPool/);
  const changed = { ...reopened, overrides: { ...reopened.overrides, keeperSelections: { ...reopened.overrides.keeperSelections, cuckoo: [] } } };
  assert.equal(loadScenarios(storage, base)[0].overrides.keeperSelections.cuckoo.length, 1);
  const duplicate = { ...newScenario("Duplicate", base), overrides: structuredClone(changed.overrides) };
  saveScenarios(storage, [reopened, duplicate], base);
  assert.equal(loadScenarios(storage, base).length, 2);
  saveScenarios(storage, loadScenarios(storage, base).filter((s) => s.id !== duplicate.id), base);
  assert.equal(loadScenarios(storage, base).length, 1);
  assert.deepEqual(deserializeScenario(serializeScenario(reopened, base), base), reopened);
  assert.throws(() => deserializeScenario('{broken', base), /Malformed/);
  assert.throws(() => deserializeScenario(JSON.stringify({ ...reopened, schemaVersion: 99 }), base), /Unsupported/);
  const reset = resetScenario(reopened, base);
  assert.deepEqual(reset.overrides, createEmptyScenarioOverrides());
  assert.equal(resolveScenario(base, reset.overrides).resolvedState.picks.length, 198);
  assert.equal(JSON.stringify(base), initial);
  assert.equal(resolveDraftState(base).confirmedDeclarationCount, 18);
});

test("search retains all roster and final declaration markup for printing", () => {
  const html = renderKeeperPage(cards, { search: "Tatum" });
  assert.equal((html.match(/<article /g) ?? []).length, 18);
  assert.equal((html.match(/class="keeper-team-card search-hidden"/g) ?? []).length, 17);
  assert.equal((html.match(/data-player-id=/g) ?? []).length, 198);
  assert.equal((html.match(/✓ KEPT<\/b>/g) ?? []).length, 12);
  assert.equal((html.match(/DECLARED · NO KEEPERS<\/strong>/g) ?? []).length, 10);
  assert.equal((html.match(/R1: PENDING/g) ?? []).length, 0);
  const runAndGun = html.match(/<article id="keeper-card-run-and-gun"[\s\S]*?<\/article>/)[0];
  assert.match(runAndGun, /DECLARED · NO KEEPERS/);
  assert.match(runAndGun, /EARLY/);
  assert.doesNotMatch(runAndGun, /✓ KEPT/);
});

test("renaming saved metadata does not commit unsaved keeper overrides", async () => {
  const { newScenario, renameScenario, saveScenarios, loadScenarios } = await import("../src/scenario/storage.js");
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => stored = value };
  const saved = newScenario("Original", base);
  const working = { ...saved, overrides: { ...saved.overrides, keeperSelections: { cuckoo: [] } } };
  const renamed = renameScenario(working, " Changed name ");
  saveScenarios(storage, [renameScenario(saved, renamed.name)], base);
  assert.equal(loadScenarios(storage, base)[0].name, "Changed name");
  assert.deepEqual(loadScenarios(storage, base)[0].overrides.keeperSelections, {});
  assert.deepEqual(renamed.overrides.keeperSelections, { cuckoo: [] });
  assert.equal(saved.name, "Original");
  assert.throws(() => renameScenario(saved, " "), /Invalid scenario name/);
});

test("invalid local libraries fail without changing stored bytes", async () => {
  const { newScenario, loadScenarios } = await import("../src/scenario/storage.js");
  const scenario = newScenario("Stored", base);
  for (const raw of ['{broken', '{}', JSON.stringify([scenario, scenario]), JSON.stringify([{ ...scenario, schemaVersion: 99 }])]) {
    let writes = 0;
    assert.throws(() => loadScenarios({ getItem: () => raw, setItem: () => writes++ }, base));
    assert.equal(writes, 0);
  }
});

test("print rules preserve pending visibility, grayscale keeper labels and unbroken team cards", () => {
  const css = fs.readFileSync("src/ui/styles.css", "utf8");
  assert.match(css, /@page\s*\{\s*size: A3 landscape/);
  assert.match(css, /\.board-scroll\[hidden\]\s*\{\s*display: none/);
  assert.match(css, /\.surface-nav, \.scenario-library,[^{]+\{ display: none !important/);
  assert.match(css, /\.draft-board thead th,[^{]+\{ position: static/);
  assert.match(css, /\.app-shell, \.workspace,[^{]+\{[^}]+overflow: visible/);
  assert.match(css, /\.keeper-page-controls, \.keeper-page-legend \{ display: none/);
  assert.match(css, /\.keeper-cards \{ display: block; orphans: 1; widows: 1/);
  assert.match(css, /\.keeper-team-card, \.keeper-team-card.search-hidden \{[^}]+break-inside: avoid/);
  assert.match(css, /\.actual-keeper td:first-child \{ border-left: 1mm double black/);
});
