# Project Operating Contract

## Project purpose
Build an interactive 2026/27 NBA Talk VN - Serie A keeper/draft board.

The product has two uses over one deterministic rules engine:
1. Governance: represent the league's current verified pre-draft state.
2. Scenario analysis: fork that official state and change keeper, steal, and trade inputs without affecting official state.

The product is not a commentary or recommendation engine. It represents league facts and derives draft-board consequences.

## Governing principle
Humans supply facts and league decisions.
Code deterministically derives:
- keeper eligibility;
- keeper costs;
- collision resolution;
- keeper/no-keeper bucket membership;
- R1 slot allocation;
- full 11-round snake geometry;
- pre-draft pick entitlement ownership;
- exact numbered pick ownership;
- keeper occupancy;
- available-player pool;
- complete 18 x 11 board.

Never invent missing league rules or silently resolve ambiguity.

## Source precedence
1. `docs/LEAGUE_RULES.md`
2. canonical JSON under `data/`
3. explicit commissioner-confirmed clarifications recorded in `docs/OPEN_RULE_QUESTIONS.md`
4. presentation/UI state

Rendered HTML/UI is never canonical state.

## State model
Official, working, and sandbox/scenario states must use the same resolver.

- Working state: latest entered declarations/trades, not necessarily verified.
- Official state: verified league baseline.
- Scenario state: immutable fork of an official state plus explicit overrides.

A scenario may never mutate official state.

## Global recomputation rule
Keeper/no-keeper and Early/Late are global allocation inputs.

Changing one team's declaration may move multiple teams.

Every relevant mutation must rerun the complete R1 allocator and regenerate the full board.
Never implement declaration changes as a local movement of one team only.

## Pre-draft pick trades
Before R1 slots resolve, a traded asset is a round entitlement tied to an origin team, not a numbered pick.

Example:
- `sup-fam:R6` is the pre-draft asset.
- If sup fam later resolves to slot 1.01, the entitlement resolves to 6.18.
- If sup fam instead resolves to slot 1.09, the same entitlement resolves to that slot's R6 pick.

Persist origin and current owner separately.

## Keeper model
For each selected keeper preserve:
- player identity;
- original drafting team;
- old round;
- finish-based eligibility;
- consecutive-year eligibility;
- base mapped keeper cost;
- resolved keeper cost after collisions;
- consumed pick entitlement;
- exact consumed pick number after board geometry resolves.

Do not collapse these concepts into one `eligible` flag.

## Board requirements
The canonical visual output is an 18-column x 11-round board.

Every cell must display:
- exact pick number, e.g. 1.01 / 2.18 / 4.13;
- current owner;
- origin team/slot when ownership differs;
- OPEN or keeper occupancy;
- keeper old-round -> base-cost -> resolved-cost provenance when occupied.

Columns are ordered by resolved R1 slot 1.01 through 1.18.
The board must remain legible under traded pick ownership.

## UI doctrine
The interface should be factual, compact, and easy to operate.

Do not add:
- keeper EV commentary;
- draft recommendations;
- value scores;
- “top-50 removed” KPI commentary;
- artificial keeper-adjusted rankings;
- strategic verdicts.

The state movement of the board is the explanation.

## Human-decision boundary
Do not autonomously decide:
- missing/ambiguous league rules;
- commissioner judgments;
- which prior-year red/ineligible players were keepers if source data does not explicitly preserve that;
- which named keeper receives which round in a collision unless the league rule explicitly specifies it;
- whether a working state is official.

Surface ambiguity.

## Expected implementation order
1. canonical schemas/data
2. keeper eligibility and cost engine
3. collision resolver
4. R1 allocation engine
5. snake geometry
6. pre-draft entitlement/trade engine
7. complete board resolver
8. tests
9. board UI
10. team/keeper drawer
11. working/official/scenario handling
12. visual polish

Do not build authentication, commissioner accounts, workflow automation, or a backend unless later usage justifies them.

## Definition of done for implementation tasks
- relevant tests added/updated;
- all tests pass;
- no league rules changed to make tests pass;
- canonical/advisory/presentation boundaries preserved;
- no ambiguity silently resolved;
- no unrelated changes;
- implementation report states any unresolved rule issue.
