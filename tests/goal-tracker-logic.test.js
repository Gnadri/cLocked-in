const assert = require('node:assert/strict');
const {
  getDailyTarget,
  isEntryComplete,
  shouldShowEntry
} = require('../goal-tracker-logic.js');

const checkoffGoal = { type: 'checkoff' };
assert.equal(isEntryComplete(checkoffGoal, false), false);
assert.equal(isEntryComplete(checkoffGoal, true), true);
assert.equal(shouldShowEntry('good', checkoffGoal, false), true);
assert.equal(shouldShowEntry('good', checkoffGoal, true), false);
assert.equal(shouldShowEntry('bad', checkoffGoal, true), true);
assert.equal(shouldShowEntry('bad', checkoffGoal, false), false);

const countableGoal = { type: 'countable', dailyTarget: 5 };
assert.equal(getDailyTarget(countableGoal), 5);
assert.equal(isEntryComplete(countableGoal, 4), false);
assert.equal(isEntryComplete(countableGoal, 5), true);
assert.equal(shouldShowEntry('good', countableGoal, 4), true);
assert.equal(shouldShowEntry('good', countableGoal, 5), false);
assert.equal(shouldShowEntry('bad', countableGoal, 5), true);
assert.equal(shouldShowEntry('bad', countableGoal, 4), false);

assert.equal(getDailyTarget({ type: 'countable', dailyTarget: 0 }), 1);

console.log('goal tracker timeline tests passed');
