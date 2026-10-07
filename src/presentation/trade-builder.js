import { resolveScenario } from "../scenario/scenario-state.js";

export function tradeAssetOptions(input, resolvedState, teamId) {
  const team = input.teams.find((row) => row.teamId === teamId);
  if (!team) return { players: [], picks: [] };
  const kept = new Set(resolvedState.playerPool.filter((row) => row.availability === "KEPT").map((row) => row.playerId));
  const players = resolvedState.keepers.filter((keeper) => keeper.teamId === teamId && kept.has(keeper.playerId))
    .map((keeper) => ({ kind: "PLAYER", playerId: keeper.playerId, label: keeper.playerName,
      teamId, oldRound: keeper.oldRound, keeperCost: keeper.resolvedCostRound,
      baseCost: keeper.baseCostRound, isKeeper: true }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const picks = resolvedState.entitlements.filter((pick) => pick.currentOwnerTeamId === teamId && pick.ownershipStatus === "RESOLVED")
    .map((pick) => {
      const slot = resolvedState.picks.find((row) => row.originTeamId === pick.originTeamId && row.round === pick.round);
      return { kind: "PICK", originTeamId: pick.originTeamId, round: pick.round,
      teamId, label: `${input.teams.find((row) => row.teamId === pick.originTeamId)?.name ?? pick.originTeamId} · R${pick.round}`,
      acquired: pick.originTeamId !== teamId,
      pickNumber: slot?.pickNumber ?? null, overallPick: slot?.overallPick ?? null };
    })
    .sort((a, b) => a.round - b.round || a.label.localeCompare(b.label));
  return { players, picks };
}

export function tradeAssetKey(asset) {
  return asset.kind === "PLAYER" ? `player:${asset.playerId}` : `pick:${asset.originTeamId}:R${asset.round}`;
}

export function addTradeAsset(builder, side, asset) {
  if (!["a", "b"].includes(side)) throw new TypeError("Choose a trade side.");
  const key = tradeAssetKey(asset);
  if ([...builder.a, ...builder.b].some((row) => tradeAssetKey(row) === key)) return builder;
  return { ...builder, [side]: [...builder[side], asset] };
}

export function createTradePackage(builder, input, resolvedState, tradeId = crypto.randomUUID()) {
  const { teamA, teamB } = builder;
  if (!teamA || !teamB || teamA === teamB) throw new Error("Choose two different teams.");
  if (!builder.a.length || !builder.b.length) throw new Error("Add at least one asset from each team.");
  const transfers = [], playerMoves = [];
  for (const [side, fromTeamId, toTeamId] of [[builder.a, teamA, teamB], [builder.b, teamB, teamA]]) {
    for (const asset of side) {
      if (asset.teamId !== fromTeamId) throw new Error("An asset no longer belongs to this side. Choose it again.");
      if (asset.kind === "PICK") {
        const current = resolvedState.entitlements.find((row) => row.originTeamId === asset.originTeamId && row.round === asset.round);
        if (current?.currentOwnerTeamId !== fromTeamId || current.ownershipStatus !== "RESOLVED") throw new Error(`${asset.label} is no longer owned by this team.`);
        transfers.push({ originTeamId: asset.originTeamId, round: asset.round, fromTeamId, toTeamId });
      } else if (asset.kind === "PLAYER") {
        if (!tradeAssetOptions(input, resolvedState, fromTeamId).players.some((player) => player.playerId === asset.playerId)) throw new Error("This player is no longer an active keeper for this team.");
        playerMoves.push({ playerId: asset.playerId, fromTeamId, toTeamId });
      }
    }
  }
  return { tradeId, status: "HYPOTHETICAL", transfers, ...(playerMoves.length ? { playerMoves } : {}) };
}

export function describeKeeperMoves(trade, input, resolvedState) {
  const names = new Map(input.teams.map((team) => [team.teamId, team.name]));
  return (trade.playerMoves ?? []).map((move) => {
    const keeper = resolvedState.keepers.find((row) => row.playerId === move.playerId && row.teamId === move.fromTeamId);
    const pick = resolvedState.picks.find((row) => row.keeper?.playerId === move.playerId);
    const player = input.teams.flatMap((team) => team.priorDraft).find((row) => row.playerId === move.playerId);
    return {
      playerId: move.playerId,
      playerName: keeper?.playerName ?? player?.playerName ?? "Player",
      fromTeamId: move.fromTeamId,
      fromTeamName: names.get(move.fromTeamId) ?? move.fromTeamId,
      toTeamId: move.toTeamId,
      toTeamName: names.get(move.toTeamId) ?? move.toTeamId,
      costRound: keeper?.resolvedCostRound ?? null,
      pickNumber: pick?.pickNumber ?? null,
      overallPick: pick?.overallPick ?? null,
    };
  });
}

export function previewTradePackage(builder, baselineInput, overrides, currentResolution) {
  const trade = createTradePackage(builder, currentResolution.input, currentResolution.resolvedState, "preview");
  const names = new Map(baselineInput.teams.map((team) => [team.teamId, team.name]));
  const previewOverrides = { ...overrides, trades: [...(overrides.trades ?? []), trade] };
  const preview = resolveScenario(baselineInput, previewOverrides).resolvedState;
  const keeperMoves = describeKeeperMoves(trade, currentResolution.input, currentResolution.resolvedState);
  const boardChanges = trade.transfers.map((transfer) => {
    const before = currentResolution.resolvedState.picks.find((row) => row.originTeamId === transfer.originTeamId && row.round === transfer.round);
    const after = preview.picks.find((row) => row.originTeamId === transfer.originTeamId && row.round === transfer.round);
    return { originTeamName: names.get(transfer.originTeamId) ?? transfer.originTeamId, round: transfer.round,
      pickNumber: after?.pickNumber ?? before?.pickNumber ?? null, overallPick: after?.overallPick ?? before?.overallPick ?? null,
      beforeOwnerName: names.get(before?.currentOwnerTeamId) ?? "Unresolved",
      afterOwnerName: names.get(after?.currentOwnerTeamId) ?? "Unresolved",
      status: after?.status ?? "UNRESOLVED", keeperName: after?.keeper?.playerName ?? null };
  }).sort((a, b) => (a.overallPick ?? Infinity) - (b.overallPick ?? Infinity));
  const impact = trade.transfers.map((transfer) => {
    const pick = preview.picks.find((row) => row.originTeamId === transfer.originTeamId && row.round === transfer.round);
    const label = `${names.get(transfer.originTeamId)}'s ${["first", "second", "third"][transfer.round - 1] ?? `round ${transfer.round}`}-round pick`;
    return `${names.get(transfer.toTeamId)} receives ${label}${pick?.pickNumber ? ` · ${pick.pickNumber} (${pick.overallPick})` : ""}.`;
  });
  const warnings = [];
  if (keeperMoves.length) warnings.push("Keeper transfer rule requires commissioner confirmation before the receiving team's keeper slot and cost can be assigned.");
  for (const issue of preview.validation.filter((item) => /TRADE|ENTITLEMENT|CHANNEL/.test(item.code) && item.severity !== "WARNING")) warnings.push(issue.message);
  return { trade, impact, warnings, boardChanges, keeperMoves, resolvedState: preview };
}
