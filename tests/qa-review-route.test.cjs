const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

process.env.OPENAI_API_KEY = 'test-provider-key';
process.env.QA_REVIEW_ACCESS_TOKEN = 'test-access-code-that-is-at-least-32-characters-long';

const { handleQAReviewApi } = require('../js/qa-review-api.js');
const transcript = '[00:18] Customer: Our annual revenue is under $200,000.\n[00:21] Agent: I will review the application.';
const providerDraft = {
  agentSpeaker: 'Agent',
  suggestedOutcome: 'Invalid',
  primaryReason: 'Under $200k revenue',
  summary: 'The transcript reports annual revenue below the threshold.',
  evidence: [{ timestamp: '00:18', quote: 'Our annual revenue is under $200,000.', rule: 'Revenue is below $200,000.' }],
  coachingTip: 'Confirm qualification before proceeding.',
  confidence: 0.92,
  limitations: ''
};

let providerCalls = 0;
global.fetch = async (url, options) => {
  providerCalls++;
  assert.equal(url, 'https://api.openai.com/v1/responses');
  const payload = JSON.parse(options.body);
  assert.equal(payload.store, false);
  assert.match(payload.input, /Our annual revenue is under \$200,000/);
  assert.doesNotMatch(payload.input, /Call Number|Customer Number/);
  return {
    ok: true,
    status: 200,
    json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(providerDraft) }] }] })
  };
};

async function sendRequest({ method = 'POST', path = '/api/qa/review', origin = 'https://qa.example.com', secure = true, token = process.env.QA_REVIEW_ACCESS_TOKEN, contentType = 'application/json', body = JSON.stringify({ transcript }) } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.headers = { host: 'qa.example.com', origin, 'x-forwarded-proto': secure ? 'https' : 'http' };
  req.headers.authorization = token ? 'Bearer ' + token : '';
  if (contentType) req.headers['content-type'] = contentType;
  req.socket = { encrypted: false };
  let statusCode;
  let responseBody = '';
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  const res = {
    writeHead(status, headers) { statusCode = status; this.headers = headers; },
    end(value) { responseBody = value || ''; finish(); }
  };
  assert.equal(handleQAReviewApi(req, res, new URL('https://qa.example.com' + path)), true);
  if (method === 'POST') req.end(body);
  await completed;
  return { statusCode, body: JSON.parse(responseBody) };
}

(async () => {
  const status = await sendRequest({ method: 'GET', path: '/api/qa/review/status' });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.ready, true);

  const badOrigin = await sendRequest({ origin: 'https://elsewhere.example.com' });
  assert.equal(badOrigin.statusCode, 403);
  const callsAfterOriginCheck = providerCalls;

  const badToken = await sendRequest({ token: 'incorrect-token' });
  assert.equal(badToken.statusCode, 401);
  assert.equal(providerCalls, callsAfterOriginCheck);

  const insecure = await sendRequest({ secure: false });
  assert.equal(insecure.statusCode, 400);
  const multipart = await sendRequest({ contentType: 'multipart/form-data; boundary=unused' });
  assert.equal(multipart.statusCode, 415);

  const valid = await sendRequest();
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.transcript, transcript);
  assert.equal(valid.body.draft.suggestedOutcome, 'Invalid');
  assert.equal(valid.body.draft.agentSpeaker, 'Agent');
  assert.equal(valid.body.draft.evidence[0].timestamp, '00:18');
  assert.equal(providerCalls, callsAfterOriginCheck + 1);

  console.log('QA review route: status, origin/auth/HTTPS checks, transcript-only requests, provider draft, and evidence validation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
