import rookieAnnotations from '../../data/seasons/2026-27/rookie-annotations.json' with { type: 'json' };
import designations from '../../data/seasons/2027-28/designations.json' with { type: 'json' };

const rookieIds = new Set(rookieAnnotations.matches.map((match) => match.playerId));

export const is2026DraftRookie = (playerId) => rookieIds.has(playerId);
export const displayPlayerName = (name, playerId) => `${name}${is2026DraftRookie(playerId) ? ' (R)' : ''}`;
export const isDefendingChampion = (teamId) => teamId === designations.defendingChampionTeamId;
export const displayTeamName = (name, teamId) => `${isDefendingChampion(teamId) ? '👑 ' : ''}${name}`;
