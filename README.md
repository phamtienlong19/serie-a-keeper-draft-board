# Serie A Draft Board

This repository contains the canonical league rules/data, deterministic domain engine, and interactive 2026/27 keeper and draft board.

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

## Read-only draft board

Task 003 adds a Vite-powered, read-only 18-column × 11-round board. The browser consumes a pure presentation model built from `resolveDraftState`; it does not calculate allocation, snake geometry, entitlement ownership, or keeper placement itself.

The bundled screen is clearly labeled `DEMO / NOT OFFICIAL`. Its fixture clones all 18 canonical team records, supplies an explicit zero-keeper and `EARLY` declaration for each team, and passes everything through the production resolver. Canonical `data/teams.json` remains unchanged.

Task 004 adds client-side scenario controls. Clicking a team header or using Jump to Team opens its roster drawer, where keeper selections, explicit scenario-only eligibility assumptions, and `EARLY`/`LATE` overrides can be changed. Scenario state stores inputs only; every change reruns the complete domain resolver and rebuilds the board. Reset returns to the immutable demo baseline.

## Local Development

Install the locked dependencies and run the Vite development server:

```sh
npm ci
npm test
npm run dev
```

The development server uses `/` as its base path. An optional development-only Sites artifact can be created with `npm run build:sites`; it is not the production deployment target.

## Production Build

Create and verify the static GitHub Pages artifact:

```sh
npm run build
```

The output is written directly to `dist/`. The build verifier checks repository-subpath asset references, bundled canonical/Yahoo data, missing assets, source maps, local filesystem paths, and hosting-specific output. The default public base is `/serie-a-keeper-draft-board/`; set `VITE_BASE_PATH` and `VITE_PUBLIC_SITE_URL` when building for a differently named repository.

## Public Deployment

Pushes to `main` and manual workflow runs execute `.github/workflows/deploy-pages.yml`. The workflow installs from `package-lock.json`, runs the complete test suite, builds the static site, uploads `dist/`, and deploys only after those gates succeed.

Expected public URL:

`https://phamtienlong19.github.io/serie-a-keeper-draft-board/`

One-time repository setup: in GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**. If the local checkout is not yet connected to `phamtienlong19/serie-a-keeper-draft-board`, create or connect that repository and push `main`; no application secrets are required.

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
The authoritative complete prior-year keeper list has now been supplied. Canonical data marks those seven players `INELIGIBLE` for consecutive-year keeping and all other prior-draft players `ELIGIBLE`.
