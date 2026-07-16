import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
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
const PROBE_ONLY = /^(1|true)$/i.test(process.env.PROBE_ONLY || '');
const PROBE_REGION = (process.env.PROBE_REGION || '当前节点').slice(0, 32);
// 部署在 Render / nginx / Cloudflare 等反代后面时设 TRUST_PROXY=1，才能拿到访客真实 IP
const TRUST_PROXY = /^(1|true)$/i.test(process.env.TRUST_PROXY || '');
// 代理模式（/api/exit-ip、/api/unlock）会让服务器连接用户指定地址，存在 SSRF 风险，
// 默认仅在非反代（本地）环境开启；公开部署（TRUST_PROXY=1）默认关闭。可用 ENABLE_PROXY_MODE 显式覆盖。
const ENABLE_PROXY_MODE = process.env.ENABLE_PROXY_MODE
  ? /^(1|true)$/i.test(process.env.ENABLE_PROXY_MODE)
  : !TRUST_PROXY;

// 校验是否为合法 IP（IPv4 / IPv6），防止把任意字符串拼进第三方查询 URL
function isValidIp(ip) {
  return typeof ip === 'string' && ip.length >= 2 && ip.length <= 45 && isIP(ip) > 0;
}

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
    spamhausDqs: process.env.SPAMHAUS_DQS_KEY,
  };
  const merged = { ...fileKeys };
  for (const [k, v] of Object.entries(envKeys)) if (v) merged[k] = v;
  return merged;
}

function loadNetworkProbes() {
  const fallback = [{ id: 'local', label: PROBE_REGION, url: '' }];
  if (!process.env.NETWORK_PROBES_JSON) return fallback;
  try {
    const parsed = JSON.parse(process.env.NETWORK_PROBES_JSON);
    if (!Array.isArray(parsed)) return fallback;
    const probes = parsed.slice(0, 8).flatMap((item, index) => {
      if (!item || typeof item !== 'object') return [];
      const label = String(item.label || `节点 ${index + 1}`).slice(0, 32);
      const url = String(item.url || '').replace(/\/+$/, '');
      const secureUrl = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url);
      const localDevUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(url);
      if (url && !secureUrl && !localDevUrl) return [];
      return [{ id: String(item.id || `probe-${index + 1}`).slice(0, 32), label, url }];
    });
    return probes.length ? probes : fallback;
  } catch {
    return fallback;
  }
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

// 全局每分钟总量上限：兜住 XFF 伪造绕过单 IP 限流的情况，保护第三方 API 额度
const GLOBAL_MAX = Number(process.env.GLOBAL_MAX) || 300;
let globalWindow = { start: Date.now(), count: 0 };
function globalLimit(req, res, next) {
  const now = Date.now();
  if (now - globalWindow.start > 60_000) globalWindow = { start: now, count: 0 };
  if (globalWindow.count >= GLOBAL_MAX) {
    return res.status(429).json({ error: '服务繁忙，请稍后再试' });
  }
  globalWindow.count++;
  next();
}

// 下载测速比普通 JSON API 消耗更多带宽，单独收紧额度，避免公开站被当作流量源滥用。
const downloadHits = new Map();
let downloadGlobalWindow = { start: Date.now(), count: 0 };
function downloadLimit(req, res, next) {
  const now = Date.now();
  if (now - downloadGlobalWindow.start > 60_000) downloadGlobalWindow = { start: now, count: 0 };
  if (downloadGlobalWindow.count >= 120) return res.status(429).json({ error: '测速服务繁忙，请稍后重试' });

  const key = clientIp(req);
  const rec = downloadHits.get(key);
  if (!rec || now - rec.start > 60_000) downloadHits.set(key, { start: now, count: 1 });
  else {
    if (rec.count >= 8) return res.status(429).json({ error: '测速过于频繁，请稍后重试' });
    rec.count++;
  }
  downloadGlobalWindow.count++;
  next();
}

// 按 IP 缓存查询结果 10 分钟：同一 IP 反复检测不再重打第三方 API
const CACHE_TTL = 10 * 60_000;
const CACHE_MAX = 5000; // 上限，防攻击者用海量不同 IP 撑爆内存
const cache = new Map();
function cacheGet(key) {
  const rec = cache.get(key);
  if (rec && Date.now() - rec.at < CACHE_TTL) return rec.data;
  if (rec) cache.delete(key);
  return null;
}
function cacheSet(key, data) {
  if (cache.size >= CACHE_MAX) {
    // Map 保留插入顺序，删掉最旧的一批
    for (const k of [...cache.keys()].slice(0, Math.ceil(CACHE_MAX / 5))) cache.delete(k);
  }
  cache.set(key, { at: Date.now(), data });
}
// 带缓存执行：命中直接返回，否则计算并写入
async function cached(key, compute) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const data = await compute();
  cacheSet(key, data);
  return data;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > 120_000) hits.delete(k);
  for (const [k, v] of downloadHits) if (now - v.start > 120_000) downloadHits.delete(k);
  for (const [k, v] of cache) if (now - v.at > CACHE_TTL) cache.delete(k);
}, 120_000).unref();

const app = express();
if (TRUST_PROXY) app.set('trust proxy', true);
app.use(express.json());
app.use('/api', globalLimit, rateLimit);
if (PROBE_ONLY) {
  app.get('/', (req, res) => res.json({ service: 'PureIP network probe', region: PROBE_REGION }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/network/')) return next();
    return res.status(404).json({ error: 'probe-only service' });
  });
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

app.get('/api/config', (req, res) => {
  const keys = loadKeys();
  res.json({
    proxyMode: ENABLE_PROXY_MODE,
    networkProbes: loadNetworkProbes(),
    keys: Object.fromEntries(
      ['abuseipdb', 'ipqs', 'ipinfo', 'ipapiis', 'proxycheck'].map((k) => [k, Boolean(keys[k])])
    ),
  });
});

// 浏览器端网络稳定性探针。只访问本站，避免任意目标探测/SSRF；禁用缓存以确保每次都真实往返。
app.get('/api/network/ping', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Timing-Allow-Origin': '*',
    'Access-Control-Allow-Origin': '*',
    'X-PureIP-Region': encodeURIComponent(PROBE_REGION),
  });
  res.status(204).end();
});

// 只允许三个固定档位，兼顾渐进测速与带宽滥用防护。
const NETWORK_SAMPLES = new Map([
  [64 * 1024, Buffer.alloc(64 * 1024, 0x50)],
  [256 * 1024, Buffer.alloc(256 * 1024, 0x50)],
  [1024 * 1024, Buffer.alloc(1024 * 1024, 0x50)],
]);
app.get('/api/network/download', downloadLimit, (req, res) => {
  const requested = Number(req.query.bytes);
  const size = NETWORK_SAMPLES.has(requested) ? requested : 256 * 1024;
  const sample = NETWORK_SAMPLES.get(size);
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(sample.length),
    'Timing-Allow-Origin': '*',
    'Access-Control-Allow-Origin': '*',
    'X-PureIP-Region': encodeURIComponent(PROBE_REGION),
  });
  res.send(sample);
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

// 代理模式端点的统一守卫：公开部署默认关闭，防 SSRF / 被当开放代理滥用
function requireProxyMode(req, res, next) {
  if (!ENABLE_PROXY_MODE) {
    return res.status(403).json({ error: '代理模式在公开部署中已禁用（防 SSRF）；请在本地运行使用该功能' });
  }
  next();
}

// 探测某个代理的出口 IP（高级：测其他地区 IP）
app.post('/api/exit-ip', requireProxyMode, async (req, res) => {
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
  if (!isValidIp(ip)) return res.status(400).json({ error: '无效的 IP 地址' });
  res.json(await cached(`basic:${ip}`, () => basicInfo(ip, loadKeys())));
});

app.post('/api/risk', async (req, res) => {
  const { ip, ipapiis } = req.body || {};
  if (!isValidIp(ip)) return res.status(400).json({ error: '无效的 IP 地址' });
  const basicResult = ipapiis ? { sources: { 'ipapi.is': ipapiis } } : null;
  res.json(await cached(`risk:${ip}`, () => riskScores(ip, loadKeys(), basicResult)));
});

app.post('/api/dnsbl', async (req, res) => {
  const { ip } = req.body || {};
  if (!isValidIp(ip)) return res.status(400).json({ error: '无效的 IP 地址' });
  res.json(await cached(`dnsbl:${ip}`, () => dnsblCheck(ip, loadKeys().spamhausDqs)));
});

// AI/流媒体解锁实测（走指定代理；不填代理则测服务器出口，仅在高级模式使用）
app.post('/api/unlock', requireProxyMode, async (req, res) => {
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
