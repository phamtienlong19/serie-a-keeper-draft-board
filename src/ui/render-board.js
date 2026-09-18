function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function positionLabel(displayPosition) {
  return displayPosition?.replaceAll(",", "/") ?? null;
}

function keeperMetadataLines(metadata) {
  if (!metadata) return "";
  const compact = [
    metadata.nbaTeamAbbreviation,
    positionLabel(metadata.displayPosition),
    metadata.status,
  ].filter(Boolean);
  return `
    ${compact.length ? `<div class="player-meta">${compact.map(escapeHtml).join(" · ")}</div>` : ""}
    ${metadata.injuryNote ? `<div class="injury-note">${escapeHtml(metadata.injuryNote)}</div>` : ""}
    ${metadata.oRank !== null ? `<div class="o-rank">O-RANK ${escapeHtml(metadata.oRank)}</div>` : ""}
  `;
}

function stateClass(cell) {
  if (cell.status === "UNRESOLVED" || cell.status === "KEEPER_UNRESOLVED") return "is-unresolved";
  if (cell.status === "KEEPER") return cell.isTraded ? "is-keeper is-traded" : "is-keeper";
  if (cell.isTraded) return "is-traded";
  return "is-open";
}

function renderCell(cell, column) {
  const keeper = cell.keeper;
  const primary = keeper
    ? `<div class="cell-player">${escapeHtml(keeper.playerName?.toLocaleUpperCase("en-US"))}</div>`
    : `<div class="cell-open">${cell.status === "UNRESOLVED" ? "UNRESOLVED" : "OPEN"}</div>`;
  const keeperDetails = keeper
    ? `${keeperMetadataLines(cell.yahooMetadata)}
       <div class="keeper-line"><span>KEEPER</span><span>R${escapeHtml(keeper.oldRound)} → R${escapeHtml(keeper.resolvedCostRound)}</span></div>`
    : "";
  const ownership = cell.isTraded
    ? `<div class="ownership"><span>OWNER: ${escapeHtml(cell.currentOwnerName)}</span><span>FROM: ${escapeHtml(cell.originTeamName)}</span></div>`
    : "";
  const unresolvedKeeper =
    cell.status === "KEEPER_UNRESOLVED"
      ? `<div class="unresolved-copy">KEEPER ASSIGNMENT UNRESOLVED</div>`
      : "";

  return `<td class="pick-cell ${stateClass(cell)} ${column.isSelected ? "is-selected-column" : ""}" data-pick-cell data-pick-number="${escapeHtml(cell.pickNumber)}">
    <div class="pick-number">${escapeHtml(cell.pickNumber)}</div>
    ${primary}
    ${keeperDetails}
    ${unresolvedKeeper}
    ${ownership}
  </td>`;
}

function renderColumnHeader(column) {
  const keeperState = `${column.keeperCount} KEEP`;
  const classes = ["team-header", column.isSelected ? "is-selected" : "", column.hasMoved ? "has-moved" : ""]
    .filter(Boolean)
    .join(" ");
  return `<th class="${classes}" scope="col" data-team-column="${escapeHtml(column.teamId)}">
    <button class="team-header-button" type="button" data-action="select-team" data-team-id="${escapeHtml(column.teamId)}" aria-pressed="${column.isSelected}" aria-label="Open ${escapeHtml(column.teamName)} scenario controls">
      <div class="slot-number">${escapeHtml(column.r1PickNumber)}</div>
      <div class="team-name">${escapeHtml(column.teamName)}</div>
      <div class="team-context">#${escapeHtml(column.previousFinish)} LAST SEASON</div>
      <div class="team-state">${escapeHtml(keeperState)} · ${escapeHtml(column.stealDirection ?? "UNDECLARED")}</div>
    </button>
  </th>`;
}

function renderYahooMetadata(metadata) {
  if (!metadata) return "";
  const summary = [metadata.nbaTeamAbbreviation, positionLabel(metadata.displayPosition)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  return `<div class="roster-meta">${summary}${metadata.oRank !== null ? ` · O-RANK ${escapeHtml(metadata.oRank)}` : ""}</div>`;
}

function renderCandidateStatus(candidate) {
  const firstError = candidate.validation.find((item) => item.severity === "ERROR");
  if (firstError) {
    const reason =
      firstError.code === "KEEPER_CONSECUTIVE_YEAR_INELIGIBLE"
        ? "Kept last season."
        : firstError.message;
    return `<div class="candidate-status is-error"><strong>INELIGIBLE</strong><span>${escapeHtml(reason)}</span></div>`;
  }
  if (candidate.requiresEligibilityAssumption) {
    return `<div class="candidate-status is-unresolved"><strong>UNRESOLVED</strong><span>Prior-year keeper status is unknown.</span></div>`;
  }
  if (candidate.assumedEligible) {
    return `<div class="candidate-status is-assumed"><strong>SCENARIO ASSUMPTION</strong><span>Treated as eligible in this scenario only.</span></div>`;
  }
  return `<div class="candidate-status is-eligible"><strong>ELIGIBLE</strong><span>Finish and keeper-history checks pass.</span></div>`;
}

function renderCandidateAction(candidate, teamId) {
  if (candidate.selected) {
    return `<button class="row-action remove" type="button" data-action="remove-keeper" data-team-id="${escapeHtml(teamId)}" data-player-id="${escapeHtml(candidate.playerId)}">REMOVE</button>`;
  }
  if (candidate.deterministicError) {
    return `<button class="row-action" type="button" disabled>INELIGIBLE</button>`;
  }
  if (candidate.requiresEligibilityAssumption) {
    return `<button class="row-action assume" type="button" data-action="assume-eligible" data-player-id="${escapeHtml(candidate.playerId)}">ASSUME ELIGIBLE</button>`;
  }
  return `<div class="row-actions">
    <button class="row-action" type="button" data-action="select-keeper" data-team-id="${escapeHtml(teamId)}" data-player-id="${escapeHtml(candidate.playerId)}">SELECT</button>
    ${candidate.assumedEligible ? `<button class="clear-assumption" type="button" data-action="clear-assumption" data-player-id="${escapeHtml(candidate.playerId)}">CLEAR ASSUMPTION</button>` : ""}
  </div>`;
}

function renderRosterRow(candidate, teamId) {
  return `<li class="roster-row ${candidate.selected ? "is-selected" : ""}">
    <div class="old-round">R${escapeHtml(candidate.oldRound)}</div>
    <div class="roster-player">
      <div class="roster-player-name">${escapeHtml(candidate.playerName)}</div>
      ${renderYahooMetadata(candidate.yahooMetadata)}
      <div class="cost-flow">${escapeHtml(candidate.costLabel)}${candidate.possibleResolvedCostRounds.length ? " · ASSIGNMENT UNRESOLVED" : ""}</div>
      ${renderCandidateStatus(candidate)}
    </div>
    <div class="roster-action">${renderCandidateAction(candidate, teamId)}</div>
  </li>`;
}

function renderTeamValidation(validation) {
  if (validation.length === 0) return "";
  return `<section class="drawer-section validation-list" aria-labelledby="team-validation-title">
    <h3 id="team-validation-title">VALIDATION</h3>
    ${validation
      .map(
        (item) => `<div class="validation-item ${escapeHtml(item.severity.toLowerCase())}">
          <strong>${escapeHtml(item.severity)}</strong><span>${escapeHtml(item.message)}</span>
        </div>`,
      )
      .join("")}
  </section>`;
}

function renderPickPath(teamPanel) {
  if (teamPanel.pickPath.length === 0) {
    return `<p class="empty-path">Exact pick path is pending resolver allocation.</p>`;
  }
  return `<div class="pick-path">
    ${teamPanel.pickPath
      .map(
        (pick) => `<div class="path-row">
          <span>R${escapeHtml(pick.round)}</span>
          <strong>${escapeHtml(pick.pickNumber)}</strong>
          <span>${escapeHtml(pick.occupant ?? pick.status)}</span>
          ${pick.isAcquired ? `<small>FROM ${escapeHtml(pick.originTeamId)}</small>` : ""}
        </div>`,
      )
      .join("")}
  </div>`;
}

function renderTeamDrawer(teamPanel, drawerMode) {
  if (!teamPanel) return "";
  const showKeepers = drawerMode !== "DRAFT_PATH";
  return `<aside class="team-drawer" aria-labelledby="drawer-team-name">
    <header class="drawer-header">
      <div>
        <p class="eyebrow">TEAM SCENARIO · ${escapeHtml(teamPanel.allocationBucket ?? "UNRESOLVED")}</p>
        <h2 id="drawer-team-name">${escapeHtml(teamPanel.teamName)}</h2>
        <p>#${escapeHtml(teamPanel.previousFinish)} LAST SEASON · ${escapeHtml(teamPanel.keeperTierLabel)}</p>
      </div>
      <button class="drawer-close" type="button" data-action="close-drawer" aria-label="Close team panel">×</button>
    </header>

    <section class="drawer-section scenario-controls">
      <div class="mode-card">
        <span>KEEPER MODE</span>
        <strong>${escapeHtml(teamPanel.entitlementModeLabel)}</strong>
        ${teamPanel.keeperTier === "ONE_R2_OR_TWO_R3_PLUS" && teamPanel.selectedKeeperCount < 2 ? `<small>Selecting a second keeper switches the mode to two from R3+.</small>` : ""}
      </div>
      <fieldset class="steal-control">
        <legend>STEAL</legend>
        <button type="button" data-action="set-steal" data-team-id="${escapeHtml(teamPanel.teamId)}" data-direction="EARLY" class="${teamPanel.stealDirection === "EARLY" ? "active" : ""}">EARLY</button>
        <button type="button" data-action="set-steal" data-team-id="${escapeHtml(teamPanel.teamId)}" data-direction="LATE" class="${teamPanel.stealDirection === "LATE" ? "active" : ""}">LATE</button>
      </fieldset>
    </section>

    <div class="drawer-tabs" role="tablist" aria-label="Team scenario views">
      <button id="keepers-tab" type="button" role="tab" aria-selected="${showKeepers}" aria-controls="keepers-panel" data-action="set-drawer-mode" data-mode="KEEPERS" class="${showKeepers ? "active" : ""}">KEEPERS</button>
      <button id="draft-path-tab" type="button" role="tab" aria-selected="${!showKeepers}" aria-controls="draft-path-panel" data-action="set-drawer-mode" data-mode="DRAFT_PATH" class="${!showKeepers ? "active" : ""}">DRAFT PATH</button>
    </div>

    <div class="drawer-content">
      ${
        showKeepers
          ? `<div id="keepers-panel" role="tabpanel" aria-labelledby="keepers-tab">
              ${renderTeamValidation(teamPanel.validation)}
              <section class="drawer-section roster-section" aria-labelledby="prior-draft-title">
                <div class="section-heading"><h3 id="prior-draft-title">PRIOR DRAFT</h3><span>${escapeHtml(teamPanel.selectedKeeperCount)} SELECTED</span></div>
                <ol class="roster-list">${teamPanel.roster.map((candidate) => renderRosterRow(candidate, teamPanel.teamId)).join("")}</ol>
              </section>
            </div>`
          : `<section id="draft-path-panel" class="drawer-section path-section" role="tabpanel" aria-labelledby="draft-path-tab">
              <div class="section-heading"><h3 id="draft-path-title">CURRENT DRAFT PATH</h3><span>${teamPanel.r1Slot ? `SLOT ${escapeHtml(teamPanel.r1Slot)}` : "PENDING"}</span></div>
              ${renderPickPath(teamPanel)}
            </section>`
      }
    </div>
  </aside>`;
}

function renderPending(viewModel) {
  if (viewModel.pendingTeams.length === 0) return "";
  return `<section class="pending-panel" aria-labelledby="pending-title">
    <div>
      <p class="eyebrow">PENDING / UNRESOLVED</p>
      <h2 id="pending-title">Teams awaiting exact slots</h2>
    </div>
    <ul>
      ${viewModel.pendingTeams
        .map((team) => {
          const reasons = team.validation.length
            ? team.validation.map((item) => item.message).join("; ")
            : "R1 allocation is unresolved.";
          return `<li><strong>${escapeHtml(team.teamName)}</strong><span>${escapeHtml(reasons)}</span></li>`;
        })
        .join("")}
    </ul>
  </section>`;
}

export function renderDraftBoard(viewModel, teamPanel = null, drawerMode = "KEEPERS") {
  const roundRows = Array.from({ length: viewModel.draftRounds }, (_, index) => index + 1)
    .map(
      (round) => `<tr>
        <th class="round-label" scope="row"><span>R${round}</span><small>ROUND ${round}</small></th>
        ${viewModel.columns
          .map((column) => renderCell(column.cells.find((cell) => cell.round === round), column))
          .join("")}
      </tr>`,
    )
    .join("");
  const blockingValidation = viewModel.validation.filter(
    (item) => item.severity === "ERROR" || item.severity === "UNRESOLVED",
  );

  return `<main class="app-shell ${teamPanel ? "has-drawer" : ""}">
    <header class="masthead">
      <div class="title-block">
        <div class="league-mark" aria-hidden="true">SA</div>
        <div>
          <p class="eyebrow">NBA TALK VN · SERIE A · ${escapeHtml(viewModel.season)}</p>
          <h1>Keeper Draft Board</h1>
        </div>
      </div>
      <div class="state-block">
        <span class="state-pill">${escapeHtml(viewModel.stateLabel)}</span>
        ${viewModel.assumedEligibilityCount ? `<span class="assumption-pill">${escapeHtml(viewModel.assumedEligibilityCount)} ASSUMPTION${viewModel.assumedEligibilityCount === 1 ? "" : "S"}</span>` : ""}
        <span class="read-only-pill">SCENARIO TOOL</span>
        <button class="reset-button" type="button" data-action="reset-scenario" ${viewModel.scenarioChangeCount === 0 ? "disabled" : ""}>RESET SCENARIO</button>
      </div>
    </header>

    <div class="workspace ${teamPanel ? "has-team-panel" : ""}">
    <div class="board-pane">
    <section class="board-toolbar" aria-label="Board navigation and legend">
      <label class="jump-control">
        <span>JUMP TO TEAM</span>
        <select id="team-jump">
          <option value="">Select team…</option>
          ${viewModel.columns
            .map(
              (column) =>
                `<option value="${escapeHtml(column.teamId)}" ${column.isSelected ? "selected" : ""}>${escapeHtml(column.r1PickNumber)} · ${escapeHtml(column.teamName)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <div class="legend" aria-label="Pick state legend">
        <span><i class="legend-dot open"></i>OPEN</span>
        <span><i class="legend-dot keeper"></i>KEEPER</span>
        <span><i class="legend-dot traded"></i>TRADED</span>
        <span><i class="legend-dot unresolved"></i>UNRESOLVED</span>
      </div>
      <p class="board-help">Columns are origin geometry. Trades change ownership, never column position.</p>
    </section>

    ${
      blockingValidation.length
        ? `<div class="validation-banner" role="status">${blockingValidation.length} unresolved or invalid item${blockingValidation.length === 1 ? "" : "s"}. See pending teams below.</div>`
        : ""
    }

    <section class="board-region" aria-label="18 team by 11 round draft board">
      <div class="board-scroll" id="board-scroll" tabindex="0">
        <table class="draft-board">
          <thead><tr><th class="board-corner" scope="col">ROUND</th>${viewModel.columns.map(renderColumnHeader).join("")}</tr></thead>
          <tbody>${roundRows}</tbody>
        </table>
      </div>
    </section>

    ${renderPending(viewModel)}
    <footer><span>Resolver-derived board · Yahoo metadata enrichment</span><span>${escapeHtml(viewModel.resolvedPickCount)} resolved picks</span></footer>
    </div>
    ${renderTeamDrawer(teamPanel, drawerMode)}
    </div>
  </main>`;
}
