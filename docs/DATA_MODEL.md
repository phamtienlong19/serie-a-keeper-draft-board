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
