# Serie A Draft Board

This repository contains the canonical league rules/data, deterministic domain engine, and interactive Serie A keeper outlook. The landing view is the preliminary 2027–28 keeper-rights ledger, based on the completed 2026–27 draft.

## 2027–28 Keeper Outlook

`data/seasons/2026-27/draft-results.json` is the completed historical draft record. It is generated from the supplied sanitized Yahoo draft import with `npm run import:2026-draft`. The importer checks all 198 positions, 18 team identities, 12 keeper reservations, and finalized resolver pick ownership before writing the archive. The source HTML is not stored. Its SHA-256 is retained in the archive.

`buildKeeperRights` derives 186 fresh draft-based rights from the archive. The 12 prior-year keeper reservations remain visible but do not create new rights; they are marked ineligible for consecutive keeping by the same manager. The individual base cost uses the existing keeper-cost function. Candidate comparisons reuse the existing finish-tier limits and collision allocator. Final 2026–27 finish, 2027–28 exact pick channels, and current roster ownership remain unknown. The 2025–26 finish in `data/teams.json` applies only to the archived 2026–27 pre-draft workspace.

The saved Yahoo Sports profile ID is retained separately from the fantasy player identity. 149 records reconcile by established ID plus agreeing name; 49 retain source-profile-only identities without an inferred cross-source merge. The completed Draft Archive presents all 18 × 11 picks with search, print/PDF, and XLSX export. The completed pre-draft workspace is absent from the live site. Its old `serie-a.scenarios.v1` browser data is left untouched and never read as 2027–28 state. Candidate selections are temporary UI state and do not modify the archive or official inputs.

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

## Draft-cycle reuse after the season

The 2026 pre-draft workspace is retired from the live interface. Its deterministic resolver, keeper and board renderers, scenario tools, trade builder, and report builders remain in the repository for a future draft cycle. The current site entry (`src/ui/main.js`) imports only the completed draft archive and preliminary rights ledger; it does not initialize the old declarations or local scenarios.

`buildDraftCycle(input)` in `src/presentation/draft-cycle.js` provides the next cycle’s view boundary from the existing resolver:

- `keeperDecisions` and `keeperPicks` communicate declared keepers and occupied slots;
- `livePicks` contains the actual open picks, excluding keeper-occupied positions;
- `tradedPicks` retains both the entitlement origin and current pick owner;
- `unresolvedPicks` stays separate from confirmed trades and live picks;
- `board` retains every numbered position, including keeper reservations;
- incomplete inputs return a pending board and structured validation instead of invented picks.

A 2027–28 board must wait for verified 2026–27 final finishes, the next season’s keeper and Early/Late declarations, confirmed pre-draft entitlement trades, and any required Q4/Q5 rule clarifications. When those inputs exist, the same resolver can show official decisions and scenario forks without altering the 2026 draft archive. A new persisted scenario format must use a distinct season, schema version, scenario type, and storage key.

The completed 2026 pre-draft inputs in `data/pre_draft.json` and the old browser storage remain historical records. They are not a live tradeable roster or a 2027–28 board.

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

The output is written directly to `dist/`. The build verifier checks repository-subpath asset references, bundled draft history, missing assets, source maps, local filesystem paths, and absence of the retired pre-draft workspace. The default public base is `/serie-a-keeper-draft-board/`; set `VITE_BASE_PATH` and `VITE_PUBLIC_SITE_URL` when building for a differently named repository.

## Public Deployment

Pushes to `main` and manual workflow runs execute `.github/workflows/deploy-pages.yml`. The workflow installs from `package-lock.json`, runs the complete test suite, builds the static site, uploads `dist/`, and deploys only after those gates succeed.

Expected public URL:

`https://phamtienlong19.github.io/serie-a-keeper-draft-board/`

Deployment documentation describes the existing workflow only. A feature-branch push and pull request do not deploy this work.

## Yahoo metadata enrichment

Yahoo data is an external, non-authoritative enrichment layer:

- `data/external/yahoo/draft_analysis.json` is the preserved raw snapshot.
- `data/external/yahoo/players.json` is the deterministic normalized player metadata.
- `data/player_identity_map.json` joins stable local player IDs to Yahoo player IDs and keys.
- `src/external/yahoo.js` provides normalization, reconciliation, and ID-based metadata lookup helpers.

**XRank is the per-player `player_ranks[].player_rank` value whose `rank_type` is `OR`** in the 16 October 2026 Yahoo snapshot. The source array's order does not define XRank. The raw OR value is also preserved as `oRank`; ADP and auction fields never define XRank. Auction fields remain preserved externally but are absent from main UI/export ranking columns. The retired 2026 pre-draft board, team drawer, Rankings, print view, and exports used this same normalized metadata; the current Keeper Outlook derives rights from the completed draft archive.

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

The refreshed 300-player snapshot reconciles 182 of 198 historical rows. All 12 declared keepers reconcile. Bobby Portis retains established Yahoo ID 5482 despite the external name changing to Bobby Portis Jr.; 16 rows remain unresolved. The original 17-row audit is in `docs/IDENTITY_RECONCILIATION.md`; no fuzzy identity guess was made. If an unresolved historical player is selected in a scenario, Rankings displays an explicit reconciliation warning. Canonical `data/teams.json` was not changed by the refresh.
