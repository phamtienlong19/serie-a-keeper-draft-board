import { createEmptyScenarioOverrides } from "./scenario-state.js";

export const STORAGE_KEY = "serie-a.scenarios.v1";
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function requireValue(condition, message) { if (!condition) throw new TypeError(message); }
function keys(value, allowed, label) {
  requireValue(object(value) && Object.keys(value).every((key) => allowed.includes(key)), `Invalid ${label} fields.`);
}

/** Strict, input-only wire format. Reject unknown fields, including derived state. */
export function validateScenario(value, base) {
  keys(value, ["schemaVersion", "id", "name", "createdAt", "updatedAt", "baseRevision", "overrides"], "scenario");
  requireValue(value.schemaVersion === 1, "Unsupported scenario schema version.");
  for (const key of ["id", "name", "baseRevision"]) requireValue(typeof value[key] === "string" && value[key].trim().length > 0 && value[key].length <= 200, `Invalid scenario ${key}.`);
  for (const key of ["createdAt", "updatedAt"]) requireValue(typeof value[key] === "string" && Number.isFinite(Date.parse(value[key])), `Invalid scenario ${key}.`);
  const o = value.overrides;
  keys(o, ["keeperSelections", "stealDirections", "assumedEligiblePlayerIds", "trades"], "override");
  const teamIds = base.teams.map((team) => team.teamId);
  const playerIds = base.teams.flatMap((team) => team.priorDraft.map((p) => p.playerId));
  keys(o.keeperSelections, teamIds, "keeper selection");
  for (const [teamId, ids] of Object.entries(o.keeperSelections)) {
    const roster = base.teams.find((team) => team.teamId === teamId).priorDraft.map((p) => p.playerId);
    requireValue(Array.isArray(ids) && new Set(ids).size === ids.length && ids.every((id) => roster.includes(id)), `Invalid keeper identities for ${teamId}.`);
  }
  keys(o.stealDirections, teamIds, "Early/Late");
  requireValue(Object.values(o.stealDirections).every((v) => ["EARLY", "LATE"].includes(v)), "Invalid Early/Late direction.");
  requireValue(Array.isArray(o.assumedEligiblePlayerIds) && o.assumedEligiblePlayerIds.every((id) => playerIds.includes(id)), "Invalid eligibility assumptions.");
  requireValue(o.trades === undefined || Array.isArray(o.trades), "Invalid hypothetical trades.");
  for (const trade of o.trades ?? []) {
    keys(trade, ["tradeId", "status", "transfers", "playerMoves"], "trade");
    requireValue(typeof trade.tradeId === "string" && trade.tradeId.length > 0 && trade.status === "HYPOTHETICAL" && Array.isArray(trade.transfers) && Array.isArray(trade.playerMoves ?? []) && (trade.transfers.length + (trade.playerMoves?.length ?? 0)) > 0, "Scenario trades must contain HYPOTHETICAL assets.");
    for (const transfer of trade.transfers) {
      keys(transfer, ["originTeamId", "round", "fromTeamId", "toTeamId"], "entitlement transfer");
      requireValue([transfer.originTeamId, transfer.fromTeamId, transfer.toTeamId].every((id) => teamIds.includes(id)) && Number.isInteger(transfer.round) && transfer.round >= 1 && transfer.round <= (base.draftRounds ?? 11), "Invalid entitlement identity or owner.");
    }
    for (const move of trade.playerMoves ?? []) {
      keys(move, ["playerId", "fromTeamId", "toTeamId"], "player move");
      requireValue(playerIds.includes(move.playerId) && teamIds.includes(move.fromTeamId) && teamIds.includes(move.toTeamId) && move.fromTeamId !== move.toTeamId && base.teams.find((team) => team.teamId === move.fromTeamId)?.priorDraft.some((player) => player.playerId === move.playerId), "Invalid player move.");
    }
  }
  return structuredClone(value);
}

export function newScenario(name, base, { id = crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  return { schemaVersion: 1, id, name, createdAt: now, updatedAt: now, baseRevision: base.baseRevision, overrides: createEmptyScenarioOverrides() };
}
export function renameScenario(scenario, name, { now = new Date().toISOString() } = {}) {
  requireValue(typeof name === "string" && name.trim().length > 0 && name.trim().length <= 200, "Invalid scenario name.");
  return { ...scenario, name: name.trim(), updatedAt: now };
}
export function serializeScenario(scenario, base) { return JSON.stringify(validateScenario(scenario, base), null, 2); }
export function deserializeScenario(json, base) {
  let value;
  try { value = JSON.parse(json); } catch { throw new TypeError("Malformed scenario JSON."); }
  return validateScenario(value, base);
}
export function resetScenario(scenario, base) {
  return { ...scenario, baseRevision: base.baseRevision, updatedAt: new Date().toISOString(), overrides: createEmptyScenarioOverrides() };
}
export function loadScenarios(storage, base) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const values = JSON.parse(raw);
  requireValue(Array.isArray(values), "Invalid local scenario library; stored data has been left intact.");
  const scenarios = values.map((value) => validateScenario(value, base));
  requireValue(new Set(scenarios.map((s) => s.id)).size === scenarios.length, "Duplicate scenario IDs in local library.");
  return scenarios;
}
export function saveScenarios(storage, scenarios, base) {
  const validated = scenarios.map((value) => validateScenario(value, base));
  storage.setItem(STORAGE_KEY, JSON.stringify(validated));
}
export function autosaveScenario(storage, saved, scenario, base, now = new Date().toISOString()) {
  const updated = { ...scenario, updatedAt: now };
  const next = [...saved.filter((item) => item.id !== updated.id), updated];
  saveScenarios(storage, next, base);
  return { scenario: updated, saved: next };
}
