import fs from 'node:fs';
import { createPreDraftInput } from '../src/domain/pre-draft.js';
import { resolveDraftState, formatPickNumber } from '../src/domain/engine.js';

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const source = read('../data/imports/serie_a_2026_27_draft_import.json');
const teams = read('../data/teams.json');
const declarations = read('../data/pre_draft.json');
const identities = read('../data/player_identity_map.json');
const aliases = {
  'J1nple': 'jinple', 'Dial Square 🔴⚪': 'dial-square', Abcxyz: 'abcxyz',
  'bounce island': 'bounce-island', 'DonTrick DevilTeam': 'dontrick-devilteam',
  'MNQA ⛹️‍♂️': 'mnqa', 'Tiến Delay': 'tien-delay', 'Clutch City Rockets': 'rising-rockets',
};
const fail = (message) => { throw new Error(`Draft import: ${message}`); };
const normalized = (name) => String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
if (source.schemaVersion !== 1 || source.season !== '2026-27' || source.picks.length !== 198) fail('source shape/count');
const teamByName = new Map(teams.teams.map((team) => [team.name, team.teamId]));
const teamIds = new Set(teams.teams.map((team) => team.teamId));
const idBySportsProfile = new Map(identities.matches.map((row) => [row.yahooPlayerId, row]));
const resolved = resolveDraftState(createPreDraftInput(teams, declarations));
if (resolved.picks.length !== 198 || resolved.validation.some((issue) => issue.severity !== 'WARNING')) fail('finalized board is unresolved');
const boardByOverall = new Map(resolved.picks.map((pick) => [pick.overallPick, pick]));
const seenProfiles = new Set(), seenPlayers = new Set(), seenOverall = new Set();
const rows = source.picks.map((pick) => {
  const { overallPick, round, pickInRound, yahooSportsProfileId: profileId } = pick;
  if (!Number.isInteger(overallPick) || overallPick < 1 || overallPick > 198 || seenOverall.has(overallPick) ||
      !Number.isInteger(round) || round < 1 || round > 11 || !Number.isInteger(pickInRound) || pickInRound < 1 || pickInRound > 18 ||
      overallPick !== (round - 1) * 18 + pickInRound || !profileId || seenProfiles.has(profileId)) fail(`invalid or duplicate position/profile ${overallPick}`);
  seenOverall.add(overallPick); seenProfiles.add(profileId);
  const selectingTeamId = aliases[pick.teamNameAsShown] ?? teamByName.get(pick.teamNameAsShown);
  if (!teamIds.has(selectingTeamId)) fail(`unmapped team ${pick.teamNameAsShown}`);
  const boardPick = boardByOverall.get(overallPick);
  if (boardPick?.round !== round || boardPick.slot !== pickInRound || boardPick.currentOwnerTeamId !== selectingTeamId ||
      (boardPick.status === 'KEEPER') !== pick.was2026KeeperReservation) fail(`board mismatch at ${overallPick}`);
  const mapped = idBySportsProfile.get(profileId);
  // A Yahoo Sports profile ID is evidence only when the saved name also agrees
  // with the independently established fantasy identity map.
  const nameAgrees = mapped && (normalized(mapped.playerName) === normalized(pick.playerNameAsShown) ||
    (mapped.playerId === 'bobby-portis' && normalized(pick.playerNameAsShown) === normalized('Bobby Portis Jr.')));
  const historicalKeeper = resolved.keepers.find((keeper) => keeper.consumedPickNumber === boardPick.pickNumber);
  if (pick.was2026KeeperReservation && (!historicalKeeper || !nameAgrees || mapped.playerId !== historicalKeeper.playerId)) fail(`keeper assignment mismatch at ${overallPick}`);
  const playerId = nameAgrees ? mapped.playerId : `yahoo-sports-profile-${profileId}`;
  if (seenPlayers.has(playerId)) fail(`duplicate player ${playerId}`);
  seenPlayers.add(playerId);
  return {
    overallPick, round, pickInRound, pickNumber: formatPickNumber(round, pickInRound),
    playerId, playerName: pick.playerNameAsShown, yahooSportsProfileId: profileId,
    identityStatus: nameAgrees ? 'RECONCILED_ID_AND_NAME' : 'SOURCE_PROFILE_ONLY',
    ...(nameAgrees ? { historicalPlayerId: mapped.playerId } : {}),
    selectingTeamId, sourceTeamName: pick.teamNameAsShown,
    originalEntitlementOwnerTeamId: boardPick.originTeamId,
    was2026KeeperReservation: pick.was2026KeeperReservation,
    ...(historicalKeeper ? { historicalKeeperAssignment: {
      previousDraftRound: historicalKeeper.oldRound,
      baseCostRound: historicalKeeper.baseCostRound,
      resolvedCostRound: historicalKeeper.resolvedCostRound,
      previousDrafterTeamId: historicalKeeper.originalDrafterTeamId,
      consumedPickNumber: historicalKeeper.consumedPickNumber,
    } } : {}),
  };
});
if (seenOverall.size !== 198 || source.picks.filter((p) => p.was2026KeeperReservation).length !== 12 ||
    new Set(rows.map((p) => p.selectingTeamId)).size !== 18 ||
    teams.teams.some((team) => rows.filter((p) => p.selectingTeamId === team.teamId).length !== 11)) fail('league coverage');
const archive = {
  schemaVersion: 1, season: '2026-27', recordType: 'COMPLETED_DRAFT',
  source: { ...source.source, importPath: 'data/imports/serie_a_2026_27_draft_import.json',
    boardBaseRevision: declarations.revision },
  teams: teams.teams.map(({ teamId, name }) => ({ teamId, name })),
  picks: rows.sort((a, b) => a.overallPick - b.overallPick),
};
const output = new URL('../data/seasons/2026-27/draft-results.json', import.meta.url);
fs.mkdirSync(new URL('../data/seasons/2026-27/', import.meta.url), { recursive: true });
fs.writeFileSync(output, JSON.stringify(archive, null, 2) + '\n');
console.log(`Imported ${rows.length} picks; ${rows.filter((p) => p.was2026KeeperReservation).length} keeper reservations; ${rows.filter((p) => p.identityStatus === 'RECONCILED_ID_AND_NAME').length} reconciled identities.`);
