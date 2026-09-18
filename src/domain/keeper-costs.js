const ERROR = "ERROR";

function canonicalPlayerOrder(left, right) {
  return left.oldRound - right.oldRound || left.playerId.localeCompare(right.playerId);
}

function overflowValidation(record) {
  return {
    severity: ERROR,
    code: "KEEPER_COST_COLLISION_OVERFLOW",
    message: `${record.playerName ?? record.playerId} cannot be assigned a keeper cost without moving earlier than R1.`,
    playerId: record.playerId,
    baseCostRound: record.baseCostRound,
  };
}

/**
 * Allocate intrinsic keeper costs without consulting pick ownership.
 *
 * Every distinct base round is reserved first. Remaining same-base claims then
 * spill toward R1, skipping both genuine base claims and prior spillovers.
 * Tighter (earlier) base rounds spill first; ties use canonical prior-draft
 * order so input/click order cannot affect the result.
 */
export function allocateKeeperCosts(keepers) {
  const groupsByBaseRound = new Map();
  for (const keeper of keepers) {
    if (!Number.isInteger(keeper.baseCostRound) || keeper.baseCostRound < 1) {
      throw new TypeError(`Keeper ${keeper.playerId ?? "(unknown)"} has an invalid base cost round.`);
    }
    if (!Number.isInteger(keeper.oldRound) || typeof keeper.playerId !== "string") {
      throw new TypeError("Keeper cost allocation requires stable playerId and oldRound values.");
    }
    if (!groupsByBaseRound.has(keeper.baseCostRound)) {
      groupsByBaseRound.set(keeper.baseCostRound, []);
    }
    groupsByBaseRound.get(keeper.baseCostRound).push(keeper);
  }

  const groups = [...groupsByBaseRound.entries()]
    .sort(([leftRound], [rightRound]) => leftRound - rightRound)
    .map(([baseCostRound, members]) => ({
      baseCostRound,
      members: [...members].sort(canonicalPlayerOrder),
    }));
  const occupiedRounds = new Set();
  const assignments = [];
  const overflows = [];

  // Reserve genuine base claims before any collision spillover is considered.
  for (const group of groups) {
    const keeper = group.members[0];
    occupiedRounds.add(group.baseCostRound);
    assignments.push({
      playerId: keeper.playerId,
      baseCostRound: group.baseCostRound,
      resolvedCostRound: group.baseCostRound,
      collisionDepth: 0,
    });
  }

  for (const group of groups) {
    for (const keeper of group.members.slice(1)) {
      let resolvedCostRound = group.baseCostRound - 1;
      while (resolvedCostRound >= 1 && occupiedRounds.has(resolvedCostRound)) {
        resolvedCostRound -= 1;
      }
      if (resolvedCostRound < 1) {
        overflows.push({
          playerId: keeper.playerId,
          baseCostRound: group.baseCostRound,
          validation: overflowValidation(keeper),
        });
        continue;
      }
      occupiedRounds.add(resolvedCostRound);
      assignments.push({
        playerId: keeper.playerId,
        baseCostRound: group.baseCostRound,
        resolvedCostRound,
        collisionDepth: group.baseCostRound - resolvedCostRound,
      });
    }
  }

  const assignmentByPlayerId = new Map(assignments.map((assignment) => [assignment.playerId, assignment]));
  const collisions = groups
    .filter((group) => group.members.length > 1)
    .map((group) => {
      const playerIds = group.members.map((keeper) => keeper.playerId);
      const groupAssignments = playerIds
        .map((playerId) => assignmentByPlayerId.get(playerId))
        .filter(Boolean);
      return {
        baseCostRound: group.baseCostRound,
        playerIds,
        resolvedRounds: groupAssignments.map((assignment) => assignment.resolvedCostRound),
        assignments: groupAssignments,
        assignmentStatus: groupAssignments.length === playerIds.length ? "RESOLVED" : "OVERFLOW",
      };
    });

  return {
    assignments,
    collisions,
    occupiedRounds: [...occupiedRounds].sort((left, right) => left - right),
    overflows,
    validation: overflows.map((overflow) => overflow.validation),
  };
}
