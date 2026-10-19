import { resolveDraftState } from '../domain/engine.js';
import { DEFAULT_DRAFT_ROUNDS } from '../domain/constants.js';

/** One season's resolver output, split into manager-facing draft surfaces. */
export function buildDraftCycle(input) {
  if (!input?.season || !Array.isArray(input.teams)) {
    throw new TypeError('Draft-cycle input needs a season and canonical teams.');
  }
  const resolved = resolveDraftState(input);
  const names = new Map(input.teams.map((team) => [team.teamId, team.name]));
  const pick = (row) => ({
    pickNumber: row.pickNumber,
    overallPick: row.overallPick,
    round: row.round,
    originTeamId: row.originTeamId,
    originTeamName: names.get(row.originTeamId) ?? null,
    ownerTeamId: row.currentOwnerTeamId,
    ownerTeamName: names.get(row.currentOwnerTeamId) ?? null,
    status: row.status,
    keeper: row.keeper ? { ...row.keeper } : null,
  });
  const board = resolved.picks.map(pick).sort((a, b) => a.overallPick - b.overallPick);
  const completeBoard = board.length === input.teams.length * (input.draftRounds ?? DEFAULT_DRAFT_ROUNDS)
    && board.every((row) => row.ownerTeamId && ['OPEN', 'KEEPER'].includes(row.status));
  return {
    season: input.season,
    publicationStatus: resolved.publicationStatus,
    boardStatus: completeBoard ? 'RESOLVED' : 'PENDING',
    // The live draft omits keeper-occupied slots, but retains their numbered
    // positions in the full board for provenance and trade reconciliation.
    livePicks: board.filter((row) => row.status === 'OPEN'),
    keeperPicks: board.filter((row) => row.status === 'KEEPER'),
    tradedPicks: board.filter((row) => row.ownerTeamId && row.originTeamId !== row.ownerTeamId),
    unresolvedPicks: board.filter((row) => !row.ownerTeamId || !['OPEN', 'KEEPER'].includes(row.status)),
    board,
    keeperDecisions: resolved.keepers.map((row) => ({ ...row })),
    validation: resolved.validation.map((issue) => ({ ...issue })),
  };
}
