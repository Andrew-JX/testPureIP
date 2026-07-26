import test from 'node:test';
import assert from 'node:assert/strict';
import { createRiskHandler } from '../src/routes/risk.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('risk route ignores forged client evidence and uses server-owned basic data', async () => {
  const trustedBasic = { sources: { 'ipapi.is': { flags: { abuser: false, tor: false } } } };
  let scoredWith;
  const handler = createRiskHandler({
    loadBasic: async (ip) => {
      assert.equal(ip, '8.8.8.8');
      return trustedBasic;
    },
    scoreRisk: async (_ip, basic) => {
      scoredWith = basic;
      return { ok: true };
    },
  });
  const res = responseRecorder();

  await handler({
    body: { ip: '8.8.8.8', ipapiis: { flags: { abuser: true, tor: true } } },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.strictEqual(scoredWith, trustedBasic);
});

test('risk route rejects non-public addresses before loading evidence', async () => {
  let called = false;
  const handler = createRiskHandler({
    loadBasic: async () => { called = true; },
    scoreRisk: async () => ({ ok: true }),
  });
  const res = responseRecorder();

  await handler({ body: { ip: '127.0.0.1' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
  assert.match(res.body.error, /公网 IP/);
});
