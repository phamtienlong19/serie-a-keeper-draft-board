import draftHistory from '../../data/seasons/2026-27/draft-results.json';
import { buildKeeperRights } from '../domain/keeper-outlook.js';
import { buildArchiveExportSheets } from '../exports/archive.js';
import { buildXlsx } from '../exports/xlsx.js';
import { renderSeason } from './render-season.js';
import './season.css';

const root = document.querySelector('#app');
const keeperRights = buildKeeperRights(draftHistory);
let activeView = 'OUTLOOK';
let selectedTeamId = draftHistory.teams[0].teamId;
let comparedPlayerIds = [];
let archiveSearch = '';

function render() {
  root.innerHTML = renderSeason({
    archive: draftHistory, rights: keeperRights, view: activeView,
    teamId: selectedTeamId, selectedIds: comparedPlayerIds, search: archiveSearch,
  });
  document.body.dataset.activeView = activeView;
}

function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

root.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, view, teamId, playerId } = control.dataset;
  if (action === 'season-view') {
    activeView = view;
  } else if (action === 'open-outlook-team') {
    selectedTeamId = teamId;
    comparedPlayerIds = [];
    activeView = 'OUTLOOK';
  } else if (action === 'compare-candidate') {
    comparedPlayerIds = comparedPlayerIds.includes(playerId)
      ? comparedPlayerIds.filter((id) => id !== playerId)
      : [...comparedPlayerIds.slice(-1), playerId];
  } else if (action === 'archive-print') {
    window.print();
    return;
  } else if (action === 'archive-xlsx') {
    download(buildXlsx(buildArchiveExportSheets(draftHistory)),
      'serie-a-2026-draft-results.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return;
  } else return;
  render();
});

root.addEventListener('change', (event) => {
  if (event.target.id !== 'outlook-team') return;
  selectedTeamId = event.target.value;
  comparedPlayerIds = [];
  render();
});

root.addEventListener('input', (event) => {
  if (event.target.id !== 'archive-search') return;
  const position = event.target.selectionStart;
  archiveSearch = event.target.value;
  render();
  const search = root.querySelector('#archive-search');
  search.focus();
  search.setSelectionRange(position, position);
});

render();
