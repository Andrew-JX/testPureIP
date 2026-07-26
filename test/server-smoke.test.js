import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitUntilReady(url, child, output) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode != null) throw new Error(`server exited early (${child.exitCode})\n${output.join('')}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The listener may not be ready yet.
    }
    await delay(100);
  }
  throw new Error(`server did not become ready\n${output.join('')}`);
}

test('server enforces public-IP validation and security headers', { timeout: 10_000 }, async (t) => {
  const port = await availablePort();
  const output = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  t.after(() => { if (child.exitCode == null) child.kill(); });

  const base = `http://127.0.0.1:${port}`;
  await waitUntilReady(`${base}/api/config`, child, output);

  const root = await fetch(`${base}/`);
  assert.equal(root.status, 200);
  assert.equal(root.headers.get('x-powered-by'), null);
  assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(root.headers.get('x-frame-options'), 'DENY');
  assert.equal(root.headers.get('referrer-policy'), 'no-referrer');
  const html = await root.text();
  assert.match(html, /四源地理/);
  assert.doesNotMatch(html, /五源地理/);

  const scenarios = await fetch(`${base}/scenarios.js`);
  assert.equal(scenarios.status, 200);
  assert.match(scenarios.headers.get('content-type') || '', /javascript/);

  const ipValidation = await fetch(`${base}/ip-validation.js`);
  assert.equal(ipValidation.status, 200);
  assert.match(ipValidation.headers.get('content-type') || '', /javascript/);

  const speedtestVendor = await fetch(`${base}/vendor/cloudflare-speedtest.js`);
  assert.equal(speedtestVendor.status, 200);

  const ping = await fetch(`${base}/api/network/ping`);
  assert.equal(ping.status, 204);

  const risk = await fetch(`${base}/api/risk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ip: '::1', ipapiis: { flags: { abuser: true, tor: true } } }),
  });
  assert.equal(risk.status, 400);
  assert.match((await risk.json()).error, /公网 IP/);

  const basic = await fetch(`${base}/api/basic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ip: '100.64.0.1' }),
  });
  assert.equal(basic.status, 400);
});
