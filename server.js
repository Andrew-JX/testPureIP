import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from 'undici';
import { buildDispatcher } from './src/proxy.js';
import { detectExitIp, basicInfo } from './src/checks/basic.js';
import { riskScores } from './src/checks/risk.js';
import { dnsblCheck } from './src/checks/dnsbl.js';
import { unlockChecks } from './src/checks/unlock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3210;
const HOST = process.env.HOST || '0.0.0.0';
// 部署在 Render / nginx / Cloudflare 等反代后面时设 TRUST_PROXY=1，才能拿到访客真实 IP
const TRUST_PROXY = /^(1|true)$/i.test(process.env.TRUST_PROXY || '');

// key 来源：环境变量优先（托管平台用），其次本地 config.json
function loadKeys() {
  let fileKeys = {};
  try {
    fileKeys = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')).keys || {};
  } catch {
    /* 无 config.json 时忽略 */
  }
  const envKeys = {
    abuseipdb: process.env.ABUSEIPDB_KEY,
    ipqs: process.env.IPQS_KEY,
    ipinfo: process.env.IPINFO_KEY,
    ipapiis: process.env.IPAPIIS_KEY,
    proxycheck: process.env.PROXYCHECK_KEY,
  };
  const merged = { ...fileKeys };
  for (const [k, v] of Object.entries(envKeys)) if (v) merged[k] = v;
  return merged;
}

function isPrivate(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip === 'localhost' || ip.startsWith('127.')) return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip) || /^f[cd]/i.test(ip)) return true;
  return false;
}

// 只有 TRUST_PROXY 开启时才信任转发头（反代环境）；否则用 socket 地址防伪造
function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const first = xff.split(',')[0].trim().replace(/^::ffff:/, '');
      if (first) return first;
    }
    const real = req.headers['x-real-ip'];
    if (real) return real.trim().replace(/^::ffff:/, '');
  }
  return (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

// 简易内存限流：每 IP 每分钟 40 次
const hits = new Map();
function rateLimit(req, res, next) {
  const key = clientIp(req);
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.start > 60_000) {
    hits.set(key, { start: now, count: 1 });
    return next();
  }
  if (rec.count >= 40) return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  rec.count++;
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > 120_000) hits.delete(k);
}, 120_000).unref();

const app = express();
if (TRUST_PROXY) app.set('trust proxy', true);
app.use(express.json());
app.use('/api', rateLimit);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  const keys = loadKeys();
  res.json({
    keys: Object.fromEntries(
      ['abuseipdb', 'ipqs', 'ipinfo', 'ipapiis', 'proxycheck'].map((k) => [k, Boolean(keys[k])])
    ),
  });
});

// 访客自己的真实出口 IP（公开站默认流程）。本地开发时退回服务器出口 IP。
app.post('/api/self', async (req, res) => {
  let ip = clientIp(req);
  if (isPrivate(ip)) {
    try {
      ip = await detectExitIp(new Agent({ connectTimeout: 8000 }));
    } catch {
      /* 保留原值 */
    }
  }
  res.json({ ip });
});

// 探测某个代理的出口 IP（高级：测其他地区 IP）
app.post('/api/exit-ip', async (req, res) => {
  let dispatcher;
  try {
    dispatcher = buildDispatcher(req.body?.proxy);
    res.json({ ip: await detectExitIp(dispatcher) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    dispatcher?.close?.();
  }
});

app.post('/api/basic', async (req, res) => {
  const { ip } = req.body || {};
  if (!ip) return res.status(400).json({ error: '缺少 ip' });
  res.json(await basicInfo(ip, loadKeys()));
});

app.post('/api/risk', async (req, res) => {
  const { ip, ipapiis } = req.body || {};
  if (!ip) return res.status(400).json({ error: '缺少 ip' });
  const basicResult = ipapiis ? { sources: { 'ipapi.is': ipapiis } } : null;
  res.json(await riskScores(ip, loadKeys(), basicResult));
});

app.post('/api/dnsbl', async (req, res) => {
  const { ip } = req.body || {};
  if (!ip) return res.status(400).json({ error: '缺少 ip' });
  res.json(await dnsblCheck(ip));
});

// AI/流媒体解锁实测（走指定代理；不填代理则测服务器出口，仅在高级模式使用）
app.post('/api/unlock', async (req, res) => {
  let dispatcher;
  try {
    dispatcher = buildDispatcher(req.body?.proxy);
    res.json(await unlockChecks(dispatcher));
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    dispatcher?.close?.();
  }
});

app.listen(PORT, HOST, () => {
  console.log(`IP 纯净度检测已启动: http://${HOST}:${PORT}`);
});
