/** Export the completed draft event, not the archived pre-draft scenario board. */
import { displayPlayerName, displayTeamName } from '../presentation/season-labels.js';

export function buildArchiveExportSheets(archive) {
  const names = new Map(archive.teams.map((team) => [team.teamId, displayTeamName(team.name, team.teamId)]));
  return [{ name: '2026 Draft Results', rows: archive.picks.map((pick) => ({
    Pick: pick.pickNumber, Overall: pick.overallPick, Round: pick.round, Player: displayPlayerName(pick.playerName, pick.playerId),
    'Selecting team': names.get(pick.selectingTeamId),
    'Entitlement origin': names.get(pick.originalEntitlementOwnerTeamId),
    Type: pick.was2026KeeperReservation ? '2026 keeper' : 'Live selection',
    '2026 keeper prior round': pick.historicalKeeperAssignment?.previousDraftRound ?? '',
    '2026 keeper resolved cost': pick.historicalKeeperAssignment?.resolvedCostRound ?? '',
  })) }];
}
