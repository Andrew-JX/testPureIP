import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDispatcher } from '../src/proxy.js';

test('builds direct, HTTP and SOCKS dispatchers with the upgraded dependencies', async () => {
  for (const value of ['', 'http://127.0.0.1:8080', 'socks5://user:pass@127.0.0.1:1080']) {
    const dispatcher = buildDispatcher(value);
    assert.equal(typeof dispatcher.dispatch, 'function', value || 'direct');
    await dispatcher.close?.();
  }
});

test('rejects unsupported proxy protocols', () => {
  assert.throws(() => buildDispatcher('ftp://127.0.0.1:21'), /不支持的代理协议/);
});
