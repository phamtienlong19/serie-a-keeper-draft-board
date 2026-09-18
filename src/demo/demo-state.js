/**
 * Primary UI-development fixture. It derives one zero-keeper and EARLY input
 * for every canonical team; no parallel team list or presentation order exists.
 */
export function createDemoDraftInput(canonicalTeamsPayload) {
  const teams = structuredClone(canonicalTeamsPayload.teams);

  return {
    stateType: "WORKING",
    season: canonicalTeamsPayload.season,
    teams,
    keeperSelections: teams.map((team) => ({
      teamId: team.teamId,
      status: "CONFIRMED",
      selectedPlayerIds: [],
    })),
    stealDeclarations: teams.map((team) => ({
      teamId: team.teamId,
      status: "CONFIRMED",
      direction: "EARLY",
    })),
    trades: [],
  };
}

/** Explicit presentation fixture for traded-pick regression coverage only. */
export function createTradedEntitlementDemoInput(canonicalTeamsPayload) {
  const input = createDemoDraftInput(canonicalTeamsPayload);
  input.trades = [
    {
      tradeId: "demo-sup-fam-r6-to-mnqa",
      status: "CONFIRMED",
      transfers: [
        {
          originTeamId: "sup-fam",
          round: 6,
          fromTeamId: "sup-fam",
          toTeamId: "mnqa",
        },
      ],
    },
  ];
  return input;
}

export const demoFixtureDescription = Object.freeze({
  label: "DEMO / NOT OFFICIAL",
  note: "Resolver-driven all-zero-keeper, all-EARLY, native-entitlement baseline; it does not modify canonical league data.",
  keeperPlayerIds: [],
});
