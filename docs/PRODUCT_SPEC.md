# Serie A 2026/27 Draft Board — Product Specification

## 1. Product definition
A stateful, deterministic pre-draft board for NBA Talk VN - Serie A.

The product answers one operational question:

> Given the current keeper declarations, steal directions, and pre-draft pick trades, what exact 18 x 11 draft board does the league have?

It also allows users to fork an official state and change those inputs hypothetically.

The product is not an analysis/commentary dashboard.

## 2. Primary users
- League members: view the official state and play with scenarios.
- Operator: enter keeper/steal/trade inputs received from the league.
- Commissioner: supply inputs and verify the rendered state is correct. The commissioner is not expected to operate the tool.

## 3. Primary surface: 18 x 11 board
The main UI is the draft board.

- 18 columns, ordered by resolved R1 slot from 1.01 to 1.18.
- 11 rows, one per draft round.
- Every cell shows its exact pick number in the top-left.
- Each cell represents a resolved draft pick.
- Keepers occupy the picks they consume.
- Traded picks show current owner and origin.
- Open picks remain visibly open.

Example keeper cell:

    4.13
    ALEX SARR
    KEEPER
    R5 -> R4

Example traded open cell:

    6.10
    OPEN
    Owner: MNQA
    From: sup fam

## 4. Dynamic inputs that move the board

### 4.1 Keeper vs no keeper
A team's keeper declaration determines whether it enters the no-keeper R1 allocation bucket or keeper bucket.

Changing keeper status can move multiple teams, not just the edited team.

### 4.2 Steal Early vs Late
At the team's turn within its allocation bucket:
- Early takes the earliest remaining R1 slot.
- Late takes the latest remaining R1 slot.

Changing Early/Late can change the slots remaining for all teams resolved later.

### 4.3 Pre-draft pick trades
Pre-draft trades transfer round entitlements before exact numbered picks exist.

The entitlement is tied to the origin team and round.

After R1 slot resolution:
- each entitlement resolves into an exact numbered pick;
- current ownership is applied;
- the board displays both origin and current owner where they differ.

## 5. Keeper visualization
Selecting a team must expose its prior draft roster and keeper mechanics.

For each prior pick show:
- player;
- old round;
- whether finish-based rules permit the player;
- whether individual keeper-history rules permit the player;
- base keeper cost;
- resolved cost if selected;
- collision status if applicable.

Example:

    Alex Sarr
    old R5 -> base R4 -> resolved R4

Collision example:

    Player A
    old R7 -> base R6 -> resolved R6

    Player B
    old R8 -> base R6 -> collision -> resolved R5

## 6. Keeper entitlement visualization
The UI must make each team's finish-based keeper rule obvious.

Examples:
- 1st–3rd: up to 2, any round subject to other restrictions.
- 4th–7th: up to 2, original R2+.
- 8th–11th: either 1 from R2+ OR 2 from R3+.
- 12th–14th: 1 from R3+.
- 15th–16th: 1 from R4+.
- 17th–18th: none.

The special 8th–11th branch should be represented as an actual mode constraint, not prose users must remember.

## 7. Board versus team inventory
A resolved slot determines a team's natural snake geometry, but trades may cause actual owned picks to differ from the natural column.

Therefore:
- board columns represent resolved slot/origin geometry;
- each cell represents the exact pick and current owner;
- origin and current ownership remain separate fields.

A team-focused view/drawer may show actual owned picks by round, including additional acquired picks and traded-away native picks.

## 8. Working, Official, and Scenario states

### Working
Latest entered keeper/steal/trade inputs.
May include undeclared, unconfirmed, or unresolved teams.

### Official
A verified snapshot of league inputs and their deterministic resolved output.

The operator publishes it after the commissioner verifies correctness.

### Scenario
A fork of an Official state plus explicit overrides.

Scenario changes may include:
- different keeper selections;
- no-keeper vs keeper;
- Early/Late;
- hypothetical pre-draft trades.

Scenario changes never modify Official state.

The UI must always make Official versus Scenario obvious.

## 9. Scenario behavior
Every scenario mutation reruns the same full resolver used for Official state.

No special scenario-only rules.

A scenario may be invalid; if so, show factual validation errors instead of forcing a result.

Useful controls:
- Fork Scenario
- Reset to Official
- Duplicate
- Compare
- optionally share/export

## 10. Available player pool
The live player pool should reflect keeper occupancy.

Kept players are not available.

A simple player list may show:
- available players;
- kept players and owner.

Do not create artificial “keeper-adjusted rank” unless explicitly requested later.

## 11. Operator input UX
Data entry should be simple enough for a non-technical operator.

Per team:
- Keeper 1 selector
- Keeper 2 selector if permitted
- Steal Early/Late
- Entered/Confirmed state

Keeper selectors should show round mapping directly:

    Cooper Flagg   R2 -> R2
    Alex Sarr      R5 -> R4
    VJ Edgecombe   R7 -> R6

Trade entry:

    Team A sends: [Round entitlement]
    Team B sends: [Round entitlement]

The engine derives exact pick numbers later.

## 12. Validation
Hard validation should detect at minimum:
- too many keepers;
- player below team's permitted original-round threshold;
- more than one R1/R2 keeper;
- consecutive-year ineligible keeper;
- player not originally drafted by the team;
- keeper channel unavailable after trades;
- unresolved collision;
- duplicate entitlement ownership;
- duplicate R1 slot;
- missing R1 allocation for a fully declared team.

Working/scenario states may remain unresolved.
Official state must not silently contain hard conflicts.

## 13. Responsive behavior
Desktop:
- full 18 x 11 board;
- sticky team headers;
- sticky round labels;
- local horizontal scrolling;
- jump-to-team behavior.

Mobile:
- selected-team path is the default practical representation;
- full board may remain available in a local horizontal scroller.

## 14. Visual direction
Use the compact Yahoo-inspired visual language of the existing NBA Talk VN dynasty board:
- high information density;
- restrained surfaces;
- strong numeric hierarchy;
- state colors only where useful;
- no decorative dashboard KPI layer.

## 15. Non-goals for v1
- AI draft simulation;
- automated player recommendations;
- keeper EV scoring;
- authentication/accounts;
- commissioner workflow system;
- Discord automation;
- backend/database unless required by actual usage;
- generic trade valuation.
