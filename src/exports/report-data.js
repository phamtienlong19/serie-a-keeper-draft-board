import { declarationProvenance } from "../domain/pre-draft.js";

export function buildKeeperDecisions({ input, resolvedState, baselineInput, overrides }) {
  return input.teams.map((team) => {
    const selection = input.keeperSelections.find((row) => row.teamId === team.teamId);
    const allocation = resolvedState.allocations.find((row) => row.teamId === team.teamId);
    const keepers = resolvedState.keepers.filter((row) => row.teamId === team.teamId);
    const provenance = declarationProvenance(baselineInput, overrides, team.teamId);
    const row = { Team: team.name, "Prior finish": team.previousFinish,
      "Declaration status": provenance === "CONFIRMED" && selection.selectedPlayerIds?.length === 0 ? "NO KEEPERS CONFIRMED" : provenance };
    for (let i = 0; i < 2; i++) {
      const k = keepers[i];
      row[`Keeper ${i + 1}`] = k?.playerName ?? "";
      row[`Keeper ${i + 1} prior round`] = k?.oldRound ?? "";
      row[`Keeper ${i + 1} cost`] = k?.resolvedCostRound ?? "";
    }
    row["EARLY / LATE"] = allocation?.stealDirection ?? "PENDING";
    row["R1 slot"] = resolvedState.picks.find((p) => p.originTeamId === team.teamId && p.round === 1)?.pickNumber ?? "PENDING";
    row.Notes = resolvedState.validation.filter((v) => v.teamId === team.teamId).map((v) => v.message).join("; ") || (row["R1 slot"] === "PENDING" ? "Global allocation pending complete declarations." : "");
    return row;
  });
}
export function buildDraftOrder({ input, resolvedState, baselineInput, overrides }) {
  return [...resolvedState.allocations].sort((a, b) => (a.r1Slot ?? 99) - (b.r1Slot ?? 99) || a.previousFinish - b.previousFinish).map((row) => ({
    Team: input.teams.find((t) => t.teamId === row.teamId)?.name,
    "R1 slot": row.r1Slot ?? "PENDING", Bucket: row.bucket ?? "PENDING", Direction: row.stealDirection ?? "PENDING",
    Provenance: declarationProvenance(baselineInput, overrides, row.teamId),
  }));
}
export function buildAvailableXRank(rows) {
  return rows.filter((row) => row.availability === "AVAILABLE").map((row) => ({
    Rank: row.availableRank, XRank: row.xrank, Player: row.fullName,
    Pos: row.displayPosition ?? "", NBA: row.nbaTeamAbbreviation ?? "", "Board Range": row.boardRange ?? "PENDING",
  }));
}
export function buildExportSheets(context, poolRows, { title, generatedAt }) {
  const { input, resolvedState } = context;
  const name = (id) => input.teams.find((team) => team.teamId === id)?.name ?? id;
  const xrankByPlayerId = new Map(poolRows.filter((row) => row.playerId).map((row) => [row.playerId, row.xrank]));
  const trades = input.trades.flatMap((trade) => trade.transfers.map((t) => ({
    Trade: trade.tradeId, Status: trade.status, Origin: name(t.originTeamId), Round: t.round,
    From: name(t.fromTeamId), To: name(t.toTeamId),
    "Current owner": name(resolvedState.entitlements.find((e) => e.originTeamId === t.originTeamId && e.round === t.round)?.currentOwnerTeamId) ?? "UNRESOLVED",
    "Derived pick": resolvedState.picks.find((p) => p.originTeamId === t.originTeamId && p.round === t.round)?.pickNumber ?? "PENDING",
  })));
  return [
    { name: "State", rows: [{ Title: title, Generated: generatedAt, "Base revision": context.baselineInput.baseRevision,
      "Confirmed declarations": `${context.baselineInput.keeperSelections.filter((r) => r.status === "CONFIRMED").length} / ${input.teams.length}`,
      Status: resolvedState.publicationStatus, Validation: resolvedState.validation.map((v) => v.message).join("; ") }] },
    { name: "Keeper Decisions", rows: buildKeeperDecisions(context) },
    { name: "Draft Order", rows: buildDraftOrder(context) },
    { name: "Pick Trades", rows: trades.length ? trades : [{ Status: "No pick trades entered" }] },
    { name: "Available Rankings", rows: buildAvailableXRank(poolRows) },
    { name: "Full Draft Board", rows: resolvedState.picks.length ? resolvedState.picks.map((p) => ({
      Pick: p.pickNumber, "Overall pick": p.overallPick, Round: p.round, Origin: name(p.originTeamId), Owner: name(p.currentOwnerTeamId) ?? "UNRESOLVED",
      Status: p.status, Keeper: p.keeper?.playerName ?? "", "Keeper XRank": p.keeper ? xrankByPlayerId.get(p.keeper.playerId) ?? "" : "", "Old round": p.keeper?.oldRound ?? "",
      "Base cost": p.keeper?.baseCostRound ?? "", "Resolved cost": p.keeper?.resolvedCostRound ?? "",
    })) : [{ Status: "PENDING — exact board requires complete declarations." }] },
  ];
}
