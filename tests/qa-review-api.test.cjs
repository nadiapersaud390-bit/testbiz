const assert = require('node:assert/strict');
const { parseTranscriptLines, normalizeQuote } = require('../js/qa-review-api.js');

const lines = parseTranscriptLines([
  '[00:12] Agent: Thanks for calling, how can I help?',
  '[00:18] Customer: Our annual revenue is under $200,000.',
  'Agent: I understand. I will continue.'
].join('\n'));

assert.equal(lines.length, 3);
assert.deepEqual(lines[0], {
  line: 1,
  timestamp: '00:12',
  reference: '00:12',
  speaker: 'Agent',
  text: 'Thanks for calling, how can I help?'
});
assert.equal(lines[1].speaker, 'Customer');
assert.equal(lines[1].reference, '00:18');
assert.equal(lines[2].reference, 'Line 3');
assert.equal(lines[2].text, 'I understand. I will continue.');
assert.equal(normalizeQuote('Caller said: “Under $200,000!”'), 'caller said under 200 000');
assert.deepEqual(parseTranscriptLines('   \n\t\n'), []);

console.log('QA review API: speaker labels, timestamps, line references, and transcript normalization passed.');
