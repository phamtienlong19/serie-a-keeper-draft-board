import { allocateKeeperCosts } from './keeper-costs.js';
import { deriveKeeperEntitlement, entitlementLimits, mapKeeperCost } from './engine.js';

/** Historical draft facts in, preliminary next-season rights out. No roster or standings inference. */
export function buildKeeperRights(draftHistory, { seasonStandings = null, currentRosterOwnership = null } = {}) {
  if (draftHistory.season !== '2026-27' || draftHistory.recordType !== 'COMPLETED_DRAFT') throw new TypeError('Expected 2026-27 completed draft history.');
  // These future feeds are intentionally not used to transfer original draft rights.
  void seasonStandings; void currentRosterOwnership;
  return draftHistory.picks.map((pick) => ({
    playerId: pick.playerId, playerName: pick.playerName,
    yahooSportsProfileId: pick.yahooSportsProfileId,
    identityStatus: pick.identityStatus,
    selectingTeamId: pick.selectingTeamId,
    originalEntitlementOwnerTeamId: pick.originalEntitlementOwnerTeamId,
    keeperRightsHolderTeamId: pick.was2026KeeperReservation ? null : pick.selectingTeamId,
    currentRosterOwnerTeamId: null,
    originalDraftRound: pick.round,
    overallPick: pick.overallPick, pickNumber: pick.pickNumber,
    was2026KeeperReservation: pick.was2026KeeperReservation,
    historicalKeeperAssignment: pick.historicalKeeperAssignment ?? null,
    consecutiveYearEligibility: pick.was2026KeeperReservation ? 'INELIGIBLE_SAME_MANAGER' : 'ELIGIBLE',
    baseCostRound: pick.was2026KeeperReservation ? null : mapKeeperCost(pick.round),
    finishEligibility: 'UNKNOWN',
    status: pick.was2026KeeperReservation ? 'INELIGIBLE_PREVIOUS_KEEPER' : pick.round <= 2 ? 'RESTRICTED_BY_FINAL_FINISH' : 'POTENTIAL_KEEPER',
  }));
}

/** Evaluate a proposed set at every possible final finish using the existing tier rule. */
export function compareKeeperCandidates(rights, teamId, playerIds) {
  if (playerIds.length > 2 || new Set(playerIds).size !== playerIds.length) throw new TypeError('Choose up to two different candidates.');
  const selected = playerIds.map((id) => rights.find((right) => right.playerId === id && right.selectingTeamId === teamId));
  if (selected.some((right) => !right)) throw new TypeError('Candidate is not in this team’s 2026 draft.');
  const issues = [];
  if (selected.some((right) => !right.keeperRightsHolderTeamId)) issues.push('Kept in 2026–27 · cannot repeat.');
  if (selected.filter((right) => right.originalDraftRound <= 2).length > 1) issues.push('Max one R1/R2 keeper.');
  const allowedFinishes = issues.length ? [] : Array.from({ length: 18 }, (_, index) => index + 1).filter((finish) => {
    const limits = entitlementLimits(deriveKeeperEntitlement(finish), selected.length);
    return selected.length <= limits.maximum && selected.every((right) => right.originalDraftRound >= limits.minimumOldRound);
  });
  const allocation = issues.length || !selected.length ? null : allocateKeeperCosts(selected.map((right) => ({
    playerId: right.playerId, oldRound: right.originalDraftRound,
    baseCostRound: right.baseCostRound, playerName: right.playerName,
  })));
  if (allocation?.overflows.length) issues.push('Cost collision exceeds R1.');
  return {
    teamId, selected, issues, allowedFinishes,
    costAssignments: allocation?.assignments ?? [],
    collisions: allocation?.collisions ?? [],
    exactPickStatus: 'UNKNOWN_2027_DRAFT_GEOMETRY',
    finishStatus: 'UNKNOWN_2026_27_FINAL_FINISH',
  };
}
