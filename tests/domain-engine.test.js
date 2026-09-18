import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveKeeperEntitlement,
  mapKeeperCost,
  resolveDraftState,
  snakeSlotForRound,
} from "../src/index.js";

function makeTeams() {
  return Array.from({ length: 18 }, (_, teamIndex) => {
    const finish = teamIndex + 1;
    const teamId = `team-${finish}`;
    return {
      teamId,
      name: `Team ${finish}`,
      previousFinish: finish,
      // Deliberately bogus: the engine must derive this from finish.
      keeperTier: "STORED_VALUE_IS_NOT_CANONICAL",
      priorDraft: Array.from({ length: 11 }, (_, roundIndex) => {
        const oldRound = roundIndex + 1;
        return {
          playerId: `${teamId}-r${oldRound}`,
          playerName: `T${finish} R${oldRound}`,
          oldRound,
          originalDrafterTeamId: teamId,
          consecutiveYearKeeperEligibility: "ELIGIBLE",
        };
      }),
    };
  });
}

function completeInput(overrides = {}) {
  const teams = overrides.teams ?? makeTeams();
  return {
    stateType: "OFFICIAL",
    season: "2026-27",
    teams,
    keeperSelections: teams.map((team) => ({
      teamId: team.teamId,
      status: "CONFIRMED",
      selectedPlayerIds: [],
    })),
    stealDeclarations: teams.map((team) => ({
      teamId: team.teamId,
      status: "CONFIRMED",
      direction: "EARLY",
    })),
    trades: [],
    ...overrides,
  };
}

function replaceTeamEntry(entries, teamId, replacement) {
  return entries.map((entry) => (entry.teamId === teamId ? { ...entry, ...replacement } : entry));
}

function allocation(result, teamId) {
  return result.allocations.find((item) => item.teamId === teamId);
}

function validationCodes(result) {
  return result.validation.map((item) => item.code);
}

test("derives keeper entitlement solely from prior finish", () => {
  assert.equal(deriveKeeperEntitlement(1), "ANY_2");
  assert.equal(deriveKeeperEntitlement(4), "TWO_R2_PLUS");
  assert.equal(deriveKeeperEntitlement(8), "ONE_R2_OR_TWO_R3_PLUS");
  assert.equal(deriveKeeperEntitlement(12), "ONE_R3_PLUS");
  assert.equal(deriveKeeperEntitlement(15), "ONE_R4_PLUS");
  assert.equal(deriveKeeperEntitlement(17), "NONE");

  const result = resolveDraftState(completeInput());
  assert.equal(result.teamKeeperStates.find((team) => team.teamId === "team-1").keeperTier, "ANY_2");
  assert.equal(
    result.teamKeeperStates.find((team) => team.teamId === "team-8").keeperTier,
    "ONE_R2_OR_TWO_R3_PLUS",
  );
});

test("maps R5 to R4 and R8 to R6", () => {
  assert.equal(mapKeeperCost(5), 4);
  assert.equal(mapKeeperCost(8), 6);
});

test("champion with zero keepers and EARLY resolves to 1.01", () => {
  const result = resolveDraftState(completeInput());

  assert.equal(allocation(result, "team-1").bucket, "NO_KEEPER");
  assert.equal(allocation(result, "team-1").r1Slot, 1);
  assert.equal(result.picks.length, 18 * 11);
  assert.equal(result.isResolved, true);
});

test("switching champion to keeper moves it behind the no-keeper bucket", () => {
  const input = completeInput();
  input.keeperSelections = replaceTeamEntry(input.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r5"],
  });
  const result = resolveDraftState(input);

  assert.equal(allocation(result, "team-1").bucket, "KEEPER");
  assert.equal(allocation(result, "team-2").r1Slot, 1);
  assert.equal(allocation(result, "team-1").r1Slot, 18);
});

test("EARLY to LATE recomputes downstream R1 slots globally", () => {
  const early = completeInput();
  const earlyResult = resolveDraftState(early);

  const late = completeInput();
  late.stealDeclarations = replaceTeamEntry(late.stealDeclarations, "team-1", {
    direction: "LATE",
  });
  const lateResult = resolveDraftState(late);

  assert.equal(allocation(earlyResult, "team-1").r1Slot, 1);
  assert.equal(allocation(earlyResult, "team-2").r1Slot, 2);
  assert.equal(allocation(lateResult, "team-1").r1Slot, 18);
  assert.equal(allocation(lateResult, "team-2").r1Slot, 1);
  assert.notEqual(allocation(earlyResult, "team-18").r1Slot, allocation(lateResult, "team-18").r1Slot);
});

test("one keeper declaration can move multiple other teams", () => {
  const baseline = resolveDraftState(completeInput());
  const changedInput = completeInput();
  changedInput.keeperSelections = replaceTeamEntry(changedInput.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r5"],
  });
  const changed = resolveDraftState(changedInput);

  const movedOtherTeams = changed.allocations.filter(
    (item) => item.teamId !== "team-1" && item.r1Slot !== allocation(baseline, item.teamId).r1Slot,
  );
  assert.equal(movedOtherTeams.length, 17);
});

test("simple R7/R8 collision resolves collective channels but not named assignment", () => {
  const input = completeInput();
  input.keeperSelections = replaceTeamEntry(input.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r7", "team-1-r8"],
  });
  const result = resolveDraftState(input);
  const collision = result.keeperCollisions[0];
  const records = result.keepers.filter((keeper) => keeper.teamId === "team-1");

  assert.deepEqual(collision.resolvedRounds, [6, 5]);
  assert.equal(collision.assignmentStatus, "UNRESOLVED");
  assert.ok(records.every((record) => record.resolvedCostRound === null));
  assert.ok(records.every((record) => record.possibleResolvedCostRounds.join(",") === "6,5"));
  assert.ok(validationCodes(result).includes("KEEPER_COLLISION_ASSIGNMENT_UNRESOLVED"));
  assert.equal(allocation(result, "team-1").bucket, "KEEPER");
  assert.equal(result.picks.filter((pick) => pick.status === "KEEPER_UNRESOLVED").length, 2);
});

test("8th-11th place team uses one-R2+ mode or two-R3+ mode, never both", () => {
  const oneInput = completeInput();
  oneInput.keeperSelections = replaceTeamEntry(oneInput.keeperSelections, "team-8", {
    selectedPlayerIds: ["team-8-r2"],
  });
  const oneResult = resolveDraftState(oneInput);
  assert.equal(allocation(oneResult, "team-8").bucket, "KEEPER");
  assert.ok(!validationCodes(oneResult).includes("KEEPER_FINISH_RESTRICTION"));

  const twoInput = completeInput();
  twoInput.keeperSelections = replaceTeamEntry(twoInput.keeperSelections, "team-8", {
    selectedPlayerIds: ["team-8-r2", "team-8-r3"],
  });
  const twoResult = resolveDraftState(twoInput);
  assert.ok(validationCodes(twoResult).includes("KEEPER_FINISH_RESTRICTION"));
  assert.equal(allocation(twoResult, "team-8").bucket, null);
});

test("17th and 18th place cannot keep", () => {
  for (const finish of [17, 18]) {
    const input = completeInput();
    input.keeperSelections = replaceTeamEntry(input.keeperSelections, `team-${finish}`, {
      selectedPlayerIds: [`team-${finish}-r4`],
    });
    const result = resolveDraftState(input);
    assert.ok(validationCodes(result).includes("KEEPER_TOO_MANY"));
    assert.equal(allocation(result, `team-${finish}`).bucket, null);
  }
});

test("a second R1/R2 keeper is rejected", () => {
  const input = completeInput();
  input.keeperSelections = replaceTeamEntry(input.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r1", "team-1-r2"],
  });
  const result = resolveDraftState(input);

  assert.ok(validationCodes(result).includes("KEEPER_R1_R2_LIMIT"));
  assert.equal(allocation(result, "team-1").bucket, null);
});

test("UNKNOWN consecutive-year eligibility is unresolved in Official state", () => {
  const teams = makeTeams();
  teams[0].priorDraft[4].consecutiveYearKeeperEligibility = "UNKNOWN";
  const input = completeInput({ teams });
  input.keeperSelections = replaceTeamEntry(input.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r5"],
  });
  const result = resolveDraftState(input);
  const issue = result.validation.find((item) => item.code === "KEEPER_CONSECUTIVE_YEAR_UNKNOWN");

  assert.equal(issue.severity, "UNRESOLVED");
  assert.equal(allocation(result, "team-1").r1Slot, null);
  assert.equal(result.picks.length, 0);
  assert.equal(result.unresolvedPlayers.some((player) => player.playerId === "team-1-r5"), true);
});

test("traded R6 entitlement follows origin team's eventual snake geometry", () => {
  const input = completeInput({
    trades: [
      {
        tradeId: "trade-r6",
        status: "CONFIRMED",
        transfers: [
          { originTeamId: "team-1", round: 6, fromTeamId: "team-1", toTeamId: "team-2" },
        ],
      },
    ],
  });
  input.stealDeclarations = replaceTeamEntry(input.stealDeclarations, "team-1", { direction: "LATE" });
  const result = resolveDraftState(input);
  const tradedPick = result.picks.find((pick) => pick.originTeamId === "team-1" && pick.round === 6);

  assert.equal(allocation(result, "team-1").r1Slot, 18);
  assert.equal(snakeSlotForRound(18, 6), 1);
  assert.equal(tradedPick.pickNumber, "6.01");
  assert.equal(tradedPick.currentOwnerTeamId, "team-2");
});

test("duplicate entitlement ownership rows are rejected", () => {
  const result = resolveDraftState(
    completeInput({
      entitlements: [
        { originTeamId: "team-1", round: 6, currentOwnerTeamId: "team-2" },
        { originTeamId: "team-1", round: 6, currentOwnerTeamId: "team-3" },
      ],
    }),
  );
  const issue = result.validation.find((item) => item.code === "DUPLICATE_ENTITLEMENT_OWNERSHIP");
  const entitlement = result.entitlements.find(
    (item) => item.originTeamId === "team-1" && item.round === 6,
  );

  assert.equal(issue.severity, "ERROR");
  assert.equal(entitlement.currentOwnerTeamId, null);
  assert.equal(entitlement.ownershipStatus, "UNRESOLVED");
});

test("unresolved declarations remain unresolved instead of receiving guessed slots", () => {
  const teams = makeTeams();
  const result = resolveDraftState({
    stateType: "WORKING",
    season: "2026-27",
    teams,
    keeperSelections: [{ teamId: "team-1", selectedPlayerIds: [] }],
    stealDeclarations: [{ teamId: "team-1", direction: "EARLY" }],
  });

  assert.ok(result.allocations.every((item) => item.r1Slot === null));
  assert.equal(result.picks.length, 0);
  assert.ok(validationCodes(result).includes("R1_ALLOCATION_UNRESOLVED"));
});

test("original-drafter and consecutive-year restrictions are hard validation", () => {
  const notOriginal = completeInput();
  notOriginal.keeperSelections = replaceTeamEntry(notOriginal.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-2-r5"],
  });
  assert.ok(validationCodes(resolveDraftState(notOriginal)).includes("KEEPER_NOT_ORIGINAL_DRAFTER"));

  const teams = makeTeams();
  teams[0].priorDraft[4].consecutiveYearKeeperEligibility = "INELIGIBLE";
  const consecutive = completeInput({ teams });
  consecutive.keeperSelections = replaceTeamEntry(consecutive.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r5"],
  });
  assert.ok(
    validationCodes(resolveDraftState(consecutive)).includes("KEEPER_CONSECUTIVE_YEAR_INELIGIBLE"),
  );
});

test("keeper occupies the native consumed entitlement and exact pick", () => {
  const input = completeInput();
  input.keeperSelections = replaceTeamEntry(input.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r5"],
  });
  const result = resolveDraftState(input);
  const keeper = result.keepers.find((item) => item.playerId === "team-1-r5");
  const pick = result.picks.find((item) => item.keeper?.playerId === "team-1-r5");

  assert.equal(keeper.baseCostRound, 4);
  assert.equal(keeper.resolvedCostRound, 4);
  assert.deepEqual(keeper.consumedEntitlement, { originTeamId: "team-1", round: 4 });
  assert.equal(keeper.consumedPickNumber, pick.pickNumber);
  assert.equal(pick.currentOwnerTeamId, "team-1");
});

test("trading away a keeper channel returns Q5 unresolved instead of inventing a replacement", () => {
  const input = completeInput({
    trades: [
      {
        tradeId: "trade-native-r4",
        status: "CONFIRMED",
        transfers: [
          { originTeamId: "team-1", round: 4, fromTeamId: "team-1", toTeamId: "team-2" },
        ],
      },
    ],
  });
  input.keeperSelections = replaceTeamEntry(input.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r5"],
  });
  const result = resolveDraftState(input);
  const issue = result.validation.find((item) => item.code === "KEEPER_CHANNEL_RULE_UNRESOLVED");

  assert.equal(issue.severity, "UNRESOLVED");
  assert.equal(issue.ruleQuestion, "Q5");
  assert.equal(allocation(result, "team-1").bucket, null);
});

test("an acquired duplicate collision-round channel returns Q4 unresolved", () => {
  const input = completeInput({
    trades: [
      {
        tradeId: "trade-extra-r6",
        status: "CONFIRMED",
        transfers: [
          { originTeamId: "team-2", round: 6, fromTeamId: "team-2", toTeamId: "team-1" },
        ],
      },
    ],
  });
  input.keeperSelections = replaceTeamEntry(input.keeperSelections, "team-1", {
    selectedPlayerIds: ["team-1-r7", "team-1-r8"],
  });
  const result = resolveDraftState(input);
  const issue = result.validation.find(
    (item) => item.code === "KEEPER_DUPLICATE_CHANNEL_RULE_UNRESOLVED",
  );

  assert.equal(issue.severity, "UNRESOLVED");
  assert.equal(issue.ruleQuestion, "Q4");
  assert.deepEqual(result.keeperCollisions[0].resolvedRounds, []);
  assert.deepEqual(result.keeperCollisions[0].possibleRoundSets, [
    [6, 6],
    [6, 5],
  ]);
  assert.equal(result.picks.some((pick) => pick.status === "KEEPER_UNRESOLVED"), false);
});
