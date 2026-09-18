# Serie A Draft Board

This repository contains the canonical league rules/data and a deterministic, zero-dependency domain engine for the 2026/27 keeper and draft board. No UI is included yet.

## Domain engine

`resolveDraftState(input)` in `src/domain/engine.js` derives keeper validation, R1 allocation, entitlement ownership, the 18 x 11 snake board, keeper occupancy, and player availability.

Important input semantics:

- A missing team declaration is unresolved; it is never interpreted as “no keeper” or `EARLY`.
- An explicit keeper declaration with `selectedPlayerIds: []` means `NO_KEEPER`.
- `keeperSelections` and `stealDeclarations` accept either arrays keyed by `teamId` or objects whose keys are team IDs.
- Official declarations marked `ENTERED` remain unresolved until confirmed. A missing status is accepted because an Official snapshot is itself authoritative.
- Entitlements are generated once per origin team and round. Trades move those assets; exact pick numbers are derived only after R1 allocation.
- `entitlements` may provide snapshot ownership overrides. Multiple rows for the same `(originTeamId, round)` are rejected as duplicate ownership.

The resolver returns structured `ERROR`, `WARNING`, and `UNRESOLVED` validation. Open collision/channel questions remain machine-readable rather than receiving guessed outcomes.

## Yahoo metadata enrichment

Yahoo data is an external, non-authoritative enrichment layer:

- `data/external/yahoo/draft_analysis.json` is the preserved raw snapshot.
- `data/external/yahoo/players.json` is the deterministic normalized player metadata.
- `data/player_identity_map.json` joins stable local player IDs to Yahoo player IDs and keys.
- `src/external/yahoo.js` provides normalization, reconciliation, and ID-based metadata lookup helpers.

Names are used only to bootstrap the checked-in identity map. Runtime consumers join through `playerId` and `yahooPlayerId`; Yahoo metadata never updates canonical draft round, original drafter, keeper eligibility, declarations, entitlement ownership, or trades.

Regenerate normalized metadata and the identity map with:

```sh
npm run normalize:yahoo
```

Run tests with:

```sh
npm test
```

## Repository context

Files:
- `AGENTS.md` — persistent project operating contract
- `docs/PRODUCT_SPEC.md` — settled product behavior
- `docs/LEAGUE_RULES.md` — league mechanics supported by source material
- `docs/DATA_MODEL.md` — canonical/derived state model
- `docs/OPEN_RULE_QUESTIONS.md` — rules that must not be silently assumed
- `data/teams.json` — 18-team prior-draft seed data
- `CODEX_TASK_001.md` — deterministic engine implementation task
- `src/domain/` — pure rules and resolver code
- `tests/` — Node test-runner coverage for rules and unresolved boundaries

Important:
The text source does not preserve prior-year red/ineligible keeper markings. Every player's consecutive-year keeper eligibility is intentionally seeded as `UNKNOWN` until that data is supplied.
