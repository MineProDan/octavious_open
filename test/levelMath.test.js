const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLevelState, PRESTIGE_XP } = require('../utils/levelMath');

const thresholds = new Map([[0, 0], [1, 24], [2, 62], [3, 116], [49, 61994], [50, 65550]]);

test('computeLevelState keeps never-prestiged members at level 1 minimum', () => {
  assert.deepEqual(computeLevelState(0, thresholds), { prestige: 0, level: 1 });
  assert.deepEqual(computeLevelState(30, thresholds), { prestige: 0, level: 1 });
  assert.deepEqual(computeLevelState(62, thresholds), { prestige: 0, level: 2 });
});

test('computeLevelState matches /addxp and /removexp prestige math', () => {
  assert.deepEqual(computeLevelState(PRESTIGE_XP, thresholds), { prestige: 1, level: 0 });
  assert.deepEqual(computeLevelState(PRESTIGE_XP + 116, thresholds), { prestige: 1, level: 3 });
  assert.deepEqual(computeLevelState(PRESTIGE_XP * 2 + 70, thresholds), { prestige: 2, level: 2 });
});

test('computeLevelState tolerates missing or negative XP', () => {
  assert.deepEqual(computeLevelState(undefined, thresholds), { prestige: 0, level: 1 });
  assert.deepEqual(computeLevelState(-50, thresholds), { prestige: 0, level: 1 });
});
