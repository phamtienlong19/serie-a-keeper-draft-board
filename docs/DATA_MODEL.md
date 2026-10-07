# Data Model — Serie A Draft Board

## 1. Design goals
The model must preserve the distinction between:
- league facts;
- derived state;
- working/official/scenario state;
- origin of a pick;
- current ownership of a pick;
- keeper eligibility;
- keeper base cost;
- keeper resolved cost.

The UI must be regenerable entirely from canonical inputs.

## 2. Stable IDs
Use stable IDs for:
- teams;
- players;
- seasons;
- trades;
- official snapshots;
- scenarios.

Do not use display names as permanent join keys.

Suggested team IDs:
- sup-fam
- under-armour
- angry-bird
- to-kinh
- jinple
- bounce-island
- cuckoo
- rip-city-remix
- ecstasy
- mnqa
- seattle-supersonics
- rising-rockets
- dial-square
- run-and-gun
- tien-delay
- dontrick-devilteam
- abcxyz
- chicken-wings

## 3. Baseline team object

```json
{
  "teamId": "sup-fam",
  "name": "sup fam",
  "previousFinish": 1,
  "keeperTier": "ANY_2",
  "priorDraft": [
    {
      "playerId": "cooper-flagg",
      "playerName": "Cooper Flagg",
      "oldRound": 2,
      "originalDrafterTeamId": "sup-fam",
      "consecutiveYearKeeperEligibility": "ELIGIBLE"
    }
  ]
}
```

`consecutiveYearKeeperEligibility` is explicit. The 2026/27 canonical rows were reconciled from the authoritative complete prior-year keeper list; `UNKNOWN` remains available for future unreconciled inputs.

Allowed values:
- `ELIGIBLE`
- `INELIGIBLE`
- `UNKNOWN`

## 4. Keeper entitlement enum
Suggested values:
- `ANY_2`
- `TWO_R2_PLUS`
- `ONE_R2_OR_TWO_R3_PLUS`
- `ONE_R3_PLUS`
- `ONE_R4_PLUS`
- `NONE`

The engine derives this from previous finish but storing the derived label in exports is acceptable.

## 5. Keeper selection input

```json
{
  "teamId": "sup-fam",
  "selectedPlayerIds": ["cooper-flagg", "alex-sarr"]
}
```

The input stores selections only.

The engine derives:

```json
{
  "playerId": "alex-sarr",
  "oldRound": 5,
  "baseCostRound": 4,
  "resolvedCostRound": 4,
  "collisionDepth": 0,
  "collision": null,
  "consumedEntitlement": {
    "originTeamId": "sup-fam",
    "round": 4
  }
}
```

## 6. Steal declaration

```json
{
  "teamId": "sup-fam",
  "direction": "EARLY",
  "status": "CONFIRMED"
}
```

Suggested status values:
- `UNDECLARED`
- `ENTERED`
- `CONFIRMED`

## 7. Pre-draft entitlement
A pre-draft pick asset exists before exact pick numbering.

```json
{
  "season": "2026-27",
  "originTeamId": "sup-fam",
  "round": 6,
  "currentOwnerTeamId": "sup-fam"
}
```

There should initially be one entitlement per origin team per round unless historical/past trades already modify the baseline.

## 8. Trade
A trade transfers one or more entitlement assets.

```json
{
  "tradeId": "trade-001",
  "status": "CONFIRMED",
  "transfers": [
    {
      "originTeamId": "sup-fam",
      "round": 6,
      "fromTeamId": "sup-fam",
      "toTeamId": "mnqa"
    },
    {
      "originTeamId": "mnqa",
      "round": 8,
      "fromTeamId": "mnqa",
      "toTeamId": "sup-fam"
    }
  ]
}
```

Do not store `6.18` or similar at this stage.

## 9. R1 allocation result

```json
{
  "teamId": "sup-fam",
  "bucket": "NO_KEEPER",
  "priority": 1,
  "stealDirection": "EARLY",
  "r1Slot": 1
}
```

`r1Slot` is derived only when enough declaration state exists to resolve it.

## 10. Resolved pick

```json
{
  "round": 6,
  "slot": 18,
  "pickNumber": "6.18",
  "originTeamId": "sup-fam",
  "currentOwnerTeamId": "mnqa",
  "status": "OPEN",
  "keeper": null
}
```

Keeper example:

```json
{
  "round": 4,
  "slot": 13,
  "pickNumber": "4.13",
  "originTeamId": "sup-fam",
  "currentOwnerTeamId": "sup-fam",
  "status": "KEEPER",
  "keeper": {
    "playerId": "alex-sarr",
    "oldRound": 5,
    "baseCostRound": 4,
    "resolvedCostRound": 4
  }
}
```

## 11. Working state

```json
{
  "stateType": "WORKING",
  "baseSeason": "2026-27",
  "keeperSelections": {},
  "stealDeclarations": {},
  "trades": []
}
```

## 12. Official snapshot

```json
{
  "stateType": "OFFICIAL",
  "snapshotId": "official-2026-09-28-001",
  "verifiedAt": "2026-09-28T14:00:00+07:00",
  "keeperSelections": {},
  "stealDeclarations": {},
  "trades": []
}
```

The official snapshot stores authoritative inputs.
Resolved board state should be derivable.

A cached derived board may exist for convenience but is not source of truth.

## 13. Scenario

```json
{
  "stateType": "SCENARIO",
  "scenarioId": "scenario-001",
  "baseOfficialSnapshotId": "official-2026-09-28-001",
  "overrides": {
    "keeperSelections": {},
    "stealDeclarations": {},
    "trades": []
  }
}
```

Scenario resolution:

`official inputs + scenario overrides -> same resolver -> scenario board`

## 14. Validation result
Use structured validation.

```json
{
  "severity": "ERROR",
  "code": "KEEPER_TOO_MANY",
  "teamId": "sup-fam",
  "message": "Team selected 3 keepers but may keep at most 2."
}
```

Suggested severity:
- `ERROR`
- `WARNING`
- `UNRESOLVED`

Do not make free-form error strings the only machine-readable result.

## 15. Board export
The resolver should be able to return:

```json
{
  "allocations": [],
  "entitlements": [],
  "picks": [],
  "keepers": [],
  "availablePlayers": [],
  "validation": []
}
```

The UI consumes this derived representation.

## 16. Pre-draft declarations and publication

`data/pre_draft.json` schema version 1 contains a revision, season, publicationStatus, 18 declaration rows and canonical trades. A confirmed declaration requires explicit `selectedPlayerIds` (including `[]`) and `direction`. A pending declaration carries neither. The current local inputs contain 18 confirmed teams, with Run and Gun no keepers / Early and Rising Rockets no keepers / Late; the declaration layer is finalized.

`createPreDraftInput` clones canonical history and separates these rows into resolver keeper/steal declarations. `resolveDraftState` exposes `confirmedDeclarationCount`, `finalizationAllowed` and validated `publicationStatus`. A complete scenario remains PRE_DRAFT. FINALIZED requires explicit human input, 18 confirmed teams and no blocking resolution issues; it is never inferred from completeness.

## 17. Local scenario wire format

`src/scenario/storage.js` validates `{schemaVersion: 1, id, name, createdAt, updatedAt, baseRevision, overrides}`. Overrides contain `keeperSelections` keyed by canonical team ID, `stealDirections`, `assumedEligiblePlayerIds`, and optional `trades`. Empty arrays and EARLY are explicit overrides, not reset sentinels. Missing keys inherit the immutable base. Trades must be HYPOTHETICAL and contain origin/round/from/to only. Imported derived fields are rejected. A revision mismatch blocks import and requires an explicit working-copy reset on reopening, preventing silent mutation of the fork's base. The saved old copy stays intact until Save.

Only user inputs are serialized; reports, exact picks, costs and pool rows are recomputed. Reset clears overrides and adopts the current base revision. No scenario can finalize or change base declarations.

## 18. External ranks and exports

Yahoo `xrank` is the embedded per-player `OR` rank, also preserved as `oRank` in normalized metadata. The supplied array is ordered by average pick and does not define XRank. Neither field is a canonical league fact. `buildDraftPool` joins Yahoo IDs to resolver playerPool availability; it never consumes Yahoo is_keeper. Missing keeper identities are reported without guessed exclusion.

The report builders consume the same input/resolved state pair as the board. XLSX strings are encoded as literal inline strings. Print views and exports carry state provenance, declaration count and generated time; unresolved exact picks remain PENDING.

## 19. Keeper page presentation

`buildKeeperPage` combines the same report builder and resolver records used by XLSX with canonical prior rosters. `buildHistoricalEligibility` probes single/two-player paths through `resolveDraftState`, independent of actual declarations and entitlement trades, to derive historical round locks and conditional paths. It does not implement a second cost or finish rule. Actual selection styling requires confirmed declaration provenance and resolver KEPT availability; overridden selections carry scenario styling. The page mode and search are presentation state only.
