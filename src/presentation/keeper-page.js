import { resolveDraftState } from "../domain/engine.js";
import { createYahooMetadataIndex } from "../external/yahoo.js";
import { buildKeeperDecisions } from "../exports/report-data.js";
import { TIER_LABELS } from "./team-scenario-view-model.js";

/** Historical eligibility is probed independently of current selections/trades.
 * Both single and two-player paths run through the existing domain resolver.
 * Cache this immutable presentation result at the app boundary, not in storage.
 */
export function buildHistoricalEligibility(base) {
  const probeBase = { ...base, stateType: "SCENARIO", publicationStatus: "PRE_DRAFT", trades: [], entitlements: [] };
  const result = new Map();
  for (const team of base.teams) {
    for (const player of team.priorDraft) {
      const probe = (ids) => resolveDraftState({ ...probeBase,
        keeperSelections: [{ teamId: team.teamId, selectedPlayerIds: ids, status: "SCENARIO" }],
      });
      const single = probe([player.playerId]);
      const keeper = single.keepers.find((k) => k.playerId === player.playerId);
      const other = team.priorDraft.find((p) => p.playerId !== player.playerId);
      const paired = other ? probe([player.playerId, other.playerId]).keepers.find((k) => k.playerId === player.playerId) : null;
      const issues = single.validation.filter((v) => v.teamId === team.teamId);
      const roundLock = keeper.finishEligibility === "INELIGIBLE" || issues.some((v) => v.code === "KEEPER_TOO_MANY");
      const historyLock = keeper.consecutiveYearEligibility === "INELIGIBLE";
      const conditional = !roundLock && paired?.finishEligibility === "INELIGIBLE";
      result.set(player.playerId, {
        oldRound: keeper.oldRound, baseCostRound: keeper.baseCostRound,
        roundLock, historyLock, conditional,
        historyUnknown: keeper.consecutiveYearEligibility === "UNKNOWN",
        tier: single.teamKeeperStates.find((s) => s.teamId === team.teamId).keeperTier,
      });
    }
  }
  return result;
}

export function buildKeeperPage(context, identityMap, yahooPlayers, historical = buildHistoricalEligibility(context.baselineInput)) {
  const reports = buildKeeperDecisions(context);
  const index = createYahooMetadataIndex(identityMap, yahooPlayers);
  return context.input.teams.map((team, i) => {
    const report = reports[i];
    const selection = context.input.keeperSelections.find((r) => r.teamId === team.teamId);
    const teamState = context.resolvedState.teamKeeperStates.find((r) => r.teamId === team.teamId);
    return { teamId: team.teamId, name: team.name, finish: team.previousFinish, report,
      restriction: TIER_LABELS[teamState.keeperTier],
      declarationLabel: report["Declaration status"] === "PENDING" ? "DECLARATION PENDING"
        : report["Declaration status"] === "NO KEEPERS CONFIRMED" ? "DECLARED · NO KEEPERS"
        : report["Declaration status"] === "CONFIRMED" ? "DECLARED · CONFIRMED" : report["Declaration status"],
      roster: team.priorDraft.map((player) => {
        const selected = context.resolvedState.keepers.find((k) => k.teamId === team.teamId && k.playerId === player.playerId);
        const available = context.resolvedState.playerPool.find((p) => p.playerId === player.playerId);
        const actual = Boolean(selected && selection.status === "CONFIRMED" && available?.availability === "KEPT");
        return { ...player, ...historical.get(player.playerId), metadata: index.get(player.playerId)?.metadata ?? null,
          selected: Boolean(selected), actual, presentationState: actual ? "actual-keeper" : selected ? "scenario-keeper" : "prior-player",
          selectedCostRound: selected?.resolvedCostRound ?? null,
          selectedStatus: selected ? (available?.availability === "KEPT" ? "KEPT" : "SELECTION UNRESOLVED / INVALID") : null,
        };
      }),
    };
  });
}
