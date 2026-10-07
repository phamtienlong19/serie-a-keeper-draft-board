/** Canonical declarations are inputs; no inferred choices or publication transitions. */
export function createPreDraftInput(canonical, declarations) {
  const ids = declarations.declarations.map((row) => row.teamId);
  if (declarations.schemaVersion !== 1 || declarations.season !== canonical.season ||
      !["PRE_DRAFT", "FINALIZED"].includes(declarations.publicationStatus) ||
      typeof declarations.revision !== "string" || !declarations.revision.trim() ||
      ids.length !== canonical.teams.length || new Set(ids).size !== ids.length ||
      canonical.teams.some((team) => !ids.includes(team.teamId))) {
    throw new TypeError("Invalid pre-draft declaration schema/team identity coverage.");
  }
  for (const row of declarations.declarations) {
    if (!["CONFIRMED", "PENDING"].includes(row.status) ||
        (row.status === "CONFIRMED" && (!Array.isArray(row.selectedPlayerIds) || !["EARLY", "LATE"].includes(row.direction))) ||
        (row.status === "PENDING" && (row.selectedPlayerIds !== undefined || row.direction !== undefined))) {
      throw new TypeError(`Invalid declaration for ${row.teamId}; pending choices must remain absent.`);
    }
  }
  return {
    stateType: "WORKING",
    season: canonical.season,
    baseRevision: declarations.revision,
    publicationStatus: declarations.publicationStatus,
    teams: structuredClone(canonical.teams),
    keeperSelections: declarations.declarations.map(({ teamId, status, selectedPlayerIds }) => ({
      teamId, status, ...(selectedPlayerIds ? { selectedPlayerIds: [...selectedPlayerIds] } : {}),
    })),
    stealDeclarations: declarations.declarations.map(({ teamId, status, direction }) => ({
      teamId, status, ...(direction ? { direction } : {}),
    })),
    trades: structuredClone(declarations.trades ?? []),
  };
}

export function declarationProvenance(base, overrides, teamId) {
  const confirmed = base.keeperSelections.find((row) => row.teamId === teamId)?.status === "CONFIRMED";
  const changed = Object.hasOwn(overrides.keeperSelections, teamId) || Object.hasOwn(overrides.stealDirections, teamId);
  return changed ? (confirmed ? "SCENARIO OVERRIDE" : "SCENARIO ASSUMPTION") : (confirmed ? "CONFIRMED" : "PENDING");
}
