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
    ${metadata.xrank != null ? `<div class="o-rank">XRank ${escapeHtml(metadata.xrank)}</div>` : ""}
  `;
}

function stateClass(cell) {
  if (cell.status === "UNRESOLVED" || cell.status === "KEEPER_UNRESOLVED") return "is-unresolved";
  if (cell.status === "KEEPER") return cell.isTraded ? "is-keeper is-traded" : "is-keeper";
  if (cell.isTraded) return "is-traded";
  return "is-open";
}

export function formatKeeperCostFlow(keeper) {
  const rounds = [keeper.oldRound, keeper.baseCostRound, keeper.resolvedCostRound]
    .filter((round) => Number.isInteger(round));
  return rounds.filter((round, index) => index === 0 || round !== rounds[index - 1])
    .map((round) => `R${round}`).join(" → ") || "COST PENDING";
}

function snakeArrow(round) {
  return round % 2 === 1 ? "→" : "←";
}

function renderCell(cell, column) {
  const keeper = cell.keeper;
  const detail = keeper ? `${keeper.playerName}. Keeper cost: 2025 R${keeper.oldRound} to base R${keeper.baseCostRound} to resolved R${keeper.resolvedCostRound}. ` : "";
  const ownershipDetail = cell.isTraded ? `Owned by ${cell.currentOwnerName}; originally ${cell.originTeamName}.` : `Owned by ${cell.currentOwnerName}.`;
  const proposalDetail = cell.proposedPlayerOwnerName ? `Proposed player owner: ${cell.proposedPlayerOwnerName}. Keeper slot and cost for the receiving team need commissioner confirmation.` : "";
  const primary = keeper
    ? `<div class="cell-player">${escapeHtml(keeper.playerName)}</div>`
    : `<div class="cell-open">${cell.status === "UNRESOLVED" ? "UNRESOLVED" : "OPEN"}</div>`;
  const keeperDetails = keeper
    ? `${keeperMetadataLines(cell.yahooMetadata)}
       <div class="keeper-line"><span class="keeper-state">KEEPER${cell.isTraded ? `<span class="keeper-traded-tag">TRADED</span>` : ""}</span><span>${escapeHtml(formatKeeperCostFlow(keeper))}</span></div>`
    : "";
  const ownership = cell.proposedPlayerOwnerName
    ? `<div class="ownership proposed-ownership"><span>OWNER: ${escapeHtml(cell.proposedPlayerOwnerName)} · proposed</span><span>PICK: ${escapeHtml(cell.currentOwnerName)}</span></div>`
    : cell.isTraded
    ? `<div class="ownership"><span>OWNER: ${escapeHtml(cell.currentOwnerName)}</span><span>FROM: ${escapeHtml(cell.originTeamName)}</span></div>`
    : "";
  const unresolvedKeeper =
    cell.status === "KEEPER_UNRESOLVED"
      ? `<div class="unresolved-copy">KEEPER ASSIGNMENT UNRESOLVED</div>`
      : "";

  return `<td class="pick-cell ${stateClass(cell)} ${cell.isHypotheticalTrade ? "is-hypothetical-trade" : ""} ${cell.proposedPlayerOwnerName ? "has-proposed-player-owner" : ""} ${column.isSelected ? "is-selected-column" : ""}" data-pick-cell data-pick-number="${escapeHtml(cell.pickNumber)}" title="${escapeHtml(detail + ownershipDetail + proposalDetail)}">
    <div class="pick-head"><span class="pick-number">${escapeHtml(cell.pickNumber)} <span class="overall-pick">(${escapeHtml(cell.overallPick)})</span> <span class="snake-arrow" aria-label="${cell.round % 2 === 1 ? "Left to right" : "Right to left"}">${snakeArrow(cell.round)}</span></span>${keeper && cell.yahooMetadata?.xrank != null ? `<span class="pick-xrank">XRank ${escapeHtml(cell.yahooMetadata.xrank)}</span>` : ""}</div>
    ${primary}
    ${keeperDetails}
    ${unresolvedKeeper}
    ${ownership || `<div class="native-owner">OWNER: ${escapeHtml(cell.currentOwnerName)}</div>`}
  </td>`;
}

function renderColumnHeader(column) {
  const keeperState = `${column.keeperCount} KEEP`;
  const classes = ["team-header", column.isSelected ? "is-selected" : "", column.hasMoved ? "has-moved" : ""]
    .filter(Boolean)
    .join(" ");
  return `<th class="${classes}" scope="col" data-team-column="${escapeHtml(column.teamId)}">
    <button class="team-header-button" type="button" data-action="select-team" data-team-id="${escapeHtml(column.teamId)}" aria-pressed="${column.isSelected}" aria-label="Open ${escapeHtml(column.teamName)} scenario controls" title="#${escapeHtml(column.previousFinish)} last season · ${escapeHtml(column.provenance ?? "")}" ${column.isReadOnlyPreview ? "disabled" : ""}>
      <div class="slot-number">${escapeHtml(column.r1PickNumber)}</div>
      <div class="team-name">${escapeHtml(column.teamName)}</div>
      <div class="team-state">${escapeHtml(keeperState)} · ${escapeHtml(column.stealDirection ?? "UNDECLARED")}</div>
      ${column.provenance?.startsWith("SCENARIO") ? `<div class="column-provenance">${escapeHtml(column.provenance)}</div>` : ""}
    </button>
  </th>`;
}

function renderYahooMetadata(metadata) {
  if (!metadata) return "";
  const summary = [metadata.nbaTeamAbbreviation, positionLabel(metadata.displayPosition)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  return `<div class="roster-meta">${summary}${metadata.xrank != null ? ` · XRank ${escapeHtml(metadata.xrank)}` : ""}</div>`;
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
        <p class="eyebrow">${escapeHtml(teamPanel.provenance ?? "TEAM SCENARIO")} · ${escapeHtml(teamPanel.allocationBucket ?? "UNRESOLVED")}</p>
        <h2 id="drawer-team-name">${escapeHtml(teamPanel.teamName)}</h2>
        <p>#${escapeHtml(teamPanel.previousFinish)} LAST SEASON · ${escapeHtml(teamPanel.keeperTierLabel)}</p>
      </div>
      <button class="drawer-close" type="button" data-action="close-drawer" aria-label="Close team panel">×</button>
    </header>

    <section class="drawer-section scenario-controls">
      <button type="button" data-action="no-keepers" data-team-id="${escapeHtml(teamPanel.teamId)}">Set no keepers (scenario)</button>
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
  const decisionsNeeded = viewModel.pendingTeams.filter((team) => team.provenance === "PENDING" || team.validation.length > 0);
  const visibleTeams = decisionsNeeded.length ? decisionsNeeded : viewModel.pendingTeams;
  return `<section class="pending-panel" aria-labelledby="pending-title">
    <div>
      <p class="eyebrow">DRAFT ORDER</p>
      <h2 id="pending-title">Waiting for league decisions</h2>
    </div>
    <ul>
      ${visibleTeams
        .map((team) => {
          const reasons = team.validation.length
            ? team.validation.map((item) => item.message).join("; ")
            : "R1 allocation is unresolved.";
          return `<li><strong>${escapeHtml(team.teamName)}${team.provenance ? ` · ${escapeHtml(team.provenance)}` : ""}</strong><span>${escapeHtml(reasons)}</span></li>`;
        })
        .join("")}
    </ul>
  </section>`;
}

function renderPrintBoard(viewModel) {
  if (!viewModel.columns.length) return "";
  const groupSize = Math.ceil(viewModel.columns.length / 2);
  const groups = [viewModel.columns.slice(0, groupSize), viewModel.columns.slice(groupSize)].filter((group) => group.length);
  return `<section class="print-board" aria-label="Printable draft board">${groups.map((group) => {
    const rows = Array.from({ length: viewModel.draftRounds }, (_, index) => index + 1).map((round) => `<tr><th scope="row">R${round}</th>${group.map((column) => {
      const cell = column.cells.find((candidate) => candidate.round === round);
      const keeper = cell?.keeper;
      return `<td class="print-pick ${stateClass(cell)}"><span class="print-pick-number">${escapeHtml(cell.pickNumber)} (${escapeHtml(cell.overallPick)}) ${snakeArrow(cell.round)}${keeper && cell.yahooMetadata?.xrank != null ? ` · XRank ${escapeHtml(cell.yahooMetadata.xrank)}` : ""}</span><strong>${escapeHtml(keeper?.playerName ?? cell.status)}</strong>${keeper ? `<span class="print-pick-cost">KEEPER${cell.isTraded ? " · TRADED" : ""} · ${escapeHtml(formatKeeperCostFlow(keeper))}</span>` : ""}<span class="print-pick-owner">${cell.proposedPlayerOwnerName ? `Player owner: ${escapeHtml(cell.proposedPlayerOwnerName)} · proposed<br>Pick: ` : ""}${escapeHtml(cell.currentOwnerName)}${cell.isTraded ? ` · from ${escapeHtml(cell.originTeamName)}` : ""}</span></td>`;
    }).join("")}</tr>`).join("");
    return `<div class="print-board-page"><div class="print-board-caption"><h2>${escapeHtml(group[0].r1PickNumber)}–${escapeHtml(group.at(-1).r1PickNumber)}</h2><span>${group.length} teams · ${viewModel.draftRounds} rounds</span></div><table class="print-grid"><thead><tr><th scope="col">R</th>${group.map((column) => `<th scope="col"><span>${escapeHtml(column.r1PickNumber)}</span><strong>${escapeHtml(column.teamName)}</strong><small>${escapeHtml(column.keeperCount)} KEEP · ${escapeHtml(column.stealDirection ?? "PENDING")}</small></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("")}</section>`;
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
      </div>
    </header>

    ${viewModel.navigation ?? ""}
    <div class="print-heading">${escapeHtml(viewModel.printTitle ?? "Draft Board")} · ${escapeHtml(viewModel.generatedAt ?? "")}</div>
    <div class="workspace ${teamPanel ? "has-team-panel" : ""}">
    <div class="board-pane">
    <section class="board-toolbar" aria-label="Board navigation and legend">
      <label class="jump-control">
        <span>JUMP TO TEAM</span>
        <select id="team-jump" ${viewModel.isTradePreview ? "disabled" : ""}>
          <option value="">Select team…</option>
          ${(viewModel.teamOptions ?? viewModel.columns)
            .map(
              (column) =>
                `<option value="${escapeHtml(column.teamId)}" ${column.isSelected ? "selected" : ""}>${escapeHtml(column.r1PickNumber ?? "PENDING")} · ${escapeHtml(column.teamName)}</option>`,
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
      <button class="surface-print-button" type="button" data-action="print-board">Print / Save PDF</button>
    </section>

    ${
      blockingValidation.length
        ? `<div class="validation-banner" role="status">${blockingValidation.length} item${blockingValidation.length === 1 ? "" : "s"} need league review. See the teams below.</div>`
        : ""
    }

    ${viewModel.columns.length ? "" : `<p class="allocation-pending">The full board appears when the remaining declarations are entered. You can model them in a scenario now.</p>`}
    <section class="board-region" aria-label="18 team by 11 round draft board">
      <div class="board-scroll" ${viewModel.columns.length ? "" : "hidden"} id="board-scroll" tabindex="0">
        <table class="draft-board">
          <thead><tr><th class="board-corner" scope="col">ROUND</th>${viewModel.columns.map(renderColumnHeader).join("")}</tr></thead>
          <tbody>${roundRows}</tbody>
        </table>
      </div>
    </section>

    ${renderPrintBoard(viewModel)}

    ${renderPending(viewModel)}
    <footer><span>2026/27 draft board</span><span>${escapeHtml(viewModel.resolvedPickCount)} picks shown</span></footer>
    </div>
    ${renderTeamDrawer(teamPanel, drawerMode)}
    </div>
  </main>`;
}
