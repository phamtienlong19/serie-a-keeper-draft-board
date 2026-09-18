export const DRAWER_MODES = Object.freeze({
  KEEPERS: "KEEPERS",
  DRAFT_PATH: "DRAFT_PATH",
});

export function createBoardUiState() {
  return {
    selectedTeamId: null,
    isTeamPanelOpen: false,
    drawerMode: DRAWER_MODES.KEEPERS,
  };
}

export function openTeamPanel(state, teamId) {
  return {
    ...state,
    selectedTeamId: teamId,
    isTeamPanelOpen: true,
  };
}

export function closeTeamPanel(state) {
  return {
    ...state,
    isTeamPanelOpen: false,
  };
}

export function setDrawerMode(state, drawerMode) {
  if (!Object.values(DRAWER_MODES).includes(drawerMode)) return state;
  return {
    ...state,
    drawerMode,
  };
}

export function getSelectedTeamColumn(columns, selectedTeamId) {
  return columns.find((column) => column.teamId === selectedTeamId) ?? null;
}

export function calculateColumnScrollLeft({
  scrollLeft,
  clientWidth,
  scrollWidth,
  stickyWidth,
  columnLeft,
  columnWidth,
  breathingRoom = 22,
}) {
  const availableMargin = Math.max(0, (clientWidth - stickyWidth - columnWidth) / 2);
  const margin = Math.min(breathingRoom, availableMargin);
  const visibleLeft = scrollLeft + stickyWidth;
  const visibleRight = scrollLeft + clientWidth;
  const columnRight = columnLeft + columnWidth;
  let target = scrollLeft;

  if (columnLeft < visibleLeft + margin) {
    target = columnLeft - stickyWidth - margin;
  } else if (columnRight > visibleRight - margin) {
    target = columnRight - clientWidth + margin;
  }

  return Math.max(0, Math.min(target, Math.max(0, scrollWidth - clientWidth)));
}
