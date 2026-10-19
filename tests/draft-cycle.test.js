import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import canonical from '../data/teams.json' with { type: 'json' };
import declarations from '../data/pre_draft.json' with { type: 'json' };
import { createPreDraftInput } from '../src/domain/pre-draft.js';
import { buildDraftCycle } from '../src/presentation/draft-cycle.js';

const input = () => createPreDraftInput(canonical, declarations);

test('a resolved draft cycle separates live picks from keeper decisions', () => {
  const cycle = buildDraftCycle(input());
  assert.equal(cycle.boardStatus, 'RESOLVED');
  assert.equal(cycle.board.length, 198);
  assert.equal(cycle.livePicks.length, 186);
  assert.equal(cycle.keeperPicks.length, 12);
  assert.equal(cycle.keeperDecisions.length, 12);
  assert.ok(cycle.livePicks.every((row) => row.status === 'OPEN' && row.keeper === null));
  assert.ok(cycle.keeperPicks.every((row) => row.status === 'KEEPER' && row.keeper?.playerId));
});

test('trade mapping retains pick origin and current owner', () => {
  const state = input();
  state.trades = [{ tradeId: 'test-pick-trade', status: 'CONFIRMED', transfers: [{
    originTeamId: 'sup-fam', round: 10, fromTeamId: 'sup-fam', toTeamId: 'angry-bird',
  }] }];
  const cycle = buildDraftCycle(state);
  const moved = cycle.tradedPicks.find((row) => row.originTeamId === 'sup-fam' && row.round === 10);
  assert.equal(moved.ownerTeamId, 'angry-bird');
  assert.equal(moved.originTeamId, 'sup-fam');
  assert.ok(cycle.livePicks.some((row) => row.pickNumber === moved.pickNumber));
  assert.equal(cycle.keeperPicks.length, 12);
});

test('incomplete declarations yield no fabricated live board', () => {
  const state = input();
  state.keeperSelections = state.keeperSelections.filter((row) => row.teamId !== 'sup-fam');
  const cycle = buildDraftCycle(state);
  assert.equal(cycle.boardStatus, 'PENDING');
  assert.equal(cycle.board.length, 0);
  assert.equal(cycle.livePicks.length, 0);
  assert.ok(cycle.validation.some((issue) => issue.severity === 'UNRESOLVED'));
});

test('current site entry does not initialize 2026 pre-draft scenarios', () => {
  const main = fs.readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  const seasonal = fs.readFileSync(new URL('../src/ui/render-season.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /pre_draft\.json|loadScenarios|resolveDraftState|serie-a\.scenarios\.v1/);
  assert.match(main, /import '\.\/season\.css'/);
  assert.doesNotMatch(main, /styles\.css/);
  assert.doesNotMatch(seasonal, /open-legacy|planning workspace/);
});
