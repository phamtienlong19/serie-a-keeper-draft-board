import { escapeHtml as e, renderDataTable } from "./render-surfaces.js";

function renderRosterRow(row, mode) {
  const badges = [row.roundLock && "ROUND LOCK", row.historyLock && "KEPT LAST YEAR", row.conditional && "KEEP 1 ONLY", row.historyUnknown && "HISTORY UNKNOWN"].filter(Boolean);
  const restrictionClass = row.historyLock ? "history-lock" : row.roundLock ? "round-lock" : row.conditional ? "conditional" : "";
  const selectedBadge = row.actual ? "✓ KEPT" : row.selected ? `SCENARIO · ${row.selectedStatus}` : "";
  const cost = mode === "DECISIONS" && row.selected ? row.selectedCostRound : row.baseCostRound;
  return `<tr class="${row.presentationState} ${restrictionClass}" data-player-id="${e(row.playerId)}">
    <td class="prior-round">R${row.oldRound}</td><td><strong>${e(row.playerName)}</strong>
      ${selectedBadge ? `<b class="keeper-badge">${e(selectedBadge)}</b>` : ""}
      <small>${e([row.metadata?.nbaTeamAbbreviation, row.metadata?.displayPosition].filter(Boolean).join(" · ")) || "Yahoo metadata unavailable"}</small>
      ${mode === "ELIGIBILITY" ? badges.map((b) => `<span class="eligibility-badge">${e(b)}</span>`).join("") : ""}</td>
    <td><span class="keeper-cost-chip">${cost ? `R${cost}` : "PENDING"}</span></td></tr>`;
}
export function renderKeeperPage(teams, { mode = "DECISIONS", search = "" } = {}) {
  const query = search.trim().toLocaleLowerCase();
  const r1Order = (team) => Number(/^1\.(\d+)$/.exec(team.report["R1 slot"])?.[1] ?? Infinity);
  const orderedTeams = mode === "DECISIONS" ? [...teams].sort((a, b) => r1Order(a) - r1Order(b) || a.finish - b.finish) : teams;
  const cards = orderedTeams.map((team) => {
    const match = team.name.toLocaleLowerCase().includes(query) || team.roster.some((row) => row.playerName.toLocaleLowerCase().includes(query));
    const selected = team.roster.filter((row) => row.selected);
    const pending = team.declarationLabel === "DECLARATION PENDING";
    return `<article id="keeper-card-${e(team.teamId)}" class="keeper-team-card ${match ? "" : "search-hidden"}">
      <header><span class="keeper-finish">${String(team.finish).padStart(2, "0")}</span><div><h3>${e(team.name)}</h3><p>${e(team.restriction)}</p></div><span class="keeper-direction">${e(team.report["EARLY / LATE"])}</span><span class="keeper-print-slot">R1 ${e(team.report["R1 slot"])}</span></header>
      <div class="keeper-declaration ${team.declarationLabel === "DECLARATION PENDING" ? "pending" : ""}"><strong>${e(team.declarationLabel)}</strong><span>${e(team.report["EARLY / LATE"])}</span></div>
      ${mode === "DECISIONS" ? `<div class="keeper-decisions">${selected.length ? selected.map((row) => `<div class="decision-player"><strong>✓ ${e(row.playerName)}</strong><span>R${row.oldRound} → R${row.selectedCostRound ?? "?"}${row.actual ? "" : " · HYPOTHETICAL"}</span></div>`).join("") : `<div class="no-keepers ${pending ? "pending" : ""}">${pending ? "PENDING" : "NO KEEPERS"}</div>`}</div>` : ""}
      <p class="keeper-slot">R1: ${e(team.report["R1 slot"])}</p>
      ${mode === "DECISIONS" ? `<details class="keeper-roster-details"><summary>2025 draft roster</summary>` : ""}<table class="keeper-roster-table"><thead><tr><th>PRIOR</th><th>PLAYER · ${mode === "DECISIONS" ? "KEEPER DECISION" : "ELIGIBILITY"}</th><th>${mode === "DECISIONS" ? "COST / IF KEPT" : "IF KEPT"}</th></tr></thead>
        <tbody>${team.roster.map((row) => renderRosterRow(row, mode)).join("")}</tbody></table>${mode === "DECISIONS" ? "</details>" : ""}
      ${mode === "ELIGIBILITY" ? `<p class="keeper-card-note">If kept: base cost before multi-keeper collisions.</p>` : ""}
    </article>`;
  }).join("");
  return `<section class="data-surface keeper-page" data-keeper-mode="${mode}"><div class="surface-heading keeper-heading"><h2>Keeper ${mode === "DECISIONS" ? "Decisions" : "Eligibility"}</h2><button class="surface-print-button" type="button" data-action="${mode === "DECISIONS" ? "print-keepers" : "print-eligibility"}">Print ${mode === "DECISIONS" ? "Decisions" : "Eligibility"} / PDF</button></div>
    <div class="keeper-page-controls"><div aria-label="Keeper mode">${["DECISIONS", "ELIGIBILITY"].map((m) => `<button data-action="keeper-mode" data-mode="${m}" aria-pressed="${m === mode}">${m === "DECISIONS" ? "Decisions" : "Eligibility"}</button>`).join("")}</div>
      <label>Search team or player <input id="keeper-search" type="search" value="${e(search)}"></label>
      <label>Jump to team <select id="keeper-jump"><option value="">Choose team…</option>${orderedTeams.map((t) => `<option value="${e(t.teamId)}">${t.report["R1 slot"]} · ${e(t.name)}</option>`).join("")}</select></label></div>
    ${mode === "ELIGIBILITY" ? `<p class="keeper-page-legend">ROUND LOCK · KEPT LAST YEAR · KEEP 1 ONLY</p>` : ""}
    <div class="keeper-cards">${cards}</div>
    <div class="keeper-print-summary"><h2>Declaration summary</h2>${renderDataTable(teams.map((t) => t.report))}</div></section>`;
}
