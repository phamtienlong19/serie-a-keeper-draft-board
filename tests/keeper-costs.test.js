import assert from "node:assert/strict";
import test from "node:test";

import { allocateKeeperCosts } from "../src/index.js";

function keeper(playerId, baseCostRound, oldRound) {
  return { playerId, playerName: playerId, baseCostRound, oldRound };
}

function roundsByPlayer(result) {
  return Object.fromEntries(
    result.assignments.map((assignment) => [assignment.playerId, assignment.resolvedCostRound]),
  );
}

test("keeper cost allocator preserves a no-collision base cost", () => {
  const result = allocateKeeperCosts([keeper("a", 6, 7), keeper("b", 4, 5)]);

  assert.deepEqual(roundsByPlayer(result), { b: 4, a: 6 });
  assert.deepEqual(result.collisions, []);
  assert.deepEqual(result.validation, []);
});

test("Edgecombe and George retain the authoritative R6/R5 assignment", () => {
  const result = allocateKeeperCosts([
    keeper("kyshawn-george", 6, 8),
    keeper("vj-edgecombe", 6, 7),
  ]);

  assert.deepEqual(roundsByPlayer(result), {
    "vj-edgecombe": 6,
    "kyshawn-george": 5,
  });
});

test("three identical base costs cascade across three unique rounds", () => {
  const result = allocateKeeperCosts([
    keeper("c", 6, 9),
    keeper("a", 6, 7),
    keeper("b", 6, 8),
  ]);

  assert.deepEqual(roundsByPlayer(result), { a: 6, b: 5, c: 4 });
  assert.deepEqual(result.occupiedRounds, [4, 5, 6]);
});

test("keeper cost allocation is independent of selection order", () => {
  const keepers = [keeper("a", 6, 7), keeper("b", 6, 8), keeper("c", 5, 6)];
  const forward = roundsByPlayer(allocateKeeperCosts(keepers));
  const reversed = roundsByPlayer(allocateKeeperCosts([...keepers].reverse()));

  assert.deepEqual(forward, reversed);
});

test("stable player ID breaks a same-round canonical tie", () => {
  const result = allocateKeeperCosts([
    keeper("z-player", 6, 8),
    keeper("a-player", 6, 8),
  ]);

  assert.deepEqual(roundsByPlayer(result), { "a-player": 6, "z-player": 5 });
});

test("a genuine base claim is reserved ahead of spillover", () => {
  const result = allocateKeeperCosts([
    keeper("base-six-first", 6, 7),
    keeper("base-six-second", 6, 8),
    keeper("base-five", 5, 6),
  ]);

  assert.deepEqual(roundsByPlayer(result), {
    "base-five": 5,
    "base-six-first": 6,
    "base-six-second": 4,
  });
});

test("multi-level collisions protect all genuine base claims", () => {
  const result = allocateKeeperCosts([
    keeper("base-seven", 7, 8),
    keeper("base-six-first", 6, 7),
    keeper("base-six-second", 6, 8),
    keeper("base-five", 5, 6),
  ]);

  assert.deepEqual(roundsByPlayer(result), {
    "base-five": 5,
    "base-six-first": 6,
    "base-six-second": 4,
    "base-seven": 7,
  });
  assert.equal(new Set(result.assignments.map((item) => item.resolvedCostRound)).size, 4);
  assert.ok(result.assignments.every((item) => item.resolvedCostRound <= item.baseCostRound));
});

test("collision provenance reports spill depth", () => {
  const result = allocateKeeperCosts([
    keeper("first", 6, 7),
    keeper("second", 6, 8),
    keeper("genuine-five", 5, 6),
  ]);
  const assignments = Object.fromEntries(result.assignments.map((item) => [item.playerId, item]));

  assert.equal(assignments.first.collisionDepth, 0);
  assert.equal(assignments.second.collisionDepth, 2);
  assert.equal(assignments["genuine-five"].collisionDepth, 0);
});

test("overflow past R1 returns structured validation", () => {
  const result = allocateKeeperCosts([
    keeper("first", 1, 1),
    keeper("second", 1, 2),
  ]);

  assert.equal(result.overflows.length, 1);
  assert.deepEqual(result.validation[0], {
    severity: "ERROR",
    code: "KEEPER_COST_COLLISION_OVERFLOW",
    message: "second cannot be assigned a keeper cost without moving earlier than R1.",
    playerId: "second",
    baseCostRound: 1,
  });
});
