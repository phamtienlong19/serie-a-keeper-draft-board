import { escapeHtml as e } from './escape-html.js';
import { compareKeeperCandidates } from '../domain/keeper-outlook.js';
import { displayPlayerName, displayTeamName, is2026DraftRookie, isDefendingChampion } from '../presentation/season-labels.js';

const teamName = (archive, id) => archive.teams.find((team) => team.teamId === id)?.name ?? id;
const teamLabel = (archive, id) => displayTeamName(teamName(archive, id), id);
const teamHtml = (archive, id) => isDefendingChampion(id)
  ? `<span class="champion-name"><span class="champion-crown" aria-label="Defending champion">👑</span> ${e(teamName(archive, id))}</span>`
  : e(teamName(archive, id));
const playerHtml = (name, id) => `<span class="${is2026DraftRookie(id) ? 'rookie-name' : ''}">${e(name)}${is2026DraftRookie(id) ? ' <span class="rookie-mark">(R)</span>' : ''}</span>`;
const roundPlayerHtml = (right) => `<span class="player-round">R${e(right.originalDraftRound)}</span> ${playerHtml(right.playerName, right.playerId)}`;
const finishRange = (values) => {
  if (!values.length) return 'None';
  const groups = [];
  let start = values[0], end = start;
  for (const value of values.slice(1)) {
    if (value === end + 1) end = value;
    else { groups.push(start === end ? `${start}` : `${start}–${end}`); start = end = value; }
  }
  groups.push(start === end ? `${start}` : `${start}–${end}`);
  return groups.join(', ');
};
const status = (right) => right.status === 'INELIGIBLE_PREVIOUS_KEEPER'
  ? { label: "Kept ’26 · blocked", className: 'blocked', symbol: '×' }
  : right.status === 'RESTRICTED_BY_FINAL_FINISH'
    ? { label: 'Finish restricted', className: 'restricted', symbol: '◇' }
    : { label: 'Finish pending', className: 'pending', symbol: '◇' };
const nav = (view) => `<nav class="season-nav" aria-label="Season views">${[
  ['OUTLOOK', 'Outlook'], ['RIGHTS', 'Teams'], ['ARCHIVE', 'Draft ’26'],
].map(([key, label]) => `<button type="button" data-action="season-view" data-view="${key}" aria-current="${view === key ? 'page' : 'false'}">${label}</button>`).join('')}</nav>`;
const selectTeam = (archive, teamId) => `<label class="season-team-select">Team <select id="outlook-team">${archive.teams.map((team) => `<option value="${e(team.teamId)}" ${teamId === team.teamId ? 'selected' : ''}>${e(teamLabel(archive, team.teamId))}</option>`).join('')}</select></label>`;
const historical = (right, archive) => `<details class="draft-detail"><summary>Details</summary>
  <div><b>Pick</b> ${e(right.pickNumber)} · #${e(right.overallPick)}</div>
  <div><b>Selected by</b> ${teamHtml(archive, right.selectingTeamId)}</div>
  <div><b>Pick origin</b> ${teamHtml(archive, right.originalEntitlementOwnerTeamId)}</div>
  <div><b>Yahoo profile</b> ${e(right.yahooSportsProfileId)} · ${right.identityStatus === 'SOURCE_PROFILE_ONLY' ? 'ID link unverified' : 'ID matched'}</div>
  ${right.historicalKeeperAssignment ? `<div><b>2026 keeper cost</b> R${e(right.historicalKeeperAssignment.previousDraftRound)} → R${e(right.historicalKeeperAssignment.baseCostRound)} → R${e(right.historicalKeeperAssignment.resolvedCostRound)}</div>` : ''}
</details>`;

function outlook(archive, rights, teamId, selectedIds) {
  const rows = rights.filter((right) => right.selectingTeamId === teamId)
    .sort((a, b) => a.originalDraftRound - b.originalDraftRound);
  const comparison = selectedIds.length ? compareKeeperCandidates(rights, teamId, selectedIds) : null;
  const assigned = new Map(comparison?.costAssignments.map((row) => [row.playerId, row]) ?? []);
  return `<section class="season-content">
    <div class="season-heading"><div><p class="season-eyebrow">2027–28 / KEEPER RIGHTS</p><h2>${teamHtml(archive, teamId)}</h2><p>Final finish <strong>— pending</strong></p></div>${selectTeam(archive, teamId)}</div>
    <div class="rights-key"><span><b>R</b> 2026 draft round</span><span><b>Cost</b> individual base</span><span><b>◇</b> finish pending</span><span class="key-blocked"><b>×</b> kept in 2026–27</span><span><b class="rookie-key">(R)</b> 2026 NBA draft</span></div>
    <div class="rights-scroll"><table class="rights-table"><thead><tr><th scope="col"><span class="sr-only">Compare</span></th><th scope="col">Player</th><th scope="col">Pick</th><th scope="col">Cost</th><th scope="col">Status</th></tr></thead><tbody>${rows.map((right) => {
      const state = status(right);
      return `<tr class="${[right.was2026KeeperReservation && 'was-keeper', is2026DraftRookie(right.playerId) && 'rookie-row'].filter(Boolean).join(' ')}"><td><input type="checkbox" data-action="compare-candidate" data-player-id="${e(right.playerId)}" aria-label="${right.was2026KeeperReservation ? `Unavailable for 2027–28: ${e(displayPlayerName(right.playerName, right.playerId))} was kept in 2026–27` : `Compare ${e(displayPlayerName(right.playerName, right.playerId))}`}" ${right.was2026KeeperReservation ? 'disabled' : selectedIds.includes(right.playerId) ? 'checked' : ''}></td><td><strong>${roundPlayerHtml(right)}${right.was2026KeeperReservation ? ' <span class="keeper-lock">× UNAVAILABLE</span>' : ''}</strong>${right.was2026KeeperReservation ? '<small class="keeper-mark">Kept ’26 · cannot keep ’27–28</small>' : ''}${historical(right, archive)}</td><td class="number">${e(right.pickNumber)}</td><td class="number cost">${right.baseCostRound ? `R${e(right.baseCostRound)}` : '—'}</td><td><span class="rights-status ${state.className}"><span aria-hidden="true">${state.symbol}</span> ${state.label}</span></td></tr>`;
    }).join('')}</tbody></table></div>
    <section class="comparison" aria-live="polite"><div class="comparison-heading"><h3>Compare</h3><span>${selectedIds.length} / 2</span></div>${comparison ? `<div class="comparison-candidates">${comparison.selected.map((right) => `<div><strong>${roundPlayerHtml(right)}</strong><span>R${right.originalDraftRound} → R${right.baseCostRound ?? '—'}${assigned.has(right.playerId) && assigned.get(right.playerId).resolvedCostRound !== right.baseCostRound ? ` → R${assigned.get(right.playerId).resolvedCostRound}` : ''}</span></div>`).join('')}</div>${comparison.collisions.length ? `<p class="collision-note">◇ Collision · ${comparison.collisions.map((collision) => `base R${collision.baseCostRound} × ${collision.playerIds.length} → ${collision.resolvedRounds.map((round) => `R${round}`).join(' + ')}`).join('; ')}</p>` : ''}${comparison.issues.map((issue) => `<p class="comparison-issue">× ${e(issue)}</p>`).join('')}<p class="finish-result"><b>Allowed finish</b> ${e(finishRange(comparison.allowedFinishes))}<small>Actual finish pending</small></p><p class="comparison-footnote">Exact 2027 picks and channels pending.</p>` : '<p class="comparison-empty">Select up to two players.</p>'}</section>
  </section>`;
}

function rightsOverview(archive, rights) {
  return `<section class="season-content"><div class="season-heading"><div><p class="season-eyebrow">2027–28 / KEEPER RIGHTS</p><h2>Teams</h2><p>18 teams · 11 draft positions each</p></div></div><div class="team-rights-grid">${archive.teams.map((team) => {
    const records = rights.filter((right) => right.selectingTeamId === team.teamId);
    const live = records.filter((right) => !right.was2026KeeperReservation).length;
    return `<button type="button" data-action="open-outlook-team" data-team-id="${e(team.teamId)}"><strong>${teamHtml(archive, team.teamId)}</strong><span>${live} rights <i>·</i> ${11 - live} kept ’26</span><span class="team-arrow" aria-hidden="true">↗</span></button>`;
  }).join('')}</div></section>`;
}

function archiveView(archive, search) {
  const query = search.trim().toLocaleLowerCase();
  const matches = (pick) => !query || `${displayPlayerName(pick.playerName, pick.playerId)} ${teamLabel(archive, pick.selectingTeamId)} ${teamLabel(archive, pick.originalEntitlementOwnerTeamId)}`.toLocaleLowerCase().includes(query);
  const firstRound = archive.picks.filter((pick) => pick.round === 1);
  const grid = (columns) => `<table class="archive-grid"><thead><tr><th>R</th>${columns.map((pick) => `<th>${teamHtml(archive, pick.originalEntitlementOwnerTeamId)}<small>${e(pick.pickNumber)}</small></th>`).join('')}</tr></thead><tbody>${Array.from({ length: 11 }, (_, i) => i + 1).map((round) => `<tr><th scope="row" class="archive-round"><span>R${round}</span><span class="archive-direction" role="img" aria-label="Draft moves ${round % 2 ? 'left to right' : 'right to left'}">${round % 2 ? '→' : '←'}</span></th>${columns.map((first) => {
    const pick = archive.picks.find((item) => item.round === round && item.originalEntitlementOwnerTeamId === first.originalEntitlementOwnerTeamId);
    return `<td class="${pick.was2026KeeperReservation ? 'archive-keeper' : ''} ${is2026DraftRookie(pick.playerId) ? 'archive-rookie' : ''} ${matches(pick) ? '' : 'archive-dim'}"><small>${e(pick.pickNumber)} <span>·</span> #${e(pick.overallPick)}</small><strong>${playerHtml(pick.playerName, pick.playerId)}</strong><span>${teamHtml(archive, pick.selectingTeamId)}</span>${pick.selectingTeamId !== pick.originalEntitlementOwnerTeamId ? `<em>↖ ${teamHtml(archive, pick.originalEntitlementOwnerTeamId)}</em>` : ''}${pick.was2026KeeperReservation ? '<b>● KEEPER</b>' : ''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  return `<section class="season-content archive-content"><div class="season-heading"><div><p class="season-eyebrow">2026–27 / COMPLETED DRAFT</p><h2>Draft archive</h2><p>198 picks <span>·</span> 186 live <span>·</span> 12 keepers</p></div><div class="archive-tools"><label><span class="sr-only">Search player or team</span><input id="archive-search" type="search" value="${e(search)}" placeholder="Search player or team" aria-label="Search player or team"></label><button data-action="archive-print">Print ↗</button><button data-action="archive-xlsx">XLSX ↓</button></div></div><div class="archive-grid-wrap">${grid(firstRound)}</div><div class="archive-print">${[firstRound.slice(0, 9), firstRound.slice(9)].map((group) => `<div class="archive-print-page"><h3>Draft ’26 · ${e(group[0].pickNumber)}–${e(group.at(-1).pickNumber)}</h3>${grid(group)}</div>`).join('')}</div><p class="archive-source">Yahoo Draft Results <span>·</span> SHA-256 ${e(archive.source.sha256OfSavedHtml)}</p></section>`;
}

export function renderSeason({ archive, rights, view, teamId, selectedIds, search }) {
  return `<main class="season-shell"><header class="season-masthead"><div class="season-brand"><span class="season-mark" aria-hidden="true">SA</span><div><p>NBA TALK VN / SERIE A</p><h1>Keeper outlook <span>2027–28</span></h1></div></div><span class="season-state"><i aria-hidden="true"></i> FINISH PENDING</span></header>${nav(view)}${view === 'OUTLOOK' ? outlook(archive, rights, teamId, selectedIds) : view === 'RIGHTS' ? rightsOverview(archive, rights) : archiveView(archive, search)}</main>`;
}
