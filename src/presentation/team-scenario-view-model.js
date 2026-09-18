import { createYahooMetadataIndex, getYahooMetadataForLocalPlayer } from "../external/yahoo.js";
import { evaluateKeeperCandidates } from "../scenario/scenario-state.js";

const TIER_LABELS = Object.freeze({
  ANY_2: "Up to 2 eligible players",
  TWO_R2_PLUS: "Up to 2 players from R2+",
  ONE_R2_OR_TWO_R3_PLUS: "1 player from R2+ or 2 players from R3+",
  ONE_R3_PLUS: "1 player from R3+",
  ONE_R4_PLUS: "1 player from R4+",
  NONE: "No keepers",
});

const MODE_LABELS = Object.freeze({
  UP_TO_TWO_ANY: "Up to 2 eligible players",
  UP_TO_TWO_R2_PLUS: "Up to 2 from R2+",
  ONE_R2_PLUS: "1 keeper from R2+",
  TWO_R3_PLUS: "2 keepers from R3+",
  ONE_R3_PLUS: "1 keeper from R3+",
  ONE_R4_PLUS: "1 keeper from R4+",
  NONE: "No keepers",
});

function metadataFor(playerId, metadataIndex) {
  return getYahooMetadataForLocalPlayer(playerId, metadataIndex)?.metadata ?? null;
}

function costLabel(candidate) {
  const oldRound = `R${candidate.oldRound}`;
  const baseRound = candidate.baseCostRound ? `R${candidate.baseCostRound}` : "—";
  if (candidate.possibleResolvedCostRounds.length > 0) {
    return `${oldRound} → ${baseRound} → ${candidate.possibleResolvedCostRounds
      .map((round) => `R${round}`)
      .join(" / ")}`;
  }
  if (
    candidate.resolvedCostRound !== null &&
    candidate.resolvedCostRound !== candidate.baseCostRound
  ) {
    return `${oldRound} → ${baseRound} → R${candidate.resolvedCostRound}`;
  }
  return `${oldRound} → ${baseRound}`;
}

export function buildTeamScenarioViewModel({
  baselineInput,
  scenarioOverrides,
  resolvedState,
  teamId,
  identityMap,
  yahooPlayers,
}) {
  if (!teamId) return null;
  const team = baselineInput.teams.find((candidate) => candidate.teamId === teamId);
  if (!team) return null;
  const teamState = resolvedState.teamKeeperStates.find((candidate) => candidate.teamId === teamId);
  const allocation = resolvedState.allocations.find((candidate) => candidate.teamId === teamId);
  const metadataIndex = createYahooMetadataIndex(identityMap, yahooPlayers);
  const candidates = evaluateKeeperCandidates({ baselineInput, overrides: scenarioOverrides, teamId });
  const selectedPlayerIds = scenarioOverrides.keeperSelections[teamId] ?? [];

  const roster = candidates.map((candidate) => ({
    ...candidate,
    yahooMetadata: metadataFor(candidate.playerId, metadataIndex),
    costLabel: costLabel(candidate),
  }));
  const pickPath = resolvedState.picks
    .filter((pick) => pick.currentOwnerTeamId === teamId)
    .sort((a, b) => a.round - b.round || a.slot - b.slot)
    .map((pick) => ({
      round: pick.round,
      pickNumber: pick.pickNumber,
      status: pick.status,
      originTeamId: pick.originTeamId,
      isAcquired: pick.originTeamId !== teamId,
      occupant: pick.keeper?.playerName ?? null,
    }));

  return {
    teamId,
    teamName: team.name,
    previousFinish: team.previousFinish,
    keeperTier: teamState?.keeperTier ?? null,
    keeperTierLabel: TIER_LABELS[teamState?.keeperTier] ?? "Unresolved keeper tier",
    entitlementMode: teamState?.entitlementMode ?? null,
    entitlementModeLabel: MODE_LABELS[teamState?.entitlementMode] ?? "Unresolved mode",
    selectedPlayerIds,
    selectedKeeperCount: selectedPlayerIds.length,
    stealDirection: allocation?.stealDirection ?? null,
    allocationBucket: allocation?.bucket ?? null,
    r1Slot: allocation?.r1Slot ?? null,
    roster,
    pickPath,
    validation: resolvedState.validation
      .filter((item) => item.teamId === teamId)
      .map((item) => ({ ...item })),
  };
}

