const assert = require('node:assert/strict');
const {
  normalizeHostname,
  domainMatchesSite,
  getMatchingCollections,
  isUrlException,
  activityBlocksCollections
} = require('../site-matching.js');

assert.equal(normalizeHostname('https://www.X.com/home'), 'www.x.com');
assert.equal(normalizeHostname('*.x.com/*'), 'x.com');

assert.equal(domainMatchesSite('x.com', 'https://x.com/home'), true);
assert.equal(domainMatchesSite('www.x.com', 'x.com'), true);
assert.equal(domainMatchesSite('mobile.x.com', 'x.com'), true);
assert.equal(domainMatchesSite('notx.com', 'x.com'), false);
assert.equal(domainMatchesSite('x.com.evil.example', 'x.com'), false);

const collections = [
  { id: 'first', items: ['x.com'] },
  { id: 'blocked', items: ['https://www.x.com/home'] }
];
const matchingCollections = getMatchingCollections('x.com', collections);
assert.deepEqual(matchingCollections.map((collection) => collection.id), ['first', 'blocked']);

const runningTask = {
  blockedCategoryIds: ['blocked'],
  exceptions: []
};
assert.equal(
  activityBlocksCollections('https://x.com/home', matchingCollections, runningTask),
  true,
  'a task must block when any matching category is selected'
);
assert.equal(
  activityBlocksCollections('https://x.com/home', matchingCollections, { ...runningTask, isPaused: true }),
  false,
  'paused tasks must not block'
);

assert.equal(isUrlException('https://x.com/messages/123', 'x.com/messages'), true);
assert.equal(isUrlException('https://x.com/home', 'x.com/messages'), false);
assert.equal(isUrlException('https://evil.example/?next=x.com', 'x.com'), false);
assert.equal(
  activityBlocksCollections('https://x.com/messages', matchingCollections, {
    ...runningTask,
    exceptions: ['x.com/messages']
  }),
  false,
  'a matching exception must allow the URL'
);

console.log('site-matching tests passed');
