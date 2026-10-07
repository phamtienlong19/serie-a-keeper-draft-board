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

## Current local pre-draft workspace

`data/pre_draft.json` records **18 / 18 confirmed declarations**, including ten explicit no-keeper declarations and 12 keepers. Run and Gun declared no keepers and Early; Rising Rockets is no keepers and Late. The resolver verifies the 18 × 11 board and the declaration layer is **FINALIZED** locally. Publication remains a separate action. The original demo fixtures remain for regression tests only.

The Rankings page defaults to **Available only**: 300 Yahoo players minus the 12 valid declared keepers = 288 players. Availability comes from `resolveDraftState().playerPool`, joined by persisted local/Yahoo IDs. Available Rank is consecutive among those 288 players; XRank is Yahoo's per-player OR rank and keeps its source values and gaps when keepers are hidden. Show kept restores keepers at their original XRank with no Available Rank, plus team and cost. Round separators derive from the active board's open picks after keeper placement. Search, Yahoo position, NBA team and availability filters do not renumber either underlying rank.

Team drawers fork local scenarios on edit. Confirmed inputs remain separate, with **SCENARIO OVERRIDE** on changed confirmed declarations and **SCENARIO ASSUMPTION** on pending-team choices. Set no keepers explicitly supplies an empty scenario declaration; it never fills a missing choice implicitly.

The four primary surfaces are Draft Board, Keepers, Rankings and Trades. The compact Scenario menu opens the working league base or a named local copy. Changes autosave in browser `localStorage` under `serie-a.scenarios.v1`; only metadata and input overrides are saved. Save Copy, rename, duplicate, delete and reset manage workspaces. Export backup and Import backup remain under Advanced / Backup. Storage failures are visible and leave stored data intact. An older scenario opens as a fresh named copy against current league inputs only after the user chooses that action; its saved original remains intact. There is no backend, authentication or cloud sync.

Trades uses a two-sided package builder with active keepers and picks by manager-facing names. Each pick shows its live exact/overall number from the active board; the same entitlement can move to a different numbered slot when a scenario changes R1 allocation. Preview shows the changed pick slots and opens a read-only full board before saving. The 2025 draft list is historical evidence, not a current tradeable roster. Picks still resolve internally as origin-team/round entitlements. Keeper moves remain hypothetical proposals and do not alter keeper declarations or roster ownership until the league supplies a transfer rule; the preview warns about that limit. Hypothetical pick transfers affect only the active scenario. Confirmed trades are entered in canonical `data/pre_draft.json` after commissioner verification; only `CONFIRMED` trades affect the base. Keeper-channel ambiguities under Q4/Q5 remain unresolved. No real trades were supplied in this task.

Draft Board, Keeper Decisions and Keeper Eligibility have **Print / PDF** actions using browser printing. The board prints all 11 rounds in two nine-team landscape pages; Decisions prints a compact 18-team report in resolved R1 order; Eligibility prints all historical player rows and eligibility markers across three landscape pages. Each board pick shows its exact number, overall pick in parentheses and a small snake-direction arrow. Occupied cells add Yahoo XRank beside the pick and keeper cost below. **Export .xlsx** produces State, Keeper Decisions, Draft Order, Pick Trades, Available Rankings and Full Draft Board sheets. Available Rankings includes Rank, XRank and Board Range. The small dependency-free OOXML writer uses typed cells and inline strings (never formulas), frozen headers and filters. All report values consume canonical inputs and resolver output.

### Finalization and publication

The finalized declarations can be reviewed on the feature branch and in a pull request. Publishing the site still requires a separate merge or deployment action; the Pages workflow runs on pushes to `main` or a manual dispatch.

The confirmed declarations and corrected Rising Rockets direction were entered in `data/pre_draft.json`, its revision was incremented, and `publicationStatus: FINALIZED` was set after resolver verification. The resolver rejects finalization of incomplete, conflicted or scenario inputs. Q6 (locking order) and Q7 (11-round confirmation) remain commissioner questions; no new league rule was inferred. Finalization here does not publish or deploy the board.

## Keeper Decisions and Eligibility

The Keeper surface defaults to **Decisions** with a lightweight **Eligibility** switch. Responsive cards lead with actual keeper choices and costs; prior rosters are one disclosure away. Actual confirmed keepers use `actual-keeper`, a positive border, **✓ KEPT** text and an emphasized cost chip in the expanded roster. Hypothetical selections use **SCENARIO** labeling instead. Confirmed empty declarations, including Run and Gun, show **NO KEEPERS**.

Eligibility uses independent resolver probes against canonical history for ROUND LOCK, KEPT LAST YEAR and KEEP 1 ONLY, with old round and base if-kept cost. Switching views never changes league inputs. Selected costs use the current resolver's resolved cost; unselected costs are base costs before collisions. Search matches team/player and keeps roster context; team jump is available on mobile and desktop. The keeper print report includes all 18 decisions even when screen search filters them, with text/border keeper semantics for grayscale. The supplied `public/keeper-eligibility/index.html` remains an unchanged historical reference, not a data source.

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

Deployment documentation describes the existing workflow only. A feature-branch push and pull request do not deploy this work.

## Yahoo metadata enrichment

Yahoo data is an external, non-authoritative enrichment layer:

- `data/external/yahoo/draft_analysis.json` is the preserved raw snapshot.
- `data/external/yahoo/players.json` is the deterministic normalized player metadata.
- `data/player_identity_map.json` joins stable local player IDs to Yahoo player IDs and keys.
- `src/external/yahoo.js` provides normalization, reconciliation, and ID-based metadata lookup helpers.

**XRank is the per-player `player_ranks[].player_rank` value whose `rank_type` is `OR`** in the 7 October 2026 Yahoo snapshot. The source array is sorted by average pick and does not define XRank. The raw OR value is also preserved as `oRank`; ADP and auction fields never define XRank. XRank may exceed 300 because the supplied 300-player slice includes a player with OR 467. Auction fields remain preserved externally but are absent from main UI/export ranking columns.

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
