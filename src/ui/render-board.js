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

function renderCell(cell) {
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

  return `<td class="pick-cell ${stateClass(cell)}" data-pick-cell data-pick-number="${escapeHtml(cell.pickNumber)}">
    <div class="pick-number">${escapeHtml(cell.pickNumber)}</div>
    ${primary}
    ${keeperDetails}
    ${unresolvedKeeper}
    ${ownership}
  </td>`;
}

function renderColumnHeader(column) {
  const keeperState = `${column.keeperCount} KEEP`;
  return `<th class="team-header" scope="col" data-team-column="${escapeHtml(column.teamId)}">
    <div class="slot-number">${escapeHtml(column.r1PickNumber)}</div>
    <div class="team-name">${escapeHtml(column.teamName)}</div>
    <div class="team-context">#${escapeHtml(column.previousFinish)} LAST SEASON</div>
    <div class="team-state">${escapeHtml(keeperState)} · ${escapeHtml(column.stealDirection ?? "UNDECLARED")}</div>
  </th>`;
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

export function renderDraftBoard(viewModel) {
  const roundRows = Array.from({ length: viewModel.draftRounds }, (_, index) => index + 1)
    .map(
      (round) => `<tr>
        <th class="round-label" scope="row"><span>R${round}</span><small>ROUND ${round}</small></th>
        ${viewModel.columns
          .map((column) => renderCell(column.cells.find((cell) => cell.round === round)))
          .join("")}
      </tr>`,
    )
    .join("");
  const blockingValidation = viewModel.validation.filter(
    (item) => item.severity === "ERROR" || item.severity === "UNRESOLVED",
  );

  return `<main class="app-shell">
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
        <span class="read-only-pill">READ ONLY</span>
      </div>
    </header>

    <section class="board-toolbar" aria-label="Board navigation and legend">
      <label class="jump-control">
        <span>JUMP TO TEAM</span>
        <select id="team-jump">
          <option value="">Select team…</option>
          ${viewModel.columns
            .map(
              (column) =>
                `<option value="${escapeHtml(column.teamId)}">${escapeHtml(column.r1PickNumber)} · ${escapeHtml(column.teamName)}</option>`,
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
  </main>`;
}
