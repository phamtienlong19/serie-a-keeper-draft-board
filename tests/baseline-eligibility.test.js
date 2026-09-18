import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createDemoDraftInput,
  createTradedEntitlementDemoInput,
} from "../src/demo/demo-state.js";
import { resolveDraftState } from "../src/domain/engine.js";
import { buildDraftBoardViewModel } from "../src/presentation/board-view-model.js";
import { buildTeamScenarioViewModel } from "../src/presentation/team-scenario-view-model.js";
import {
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
const priorDraftPlayers = canonicalTeams.teams.flatMap((team) =>
  team.priorDraft.map((player) => ({ teamId: team.teamId, ...player })),
);

const expectedIneligible = [
  ["angry-bird", "Jakob Poeltl", 6],
  ["angry-bird", "Andrew Nembhard", 7],
  ["to-kinh", "Cade Cunningham", 2],
  ["cuckoo", "Josh Giddey", 4],
  ["mnqa", "Trey Murphy III", 6],
  ["rising-rockets", "Amen Thompson", 5],
  ["rising-rockets", "Dyson Daniels", 6],
];

function panelFor(result, overrides, teamId, input = baselineInput) {
  return buildTeamScenarioViewModel({
    baselineInput: input,
    scenarioOverrides: overrides,
    resolvedState: result.resolvedState,
    teamId,
    identityMap,
    yahooPlayers: yahooPayload.players,
  });
}

test("primary interactive baseline resolves 198 native-owned entitlements", () => {
  const { resolvedState } = resolveScenario(baselineInput, createEmptyScenarioOverrides());
  const supFamR6 = resolvedState.entitlements.find(
    (entitlement) => entitlement.originTeamId === "sup-fam" && entitlement.round === 6,
  );

  assert.equal(baselineInput.trades.length, 0);
  assert.equal(resolvedState.entitlements.length, 198);
  assert.ok(
    resolvedState.entitlements.every(
      (entitlement) => entitlement.currentOwnerTeamId === entitlement.originTeamId,
    ),
  );
  assert.equal(supFamR6.currentOwnerTeamId, "sup-fam");
});

test("single sup-fam R6-cost keeper uses the native channel without a trade warning", () => {
  const overrides = setScenarioKeeperSelection(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "vj-edgecombe",
    true,
  );
  const result = resolveScenario(baselineInput, overrides);
  const keeper = result.resolvedState.keepers.find(
    (candidate) => candidate.playerId === "vj-edgecombe",
  );

  assert.equal(keeper.baseCostRound, 6);
  assert.equal(keeper.resolvedCostRound, 6);
  assert.deepEqual(keeper.consumedEntitlement, { originTeamId: "sup-fam", round: 6 });
  assert.equal(
    result.resolvedState.validation.some(
      (item) => item.code === "KEEPER_CHANNEL_RULE_UNRESOLVED",
    ),
    false,
  );
});

test("sup-fam keeper candidates expose the confirmed old-round cost mappings", () => {
  const candidates = evaluateKeeperCandidates({
    baselineInput,
    overrides: createEmptyScenarioOverrides(),
    teamId: "sup-fam",
  });
  const costs = Object.fromEntries(
    candidates
      .filter((candidate) =>
        ["cooper-flagg", "alex-sarr", "vj-edgecombe", "kyshawn-george"].includes(
          candidate.playerId,
        ),
      )
      .map((candidate) => [
        candidate.playerId,
        [candidate.oldRound, candidate.baseCostRound, candidate.resolvedCostRound],
      ]),
  );

  assert.deepEqual(costs, {
    "cooper-flagg": [2, 2, 2],
    "alex-sarr": [5, 4, 4],
    "vj-edgecombe": [7, 6, 6],
    "kyshawn-george": [8, 6, 6],
  });
});

test("synthetic traded-entitlement coverage is isolated in an explicit fixture", () => {
  const tradedInput = createTradedEntitlementDemoInput(canonicalTeams);
  const tradedState = resolveDraftState(tradedInput);
  const tradedR6 = tradedState.entitlements.find(
    (entitlement) => entitlement.originTeamId === "sup-fam" && entitlement.round === 6,
  );

  assert.deepEqual(baselineInput.trades, []);
  assert.equal(tradedInput.trades[0].tradeId, "demo-sup-fam-r6-to-mnqa");
  assert.equal(tradedR6.currentOwnerTeamId, "mnqa");
});

test("scenario reset restores the exact no-trade native baseline", () => {
  let overrides = setScenarioStealDirection(
    createEmptyScenarioOverrides(),
    "sup-fam",
    "LATE",
  );
  overrides = setScenarioKeeperSelection(overrides, "sup-fam", "alex-sarr", true);
  const changed = resolveScenario(baselineInput, overrides);
  const reset = resolveScenario(baselineInput, createEmptyScenarioOverrides());

  assert.notDeepEqual(changed.resolvedState.allocations, reset.resolvedState.allocations);
  assert.deepEqual(reset.input.trades, []);
  assert.equal(reset.resolvedState.entitlements.length, 198);
  assert.ok(
    reset.resolvedState.entitlements.every(
      (entitlement) => entitlement.currentOwnerTeamId === entitlement.originTeamId,
    ),
  );
});

test("canonical consecutive-year migration has exactly seven supplied ineligible players", () => {
  const ineligible = priorDraftPlayers
    .filter((player) => player.consecutiveYearKeeperEligibility === "INELIGIBLE")
    .map((player) => [player.teamId, player.playerName, player.oldRound]);
  const eligible = priorDraftPlayers.filter(
    (player) => player.consecutiveYearKeeperEligibility === "ELIGIBLE",
  );
  const unknown = priorDraftPlayers.filter(
    (player) => player.consecutiveYearKeeperEligibility === "UNKNOWN",
  );

  assert.deepEqual(ineligible, expectedIneligible);
  assert.equal(ineligible.length, 7);
  assert.equal(eligible.length, 191);
  assert.equal(unknown.length, 0);
});

test("known ineligible players cannot be selected or receive an Assume eligible action", () => {
  const forced = setScenarioEligibilityAssumption(
    setScenarioKeeperSelection(
      createEmptyScenarioOverrides(),
      "angry-bird",
      "jakob-poeltl",
      true,
    ),
    "jakob-poeltl",
    true,
  );
  const result = resolveScenario(baselineInput, forced);
  const candidates = evaluateKeeperCandidates({
    baselineInput,
    overrides: createEmptyScenarioOverrides(),
    teamId: "angry-bird",
  });
  const candidate = candidates.find((item) => item.playerId === "jakob-poeltl");
  const panel = panelFor(result, forced, "angry-bird");
  const board = buildDraftBoardViewModel({
    resolvedState: result.resolvedState,
    teams: result.input.teams,
    identityMap,
    yahooPlayers: yahooPayload.players,
    selectedTeamId: "angry-bird",
  });
  const html = renderDraftBoard(board, panel);

  assert.equal(candidate.canSelect, false);
  assert.equal(candidate.requiresEligibilityAssumption, false);
  assert.ok(
    result.resolvedState.validation.some(
      (item) => item.code === "KEEPER_CONSECUTIVE_YEAR_INELIGIBLE",
    ),
  );
  assert.match(html, /Kept last season\./);
  assert.doesNotMatch(html, /data-player-id="jakob-poeltl"[^>]*>ASSUME ELIGIBLE/);
});

test("known eligible players need no assumption while future UNKNOWN input still can", () => {
  const eligibleCandidates = evaluateKeeperCandidates({
    baselineInput,
    overrides: createEmptyScenarioOverrides(),
    teamId: "sup-fam",
  });
  const alex = eligibleCandidates.find((candidate) => candidate.playerId === "alex-sarr");
  const unknownInput = structuredClone(baselineInput);
  unknownInput.teams[0].priorDraft.find(
    (player) => player.playerId === "alex-sarr",
  ).consecutiveYearKeeperEligibility = "UNKNOWN";
  const unknownCandidate = evaluateKeeperCandidates({
    baselineInput: unknownInput,
    overrides: createEmptyScenarioOverrides(),
    teamId: "sup-fam",
  }).find((candidate) => candidate.playerId === "alex-sarr");

  assert.equal(alex.canonicalConsecutiveYearEligibility, "ELIGIBLE");
  assert.equal(alex.requiresEligibilityAssumption, false);
  assert.equal(alex.canSelect, true);
  assert.equal(unknownCandidate.requiresEligibilityAssumption, true);
  assert.equal(unknownCandidate.canSelect, false);
});

test("keeper-tier restrictions remain independent of consecutive-year eligibility", () => {
  const candidates = evaluateKeeperCandidates({
    baselineInput,
    overrides: createEmptyScenarioOverrides(),
    teamId: "to-kinh",
  });
  const donovan = candidates.find((candidate) => candidate.playerId === "donovan-mitchell");

  assert.equal(donovan.canonicalConsecutiveYearEligibility, "ELIGIBLE");
  assert.equal(donovan.canSelect, false);
  assert.ok(
    donovan.validation.some((item) => item.code === "KEEPER_FINISH_RESTRICTION"),
  );
});

test("typography uses Inter and Roboto Mono through shared CSS tokens", () => {
  const styles = fs.readFileSync("src/ui/styles.css", "utf8");

  assert.match(styles, /fonts\.googleapis\.com\/css2\?family=Inter/);
  assert.match(styles, /--font-sans: Inter, system-ui/);
  assert.match(styles, /--font-mono: "Roboto Mono", "SFMono-Regular"/);
  assert.match(styles, /\.slot-number, \.pick-number[^}]*font-family: var\(--font-mono\)/s);
  assert.match(styles, /\.round-label[^}]*font-family: var\(--font-mono\)/s);
  assert.match(styles, /\.o-rank[^}]*font-family: var\(--font-mono\)/s);
  assert.match(styles, /\.cost-flow[^}]*var\(--font-mono\)/s);
});
