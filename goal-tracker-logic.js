(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.GoalTrackerLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getDailyTarget(goal) {
    return Math.max(1, Number(goal && goal.dailyTarget) || 1);
  }

  function isEntryComplete(goal, value) {
    if (goal && goal.type === 'countable') {
      return (Number(value) || 0) >= getDailyTarget(goal);
    }

    return value === true;
  }

  function shouldShowEntry(mode, goal, value) {
    const isBadTimeline = mode === 'bad';
    return isEntryComplete(goal, value) === isBadTimeline;
  }

  return {
    getDailyTarget,
    isEntryComplete,
    shouldShowEntry
  };
});
