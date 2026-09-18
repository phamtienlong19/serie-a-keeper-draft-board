import {
  DEFAULT_DRAFT_ROUNDS,
  DIRECTIONS,
  KEEPER_TIERS,
  STATE_TYPES,
  TEAM_COUNT,
  VALIDATION_SEVERITIES,
} from "./constants.js";
import { allocateKeeperCosts } from "./keeper-costs.js";

export { allocateKeeperCosts } from "./keeper-costs.js";

const { ERROR, WARNING, UNRESOLVED } = VALIDATION_SEVERITIES;

/**
 * Derive the finish-based keeper entitlement. The stored keeperTier in seed data
 * is deliberately not trusted as an input to the rules engine.
 */
export function deriveKeeperEntitlement(previousFinish) {
  if (!Number.isInteger(previousFinish) || previousFinish < 1 || previousFinish > TEAM_COUNT) {
    return null;
  }
  if (previousFinish <= 3) return KEEPER_TIERS.ANY_2;
  if (previousFinish <= 7) return KEEPER_TIERS.TWO_R2_PLUS;
  if (previousFinish <= 11) return KEEPER_TIERS.ONE_R2_OR_TWO_R3_PLUS;
  if (previousFinish <= 14) return KEEPER_TIERS.ONE_R3_PLUS;
  if (previousFinish <= 16) return KEEPER_TIERS.ONE_R4_PLUS;
  return KEEPER_TIERS.NONE;
}

export function mapKeeperCost(oldRound) {
  if (!Number.isInteger(oldRound) || oldRound < 1) return null;
  if (oldRound <= 2) return oldRound;
  if (oldRound <= 7) return oldRound - 1;
  return oldRound - 2;
}

export function snakeSlotForRound(r1Slot, round, teamCount = TEAM_COUNT) {
  if (!Number.isInteger(r1Slot) || r1Slot < 1 || r1Slot > teamCount) return null;
  if (!Number.isInteger(round) || round < 1) return null;
  return round % 2 === 1 ? r1Slot : teamCount + 1 - r1Slot;
}

export function formatPickNumber(round, slot) {
  return `${round}.${String(slot).padStart(2, "0")}`;
}

function makeValidation(severity, code, message, context = {}) {
  return { severity, code, message, ...context };
}

function normalizeByTeam(value) {
  if (Array.isArray(value)) {
    return new Map(value.filter(Boolean).map((entry) => [entry.teamId, entry]));
  }
  if (value && typeof value === "object") {
    return new Map(
      Object.entries(value).map(([teamId, entry]) => [
        teamId,
        Array.isArray(entry)
          ? { teamId, selectedPlayerIds: entry }
          : { teamId, ...(entry ?? {}) },
      ]),
    );
  }
  return new Map();
}

function declarationIsUsable(declaration, stateType, kind, validation, teamId) {
  if (!declaration || declaration.status === "UNDECLARED") {
    validation.push(
      makeValidation(
        UNRESOLVED,
        `${kind}_DECLARATION_MISSING`,
        `${kind === "KEEPER" ? "Keeper" : "Early/Late"} declaration is not available.`,
        { teamId },
      ),
    );
    return false;
  }

  if (stateType === STATE_TYPES.OFFICIAL && declaration.status === "ENTERED") {
    validation.push(
      makeValidation(
        UNRESOLVED,
        `${kind}_DECLARATION_UNCONFIRMED`,
        `Official state contains an entered but unconfirmed ${kind.toLowerCase()} declaration.`,
        { teamId },
      ),
    );
    return false;
  }
  return true;
}

function entitlementKey(originTeamId, round) {
  return `${originTeamId}:${round}`;
}

export function generateBaseEntitlements(teams, draftRounds = DEFAULT_DRAFT_ROUNDS) {
  return teams.flatMap((team) =>
    Array.from({ length: draftRounds }, (_, index) => ({
      originTeamId: team.teamId,
      round: index + 1,
      currentOwnerTeamId: team.teamId,
      ownershipStatus: "RESOLVED",
    })),
  );
}

function resolveEntitlements(input, teams, draftRounds, validation) {
  const teamIds = new Set(teams.map((team) => team.teamId));
  const entitlements = new Map(
    generateBaseEntitlements(teams, draftRounds).map((entitlement) => [
      entitlementKey(entitlement.originTeamId, entitlement.round),
      entitlement,
    ]),
  );

  const overridesByKey = new Map();
  for (const override of input.entitlements ?? []) {
    const key = entitlementKey(override.originTeamId, override.round);
    if (!overridesByKey.has(key)) overridesByKey.set(key, []);
    overridesByKey.get(key).push(override);
  }

  for (const [key, overrides] of overridesByKey) {
    const target = entitlements.get(key);
    if (!target) {
      validation.push(
        makeValidation(ERROR, "INVALID_ENTITLEMENT", `Entitlement ${key} is outside the league board.`, {
          entitlementKey: key,
        }),
      );
      continue;
    }
    if (overrides.length > 1) {
      target.currentOwnerTeamId = null;
      target.ownershipStatus = "UNRESOLVED";
      validation.push(
        makeValidation(
          ERROR,
          "DUPLICATE_ENTITLEMENT_OWNERSHIP",
          `Entitlement ${key} has more than one ownership row.`,
          { entitlementKey: key },
        ),
      );
      continue;
    }
    const owner = overrides[0].currentOwnerTeamId;
    if (!teamIds.has(owner)) {
      target.currentOwnerTeamId = null;
      target.ownershipStatus = "UNRESOLVED";
      validation.push(
        makeValidation(ERROR, "UNKNOWN_ENTITLEMENT_OWNER", `Entitlement ${key} names an unknown owner.`, {
          entitlementKey: key,
          currentOwnerTeamId: owner,
        }),
      );
      continue;
    }
    target.currentOwnerTeamId = owner;
  }

  for (const trade of input.trades ?? []) {
    const status = trade.status ?? (input.stateType === STATE_TYPES.OFFICIAL ? "CONFIRMED" : "ENTERED");
    if (status === "UNDECLARED" || status === "REJECTED") continue;
    if (input.stateType === STATE_TYPES.OFFICIAL && status !== "CONFIRMED") {
      validation.push(
        makeValidation(
          UNRESOLVED,
          "TRADE_UNCONFIRMED",
          `Official state contains unconfirmed trade ${trade.tradeId ?? "(unnamed)"}.`,
          { tradeId: trade.tradeId ?? null },
        ),
      );
      for (const transfer of trade.transfers ?? []) {
        const target = entitlements.get(entitlementKey(transfer.originTeamId, transfer.round));
        if (target) {
          target.currentOwnerTeamId = null;
          target.ownershipStatus = "UNRESOLVED";
        }
      }
      continue;
    }
    if (status === "ENTERED") {
      validation.push(
        makeValidation(WARNING, "TRADE_NOT_CONFIRMED", `Trade ${trade.tradeId ?? "(unnamed)"} is entered but not confirmed.`, {
          tradeId: trade.tradeId ?? null,
        }),
      );
    }

    for (const transfer of trade.transfers ?? []) {
      const key = entitlementKey(transfer.originTeamId, transfer.round);
      const target = entitlements.get(key);
      if (!target) {
        validation.push(
          makeValidation(ERROR, "INVALID_TRADE_ENTITLEMENT", `Trade references unknown entitlement ${key}.`, {
            tradeId: trade.tradeId ?? null,
            entitlementKey: key,
          }),
        );
        continue;
      }
      if (!teamIds.has(transfer.fromTeamId) || !teamIds.has(transfer.toTeamId)) {
        target.currentOwnerTeamId = null;
        target.ownershipStatus = "UNRESOLVED";
        validation.push(
          makeValidation(ERROR, "UNKNOWN_TRADE_TEAM", `Trade ${trade.tradeId ?? "(unnamed)"} names an unknown team.`, {
            tradeId: trade.tradeId ?? null,
            entitlementKey: key,
          }),
        );
        continue;
      }
      if (target.ownershipStatus !== "RESOLVED" || target.currentOwnerTeamId !== transfer.fromTeamId) {
        target.currentOwnerTeamId = null;
        target.ownershipStatus = "UNRESOLVED";
        validation.push(
          makeValidation(
            ERROR,
            "ENTITLEMENT_OWNER_MISMATCH",
            `Trade cannot transfer ${key} from ${transfer.fromTeamId}; that ownership is not established.`,
            { tradeId: trade.tradeId ?? null, entitlementKey: key },
          ),
        );
        continue;
      }
      target.currentOwnerTeamId = transfer.toTeamId;
    }
  }

  return entitlements;
}

function entitlementLimits(tier, selectedCount) {
  switch (tier) {
    case KEEPER_TIERS.ANY_2:
      return { maximum: 2, minimumOldRound: 1, mode: "UP_TO_TWO_ANY" };
    case KEEPER_TIERS.TWO_R2_PLUS:
      return { maximum: 2, minimumOldRound: 2, mode: "UP_TO_TWO_R2_PLUS" };
    case KEEPER_TIERS.ONE_R2_OR_TWO_R3_PLUS:
      return selectedCount <= 1
        ? { maximum: 1, minimumOldRound: 2, mode: "ONE_R2_PLUS" }
        : { maximum: 2, minimumOldRound: 3, mode: "TWO_R3_PLUS" };
    case KEEPER_TIERS.ONE_R3_PLUS:
      return { maximum: 1, minimumOldRound: 3, mode: "ONE_R3_PLUS" };
    case KEEPER_TIERS.ONE_R4_PLUS:
      return { maximum: 1, minimumOldRound: 4, mode: "ONE_R4_PLUS" };
    case KEEPER_TIERS.NONE:
      return { maximum: 0, minimumOldRound: Number.POSITIVE_INFINITY, mode: "NONE" };
    default:
      return null;
  }
}

function resolveKeepers(input, teams, entitlements, draftRounds, validation) {
  const selections = normalizeByTeam(input.keeperSelections);
  const playerRows = teams.flatMap((team) => team.priorDraft ?? []);
  const playersById = new Map();
  const ambiguousPlayerIds = new Set();
  for (const player of playerRows) {
    if (playersById.has(player.playerId)) ambiguousPlayerIds.add(player.playerId);
    else playersById.set(player.playerId, player);
  }
  for (const playerId of ambiguousPlayerIds) {
    validation.push(
      makeValidation(ERROR, "DUPLICATE_PLAYER_ID", `Player ID ${playerId} appears more than once in prior draft data.`, {
        playerId,
      }),
    );
  }

  const keeperRecords = [];
  const collisions = [];
  const teamStates = new Map();
  const selectedGlobally = new Map();

  for (const team of teams) {
    const tier = deriveKeeperEntitlement(team.previousFinish);
    const declaration = selections.get(team.teamId);
    const usable = declarationIsUsable(declaration, input.stateType, "KEEPER", validation, team.teamId);
    const rawIds = declaration?.selectedPlayerIds ?? [];
    const selectedPlayerIds = Array.isArray(rawIds) ? rawIds : [];
    let blocking = !usable;
    let hasUnresolved = !usable;

    if (!Array.isArray(rawIds)) {
      blocking = true;
      validation.push(
        makeValidation(ERROR, "INVALID_KEEPER_SELECTION", "selectedPlayerIds must be an array.", {
          teamId: team.teamId,
        }),
      );
    }

    const duplicateIds = selectedPlayerIds.filter((playerId, index) => selectedPlayerIds.indexOf(playerId) !== index);
    if (duplicateIds.length) {
      blocking = true;
      validation.push(
        makeValidation(ERROR, "DUPLICATE_KEEPER_SELECTION", "A player may only be selected once by a team.", {
          teamId: team.teamId,
          playerIds: [...new Set(duplicateIds)],
        }),
      );
    }

    const limits = entitlementLimits(tier, selectedPlayerIds.length);
    if (!tier || !limits) {
      blocking = true;
      validation.push(
        makeValidation(ERROR, "INVALID_PREVIOUS_FINISH", "Previous finish does not map to a keeper entitlement.", {
          teamId: team.teamId,
          previousFinish: team.previousFinish,
        }),
      );
    } else if (selectedPlayerIds.length > limits.maximum) {
      blocking = true;
      validation.push(
        makeValidation(
          ERROR,
          "KEEPER_TOO_MANY",
          `Team selected ${selectedPlayerIds.length} keepers but its active mode permits ${limits.maximum}.`,
          { teamId: team.teamId, keeperTier: tier, entitlementMode: limits.mode },
        ),
      );
    }

    const records = [];
    for (const playerId of [...new Set(selectedPlayerIds)]) {
      const player = playersById.get(playerId);
      const record = {
        teamId: team.teamId,
        playerId,
        playerName: player?.playerName ?? null,
        originalDrafterTeamId: player?.originalDrafterTeamId ?? null,
        oldRound: player?.oldRound ?? null,
        finishEligibility: "UNKNOWN",
        consecutiveYearEligibility: player?.consecutiveYearKeeperEligibility ?? "UNKNOWN",
        baseCostRound: player ? mapKeeperCost(player.oldRound) : null,
        resolvedCostRound: null,
        collisionDepth: null,
        possibleResolvedCostRounds: [],
        collision: null,
        consumedEntitlement: null,
        possibleConsumedEntitlements: [],
        consumedPickNumber: null,
        possibleConsumedPickNumbers: [],
        selectionStatus: "VALID",
        placementStatus: "PENDING",
      };
      records.push(record);
      keeperRecords.push(record);

      if (!player || ambiguousPlayerIds.has(playerId)) {
        blocking = true;
        record.selectionStatus = "INVALID";
        validation.push(
          makeValidation(ERROR, "UNKNOWN_KEEPER_PLAYER", `Keeper selection ${playerId} is not uniquely present in prior draft data.`, {
            teamId: team.teamId,
            playerId,
          }),
        );
        continue;
      }

      if (player.originalDrafterTeamId !== team.teamId) {
        blocking = true;
        record.selectionStatus = "INVALID";
        validation.push(
          makeValidation(
            ERROR,
            "KEEPER_NOT_ORIGINAL_DRAFTER",
            `${team.name} did not originally draft ${player.playerName}.`,
            { teamId: team.teamId, playerId, originalDrafterTeamId: player.originalDrafterTeamId },
          ),
        );
      }

      if (limits && player.oldRound < limits.minimumOldRound) {
        blocking = true;
        record.finishEligibility = "INELIGIBLE";
        record.selectionStatus = "INVALID";
        validation.push(
          makeValidation(
            ERROR,
            "KEEPER_FINISH_RESTRICTION",
            `${player.playerName} was drafted in R${player.oldRound}, outside ${team.name}'s active keeper mode.`,
            { teamId: team.teamId, playerId, oldRound: player.oldRound, entitlementMode: limits.mode },
          ),
        );
      } else {
        record.finishEligibility = "ELIGIBLE";
      }

      if (player.consecutiveYearKeeperEligibility === "INELIGIBLE") {
        blocking = true;
        record.selectionStatus = "INVALID";
        validation.push(
          makeValidation(
            ERROR,
            "KEEPER_CONSECUTIVE_YEAR_INELIGIBLE",
            `${player.playerName} cannot be kept in consecutive years.`,
            { teamId: team.teamId, playerId },
          ),
        );
      } else if (player.consecutiveYearKeeperEligibility === "UNKNOWN") {
        blocking = true;
        hasUnresolved = true;
        record.selectionStatus = "UNRESOLVED";
        validation.push(
          makeValidation(
            UNRESOLVED,
            "KEEPER_CONSECUTIVE_YEAR_UNKNOWN",
            `${player.playerName}'s consecutive-year keeper eligibility is unknown.`,
            { teamId: team.teamId, playerId },
          ),
        );
      }

      const priorSelectingTeam = selectedGlobally.get(playerId);
      if (priorSelectingTeam && priorSelectingTeam !== team.teamId) {
        blocking = true;
        record.selectionStatus = "INVALID";
        validation.push(
          makeValidation(ERROR, "PLAYER_SELECTED_BY_MULTIPLE_TEAMS", `${player.playerName} was selected by multiple teams.`, {
            teamId: team.teamId,
            playerId,
            otherTeamId: priorSelectingTeam,
          }),
        );
      } else {
        selectedGlobally.set(playerId, team.teamId);
      }

      if (record.baseCostRound > draftRounds) {
        blocking = true;
        record.selectionStatus = "INVALID";
        validation.push(
          makeValidation(ERROR, "KEEPER_COST_OUTSIDE_DRAFT", `${player.playerName}'s mapped cost is outside the draft board.`, {
            teamId: team.teamId,
            playerId,
            baseCostRound: record.baseCostRound,
          }),
        );
      }
    }

    const earlyRoundRecords = records.filter((record) => record.oldRound <= 2);
    if (earlyRoundRecords.length > 1) {
      blocking = true;
      for (const record of earlyRoundRecords) record.selectionStatus = "INVALID";
      validation.push(
        makeValidation(ERROR, "KEEPER_R1_R2_LIMIT", "Only one R1/R2 keeper may be selected.", {
          teamId: team.teamId,
          playerIds: earlyRoundRecords.map((record) => record.playerId),
        }),
      );
    }

    if (!blocking && records.length > 0) {
      const costAllocation = allocateKeeperCosts(records);
      const recordsById = new Map(records.map((record) => [record.playerId, record]));
      const channelBlockedPlayerIds = new Set();

      for (const assignment of costAllocation.assignments) {
        const record = recordsById.get(assignment.playerId);
        record.resolvedCostRound = assignment.resolvedCostRound;
        record.collisionDepth = assignment.collisionDepth;
      }

      for (const issue of costAllocation.validation) {
        blocking = true;
        const record = recordsById.get(issue.playerId);
        if (record) {
          record.selectionStatus = "INVALID";
          record.placementStatus = "INVALID";
        }
        validation.push({ ...issue, teamId: team.teamId });
      }

      for (const allocatedCollision of costAllocation.collisions) {
        const collisionId = `${team.teamId}:R${allocatedCollision.baseCostRound}`;
        const collision = {
          collisionId,
          teamId: team.teamId,
          ...allocatedCollision,
          channelStatus: "PENDING",
        };
        const collisionRecords = collision.playerIds.map((playerId) => recordsById.get(playerId));
        for (const record of collisionRecords) {
          record.collision = { collisionId, assignmentStatus: collision.assignmentStatus };
        }

        const ownedBaseRoundChannels = [...entitlements.values()].filter(
          (entitlement) =>
            entitlement.round === collision.baseCostRound &&
            entitlement.ownershipStatus === "RESOLVED" &&
            entitlement.currentOwnerTeamId === team.teamId,
        );
        if (ownedBaseRoundChannels.length > 1) {
          blocking = true;
          hasUnresolved = true;
          collision.channelStatus = "RULE_UNRESOLVED";
          collision.possibleConsumedRoundSets = [
            collision.playerIds.map(() => collision.baseCostRound),
            [...collision.resolvedRounds],
          ];
          for (const record of collisionRecords) {
            channelBlockedPlayerIds.add(record.playerId);
            record.placementStatus = "UNRESOLVED";
          }
          validation.push(
            makeValidation(
              UNRESOLVED,
              "KEEPER_DUPLICATE_CHANNEL_RULE_UNRESOLVED",
              `The team owns multiple R${collision.baseCostRound} entitlements, and the rule for consuming them after keeper-cost allocation is not confirmed.`,
              {
                teamId: team.teamId,
                playerIds: collision.playerIds,
                resolvedRounds: collision.resolvedRounds,
                entitlementOrigins: ownedBaseRoundChannels.map(
                  (entitlement) => entitlement.originTeamId,
                ),
                ruleQuestion: "Q4",
              },
            ),
          );
        }
        collisions.push(collision);
      }

      for (const record of records) {
        if (record.resolvedCostRound === null || channelBlockedPlayerIds.has(record.playerId)) continue;
        const channel = entitlements.get(entitlementKey(team.teamId, record.resolvedCostRound));
        if (!channel || channel.ownershipStatus !== "RESOLVED" || channel.currentOwnerTeamId !== team.teamId) {
          blocking = true;
          hasUnresolved = true;
          record.placementStatus = "UNRESOLVED";
          validation.push(
            makeValidation(
              UNRESOLVED,
              "KEEPER_CHANNEL_RULE_UNRESOLVED",
              `${team.name} does not hold its native R${record.resolvedCostRound} entitlement; the replacement-channel rule is unresolved.`,
              {
                teamId: team.teamId,
                playerId: record.playerId,
                baseCostRound: record.baseCostRound,
                resolvedCostRound: record.resolvedCostRound,
                ruleQuestion: "Q5",
              },
            ),
          );
        } else {
          record.consumedEntitlement = {
            originTeamId: team.teamId,
            round: record.resolvedCostRound,
          };
          record.placementStatus = "RESOLVED";
        }
      }

      for (const collision of collisions.filter((item) => item.teamId === team.teamId)) {
        if (collision.channelStatus === "PENDING") {
          collision.channelStatus = collision.playerIds.some(
            (playerId) => recordsById.get(playerId)?.placementStatus !== "RESOLVED",
          )
            ? "RULE_UNRESOLVED"
            : "RESOLVED";
        }
        for (const playerId of collision.playerIds) {
          const record = recordsById.get(playerId);
          record.collision = {
            collisionId: collision.collisionId,
            assignmentStatus: collision.assignmentStatus,
            channelStatus: collision.channelStatus,
          };
        }
      }
    }

    const bucket = usable && !blocking ? (records.length === 0 ? "NO_KEEPER" : "KEEPER") : null;
    const declarationStatus = !usable
      ? "UNRESOLVED"
      : blocking
        ? hasUnresolved
          ? "UNRESOLVED"
          : "INVALID"
        : "RESOLVED";
    teamStates.set(team.teamId, {
      teamId: team.teamId,
      keeperTier: tier,
      entitlementMode: limits?.mode ?? null,
      bucket,
      declarationStatus,
      selectedPlayerIds,
    });
  }

  return { keeperRecords, collisions, teamStates, playersById };
}

function resolveAllocations(input, teams, teamStates, validation) {
  const declarations = normalizeByTeam(input.stealDeclarations);
  const allocations = [];
  let allResolvable = true;

  for (const team of teams) {
    const teamState = teamStates.get(team.teamId);
    const declaration = declarations.get(team.teamId);
    const usable = declarationIsUsable(declaration, input.stateType, "STEAL", validation, team.teamId);
    const direction = declaration?.direction;
    const validDirection = direction === DIRECTIONS.EARLY || direction === DIRECTIONS.LATE;
    if (usable && !validDirection) {
      validation.push(
        makeValidation(UNRESOLVED, "STEAL_DIRECTION_MISSING", "Early/Late direction is not explicit.", {
          teamId: team.teamId,
        }),
      );
    }
    if (!usable || !validDirection || !teamState?.bucket) allResolvable = false;
    allocations.push({
      teamId: team.teamId,
      previousFinish: team.previousFinish,
      bucket: teamState?.bucket ?? null,
      priority: null,
      stealDirection: validDirection ? direction : null,
      r1Slot: null,
      status: usable && validDirection && teamState?.bucket ? "READY" : "UNRESOLVED",
    });
  }

  if (!allResolvable) {
    validation.push(
      makeValidation(
        UNRESOLVED,
        "R1_ALLOCATION_UNRESOLVED",
        "R1 slots require resolved keeper buckets and explicit Early/Late declarations for all teams.",
      ),
    );
    return allocations;
  }

  const allocationOrder = ["NO_KEEPER", "KEEPER"].flatMap((bucket) =>
    allocations
      .filter((allocation) => allocation.bucket === bucket)
      .sort((a, b) => a.previousFinish - b.previousFinish)
      .map((allocation, index) => ({ allocation, priority: index + 1 })),
  );
  const remainingSlots = Array.from({ length: teams.length }, (_, index) => index + 1);
  for (const { allocation, priority } of allocationOrder) {
    allocation.priority = priority;
    allocation.r1Slot =
      allocation.stealDirection === DIRECTIONS.EARLY ? remainingSlots.shift() : remainingSlots.pop();
    allocation.status = "RESOLVED";
  }

  const assignedSlots = allocations.map((allocation) => allocation.r1Slot);
  if (new Set(assignedSlots).size !== assignedSlots.length) {
    validation.push(makeValidation(ERROR, "DUPLICATE_R1_SLOT", "R1 allocator produced a duplicate slot."));
  }
  if (allocations.some((allocation) => allocation.r1Slot === null)) {
    validation.push(
      makeValidation(ERROR, "MISSING_R1_ALLOCATION", "A fully declared team is missing its R1 allocation."),
    );
  }
  return allocations;
}

function buildPicks(teams, draftRounds, allocations, entitlements, keeperRecords, collisions) {
  if (allocations.some((allocation) => allocation.r1Slot === null)) return [];
  const picks = [];
  for (const allocation of [...allocations].sort((a, b) => a.r1Slot - b.r1Slot)) {
    for (let round = 1; round <= draftRounds; round += 1) {
      const slot = snakeSlotForRound(allocation.r1Slot, round, teams.length);
      const entitlement = entitlements.get(entitlementKey(allocation.teamId, round));
      picks.push({
        round,
        slot,
        overallPick: (round - 1) * teams.length + slot,
        pickNumber: formatPickNumber(round, slot),
        r1Slot: allocation.r1Slot,
        originTeamId: allocation.teamId,
        currentOwnerTeamId: entitlement?.currentOwnerTeamId ?? null,
        ownershipStatus: entitlement?.ownershipStatus ?? "UNRESOLVED",
        status: entitlement?.ownershipStatus === "RESOLVED" ? "OPEN" : "UNRESOLVED",
        keeper: null,
        keeperCandidates: [],
      });
    }
  }

  const pickByOriginRound = new Map(
    picks.map((pick) => [entitlementKey(pick.originTeamId, pick.round), pick]),
  );
  for (const keeper of keeperRecords) {
    if (keeper.placementStatus !== "RESOLVED" || !keeper.consumedEntitlement) continue;
    const pick = pickByOriginRound.get(
      entitlementKey(keeper.consumedEntitlement.originTeamId, keeper.consumedEntitlement.round),
    );
    if (!pick) continue;
    pick.status = "KEEPER";
    pick.keeper = {
      teamId: keeper.teamId,
      playerId: keeper.playerId,
      playerName: keeper.playerName,
      oldRound: keeper.oldRound,
      baseCostRound: keeper.baseCostRound,
      resolvedCostRound: keeper.resolvedCostRound,
      collisionDepth: keeper.collisionDepth,
    };
    keeper.consumedPickNumber = pick.pickNumber;
  }

  for (const collision of collisions) {
    if (collision.assignmentStatus === "RESOLVED" || collision.resolvedRounds.length === 0) continue;
    const candidatePicks = collision.resolvedRounds.map((round) =>
      pickByOriginRound.get(entitlementKey(collision.teamId, round)),
    );
    for (const pick of candidatePicks) {
      if (!pick) continue;
      pick.status = "KEEPER_UNRESOLVED";
      pick.keeperCandidates = [...collision.playerIds];
    }
    for (const keeper of keeperRecords.filter(
      (record) => record.collision?.collisionId === collision.collisionId,
    )) {
      keeper.possibleConsumedPickNumbers = candidatePicks.filter(Boolean).map((pick) => pick.pickNumber);
    }
  }
  return picks;
}

function buildPlayerPool(teams, keeperRecords, teamStates) {
  const selectedByPlayer = new Map(keeperRecords.map((keeper) => [keeper.playerId, keeper]));
  const playerPool = teams.flatMap((team) =>
    (team.priorDraft ?? []).map((player) => {
      const keeper = selectedByPlayer.get(player.playerId);
      let availability = "AVAILABLE";
      let keeperTeamId = null;
      if (keeper) {
        const declarationStatus = teamStates.get(keeper.teamId)?.declarationStatus;
        if (declarationStatus === "RESOLVED" && keeper.selectionStatus === "VALID") {
          availability = "KEPT";
          keeperTeamId = keeper.teamId;
        } else if (declarationStatus === "UNRESOLVED" || keeper.selectionStatus === "UNRESOLVED") {
          availability = "UNRESOLVED";
          keeperTeamId = keeper.teamId;
        }
      }
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        originalDrafterTeamId: player.originalDrafterTeamId,
        oldRound: player.oldRound,
        availability,
        keeperTeamId,
      };
    }),
  );
  return {
    playerPool,
    availablePlayers: playerPool.filter((player) => player.availability === "AVAILABLE"),
    unresolvedPlayers: playerPool.filter((player) => player.availability === "UNRESOLVED"),
  };
}

function validateLeagueShape(teams, validation) {
  if (teams.length !== TEAM_COUNT) {
    validation.push(
      makeValidation(ERROR, "INVALID_TEAM_COUNT", `League must contain ${TEAM_COUNT} teams, received ${teams.length}.`),
    );
  }
  const teamIds = teams.map((team) => team.teamId);
  if (new Set(teamIds).size !== teamIds.length) {
    validation.push(makeValidation(ERROR, "DUPLICATE_TEAM_ID", "Team IDs must be unique."));
  }
  const finishes = teams.map((team) => team.previousFinish);
  if (
    finishes.some((finish) => !Number.isInteger(finish) || finish < 1 || finish > TEAM_COUNT) ||
    new Set(finishes).size !== finishes.length
  ) {
    validation.push(
      makeValidation(ERROR, "INVALID_FINISH_ORDER", "Previous finishes must uniquely cover valid league positions."),
    );
  }
}

/**
 * Pure top-level resolver. It never mutates canonical input objects and never
 * fills a missing declaration or unresolved league rule with a guessed value.
 */
export function resolveDraftState(input) {
  const stateType = input.stateType ?? STATE_TYPES.WORKING;
  const teams = input.teams ?? [];
  const draftRounds = input.draftRounds ?? DEFAULT_DRAFT_ROUNDS;
  const normalizedInput = { ...input, stateType };
  const validation = [];

  validateLeagueShape(teams, validation);
  const entitlementMap = resolveEntitlements(normalizedInput, teams, draftRounds, validation);
  const { keeperRecords, collisions, teamStates } = resolveKeepers(
    normalizedInput,
    teams,
    entitlementMap,
    draftRounds,
    validation,
  );
  const allocations = resolveAllocations(normalizedInput, teams, teamStates, validation);
  const picks = buildPicks(teams, draftRounds, allocations, entitlementMap, keeperRecords, collisions);
  const { playerPool, availablePlayers, unresolvedPlayers } = buildPlayerPool(
    teams,
    keeperRecords,
    teamStates,
  );
  const entitlements = [...entitlementMap.values()].sort(
    (a, b) => a.round - b.round || a.originTeamId.localeCompare(b.originTeamId),
  );
  const hasBlockingValidation = validation.some(
    (item) => item.severity === ERROR || item.severity === UNRESOLVED,
  );

  return {
    stateType,
    season: input.season ?? null,
    draftRounds,
    teamKeeperStates: teams.map((team) => teamStates.get(team.teamId)),
    allocations,
    entitlements,
    picks,
    keepers: keeperRecords,
    keeperCollisions: collisions,
    playerPool,
    availablePlayers,
    unresolvedPlayers,
    validation,
    isResolved: !hasBlockingValidation && picks.length === teams.length * draftRounds,
  };
}
