# NBA Talk VN - Serie A — 2026/27 Keeper & Draft Rules

## League format
- Yahoo head-to-head categories.
- 9 categories: FG%, FT%, 3PTM, PTS, REB, AST, STL, BLK, TO.
- Daily lineup changes.
- 7 acquisitions per week.
- No full-season acquisition cap.
- One IL slot.
- Standard snake draft.

## Keeper ownership eligibility
A team may only keep players it originally drafted.

Undrafted waiver/free-agent pickups are not keeper-eligible.

If a drafted player is traded during the season:
- the receiving team has the player for that season;
- keeper rights do not transfer;
- keeper rights remain with the team that originally drafted the player.

Pre-draft pick trading may reshape pick inventory / keeper channels.

## Keeper entitlement by prior-season finish
- 1st–3rd: keep any 2 eligible players.
- 4th–7th: keep any 2 eligible players originally drafted R2 or later.
- 8th–11th: either:
  - keep 1 eligible player originally drafted R2 or later; OR
  - keep 2 eligible players originally drafted R3 or later.
- 12th–14th: keep 1 eligible player originally drafted R3 or later.
- 15th–16th: keep 1 eligible player originally drafted R4 or later.
- 17th–18th: no keepers.

## Additional keeper restrictions
- Only one keeper slot may be used on an R1/R2 player.
- The same player cannot be kept in consecutive years by the same team.
- The prior keeper sheet marks consecutive-year ineligible players in red.
- The available text extraction does not preserve which names were red; this must be supplied separately before authoritative keeper eligibility can be completed.

## Keeper cost mapping
Keeper cost is based on prior-season original draft round.

- Prior R1 -> current R1.
- Prior R2 -> current R2.
- Prior R3–R7 -> one round earlier.
- Prior R8+ -> two rounds earlier.

Examples:
- old R5 -> base R4.
- old R7 -> base R6.
- old R8 -> base R6.
- old R10 -> base R8.

## Keeper collisions
If two selected keepers resolve to the same base cost:
- both may still be kept;
- one consumes the target round;
- the other consumes the next earlier available round.

Example:
- keeper A maps to R6;
- keeper B maps to R6;
- resolved keeper costs become R6 and R5.

If multiple collisions or traded pick inventory create more complex cases, the system must follow an explicit confirmed league rule. See `OPEN_RULE_QUESTIONS.md`.

## Pre-draft pick trading
The league permits pre-draft pick trading / pick-inventory reshaping for keeper purposes.

For implementation, a pre-draft asset should be represented as:
- origin team;
- round entitlement;
- current owner.

Do not persist an exact numbered pick before R1 allocation is resolved.

Example:
- `sup-fam:R6` may later resolve to 6.18, 6.10, etc., depending on sup fam's final R1 slot.

## Keeper/no-keeper declaration and R1 allocation
After keeper decisions, every team belongs to one of two R1 allocation buckets:
1. no-keeper teams;
2. keeper teams.

All no-keeper teams are resolved first.
All keeper teams are resolved second.

Within each bucket, priority is by prior-season finish, with the higher prior finisher receiving priority first.

## Steal direction
Each team declares Early or Late for its R1 slot.

At the team's allocation turn:
- Early takes the earliest remaining R1 slot.
- Late takes the latest remaining R1 slot.

If a team does not announce, the documented default is the earliest/highest possible R1 slot.

## R1 keepers
A team using an R1 keeper still claims an R1 slot.

That keeper occupies the team's R1 pick, and the selected R1 slot still determines the team's snake geometry for all later rounds.

## Snake geometry
Once a team receives R1 slot `s` in an 18-team snake:

Odd rounds use slot `s`.
Even rounds use the reversed slot `19 - s`.

Examples:
- slot 1:
  - 1.01
  - 2.18
  - 3.01
  - 4.18
- slot 9:
  - 1.09
  - 2.10
  - 3.09
  - 4.10
- slot 18:
  - 1.18
  - 2.01
  - 3.18
  - 4.01

## Global-state requirement
Keeper/no-keeper and Early/Late are global allocation inputs.

Changing one team's input may alter multiple later teams' R1 slots.

The allocator must always recompute all teams from the complete current declaration state.

## Final board
The final 18 x 11 board is derived from:
- final standings;
- prior draft;
- keeper-history eligibility;
- confirmed pre-draft pick trades;
- keeper selections;
- collision resolution;
- keeper/no-keeper bucket allocation;
- Early/Late choices;
- resulting R1 slots;
- snake geometry;
- current entitlement ownership.

The final board is output, not source data.
