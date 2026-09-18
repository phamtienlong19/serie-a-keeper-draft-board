import { resolveDraftState } from "../domain/engine.js";

export function createEmptyScenarioOverrides() {
  return {
    keeperSelections: {},
    stealDirections: {},
    assumedEligiblePlayerIds: [],
  };
}

function uniquePlayerIds(playerIds) {
  return [...new Set(playerIds)];
}

export function setScenarioKeeperSelection(overrides, teamId, playerId, selected) {
  const current = overrides.keeperSelections[teamId] ?? [];
  const next = selected
    ? uniquePlayerIds([...current, playerId])
    : current.filter((candidateId) => candidateId !== playerId);
  const keeperSelections = { ...overrides.keeperSelections };
  if (next.length === 0) delete keeperSelections[teamId];
  else keeperSelections[teamId] = next;
  return { ...overrides, keeperSelections };
}

export function setScenarioStealDirection(overrides, teamId, direction) {
  if (direction !== "EARLY" && direction !== "LATE") return overrides;
  const stealDirections = { ...overrides.stealDirections };
  if (direction === "EARLY") delete stealDirections[teamId];
  else stealDirections[teamId] = direction;
  return { ...overrides, stealDirections };
}

export function setScenarioEligibilityAssumption(overrides, playerId, assumed) {
  const assumptions = new Set(overrides.assumedEligiblePlayerIds);
  if (assumed) assumptions.add(playerId);
  else assumptions.delete(playerId);
  return { ...overrides, assumedEligiblePlayerIds: [...assumptions] };
}

export function countScenarioChanges(overrides) {
  return (
    Object.keys(overrides.keeperSelections).length +
    Object.keys(overrides.stealDirections).length +
    overrides.assumedEligiblePlayerIds.length
  );
}

/**
 * Applies scenario facts to cloned resolver inputs. UNKNOWN history assumptions
 * are upgraded only inside that clone and never alter canonical team records.
 */
export function applyScenarioOverrides(baselineInput, overrides) {
  const input = structuredClone(baselineInput);
  input.stateType = "SCENARIO";

  for (const selection of input.keeperSelections) {
    if (Object.hasOwn(overrides.keeperSelections, selection.teamId)) {
      selection.selectedPlayerIds = [...overrides.keeperSelections[selection.teamId]];
    }
  }
  for (const declaration of input.stealDeclarations) {
    if (Object.hasOwn(overrides.stealDirections, declaration.teamId)) {
      declaration.direction = overrides.stealDirections[declaration.teamId];
    }
  }

  const assumedPlayerIds = new Set(overrides.assumedEligiblePlayerIds);
  for (const team of input.teams) {
    for (const player of team.priorDraft) {
      if (
        assumedPlayerIds.has(player.playerId) &&
        player.consecutiveYearKeeperEligibility === "UNKNOWN"
      ) {
        player.consecutiveYearKeeperEligibility = "ELIGIBLE";
      }
    }
  }
  return input;
}

export function resolveScenario(baselineInput, overrides) {
  const input = applyScenarioOverrides(baselineInput, overrides);
  return { input, resolvedState: resolveDraftState(input) };
}

function relevantCandidateValidation(validation, teamId) {
  return validation.filter(
    (item) =>
      item.teamId === teamId &&
      item.code !== "KEEPER_COLLISION_ASSIGNMENT_UNRESOLVED",
  );
}

/**
 * Probes each possible selection through the real resolver. This keeps finish
 * tiers, keeper limits, R1/R2 limits, and the 8th–11th mode out of UI code.
 */
export function evaluateKeeperCandidates({ baselineInput, overrides, teamId }) {
  const baselineTeam = baselineInput.teams.find((team) => team.teamId === teamId);
  if (!baselineTeam) return [];
  const selectedPlayerIds = overrides.keeperSelections[teamId] ?? [];
  const assumedPlayerIds = new Set(overrides.assumedEligiblePlayerIds);

  return baselineTeam.priorDraft.map((player) => {
    const selected = selectedPlayerIds.includes(player.playerId);
    const probeOverrides = selected
      ? overrides
      : setScenarioKeeperSelection(overrides, teamId, player.playerId, true);
    const { resolvedState } = resolveScenario(baselineInput, probeOverrides);
    const keeper = resolvedState.keepers.find(
      (record) => record.teamId === teamId && record.playerId === player.playerId,
    );
    const validation = relevantCandidateValidation(resolvedState.validation, teamId);
    const errors = validation.filter((item) => item.severity === "ERROR");
    const unresolved = validation.filter((item) => item.severity === "UNRESOLVED");
    const historyUnknown = player.consecutiveYearKeeperEligibility === "UNKNOWN";
    const assumedEligible = historyUnknown && assumedPlayerIds.has(player.playerId);

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      oldRound: player.oldRound,
      originalDrafterTeamId: player.originalDrafterTeamId,
      canonicalConsecutiveYearEligibility: player.consecutiveYearKeeperEligibility,
      assumedEligible,
      selected,
      finishEligibility: keeper?.finishEligibility ?? "UNKNOWN",
      baseCostRound: keeper?.baseCostRound ?? null,
      resolvedCostRound: keeper?.resolvedCostRound ?? null,
      collisionDepth: keeper?.collisionDepth ?? null,
      possibleResolvedCostRounds: keeper?.possibleResolvedCostRounds ?? [],
      placementStatus: keeper?.placementStatus ?? "PENDING",
      validation: validation.map((item) => ({ ...item })),
      deterministicError: errors.length > 0,
      unresolved: unresolved.length > 0,
      requiresEligibilityAssumption: historyUnknown && !assumedEligible,
      canSelect: errors.length === 0 && (!historyUnknown || assumedEligible),
    };
  });
}
