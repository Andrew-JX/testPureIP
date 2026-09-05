import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyClaudeReachability } from '../src/checks/unlock.js';

const response = (status, extra = {}) => ({ status, url: 'https://claude.ai/', text: '', ...extra });

test('Claude check requires both the web app and official API path for a full pass', () => {
  assert.deepEqual(
    classifyClaudeReachability(response(200), response(401)),
    { status: 'yes', note: 'Claude 网页与官方 API 入口均可达（API 未携带凭据）' },
  );
  assert.equal(classifyClaudeReachability(response(200), response(0, { error: 'timeout' })).status, 'partial');
});

test('Claude check reports regional redirects and 403 without guessing the cause', () => {
  assert.equal(classifyClaudeReachability(
    response(200, { url: 'https://www.anthropic.com/app-unavailable-in-region' }),
    response(401),
  ).status, 'no');
  assert.match(classifyClaudeReachability(response(200), response(403)).note, /地区、登录状态或服务防护策略/);
});
