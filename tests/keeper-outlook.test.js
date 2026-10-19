import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import archive from '../data/seasons/2026-27/draft-results.json' with { type: 'json' };
import source from '../data/imports/serie_a_2026_27_draft_import.json' with { type: 'json' };
import teams from '../data/teams.json' with { type: 'json' };
import declarations from '../data/pre_draft.json' with { type: 'json' };
import { createPreDraftInput } from '../src/domain/pre-draft.js';
import { resolveDraftState } from '../src/domain/engine.js';
import { buildKeeperRights, compareKeeperCandidates } from '../src/domain/keeper-outlook.js';
import { renderSeason } from '../src/ui/render-season.js';
import { buildArchiveExportSheets } from '../src/exports/archive.js';
import { buildXlsx } from '../src/exports/xlsx.js';
import rookieAnnotations from '../data/seasons/2026-27/rookie-annotations.json' with { type: 'json' };
import { displayPlayerName, displayTeamName, is2026DraftRookie } from '../src/presentation/season-labels.js';

const rights = buildKeeperRights(archive);
const byTeam = (id) => rights.filter((right) => right.selectingTeamId === id);

test('198 source positions reconcile to unique completed draft picks and finalized entitlements', () => {
  assert.equal(archive.picks.length, 198);
  assert.equal(new Set(archive.picks.map((pick) => pick.overallPick)).size, 198);
  assert.equal(new Set(archive.picks.map((pick) => pick.playerId)).size, 198);
  assert.equal(new Set(archive.picks.map((pick) => pick.yahooSportsProfileId)).size, 198);
  assert.equal(archive.teams.length, 18);
  assert.equal(archive.picks.filter((pick) => pick.was2026KeeperReservation).length, 12);
  assert.equal(archive.picks.filter((pick) => !pick.was2026KeeperReservation).length, 186);
  assert.equal(archive.picks.filter((pick) => pick.identityStatus === 'RECONCILED_ID_AND_NAME').length, 149);
  assert.equal(archive.picks.filter((pick) => pick.identityStatus === 'SOURCE_PROFILE_ONLY').length, 49);
  const board = resolveDraftState(createPreDraftInput(teams, declarations));
  for (let i=0;i<198;i++) {
    const pick=archive.picks[i], raw=source.picks[i], resolved=board.picks.find((row)=>row.overallPick===i+1);
    assert.equal(pick.overallPick,i+1);
    assert.equal(pick.round,Math.floor(i/18)+1);
    assert.equal(pick.pickInRound,i%18+1);
    assert.equal(pick.yahooSportsProfileId,raw.yahooSportsProfileId);
    assert.equal(pick.playerName,raw.playerNameAsShown);
    assert.equal(pick.sourceTeamName,raw.teamNameAsShown);
    assert.equal(pick.selectingTeamId,resolved.currentOwnerTeamId);
    assert.equal(pick.originalEntitlementOwnerTeamId,resolved.originTeamId);
    assert.equal(pick.was2026KeeperReservation,resolved.status==='KEEPER');
  }
  for (const team of archive.teams) assert.equal(byTeam(team.teamId).length,11);
  assert.equal(archive.source.sha256OfSavedHtml,'d454ed0dccdbb4f8ad9ddf72f564f4072514fba3a8c9d4698c2e308063dac83b');
});

test('only live selections grant fresh rights; post-draft roster data cannot transfer them', () => {
  assert.equal(rights.filter((right)=>right.keeperRightsHolderTeamId).length,186);
  for (const right of rights) {
    assert.equal(right.keeperRightsHolderTeamId,right.was2026KeeperReservation?null:right.selectingTeamId);
    assert.equal(right.currentRosterOwnerTeamId,null);
    assert.equal(right.finishEligibility,'UNKNOWN');
    if (right.was2026KeeperReservation) assert.equal(right.consecutiveYearEligibility,'INELIGIBLE_SAME_MANAGER');
  }
  const moved=buildKeeperRights(archive,{currentRosterOwnership:{[rights[0].playerId]:'dontrick-devilteam'}});
  assert.equal(moved[0].keeperRightsHolderTeamId,rights[0].keeperRightsHolderTeamId);
  assert.deepEqual(archive.picks,JSON.parse(fs.readFileSync(new URL('../data/seasons/2026-27/draft-results.json',import.meta.url))).picks);
});

test('sup fam 11 live selections have verified source identity and individual base costs', () => {
  const expected=[['Nikola Jokić',1,1],['Domantas Sabonis',2,2],['Darius Garland',3,2],['Zach Edey',4,3],['Collin Murray-Boyles',5,4],['Brandin Podziemski',6,5],['Yaxel Lendeborg',7,6],['Gui Santos',8,6],['Morez Johnson Jr.',9,7],['Paul Reed',10,8],['Kingston Flemings',11,9]];
  assert.deepEqual(byTeam('sup-fam').map((r)=>[r.playerName,r.originalDraftRound,r.baseCostRound]),expected);
  assert.ok(byTeam('sup-fam').every((r)=>r.yahooSportsProfileId && r.identityStatus));
});

test('pair comparison uses existing tier and collision rules without inventing standings', () => {
  const sup=byTeam('sup-fam');
  const collision=compareKeeperCandidates(rights,'sup-fam',[sup[6].playerId,sup[7].playerId]);
  assert.deepEqual(collision.costAssignments.map((row)=>row.resolvedCostRound),[6,5]);
  assert.equal(collision.collisions.length,1);
  assert.deepEqual(collision.allowedFinishes,Array.from({length:11},(_,i)=>i+1));
  const early=compareKeeperCandidates(rights,'sup-fam',[sup[0].playerId,sup[1].playerId]);
  assert.equal(early.allowedFinishes.length,0);
  assert.match(early.issues.join(' '),/R1\/R2/);
  const oneR2=compareKeeperCandidates(rights,'sup-fam',[sup[1].playerId]);
  assert.deepEqual(oneR2.allowedFinishes,Array.from({length:11},(_,i)=>i+1));
  const kept=rights.find((r)=>r.was2026KeeperReservation);
  assert.equal(compareKeeperCandidates(rights,kept.selectingTeamId,[kept.playerId]).allowedFinishes.length,0);
});

test('all 18 outlooks and full historical archive render with conditional status and no old scenario controls', () => {
  for (const team of archive.teams) {
    const html=renderSeason({archive,rights,view:'OUTLOOK',teamId:team.teamId,selectedIds:[],search:''});
    assert.equal((html.match(/<tr class="[^"]*">/g)??[]).length,11);
    assert.match(html,/Final finish <strong>— pending<\/strong>/);
    assert.doesNotMatch(html,/Set no keepers \(scenario\)/);
  }
  const archiveHtml=renderSeason({archive,rights,view:'ARCHIVE',teamId:'sup-fam',selectedIds:[],search:''});
  assert.equal((archiveHtml.match(/<td class="/g)??[]).length,396); // screen grid plus two print pages
  assert.match(archiveHtml,/XLSX ↓/);
  assert.match(archiveHtml,/Print ↗/);
  assert.match(archiveHtml,/<th scope="row" class="archive-round"><span>R1<\/span><span class="archive-direction" role="img" aria-label="Draft moves left to right">→<\/span><\/th>/);
  assert.match(archiveHtml,/<th scope="row" class="archive-round"><span>R2<\/span><span class="archive-direction" role="img" aria-label="Draft moves right to left">←<\/span><\/th>/);
});

test('prior keepers are visibly locked beside their names and cannot be compared', () => {
  const kept=rights.find((right)=>right.was2026KeeperReservation);
  const html=renderSeason({archive,rights,view:'OUTLOOK',teamId:kept.selectingTeamId,selectedIds:[],search:''});
  const row=html.match(new RegExp(`<tr class="was-keeper[^"]*">[\\s\\S]*?data-player-id="${kept.playerId}"[\\s\\S]*?<\\/tr>`))?.[0];
  assert.ok(row);
  assert.match(row,/disabled/);
  assert.match(row,/keeper-lock">× UNAVAILABLE/);
  assert.match(row,/Kept ’26 · cannot keep ’27–28/);
  assert.match(row,/Unavailable for 2027–28:/);
});

test('team labels stay inline and current layouts retain mobile rules', () => {
  const css=fs.readFileSync(new URL('../src/ui/season.css',import.meta.url),'utf8');
  assert.match(css,/\.team-rights-grid button > strong,\.team-rights-grid button > span \{ display: block; \}/);
  assert.doesNotMatch(css,/\.team-rights-grid strong,\.team-rights-grid span \{ display: block; \}/);
  assert.match(css,/@media \(max-width: 720px\)/);
  assert.match(css,/\.rights-table tr\.was-keeper \{ margin: 0 -8px; padding: 13px 8px; \}/);
  assert.match(css,/\.archive-grid-wrap \{ max-height: calc\(100vh - 230px\); \}/);
});

test('2026 NBA draftees and defending champion are labeled consistently without changing source data', () => {
  assert.equal(rookieAnnotations.matches.length,12);
  assert.equal(new Set(rookieAnnotations.matches.map((row)=>row.playerId)).size,12);
  for (const match of rookieAnnotations.matches) {
    const pick=archive.picks.find((row)=>row.playerId===match.playerId);
    assert.ok(pick);
    assert.equal(pick.playerName,match.playerName);
    assert.equal(displayPlayerName(pick.playerName,pick.playerId),`${pick.playerName} (R)`);
    const html=renderSeason({archive,rights,view:'OUTLOOK',teamId:pick.selectingTeamId,selectedIds:[],search:''});
    assert.match(html,new RegExp(`<span class="player-round">R${pick.round}<\\/span> <span class="rookie-name">${pick.playerName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} <span class="rookie-mark">\\(R\\)<\\/span>`));
  }
  assert.equal(archive.picks.filter((pick)=>is2026DraftRookie(pick.playerId)).length,12);
  assert.equal(displayTeamName('sup fam','sup-fam'),'👑 sup fam');
  const sup=renderSeason({archive,rights,view:'OUTLOOK',teamId:'sup-fam',selectedIds:[byTeam('sup-fam')[6].playerId],search:''});
  assert.match(sup,/<h2><span class="champion-name"><span class="champion-crown" aria-label="Defending champion">👑<\/span> sup fam<\/span><\/h2>/);
  assert.match(sup,/<option value="sup-fam" selected>👑 sup fam<\/option>/);
  assert.match(sup,/<div><strong><span class="player-round">R7<\/span> <span class="rookie-name">Yaxel Lendeborg/);
  const teamsHtml=renderSeason({archive,rights,view:'RIGHTS',teamId:'sup-fam',selectedIds:[],search:''});
  assert.match(teamsHtml,/<strong><span class="champion-name"><span class="champion-crown" aria-label="Defending champion">👑<\/span> sup fam<\/span><\/strong>/);
  const archiveHtml=renderSeason({archive,rights,view:'ARCHIVE',teamId:'sup-fam',selectedIds:[],search:''});
  assert.match(archiveHtml,/archive-rookie/);
  assert.match(archiveHtml,/Cameron Boozer <span class="rookie-mark">\(R\)<\/span>/);
  const exported=buildArchiveExportSheets(archive)[0].rows;
  assert.equal(exported.filter((row)=>row.Player.endsWith(' (R)')).length,12);
  assert.equal(exported[0]['Selecting team'],'👑 sup fam');
  assert.equal(archive.picks[0].playerName,'Nikola Jokić');
});

test('archive XLSX exports all actual selections and historical keeper costs', () => {
  const sheets=buildArchiveExportSheets(archive);
  assert.equal(sheets[0].rows.length,198);
  assert.equal(sheets[0].rows.filter((row)=>row.Type==='2026 keeper').length,12);
  assert.equal(sheets[0].rows[0].Player,'Nikola Jokić');
  assert.equal(sheets[0].rows[15]['2026 keeper resolved cost'],1);
  const workbook=buildXlsx(sheets);
  assert.equal(Buffer.from(workbook).subarray(0,4).toString(),'PK\u0003\u0004');
});
