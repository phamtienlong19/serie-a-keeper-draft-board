# Open Rule Questions

Resolved clarifications are retained here for provenance. Questions explicitly marked open must not receive implementation assumptions.

## Resolved Q2. Collision assignment between named players
Commissioner clarification: named assignment does not have a separate league consequence, so it does not require a human choice. For a simple two-player collision, the engine assigns players in canonical prior-draft order (old round ascending, then stable player ID), independent of selection order. The first player consumes the base-cost round and the next consumes the earlier collision round.

## Resolved Q3. Multi-level pure keeper-cost collisions
Pure keeper-cost allocation continues toward earlier rounds until an unoccupied round is found. Genuine base-round claims are reserved before spillover, and no keeper may move later than its base cost or earlier than R1. This intrinsic allocation is independent from entitlement ownership.

An unavailable native entitlement is not an intrinsic cost collision; replacement or substitution remains open under Q4/Q5 below.

## Q4. Acquired duplicate round entitlements and keeper collisions
The rules state that pre-draft pick trading can reshape keeper channels and give an example where multiple relevant-round picks matter.

Need exact commissioner rule for:
- multiple entitlements in the same round;
- whether duplicate same-round entitlements can absorb multiple same-base-cost keepers without upward collision;
- exact ordering of entitlement use.

## Q5. Keeper channel unavailable after trade
If a manager trades away the round entitlement that a keeper would normally consume:
- is the keeper illegal;
- may another same-round acquired entitlement be used;
- may cost escalate to an earlier round;
- or is there another commissioner convention?

Need explicit rule.

## Q6. Order of final confirmation
Operationally confirm:
- when pre-draft trades stop;
- when keeper declarations lock;
- when Early/Late locks;
- whether trades can occur after declarations but before final board publication.

The engine can support any order, but Official state should reflect the actual league process.

## Q7. Draft length
The prior keeper sheet and current planning use 11 draft rounds for the board.

Confirm whether 2026/27 will again use exactly 11 drafted roster spots for the board representation.
