# Serie A Draft Board Bootstrap

This package contains the repo-native context needed to begin implementation with Codex.

Start Codex with `CODEX_TASK_001.md`.

Files:
- `AGENTS.md` — persistent project operating contract
- `docs/PRODUCT_SPEC.md` — settled product behavior
- `docs/LEAGUE_RULES.md` — league mechanics supported by source material
- `docs/DATA_MODEL.md` — canonical/derived state model
- `docs/OPEN_RULE_QUESTIONS.md` — rules that must not be silently assumed
- `data/teams.json` — 18-team prior-draft seed data
- `CODEX_TASK_001.md` — first bounded implementation task

Important:
The text source does not preserve prior-year red/ineligible keeper markings. Every player's consecutive-year keeper eligibility is intentionally seeded as `UNKNOWN` until that data is supplied.
