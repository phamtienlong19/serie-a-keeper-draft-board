# Codex Task 001 — Deterministic Domain Engine

Read:
- `AGENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/LEAGUE_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/OPEN_RULE_QUESTIONS.md`
- `data/teams.json`

Implement only the deterministic domain engine. Do not build the UI yet.

## Required functionality

1. Derive each team's keeper entitlement from prior finish.
2. Validate keeper selections against:
   - finish-based round restrictions;
   - maximum keeper count;
   - one-R1/R2-keeper maximum;
   - original-drafter requirement;
   - consecutive-year eligibility state.
3. Map old round to base keeper cost:
   - R1-R2 => same round;
   - R3-R7 => one round earlier;
   - R8+ => two rounds earlier.
4. Resolve simple same-round keeper collisions:
   - target round plus next earlier available round.
   - If named-player assignment or a more complex cascade is ambiguous under `OPEN_RULE_QUESTIONS.md`, return structured `UNRESOLVED` validation instead of inventing a rule.
5. Classify teams into `NO_KEEPER` or `KEEPER` R1 allocation buckets.
6. Resolve R1 slots:
   - all no-keeper teams first;
   - keeper teams second;
   - prior-season finish determines priority inside each bucket;
   - EARLY takes earliest remaining slot;
   - LATE takes latest remaining slot.
7. Derive exact R1-R11 snake pick numbers for all 18 resolved slots.
8. Model pre-draft traded assets as `(originTeamId, round)` entitlements.
9. Apply entitlement ownership after R1 geometry resolves.
10. Place keepers into the applicable consumed entitlement/pick when deterministic.
11. Return a complete derived state:
    - allocations;
    - entitlements;
    - picks;
    - keepers;
    - available players;
    - structured validation.
12. Partial/working states must remain representable without fake certainty.

## Tests required

At minimum cover:
- champion with 0 keepers + EARLY can resolve to 1.01 when no earlier no-keeper priority exists;
- switching that team to keeper moves it to the keeper bucket;
- EARLY -> LATE can change downstream teams' R1 slots;
- one declaration can move multiple teams;
- R5 -> R4 keeper mapping;
- R8 -> R6 mapping;
- simple R7->R6 + R8->R6 collision;
- team finishing 8th–11th may use one R2+ OR two R3+, not both modes;
- 17th/18th cannot keep;
- second R1/R2 keeper rejected;
- `UNKNOWN` consecutive-year eligibility produces unresolved validation for an attempted Official keeper decision;
- traded R6 entitlement follows the origin team's eventual snake geometry;
- duplicate entitlement ownership is rejected;
- unresolved inputs stay unresolved rather than being assigned guessed slots.

## Constraints
- No UI.
- No player-value logic.
- No strategic recommendations.
- Do not change league rules to simplify implementation.
- Do not silently resolve anything listed in `OPEN_RULE_QUESTIONS.md`.
- Keep the engine as pure/testable as practical.

## Deliverable
Implement the engine and tests, then provide:
- files changed;
- test command/result;
- unresolved rule questions encountered;
- any data/schema changes proposed.
