import { createYahooMetadataIndex, getYahooMetadataForLocalPlayer } from "../external/yahoo.js";

function teamValidation(validation, teamId) {
  return validation
    .filter((item) => item.teamId === teamId)
    .map((item) => ({ severity: item.severity, code: item.code, message: item.message }));
}

function keeperMetadata(pick, metadataIndex) {
  const playerId = pick.keeper?.playerId;
  if (!playerId) return null;
  return getYahooMetadataForLocalPlayer(playerId, metadataIndex)?.metadata ?? null;
}

/**
 * Presentation-only transformation. All geometry, ownership, keeper placement,
 * and validation come directly from resolver output.
 */
export function buildDraftBoardViewModel({
  resolvedState,
  teams,
  identityMap,
  yahooPlayers,
  stateLabel = "READ-ONLY",
  scenarioChangeCount = 0,
  assumedEligibilityCount = 0,
  selectedTeamId = null,
  movedTeamIds = [],
}) {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const keeperCountByTeam = new Map();
  for (const keeper of resolvedState.keepers) {
    keeperCountByTeam.set(keeper.teamId, (keeperCountByTeam.get(keeper.teamId) ?? 0) + 1);
  }
  const metadataIndex = createYahooMetadataIndex(identityMap, yahooPlayers);
  const picksByOriginTeam = new Map();
  for (const pick of resolvedState.picks) {
    if (!picksByOriginTeam.has(pick.originTeamId)) picksByOriginTeam.set(pick.originTeamId, []);
    picksByOriginTeam.get(pick.originTeamId).push(pick);
  }

  const columns = resolvedState.allocations
    .filter((allocation) => allocation.r1Slot !== null)
    .sort((a, b) => a.r1Slot - b.r1Slot)
    .map((allocation) => {
      const team = teamById.get(allocation.teamId);
      const resolverPicks = (picksByOriginTeam.get(allocation.teamId) ?? []).sort(
        (a, b) => a.round - b.round,
      );
      const firstRoundPick = resolverPicks.find((pick) => pick.round === 1);
      return {
        teamId: allocation.teamId,
        teamName: team?.name ?? allocation.teamId,
        previousFinish: allocation.previousFinish,
        bucket: allocation.bucket,
        keeperCount: keeperCountByTeam.get(allocation.teamId) ?? 0,
        stealDirection: allocation.stealDirection,
        r1Slot: allocation.r1Slot,
        r1PickNumber: firstRoundPick?.pickNumber ?? null,
        isSelected: allocation.teamId === selectedTeamId,
        hasMoved: movedTeamIds.includes(allocation.teamId),
        cells: resolverPicks.map((pick) => {
          const owner = teamById.get(pick.currentOwnerTeamId);
          const origin = teamById.get(pick.originTeamId);
          return {
            pickNumber: pick.pickNumber,
            round: pick.round,
            slot: pick.slot,
            status: pick.status,
            isTraded:
              pick.currentOwnerTeamId !== null && pick.currentOwnerTeamId !== pick.originTeamId,
            currentOwnerTeamId: pick.currentOwnerTeamId,
            currentOwnerName: owner?.name ?? pick.currentOwnerTeamId,
            originTeamId: pick.originTeamId,
            originTeamName: origin?.name ?? pick.originTeamId,
            keeper: pick.keeper ? { ...pick.keeper } : null,
            keeperCandidates: [...pick.keeperCandidates],
            yahooMetadata: keeperMetadata(pick, metadataIndex),
          };
        }),
      };
    });

  const pendingTeams = resolvedState.allocations
    .filter((allocation) => allocation.r1Slot === null)
    .map((allocation) => {
      const team = teamById.get(allocation.teamId);
      return {
        teamId: allocation.teamId,
        teamName: team?.name ?? allocation.teamId,
        validation: teamValidation(resolvedState.validation, allocation.teamId),
      };
    });

  return {
    stateLabel,
    scenarioChangeCount,
    assumedEligibilityCount,
    selectedTeamId,
    season: resolvedState.season,
    draftRounds: resolvedState.draftRounds,
    columns,
    pendingTeams,
    validation: resolvedState.validation.map((item) => ({ ...item })),
    resolvedPickCount: columns.reduce((count, column) => count + column.cells.length, 0),
  };
}
