import { tradeAssetOptions, tradeAssetKey, describeKeeperMoves } from "../presentation/trade-builder.js";

export function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const e = escapeHtml;
export function renderDataTable(rows, className = "report-table") {
  const keys = Object.keys(rows[0] ?? {});
  return `<table class="${className}"><thead><tr>${keys.map((key) => `<th scope="col">${e(key)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${e(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
export function renderNavigation({ activeView, scenario, saved, notice, baseStatus, pendingNames, dirty }) {
  return `<section class="league-status"><strong>${e(baseStatus)}</strong><span>${pendingNames.map((name) => `${e(name)} · PENDING`).join(" · ")}</span></section>
    <div class="app-toolbar"><nav class="surface-nav" aria-label="Views">${[["BOARD", "Draft Board"], ["DECISIONS", "Keepers"], ["POOL", "Rankings"], ["TRADES", "Trades"]].map(([id, label]) => `<button data-action="view" data-view="${id}" aria-pressed="${activeView === id}">${label}</button>`).join("")}</nav>
      <div class="workspace-controls"><label class="scenario-select">Scenario <select id="saved-scenario"><option value="" ${scenario ? "" : "selected"}>League Base</option>${saved.map((s) => `<option value="${e(s.id)}" ${scenario?.id === s.id ? "selected" : ""}>${e(s.name)}</option>`).join("")}${scenario && !saved.some((s) => s.id === scenario.id) ? `<option value="${e(scenario.id)}" selected>${e(scenario.name)} · unsaved</option>` : ""}</select></label>
        <button data-action="new-scenario" class="primary-button">Save Copy</button><details class="scenario-library"><summary aria-label="Scenario options">⋯</summary><div class="scenario-actions"><button data-action="rename-scenario" ${scenario ? "" : "disabled"}>Rename</button><button data-action="duplicate-scenario" ${scenario ? "" : "disabled"}>Duplicate</button><button data-action="reset-scenario" ${scenario ? "" : "disabled"}>Reset</button><button data-action="delete-scenario" ${scenario ? "" : "disabled"}>Delete</button><details class="advanced-backup"><summary>Advanced / Backup</summary><button data-action="export-scenario" ${scenario ? "" : "disabled"}>Export backup</button><label>Import backup <input id="import-scenario" type="file" accept=".json,application/json"></label></details></div></details>
        <details class="export-menu"><summary>Export</summary><button data-action="print-board">Print board / PDF</button><button data-action="print-keepers">Print keeper decisions / PDF</button><button data-action="print-eligibility">Print eligibility / PDF</button><button data-action="export-xlsx">Download XLSX</button></details>
      </div></div>${scenario ? `<div class="scenario-context">HYPOTHETICAL · ${e(scenario.name)} · ${dirty ? "Saving locally…" : "Saved locally"}</div>` : ""}
    ${notice ? `<p class="app-notice" role="status">${e(notice)}</p>` : ""}`;
}
export function renderPool({ pool, visibleRows, filters }) {
  const positions = [...new Set(pool.rows.flatMap((row) => [...row.eligiblePositions, ...(row.displayPosition?.split(",") ?? [])]))].sort();
  const teams = [...new Set(pool.rows.map((row) => row.nbaTeamAbbreviation).filter(Boolean))].sort();
  const options = (values, selected) => values.map((v) => `<option ${selected === v ? "selected" : ""}>${e(v)}</option>`).join("");
  const seenBands = new Set();
  const rowMarkup = visibleRows.map((row) => {
    let separator = "";
    if (row.availableRank != null && pool.boardCapacity != null) {
      const band = pool.roundBands.find((range) => row.availableRank >= range.start && row.availableRank <= range.end);
      const key = band ? `R${band.round}` : "BEYOND";
      if (!seenBands.has(key)) {
        seenBands.add(key);
        const label = band ? `ROUND ${band.round} · ${band.openSlots} OPEN PICKS` : `BEYOND CURRENT ${pool.roundBands.length}-ROUND BOARD · ${Math.max(0, pool.availableCount - pool.boardCapacity)} PLAYERS`;
        const keeperNote = band?.keepers.length ? `<small title="${e(band.keepers.join(", "))}">${band.keepers.length} KEEPER SLOT${band.keepers.length === 1 ? "" : "S"}</small>` : "";
        separator = `<tr class="rank-band-row"><td colspan="7"><span>${e(label)}</span>${keeperNote}</td></tr>`;
      }
    }
    return `${separator}<tr class="${row.availability === "KEPT" ? "kept-row" : ""}"><td class="available-rank">${row.availableRank ?? "—"}</td><td class="rank-player">${e(row.fullName)}</td><td class="xrank">${e(row.xrank)}</td><td>${e(row.displayPosition)}</td><td title="${e(row.nbaTeamFullName)}">${e(row.nbaTeamAbbreviation)}</td><td title="${e(row.injuryNote)}">${e([row.status, row.injuryNote, row.averagePick ? `ADP ${row.averagePick}` : ""].filter(Boolean).join(" · "))}</td><td>${e(row.availability)}${row.keeperTeam ? ` · ${e(row.keeperTeam)} · ${row.resolvedCostRound ? `R${row.resolvedCostRound}` : "cost pending"}` : ""}</td></tr>`;
  }).join("");
  return `<section class="data-surface"><div class="surface-heading"><h2>Rankings</h2><span>${visibleRows.length} players</span></div>
    ${pool.issues.map((issue) => `<p class="app-notice">${e(issue)}</p>`).join("")}
    <div class="pool-filters"><label>Player <input id="pool-search" type="search" value="${e(filters.search)}" placeholder="Search players"></label>
      <label>Yahoo position <select id="pool-position"><option value="">All positions</option>${options(positions, filters.position)}</select></label>
      <label>NBA team <select id="pool-team"><option value="">All teams</option>${options(teams, filters.nbaTeam)}</select></label>
      <label>Availability <select id="pool-availability">${[["AVAILABLE", "Available only"], ["", "Show kept"], ["KEPT", "Kept only"], ["UNRESOLVED", "Unresolved only"]].map(([v, text]) => `<option value="${v}" ${filters.availability === v ? "selected" : ""}>${text}</option>`).join("")}</select></label></div>
    ${pool.boardCapacity == null ? `<p class="rankings-pending">Board ranges appear when the draft board has exact keeper placements.</p>` : ""}
    <div class="data-scroll"><table class="pool-table"><thead><tr><th>Rank</th><th>Player</th><th>XRank</th><th>Pos</th><th>NBA</th><th>Status / ADP</th><th>Availability</th></tr></thead><tbody>${rowMarkup}</tbody></table>${visibleRows.length ? "" : "<p>No players match these filters.</p>"}</div></section>`;
}
export function renderDecisions(rows) {
  return `<section class="data-surface keeper-report"><h2>Keeper Decisions</h2><div class="data-scroll">${renderDataTable(rows)}</div></section>`;
}
export function renderTrades(input, resolvedState, scenario, builder, preview = null) {
  const names = new Map(input.teams.map((team) => [team.teamId, team.name]));
  const teamSelect = (side, chosen, other) => `<select id="trade-team-${side}" aria-label="Team ${side.toUpperCase()}">${input.teams.map((team) => `<option value="${e(team.teamId)}" ${chosen === team.teamId ? "selected" : ""} ${other === team.teamId ? "disabled" : ""}>${e(team.name)}</option>`).join("")}</select>`;
  const livePick = (asset) => asset.kind === "PICK" ? resolvedState.picks.find((pick) => pick.originTeamId === asset.originTeamId && pick.round === asset.round) : null;
  const pickLabel = (pick) => pick?.pickNumber ? `${pick.pickNumber} (${pick.overallPick})` : "Pick pending";
  const keeperMoveCard = (move, includeRule = false) => `<div class="keeper-move-card"><div><strong>${e(move.playerName)}</strong><span class="keeper-move-state">PROPOSED OWNER</span></div><p>${e(move.fromTeamName)} <b aria-label="to">→</b> <strong>${e(move.toTeamName)}</strong></p><small>Current board: ${e(move.fromTeamName)} · ${e(pickLabel(move))}${move.costRound ? ` · R${e(move.costRound)} keeper cost` : ""}.${includeRule ? " Receiving-team keeper slot and cost need commissioner confirmation." : ""}</small></div>`;
  const assetCard = (asset, side, index) => `<li class="trade-asset"><div><strong>${e(asset.label)}${asset.kind === "PICK" ? `<small class="trade-pick-number">${e(pickLabel(livePick(asset)))}</small>` : ""}</strong><span>${asset.kind === "PICK" ? `2026 draft pick${asset.acquired ? ` · from ${e(names.get(asset.originTeamId))}` : ""}` : `✓ KEEPER · drafted R${asset.oldRound} → 2026 cost R${asset.keeperCost ?? asset.baseCost ?? "?"}`}</span></div><div class="asset-actions"><button data-action="move-asset" data-side="${side}" data-index="${index}" data-direction="up" aria-label="Move ${e(asset.label)} up" ${index === 0 ? "disabled" : ""}>↑</button><button data-action="move-asset" data-side="${side}" data-index="${index}" data-direction="down" aria-label="Move ${e(asset.label)} down" ${index === builder[side].length - 1 ? "disabled" : ""}>↓</button><button data-action="remove-asset" data-side="${side}" data-index="${index}" aria-label="Remove ${e(asset.label)}">×</button></div></li>`;
  const picker = (side, teamId) => {
    if (builder.picker !== side) return "";
    const options = tradeAssetOptions(input, resolvedState, teamId);
    const used = new Set([...builder.a, ...builder.b].map(tradeAssetKey));
    const query = builder.search.trim().toLocaleLowerCase();
    const group = (label, assets) => `<div class="asset-picker-group"><h4>${label}</h4>${assets.filter((asset) => !used.has(tradeAssetKey(asset)) && `${asset.label} ${asset.pickNumber ?? ""} ${asset.overallPick ?? ""}`.toLocaleLowerCase().includes(query)).map((asset) => `<button data-action="choose-asset" data-side="${side}" data-asset-key="${e(tradeAssetKey(asset))}"><strong>${e(asset.label)}${asset.kind === "PICK" ? `<small class="trade-pick-number">${e(pickLabel(asset))}</small>` : ""}</strong><span>${asset.kind === "PICK" ? `2026 draft pick${asset.acquired ? ` · currently owned by ${e(names.get(teamId))}` : ""}` : `✓ Keeper · R${asset.keeperCost ?? asset.baseCost ?? "?"} cost`}</span></button>`).join("") || "<p>No matching assets</p>"}</div>`;
    return `<div class="asset-picker"><label>Find keeper or pick<input id="trade-asset-search" type="search" value="${e(builder.search)}" placeholder="Search keepers or rounds"></label>${group("Keepers", options.players)}${group("Draft Picks", options.picks)}</div>`;
  };
  const side = (key, teamId, other) => `<div class="trade-side"><div class="trade-side-header"><label>TEAM ${key.toUpperCase()} ${teamSelect(key, teamId, other)}</label><span>GIVES</span></div><ul class="trade-assets">${builder[key].map((asset, index) => assetCard(asset, key, index)).join("") || "<li class='trade-empty'>Add keepers or draft picks</li>"}</ul><button class="add-asset" data-action="open-asset-picker" data-side="${key}">+ Add asset</button>${picker(key, teamId)}</div>`;
  const saved = input.trades.map((trade) => `<article class="trade-row"><strong>${e(trade.status === "CONFIRMED" ? "CONFIRMED" : "HYPOTHETICAL")}</strong><div>${trade.transfers.map((pick) => e(`${names.get(pick.fromTeamId)} gives ${names.get(pick.originTeamId)} · R${pick.round} · ${pickLabel(livePick({ ...pick, kind: "PICK" }))} to ${names.get(pick.toTeamId)}`)).join("<br>")}${describeKeeperMoves(trade, input, resolvedState).map((move) => keeperMoveCard(move, true)).join("")}</div>${scenario && trade.status === "HYPOTHETICAL" ? `<button data-action="remove-trade" data-trade-id="${e(trade.tradeId)}">Remove</button>` : ""}</article>`).join("");
  const boardPreview = preview ? `<div class="trade-board-preview"><h4>Draft board after trade</h4>${preview.boardChanges.length ? `<div class="trade-board-preview-rows">${preview.boardChanges.map((change) => `<div class="trade-board-preview-row"><strong>${e(change.pickNumber ?? "Pending")} ${change.overallPick != null ? `(${e(change.overallPick)})` : ""}</strong><span>${e(change.originTeamName)} · R${e(change.round)}</span><span>${e(change.beforeOwnerName)} <b aria-label="becomes">→</b> ${e(change.afterOwnerName)}</span>${change.status !== "OPEN" ? `<small>${e(change.keeperName ?? "Keeper placement unresolved")}</small>` : ""}</div>`).join("")}</div>` : `<p>Pick slots remain in their current places.</p>`}<button type="button" class="board-preview-button" data-action="view-preview-board">View full board preview</button></div>` : "";
  return `<section class="data-surface trades-page"><div class="surface-heading"><h2>Trades</h2><span>Build a package, then preview its impact</span></div><div class="trade-builder">${side("a", builder.teamA, builder.teamB)}<div class="trade-exchange" aria-hidden="true">⇄</div>${side("b", builder.teamB, builder.teamA)}</div><div class="trade-actions"><button data-action="preview-trade">Preview trade</button><button data-action="save-trade" class="primary-button" ${preview ? "" : "disabled"}>Save in scenario</button><button disabled title="Commissioner verification is required in the league record">Confirm trade</button></div><p class="confirmation-note">Confirmation happens in the league record after commissioner review.</p>${preview ? `<section class="trade-impact"><h3>Trade impact</h3>${preview.impact.map((line) => `<p>${e(line)}</p>`).join("")}${preview.keeperMoves.map((move) => keeperMoveCard(move)).join("")}${preview.warnings.map((line) => `<p class="trade-warning">${e(line)}</p>`).join("")}${boardPreview}</section>` : ""}<section class="saved-trades"><h3>Recorded trades</h3>${saved || "<p>No trades recorded.</p>"}${resolvedState.validation.filter((issue) => /TRADE|ENTITLEMENT|CHANNEL/.test(issue.code) && issue.severity !== "WARNING").map((issue) => `<p class="trade-warning">${e(issue.message)}</p>`).join("")}</section></section>`;
}
