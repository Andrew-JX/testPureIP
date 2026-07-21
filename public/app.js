import { getLatestSpeedResult, initSpeedTest, setSpeedProbes } from './speedtest.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SCENARIOS = {
  ai: {
    label: 'AI 工具', noun: 'AI 工具', icon: 'AI',
    desc: '重点检查 IP 信誉、住宅属性、浏览器一致性和自动化特征。',
    weights: { reputation: 30, identity: 25, environment: 30, region: 5, network: 5, service: 5 },
  },
  browse: {
    label: '轻松上网', noun: '日常跨境浏览', icon: 'WEB',
    desc: '重点检查网页响应、抖动、失败率、带宽和线路可达性。',
    weights: { reputation: 15, identity: 10, environment: 10, region: 20, network: 40, service: 5 },
  },
  account: {
    label: '账号 / 邮箱', noun: '账号与邮箱登录', icon: 'ID',
    desc: '重点检查 IP 信誉、位置与浏览器环境是否像一个稳定的真实用户。',
    weights: { reputation: 25, identity: 20, environment: 30, region: 15, network: 10, service: 0 },
  },
  stream: {
    label: '看剧', noun: '流媒体观看', icon: '4K',
    desc: '重点检查目标地区、代理识别、解锁结果、稳定带宽和缓冲风险。',
    weights: { reputation: 10, identity: 10, environment: 5, region: 25, network: 30, service: 20 },
  },
  game: {
    label: '打游戏', noun: '游戏连接', icon: 'PING',
    desc: '重点检查目标区服延迟、负载延迟、抖动和请求失败率。',
    weights: { reputation: 5, identity: 5, environment: 0, region: 15, network: 70, service: 5 },
  },
};

const DIMENSION_LABELS = {
  reputation: '信誉与滥用', identity: '网络身份', environment: '环境一致性',
  region: '地区与可达性', network: '网络质量', service: '服务实测',
};

const appState = {
  scenario: 'ai', mode: 'self',
  streamService: 'netflix', streamRegion: 'US', streamQuality: '4k',
  gameRegion: 'singapore', gameStyle: 'competitive',
  networkProbes: [{ id: 'local', label: '当前节点', url: '' }],
};

// 国家二字码 -> 国旗 emoji
function flag(cc) {
  if (!cc || cc.length !== 2 || !/^[a-zA-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// 轻量浏览器指纹（canvas + webgl + 环境），返回稳定短哈希。非商业 FingerprintJS，仅演示。
function browserFingerprint() {
  const parts = [
    navigator.userAgent, navigator.language, (navigator.languages || []).join(','),
    screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    new Date().getTimezoneOffset(), navigator.hardwareConcurrency || '',
    navigator.deviceMemory || '', navigator.platform || '',
  ];
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('PureIP-fp😀', 2, 15);
    parts.push(c.toDataURL());
  } catch { /* ignore */ }
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) parts.push(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  } catch { /* ignore */ }
  // FNV-1a 32位
  let h = 0x811c9dc5;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setStatus(name, state) {
  const el = document.querySelector(`.status[data-for="${name}"]`);
  if (!el) return;
  el.className = 'status' + (state === 'loading' ? ' loading' : state === 'error' ? ' error' : '');
  el.textContent = state === 'error' ? '失败' : state === 'done' ? '✓' : '';
}

/* ---------- 基础信息 ---------- */

function renderBasic(data) {
  const rows = Object.entries(data.sources).map(([src, s]) => {
    if (s.error) return `<tr><th>${esc(src)}</th><td colspan="5" class="dim">错误: ${esc(s.error)}</td></tr>`;
    if (s.skipped) return `<tr><th>${esc(src)}</th><td colspan="5" class="dim">${esc(s.skipped)}</td></tr>`;
    const flags = [];
    const f = s.flags || {};
    if (f.hosting || f.datacenter) flags.push('<span class="tag bad">机房</span>');
    if (f.proxy) flags.push('<span class="tag bad">代理</span>');
    if (f.vpn) flags.push('<span class="tag warn">VPN</span>');
    if (f.tor) flags.push('<span class="tag bad">Tor</span>');
    if (f.abuser) flags.push('<span class="tag bad">滥用记录</span>');
    if (f.mobile) flags.push('<span class="tag good">移动网络</span>');
    if (s.companyType === 'isp') flags.push('<span class="tag good">ISP</span>');
    if (s.companyType === 'hosting') flags.push('<span class="tag bad">hosting</span>');
    const fl = s.countryCode ? flag(s.countryCode) + ' ' : '';
    return `<tr>
      <th>${esc(src)}</th>
      <td>${fl}${esc(s.country || '')}${s.region ? ' · ' + esc(s.region) : ''}${s.city ? ' · ' + esc(s.city) : ''}</td>
      <td class="mono">${esc(s.asn || '')}</td>
      <td>${esc(s.isp || s.org || '')}</td>
      <td class="mono">${esc(s.rdns || s.timezone || '')}</td>
      <td>${flags.join('') || '<span class="dim">—</span>'}</td>
    </tr>`;
  });
  $('basicBody').innerHTML = `<div class="table-scroll"><table>
    <tr><th>数据源</th><th>位置</th><th>ASN</th><th>ISP / 组织</th><th>rDNS / 时区</th><th>标记</th></tr>
    ${rows.join('')}</table></div>`;
}

/* ---------- IP 详情（身份证式关键字段） ---------- */

// 综合各源判定 IP 属性（住宅 / 机房 / 移动 / 商业 …）
function deriveIpType(basic) {
  const s = basic?.sources?.['ipapi.is'] || {};
  const com = basic?.sources?.['ip-api.com']?.flags || {};
  const f = s.flags || {};
  if (f.tor) return { label: 'Tor 出口', cls: 'bad' };
  if (f.hosting || f.datacenter || com.hosting || s.companyType === 'hosting') return { label: '机房 IP', cls: 'bad' };
  if (f.mobile || com.mobile || s.companyType === 'mobile') return { label: '移动网络 IP', cls: 'good' };
  if (s.companyType === 'isp') return { label: '住宅 IP（家庭宽带）', cls: 'good' };
  if (s.companyType === 'business') return { label: '商业 IP', cls: 'warn' };
  if (s.companyType === 'education') return { label: '教育网 IP', cls: 'dim' };
  return { label: '未知类型', cls: 'dim' };
}

function renderDetail(ip, basic, agent) {
  const s = basic?.sources?.['ipapi.is'] || {};
  const com = basic?.sources?.['ip-api.com'] || {};
  const type = deriveIpType(basic);
  const cc = s.countryCode || com.countryCode || '';
  const loc = [flag(cc), s.country || com.country, s.region || com.region, s.city || com.city]
    .filter(Boolean).join(' · ');
  const asn = s.asn || com.asn || '';
  const isp = s.isp || com.isp || com.org || '';
  const meta = agent?.meta || {};
  const hasBrowserContext = Boolean(agent?.meta);

  // 附加标记
  const tags = [];
  const f = s.flags || {};
  if (f.proxy) tags.push('<span class="tag bad">代理</span>');
  if (f.vpn) tags.push('<span class="tag warn">VPN</span>');
  if (f.abuser) tags.push('<span class="tag bad">滥用记录</span>');

  const rtc = !hasBrowserContext
    ? '<span class="dim">指定 IP 模式无法检测</span>'
    : meta.rtcLeak
    ? `<span class="bad">${esc((meta.leakedPublic || []).join(', '))}（与出口不一致，已泄漏真实 IP！）</span>`
    : meta.leakedPublic?.length
      ? `<span class="warn">${esc(meta.leakedPublic.join(', '))}（与出口一致）</span>`
      : '<span class="good">未泄漏</span>';

  const rows = [
    ['IP 地址', `<span class="mono big">${esc(ip)}</span>`],
    ['IP 属性', `<span class="tag ${type.cls}">${esc(type.label)}</span> ${tags.join(' ')}`],
    ['ASN', `<span class="mono">${esc(asn)}</span>${isp ? ' · ' + esc(isp) : ''}`],
    ['AS 域名', s.asDomain ? `<span class="mono">${esc(s.asDomain)}</span>` : '<span class="dim">—</span>'],
    ['IP 网段', s.network ? `<span class="mono">${esc(s.network)}</span>` : (s.route ? `<span class="mono">${esc(s.route)}</span>` : '<span class="dim">—</span>')],
    ['路由前缀', s.route ? `<span class="mono">${esc(s.route)}</span>` : '<span class="dim">—</span>'],
    ['位置', esc(loc) || '<span class="dim">—</span>'],
    ['rDNS', com.rdns ? `<span class="mono">${esc(com.rdns)}</span>` : '<span class="dim">无</span>'],
    ['滥用评分', s.abuserScore ? esc(s.abuserScore) : '<span class="dim">—</span>'],
    ['浏览器指纹', hasBrowserContext
      ? `<span class="mono">${esc(meta.fingerprint)}</span> <span class="dim">（本机浏览器画像）</span>`
      : '<span class="dim">指定 IP 模式无法检测</span>'],
    ['WebRTC 泄漏', rtc],
  ];

  $('detailBody').innerHTML = `<div class="kv-grid">${rows.map(([k, v]) =>
    `<div class="kv"><div class="kv-k">${esc(k)}</div><div class="kv-v">${v}</div></div>`).join('')}</div>`;
}

/* ---------- 风险评分 ---------- */

function barClass(score) { return score <= 25 ? 'good' : score <= 60 ? 'warn' : 'bad'; }

function renderRisk(data) {
  const rows = [];
  const add = (label, score, extra) => {
    if (score == null) return;
    rows.push(`<div class="bar-row">
      <div class="bar-label">${esc(label)}</div>
      <div class="bar-track"><div class="bar-fill ${barClass(score)}" style="width:${Math.max(score, 3)}%"></div></div>
      <div class="bar-val">${score}/100${extra ? ' · ' + esc(extra) : ''}</div>
    </div>`);
  };
  const notes = [];
  const p = data.proxycheck;
  if (p.score != null) {
    const tags = [p.proxy && '代理', p.vpn && 'VPN', p.type].filter(Boolean).join(',');
    add('ProxyCheck.io', p.score, tags);
  } else if (p.error) notes.push(`ProxyCheck: ${p.error}`);

  const a = data.abuseipdb;
  if (a.score != null) add('AbuseIPDB', a.score, `${a.totalReports ?? 0} 次举报`);
  else notes.push(`AbuseIPDB: ${a.skipped || a.error}`);

  const q = data.ipqs;
  if (q.score != null) {
    const f = q.flags || {};
    const tags = [f.proxy && '代理', f.vpn && 'VPN', f.tor && 'Tor', f.recentAbuse && '近期滥用', q.sharedConnection && '共享出口'].filter(Boolean).join(',');
    add('IPQualityScore', q.score, tags || q.connectionType);
  } else notes.push(`IPQS: ${q.skipped || q.error}`);

  if (data.ipapiis?.score != null) add('ipapi.is 滥用信誉', data.ipapiis.score);

  let idbHtml = '';
  const idb = data.internetdb;
  if (idb) {
    if (idb.error) notes.push(`InternetDB: ${idb.error}`);
    else if (idb.clean) idbHtml = `<div style="margin-top:10px"><span class="tag good">Shodan 暴露面: 无开放端口/漏洞记录</span></div>`;
    else {
      const bits = [];
      if (idb.ports.length) bits.push(`<span class="tag ${proxyPorts(idb.ports) ? 'bad' : 'warn'}">开放端口: ${idb.ports.join(', ')}${proxyPorts(idb.ports) ? '（含代理特征端口！）' : ''}</span>`);
      if (idb.tags.length) bits.push(`<span class="tag ${/proxy|vpn/i.test(idb.tags.join()) ? 'bad' : 'dim'}">标签: ${esc(idb.tags.join(', '))}</span>`);
      if (idb.vulns.length) bits.push(`<span class="tag bad">已知漏洞: ${esc(idb.vulns.join(', '))}</span>`);
      idbHtml = `<div style="margin-top:10px">Shodan 暴露面: ${bits.join(' ')}</div>`;
    }
  }

  $('riskBody').innerHTML =
    (rows.join('') || '<span class="dim">无可用风险源</span>') + idbHtml +
    (notes.length ? `<div class="dim" style="margin-top:8px;font-size:12px">${notes.map(esc).join(' · ')}</div>` : '');
}

function proxyPorts(ports) {
  return ports.some((p) => [1080, 3128, 8080, 8118, 9050, 1194, 51820].includes(p));
}

/* ---------- DNS 黑名单 ---------- */

function renderDnsbl(data) {
  if (!data.supported) { $('dnsblBody').innerHTML = `<span class="dim">${esc(data.note)}</span>`; return; }
  const tags = data.lists.map((l) => {
    const cls = l.status === 'clean' ? 'good' : l.status === 'listed' ? 'bad' : 'dim';
    const label = l.status === 'clean' ? '干净' : l.status === 'listed' ? '命中' : '未知';
    return `<span class="tag ${cls}" title="${esc(l.note || '')}">${esc(l.name)}: ${label}</span>`;
  });
  const total = data.total ?? data.lists.length;
  const lowCoverage = data.checkedCount < 3;
  const summary = data.listedCount > 0
    ? `<span class="tag bad">命中 ${data.listedCount} 个黑名单 — 该 IP 有滥用历史</span>`
    : lowCoverage
      ? `<span class="tag warn">仅 ${data.checkedCount}/${total} 个库有效应答，覆盖不足，结果仅供参考</span>`
      : `<span class="tag good">未命中黑名单（${data.checkedCount}/${total} 个库有效查询）</span>`;
  $('dnsblBody').innerHTML = `<div style="margin-bottom:8px">${summary}</div>${tags.join(' ')}`;
}

/* ---------- 解锁实测（仅高级/代理模式） ---------- */

const UNLOCK_NAMES = {
  claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini', netflix: 'Netflix',
  youtubePremium: 'YouTube Premium', disneyPlus: 'Disney+', tiktok: 'TikTok',
};

function renderUnlock(data) {
  const items = Object.entries(data).map(([key, v]) => {
    const cls = { yes: 'good', partial: 'warn', no: 'bad' }[v.status] || 'dim';
    const label = { yes: '✓ 可用', partial: '◐ 部分', no: '✗ 不可用' }[v.status] || '? 未知';
    return `<div class="unlock-item">
      <div class="name">${UNLOCK_NAMES[key] || key} <span class="tag ${cls}">${label}${v.region ? ' · ' + esc(v.region) : ''}</span></div>
      <div class="note">${esc(v.note || '')}</div>
    </div>`;
  });
  $('unlockBody').innerHTML = `<div class="unlock-grid">${items.join('')}</div>`;
}

/* ---------- 网络稳定性（空闲 + 负载 + 区域节点） ---------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

async function timedFetch(url, timeout = 3500, readBody = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = performance.now();
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    const bytes = readBody ? (await res.arrayBuffer()).byteLength : 0;
    return { ok: true, rtt: performance.now() - started, bytes, res };
  } catch (error) {
    return { ok: false, rtt: null, bytes: 0, error };
  } finally {
    clearTimeout(timer);
  }
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarizeSamples(samples, total = samples.length) {
  const rtts = samples.filter((sample) => sample.ok).map((sample) => sample.rtt);
  if (!rtts.length) return { available: false, rtts: [], success: 0, total, loss: 100 };
  const jitter = rtts.length < 2 ? 0 : average(rtts.slice(1).map((value, index) => Math.abs(value - rtts[index])));
  return {
    available: true, rtts, success: rtts.length, total,
    avg: average(rtts), min: Math.min(...rtts), p95: percentile(rtts, 0.95), jitter,
    loss: ((total - rtts.length) / total) * 100,
  };
}

async function sampleLatency(baseUrl = '', count = 8, spacing = 180, phase = 'idle') {
  const base = baseUrl.replace(/\/$/, '');
  const calls = Array.from({ length: count }, (_, index) =>
    wait(index * spacing).then(() => timedFetch(`${base}/api/network/ping?t=${Date.now()}-${phase}-${index}`))
  );
  return summarizeSamples(await Promise.all(calls), count);
}

function networkScore(avg, jitter, loss, loadedAvg = avg) {
  const latencyPenalty = avg <= 70 ? 0 : Math.min(25, (avg - 70) / 7);
  const jitterPenalty = jitter <= 10 ? 0 : Math.min(25, (jitter - 10) * 1.1);
  const loadedPenalty = loadedAvg <= avg + 60 ? 0 : Math.min(25, (loadedAvg - avg - 60) / 8);
  return Math.max(0, Math.round(100 - latencyPenalty - jitterPenalty - loadedPenalty - loss * 0.5));
}

async function measureRegionalProbes(localSummary) {
  return Promise.all(appState.networkProbes.map(async (probe) => {
    if (!probe.url) return { ...probe, ...localSummary, score: networkScore(localSummary.avg, localSummary.jitter, localSummary.loss) };
    const summary = await sampleLatency(probe.url, 5, 160, probe.id);
    return { ...probe, ...summary, score: summary.available ? networkScore(summary.avg, summary.jitter, summary.loss) : 0 };
  }));
}

async function measureNetwork() {
  const idle = await sampleLatency('', 10, 180, 'idle');
  if (!idle.available) throw new Error('所有网络探针均失败，请检查连接后重试');

  const loadStarted = performance.now();
  const downloads = [0, 1, 2].map((index) =>
    timedFetch(`/api/network/download?bytes=1048576&t=${Date.now()}-${index}`, 12000, true)
  );
  const loadedPromise = sampleLatency('', 8, 130, 'loaded');
  const [downloadResults, loaded] = await Promise.all([Promise.all(downloads), loadedPromise]);
  const loadSeconds = (performance.now() - loadStarted) / 1000;
  const totalBytes = downloadResults.reduce((sum, item) => sum + item.bytes, 0);
  const downloadMbps = totalBytes && loadSeconds > 0 ? (totalBytes * 8) / loadSeconds / 1_000_000 : null;
  const loadedAvg = loaded.available ? loaded.avg : idle.avg;
  const regions = await measureRegionalProbes(idle);

  return {
    score: networkScore(idle.avg, idle.jitter, idle.loss, loadedAvg),
    avg: idle.avg, jitter: idle.jitter, loss: idle.loss, min: idle.min, p95: idle.p95,
    success: idle.success, total: idle.total, downloadMbps, rtts: idle.rtts,
    loadedAvg, loadedJitter: loaded.jitter ?? null, regions,
  };
}

function renderNetwork(data) {
  const cls = data.score >= 90 ? 'good' : data.score >= 70 ? 'warn' : 'bad';
  const grade = data.score >= 90 ? '稳定' : data.score >= 75 ? '良好' : data.score >= 55 ? '一般' : '不稳定';
  const max = Math.max(1, ...data.rtts);
  const bars = data.rtts.map((value) =>
    `<i style="height:${Math.max(8, Math.round(value / max * 100))}%" title="${Math.round(value)} ms"></i>`
  ).join('');
  const speed = data.downloadMbps == null ? '测试失败' : `${data.downloadMbps.toFixed(1)} Mbps`;
  const regions = (data.regions || []).map((region) => region.available
    ? `<div class="region-probe"><span>${esc(region.label)}</span><b>${Math.round(region.avg)} ms</b><small>抖动 ${Math.round(region.jitter)} ms</small></div>`
    : `<div class="region-probe unavailable"><span>${esc(region.label)}</span><b>不可达</b><small>未计入评分</small></div>`
  ).join('');
  $('networkBody').innerHTML = `
    <div class="network-head">
      <div class="network-score ${cls}">${data.score}<span>/100</span></div>
      <div><div class="network-grade ${cls}">${grade}</div><div class="dim">空闲与负载双阶段采样 · ${data.success}/${data.total} 次成功</div></div>
    </div>
    <div class="network-metrics">
      <div><b>${Math.round(data.avg)} ms</b><span>空闲延迟</span></div>
      <div><b>${Math.round(data.loadedAvg)} ms</b><span>负载延迟</span></div>
      <div><b>${Math.round(data.jitter)} ms</b><span>空闲抖动</span></div>
      <div><b class="${data.loss > 0 ? 'bad' : ''}">${data.loss.toFixed(1)}%</b><span>HTTP 失败率</span></div>
      <div><b>${Math.round(data.p95)} ms</b><span>P95 延迟</span></div>
      <div><b>${speed}</b><span>并发下载</span></div>
    </div>
    <div class="latency-chart" aria-label="延迟采样图">${bars}</div>
    ${regions ? `<div class="region-title">区域节点</div><div class="region-probes">${regions}</div>` : ''}
    <div class="network-note dim">HTTP 失败率是网页体验层近似值，不等同于 ICMP 丢包；休眠中的免费区域节点首次请求可能包含冷启动时间。</div>`;
}

function renderNetworkUnavailable() {
  setStatus('network', 'done');
  $('networkBody').innerHTML = '<div class="unavailable-panel"><b>指定 IP 无法实测网络质量</b><span>延迟、抖动和带宽属于“你到目标节点的链路”，只输入一个 IP 无法从浏览器代替它发起连接。切换到“当前网络”可完整测试。</span></div>';
}

let networkRunning = false;
async function runNetworkStability() {
  if (appState.mode === 'manual') { renderNetworkUnavailable(); return null; }
  if (networkRunning) return null;
  networkRunning = true;
  $('rerunNetwork').disabled = true;
  setStatus('network', 'loading');
  $('networkBody').innerHTML = '<span class="dim">正在进行空闲、负载与区域采样，约需 6–15 秒…</span>';
  try {
    const result = await measureNetwork();
    renderNetwork(result);
    setStatus('network', 'done');
    return result;
  } catch (e) {
    setStatus('network', 'error');
    $('networkBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`;
    return null;
  } finally {
    networkRunning = false;
    $('rerunNetwork').disabled = false;
  }
}

/* ---------- AI Agent 可用性检测（客户端指纹 + IP 侧信号） ---------- */

function detectChineseFont() {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '32px monospace';
    const base = ctx.measureText('测试字体').width;
    let hits = 0;
    for (const font of ['Microsoft YaHei', 'SimSun', 'SimHei', 'PingFang SC']) {
      ctx.font = `32px "${font}", monospace`;
      if (ctx.measureText('测试字体').width !== base) hits++;
    }
    return hits;
  } catch { return -1; }
}

// WebRTC 探测本地/公网 IP 泄漏（代理没关 WebRTC 时会暴露真实 IP）
function webrtcProbe(timeout = 3500) {
  return new Promise((resolve) => {
    const ips = new Set();
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    } catch { return resolve({ supported: false, ips: [] }); }
    const done = () => { try { pc.close(); } catch {} resolve({ supported: true, ips: [...ips] }); };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return done();
      const m = e.candidate.candidate.match(/([0-9]{1,3}(?:\.[0-9]{1,3}){3})|([a-f0-9]{1,4}(?::[a-f0-9]{1,4}){7})/i);
      if (m) ips.add(m[0]);
    };
    pc.createDataChannel('x');
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => done());
    setTimeout(done, timeout);
  });
}

// 只对 IPv4 判断是否公网；IPv6 / mDNS(.local) 候选忽略
function isPublicIp(ip) {
  if (!ip || ip.split('.').length !== 4) return false;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^127\./.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip)) return false;
  return true;
}

async function analyzeAgent(exitIp, basic) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset() / 60;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const langs = navigator.languages?.join(', ') || navigator.language;
  const cnFonts = detectChineseFont();
  const webdriver = navigator.webdriver === true;
  const rtc = await webrtcProbe();

  // IP 侧地理信息（来自基础信息接口）
  const ipapi = basic?.sources?.['ip-api.com'] || {};
  const ipTz = ipapi.timezone || basic?.sources?.['ipapi.is']?.timezone || '';
  const ipapiFlags = basic?.sources?.['ipapi.is']?.flags || {};
  const ipComFlags = ipapi.flags || {};

  const leakedPublic = rtc.ips.filter(isPublicIp);
  const rtcLeak = leakedPublic.some((ip) => exitIp && ip !== exitIp);

  // 逐项信号评估：penalty 越大越危险；advice = 给用户的可操作建议（仅 bad/warn 需要）
  const signals = [];
  const push = (label, level, penalty, detail, advice) => signals.push({ label, level, penalty, detail, advice });

  // 时区 / IP 地理一致性
  if (ipTz && tz) {
    const sameRegion = ipTz.split('/')[0] === tz.split('/')[0];
    if (!sameRegion) push('时区与 IP 地理不一致', 'bad', 25, `浏览器 ${tz} vs IP ${ipTz}`,
      '你的系统时区暴露了真实位置，和代理 IP 对不上，AI 服务会怀疑你在用代理。建议把系统 / 浏览器时区改成与 IP 同一地区。');
    else push('时区与 IP 地理一致', 'good', 0, tz);
  } else {
    push('系统时区', 'dim', 0, tz);
  }

  // 语言 / 中文特征（AI 服务对中国大陆环境更敏感）
  if (/^zh-CN|zh-Hans/i.test(navigator.language)) push('首选语言为简体中文', 'warn', 12, langs,
    '浏览器首选语言是简体中文，可能略微增加相关风控。可在浏览器设置里把英文调到语言列表最前面。');
  else push('浏览器语言', 'good', 0, langs);
  if (cnFonts >= 2) push('检测到多种中文字体', 'warn', 8, `${cnFonts}/4`,
    '系统装有多种中文字体，是中国大陆环境的弱特征。影响很小，一般可忽略。');

  // WebRTC 泄漏
  if (!rtc.supported) push('WebRTC 不可用/被禁用', 'good', 0, '无泄漏面');
  else if (rtcLeak) push('WebRTC 泄漏了不同的公网 IP', 'bad', 30, leakedPublic.join(', '),
    '严重：浏览器通过 WebRTC 暴露了你的真实 IP，代理形同虚设，网站能直接看到你在哪。建议在浏览器禁用 WebRTC（装 “WebRTC Control / Leak Prevent” 类插件），或换用能阻断 WebRTC 的客户端。');
  else if (leakedPublic.length) push('WebRTC 暴露公网 IP（与出口一致）', 'warn', 8, leakedPublic.join(', '),
    '目前泄漏的 IP 和出口一致，风险不大；但换到别的代理时要复查这一项，避免泄漏真实 IP。');
  else push('WebRTC 无公网 IP 泄漏', 'good', 0, rtc.ips.length ? '仅本地/mDNS 候选' : '无候选');

  // 自动化 / Agent 指纹
  if (webdriver) push('navigator.webdriver = true（自动化环境）', 'bad', 20, '易被判定为 bot',
    '检测到自动化 / 无头浏览器特征，极易被判定为机器人。请用正常浏览器访问 AI 服务。');
  else push('无自动化标志', 'good', 0, 'navigator.webdriver = false');

  // IP 侧风险（决定 AI 服务是否直接拒绝该出口）
  if (ipComFlags.hosting || ipapiFlags.datacenter) push('IP 为机房/数据中心', 'bad', 28, 'AI 服务常直接拦截机房 IP',
    '机房 IP 最容易被 AI 服务直接拦截。建议改用住宅（家庭宽带）或移动网络 IP。');
  if (ipapiFlags.proxy || ipComFlags.proxy) push('IP 被标记为代理', 'bad', 22, '',
    '这个 IP 已被情报库标记为代理 / 中转，风控概率高。建议更换为未被标记的住宅 IP。');
  if (ipapiFlags.vpn) push('IP 被标记为 VPN', 'warn', 12, '',
    '这个 IP 属于 VPN 段，部分服务会限制。若频繁触发验证码，考虑换住宅 IP。');
  if (ipapiFlags.tor) push('IP 为 Tor 出口', 'bad', 40, '',
    'Tor 出口几乎必被 AI 服务封禁，请勿用于登录。');
  if (ipapiFlags.abuser) push('IP 有滥用记录', 'bad', 25, '',
    '这个 IP 有滥用历史（可能被前一个用户滥用过），建议更换。');

  const totalPenalty = signals.reduce((s, x) => s + x.penalty, 0);
  const score = Math.max(0, 100 - totalPenalty);
  const verdict =
    score >= 80 ? { grade: '友好', cls: 'good' } :
    score >= 55 ? { grade: '一般', cls: 'warn' } :
    { grade: '高风险', cls: 'bad' };

  return {
    score, verdict, signals,
    meta: { tz, offset, locale, langs, cnFonts, ipTz, fingerprint: browserFingerprint(), rtcLeak, leakedPublic },
  };
}

function renderAgent(agent) {
  const { score, verdict, signals, meta } = agent;
  const rows = signals.map((s) => {
    const icon = { good: '✓', warn: '△', bad: '✗', dim: '·' }[s.level] || '·';
    const advice = (s.level === 'bad' || s.level === 'warn') && s.advice
      ? `<div class="signal-advice">${esc(s.advice)}</div>` : '';
    return `<div class="signal ${s.level}">
      <div class="signal-main">
        <span class="signal-icon">${icon}</span>
        <span class="signal-label">${esc(s.label)}</span>
        ${s.detail ? `<span class="signal-detail mono dim">${esc(s.detail)}</span>` : ''}
      </div>
      ${advice}
    </div>`;
  });
  $('agentBody').innerHTML = `
    <div class="agent-head">
      <div class="agent-score ${verdict.cls}">${score}<span>/100</span></div>
      <div>
        <div class="agent-grade ${verdict.cls}">AI Agent ${verdict.grade}</div>
        <div class="dim" style="font-size:12px">综合浏览器指纹 + IP 侧信号，评估 Claude / ChatGPT 等 AI 服务是否会拦截或风控此环境</div>
      </div>
    </div>
    <div class="signal-list">${rows.join('')}</div>`;
}

/* ---------- 场景化证据、评分与结论 ---------- */

function getPrimaryCountry(basic) {
  const sources = basic?.sources || {};
  const source = [sources['ipapi.is'], sources['ip-api.com'], sources['ipwho.is'], sources['ipinfo Lite']]
    .find((item) => item && !item.error && item.countryCode) || {};
  return String(source.countryCode || '').toUpperCase();
}

function getCountryAgreement(basic) {
  const countries = Object.values(basic?.sources || {})
    .filter((source) => source && !source.error && source.countryCode)
    .map((source) => String(source.countryCode).toUpperCase());
  if (!countries.length) return null;
  const counts = countries.reduce((map, country) => map.set(country, (map.get(country) || 0) + 1), new Map());
  return Math.round(Math.max(...counts.values()) / countries.length * 100);
}

function dnsblCleanScore(dnsbl) {
  if (!dnsbl?.supported) return null;
  if (dnsbl.listedCount >= 2) return 10;
  if (dnsbl.listedCount === 1) return 45;
  const checked = dnsbl.checkedCount ?? 0;
  return checked >= 5 ? 100 : checked >= 3 ? 88 : checked >= 1 ? 75 : 55;
}

function reputationScore(risk, dnsbl) {
  const scores = [risk?.proxycheck?.score, risk?.abuseipdb?.score, risk?.ipqs?.score, risk?.ipapiis?.score]
    .filter((value) => typeof value === 'number');
  let clean = scores.length ? 100 - average(scores) : null;
  const idb = risk?.internetdb;
  if (clean != null && idb && !idb.error && !idb.clean) {
    if (proxyPorts(idb.ports || []) || /proxy|vpn/i.test((idb.tags || []).join())) clean -= 35;
    else if (idb.vulns?.length) clean -= 15;
  }
  const blacklist = dnsblCleanScore(dnsbl);
  if (clean == null) return blacklist;
  if (blacklist == null) return Math.max(0, clean);
  return Math.max(0, clean * 0.75 + blacklist * 0.25);
}

function identityScore(basic) {
  if (!basic?.sources) return null;
  let score = 100;
  const rawSource = basic.sources['ipapi.is'];
  const rawCommon = basic.sources['ip-api.com'];
  const sourceAvailable = rawSource && !rawSource.error && !rawSource.skipped;
  const commonAvailable = rawCommon && !rawCommon.error && !rawCommon.skipped;
  if (!sourceAvailable && !commonAvailable) return null;
  const source = sourceAvailable ? rawSource : {};
  const flags = source.flags || {};
  const common = commonAvailable ? rawCommon.flags || {} : {};
  if (common.hosting || flags.datacenter || source.companyType === 'hosting') score -= 45;
  if (common.proxy || flags.proxy) score -= 30;
  if (flags.vpn) score -= 15;
  if (flags.tor) score -= 60;
  if (flags.mobile || source.companyType === 'isp') score = Math.min(100, score + 10);
  return Math.max(0, score);
}

function targetRegionScore(basic, network) {
  const country = getPrimaryCountry(basic);
  if (appState.scenario === 'stream') return country ? (country === appState.streamRegion ? 100 : 42) : null;
  if (appState.scenario === 'game') {
    const region = network?.regions?.find((item) => item.id === appState.gameRegion);
    return region?.available ? Math.max(25, region.score) : null;
  }
  const agreement = getCountryAgreement(basic);
  return agreement == null ? null : Math.max(60, agreement);
}

function selectedNetworkScore(network) {
  if (!network) return null;
  const publicSpeed = getLatestSpeedResult();
  if (appState.scenario === 'stream') {
    const required = { '720p': 3, '1080p': 5, '4k': 15 }[appState.streamQuality];
    const measuredDownload = publicSpeed?.downloadMbps ?? network.downloadMbps;
    const throughput = measuredDownload == null ? null : Math.min(100, measuredDownload / required * 100);
    return throughput == null ? network.score : Math.round(network.score * 0.7 + throughput * 0.3);
  }
  if (appState.scenario !== 'game') {
    if (!publicSpeed?.score) return network.score;
    const speedWeight = appState.scenario === 'browse' ? 0.35 : 0.18;
    return Math.round(network.score * (1 - speedWeight) + publicSpeed.score * speedWeight);
  }
  const region = network.regions?.find((item) => item.id === appState.gameRegion);
  if (!region?.available) return network.score;
  if (appState.gameStyle === 'competitive') {
    const latencyPenalty = Math.max(0, region.avg - 35) * 0.65;
    const jitterPenalty = Math.max(0, region.jitter - 8) * 1.8;
    const loadPenalty = publicSpeed ? Math.max(0, publicSpeed.bufferbloat - 30) * 0.12 : 0;
    return Math.max(0, Math.round(100 - latencyPenalty - jitterPenalty - loadPenalty - region.loss * 8));
  }
  if (appState.gameStyle === 'cloud') {
    const latencyPenalty = Math.max(0, region.avg - 45) * 0.7;
    const loadedPenalty = Math.max(0, network.loadedAvg - 80) * 0.25;
    const measuredDownload = publicSpeed?.downloadMbps ?? network.downloadMbps;
    const bandwidthPenalty = measuredDownload == null ? 15 : Math.max(0, 25 - measuredDownload) * 1.2;
    return Math.max(0, Math.round(100 - latencyPenalty - loadedPenalty - bandwidthPenalty - region.loss * 6));
  }
  const latencyPenalty = Math.max(0, region.avg - 90) * 0.35;
  const jitterPenalty = Math.max(0, region.jitter - 20);
  return Math.max(0, Math.round(100 - latencyPenalty - jitterPenalty - region.loss * 5));
}

function serviceScore(unlock, network) {
  const value = (status) => ({ yes: 100, partial: 55, no: 0 }[status] ?? null);
  if (appState.scenario === 'ai' && unlock) {
    const values = [value(unlock.claude?.status), value(unlock.chatgpt?.status)].filter((item) => item != null);
    return values.length ? average(values) : null;
  }
  if (appState.scenario === 'stream' && unlock) {
    const map = { netflix: 'netflix', disney: 'disneyPlus', youtube: 'youtubePremium' };
    return value(unlock[map[appState.streamService]]?.status);
  }
  if (appState.scenario === 'game') {
    const region = network?.regions?.find((item) => item.id === appState.gameRegion);
    return region?.available ? 100 : null;
  }
  return null;
}

function buildScenarioScore(results) {
  const profile = SCENARIOS[appState.scenario];
  const values = {
    reputation: reputationScore(results.risk, results.dnsbl),
    identity: identityScore(results.basic),
    environment: results.agent?.score ?? null,
    region: targetRegionScore(results.basic, results.network),
    network: selectedNetworkScore(results.network),
    service: serviceScore(results.unlock, results.network),
  };
  const dimensions = Object.entries(profile.weights).map(([key, weight]) => ({
    key, label: DIMENSION_LABELS[key], weight, score: values[key], available: values[key] != null || weight === 0,
  }));
  const relevant = dimensions.filter((item) => item.weight > 0);
  const known = relevant.filter((item) => item.available);
  const knownWeight = known.reduce((sum, item) => sum + item.weight, 0);
  const weightedKnown = known.reduce((sum, item) => sum + item.score * item.weight / 100, 0);
  const estimate = knownWeight ? Math.round(weightedKnown * 100 / knownWeight) : 0;
  const missingWeight = 100 - knownWeight;
  const range = [Math.round(weightedKnown), Math.round(Math.min(100, weightedKnown + missingWeight))];
  const confidence = knownWeight >= 90 ? 'high' : knownWeight >= 60 ? 'medium' : 'low';
  const grade = estimate >= 85 ? '非常适合' : estimate >= 70 ? '适合' : estimate >= 55 ? '勉强可用' : '不推荐';
  const cls = estimate >= 75 ? 'good' : estimate >= 55 ? 'warn' : 'bad';
  return { profile, dimensions, estimate, knownWeight, missingWeight, range, confidence, grade, cls };
}

function renderScenarioEvidence(score, results) {
  $('scenarioEvidenceTitle').childNodes[0].nodeValue = `${score.profile.label}关键证据 `;
  $('scenarioEvidenceDesc').textContent = score.profile.desc;
  const rows = score.dimensions.filter((item) => item.weight > 0).sort((a, b) => b.weight - a.weight).map((item) => {
    const cls = !item.available ? 'dim' : item.score >= 75 ? 'good' : item.score >= 55 ? 'warn' : 'bad';
    const value = item.available ? Math.round(item.score) : '未测';
    return `<div class="evidence-row ${cls}">
      <div><b>${esc(item.label)}</b><small>权重 ${item.weight}%</small></div>
      <div class="evidence-track"><i style="width:${item.available ? Math.max(3, item.score) : 0}%"></i></div>
      <strong>${value}</strong>
    </div>`;
  }).join('');
  const importantSignals = (results.agent?.signals || []).filter((item) => item.level === 'bad' || item.level === 'warn').slice(0, 4);
  const signals = importantSignals.length ? `<div class="scenario-signals">${importantSignals.map((item) =>
    `<span class="tag ${item.level}">${esc(item.label)}</span>`).join('')}</div>` : '';
  $('agentBody').innerHTML = `<div class="evidence-list">${rows}</div>${signals}`;
  setStatus('agent', 'done');
}

function renderVerdict(score, results, reportMode = appState.mode) {
  const modeText = reportMode === 'manual' ? 'IP 侧预评估' : reportMode === 'proxy' ? '代理出口预评估' : '当前网络实测';
  const overall = score.estimate >= 85
    ? `${modeText}显示：它很适合${score.profile.noun}。`
    : score.estimate >= 70
      ? `${modeText}显示：它基本适合${score.profile.noun}，仍有少量可优化项。`
      : score.estimate >= 55
        ? `${modeText}显示：可以使用，但体验或风控稳定性一般。`
        : `${modeText}显示：不建议直接用于${score.profile.noun}。`;
  const issues = [];
  (results.agent?.signals || []).forEach((item) => {
    if ((item.level === 'bad' || item.level === 'warn') && item.advice) issues.push(item);
  });
  if (results.dnsbl?.listedCount > 0) issues.push({ level: 'bad', label: `命中 ${results.dnsbl.listedCount} 个黑名单`, advice: '该 IP 有滥用历史，重要账号和敏感服务建议更换出口。' });
  if (results.network && results.network.loadedAvg > results.network.avg + 100) issues.push({ level: 'warn', label: '负载延迟明显升高', advice: '下载占满线路时网页或游戏可能卡顿，建议启用路由器 QoS/SQM。' });
  if (results.network?.loss > 0) issues.push({ level: 'warn', label: '检测到请求失败', advice: '线路存在瞬时不稳定，建议复测并检查 Wi-Fi、代理节点或运营商线路。' });
  const region = score.dimensions.find((item) => item.key === 'region');
  if (region?.available && region.score < 55) issues.push({ level: 'bad', label: '出口与目标地区不匹配', advice: '请选择与目标服务或区服更接近的出口节点。' });
  if (score.missingWeight > 0) issues.push({ level: 'warn', label: `仍有 ${score.missingWeight}% 权重未实测`, advice: `当前可信度为${score.confidence === 'high' ? '高' : score.confidence === 'medium' ? '中' : '低'}；未测项不会按满分处理。` });

  const measuredDownload = getLatestSpeedResult()?.downloadMbps ?? results.network?.downloadMbps;
  if (appState.scenario === 'stream' && measuredDownload != null) {
    const required = { '720p': 3, '1080p': 5, '4k': 15 }[appState.streamQuality];
    if (measuredDownload < required) issues.unshift({ level: 'bad', label: `带宽不足以稳定播放 ${appState.streamQuality.toUpperCase()}`, advice: `当前约 ${measuredDownload.toFixed(1)} Mbps，目标建议至少 ${required} Mbps。` });
  }

  const unique = issues.filter((item, index, list) => list.findIndex((other) => other.label === item.label) === index).slice(0, 6);
  const issueHtml = unique.length ? unique.map((item) =>
    `<li class="issue ${item.level}"><b>${esc(item.label)}</b><span>${esc(item.advice)}</span></li>`).join('')
    : '<li class="issue good"><b>没有发现明显问题</b><span>当前已测指标适合这一使用场景。</span></li>';
  $('verdictBody').innerHTML = `<div class="verdict-overall ${score.cls}">${esc(overall)}</div><div class="verdict-sub dim">最值得关注的事项：</div><ul class="issue-list">${issueHtml}</ul>`;
  $('card-verdict').classList.remove('hidden');
}

function renderScore(ip, score) {
  $('scoreNum').textContent = score.estimate;
  document.querySelector('.gauge').className = `gauge ${score.cls}`;
  $('scoreGrade').textContent = `${score.profile.label} · ${score.grade}`;
  $('scoreIp').textContent = ip;
  $('scoreScenario').textContent = score.profile.label;
  $('scoreConfidence').className = `tag ${score.confidence === 'high' ? 'good' : score.confidence === 'medium' ? 'warn' : 'bad'}`;
  $('scoreConfidence').textContent = `可信度${score.confidence === 'high' ? '高' : score.confidence === 'medium' ? '中' : '低'} · 已测 ${score.knownWeight}%`;
  $('scoreBreakdown').innerHTML = score.dimensions.filter((item) => item.weight > 0).map((item) =>
    `<span>${esc(item.label)} ${item.available ? Math.round(item.score) : '未测'}</span>`).join('');
  $('scoreLegend').textContent = score.missingWeight
    ? `显示的是已知证据预评估；完整得分合理区间约 ${score.range[0]}–${score.range[1]}，缺失项没有按满分处理。`
    : '当前场景所需维度已完整检测，分数可直接用于比较。';
  return score.grade;
}

/* ---------- 历史 ---------- */

const HISTORY_KEY = 'ipcheck_history';
const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } };

function renderHistory() {
  const items = loadHistory();
  $('historyBody').innerHTML = items.length
    ? items.map((h) => {
        const c = h.total >= 80 ? 'good' : h.total >= 55 ? 'warn' : 'bad';
        return `<div class="history-item">
          <span class="history-score" style="color:var(--${c})">${h.total}</span>
          <span class="mono">${esc(h.ip)}</span>
          <span>${esc(h.location || '')}</span>
          <span class="tag dim">${esc(h.scenario || 'AI 工具')} · ${esc(h.grade)}</span>
          <span class="dim">${esc(h.mode || (h.proxy ? '代理实测' : '当前网络'))}</span>
          <span class="dim">${new Date(h.time).toLocaleString()}</span>
        </div>`;
      }).join('')
    : '<span class="dim">暂无记录</span>';
}

function saveHistory(entry) {
  const items = loadHistory();
  items.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
  renderHistory();
}

/* ---------- 主流程 ---------- */

let running = false;
let lastReport = null;

function validManualIp(value) {
  const ip = value.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const octets = ip.split('.').map(Number);
    if (!octets.every((value) => value >= 0 && value <= 255)) return false;
    if (octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224) return false;
    if (octets[0] === 192 && octets[1] === 168) return false;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
    if (octets[0] === 169 && octets[1] === 254) return false;
    return true;
  }
  if (!ip.includes(':') || !/^[0-9a-f:]+$/i.test(ip)) return false;
  if (ip.split('::').length > 2) return false;
  const groups = ip.split(':').filter(Boolean);
  const compressed = ip.includes('::');
  if ((!compressed && groups.length !== 8) || (compressed && groups.length >= 8)) return false;
  if (!groups.every((group) => group.length <= 4)) return false;
  return !/^::$|^::1$|^f[cd]|^fe[89ab]/i.test(ip);
}

function showInputError(message = '') {
  $('inputError').textContent = message;
  $('inputError').classList.toggle('hidden', !message);
}

function renderScenarioOptions() {
  const panel = $('scenarioOptions');
  if (appState.scenario === 'stream') {
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <label>服务<select id="streamService"><option value="netflix">Netflix</option><option value="disney">Disney+</option><option value="youtube">YouTube Premium</option></select></label>
      <label>目标地区<select id="streamRegion"><option value="US">美国</option><option value="JP">日本</option><option value="SG">新加坡</option><option value="GB">英国</option></select></label>
      <label>目标画质<select id="streamQuality"><option value="720p">720p</option><option value="1080p">1080p</option><option value="4k">4K</option></select></label>`;
    $('streamService').value = appState.streamService;
    $('streamRegion').value = appState.streamRegion;
    $('streamQuality').value = appState.streamQuality;
    ['streamService', 'streamRegion', 'streamQuality'].forEach((id) => $(id).addEventListener('change', (event) => {
      appState[id] = event.target.value;
      rerenderLastReport();
    }));
    return;
  }
  if (appState.scenario === 'game') {
    panel.classList.remove('hidden');
    const regionOptions = appState.networkProbes.map((probe) => `<option value="${esc(probe.id)}">${esc(probe.label)}</option>`).join('');
    if (!appState.networkProbes.some((probe) => probe.id === appState.gameRegion)) appState.gameRegion = appState.networkProbes[0]?.id || 'local';
    panel.innerHTML = `
      <label>目标区服<select id="gameRegion">${regionOptions}</select></label>
      <label>游戏类型<select id="gameStyle"><option value="competitive">竞技游戏</option><option value="casual">休闲游戏</option><option value="cloud">云游戏</option></select></label>`;
    $('gameRegion').value = appState.gameRegion;
    $('gameStyle').value = appState.gameStyle;
    $('gameRegion').addEventListener('change', (event) => { appState.gameRegion = event.target.value; rerenderLastReport(); });
    $('gameStyle').addEventListener('change', (event) => { appState.gameStyle = event.target.value; rerenderLastReport(); });
    return;
  }
  panel.classList.add('hidden');
  panel.innerHTML = '';
}

function setScenario(scenario) {
  if (!SCENARIOS[scenario]) return;
  appState.scenario = scenario;
  document.querySelectorAll('.scenario-option').forEach((button) => button.classList.toggle('active', button.dataset.scenario === scenario));
  renderScenarioOptions();
  rerenderLastReport();
}

function setMode(mode) {
  if (!['self', 'manual'].includes(mode)) return;
  appState.mode = mode;
  document.querySelectorAll('#modeSwitch button').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $('ipInput').classList.toggle('hidden', mode !== 'manual');
  $('run').textContent = mode === 'manual' ? '检测这个 IP' : '检测当前网络';
  $('modeHint').textContent = mode === 'manual'
    ? '只评估指定 IP 的信誉、类型和地区；浏览器环境与网络质量会标记为未实测'
    : '将检测当前出口 IP、浏览器环境、负载延迟与区域线路';
  showInputError();
  lastReport = null;
  $('report').classList.add('hidden');
}

function rerenderLastReport() {
  if (!lastReport) return;
  const score = buildScenarioScore(lastReport.results);
  renderScore(lastReport.ip, score);
  renderScenarioEvidence(score, lastReport.results);
  renderVerdict(score, lastReport.results, lastReport.mode);
}

async function run(proxy) {
  if (running) return;
  const useProxy = Boolean(proxy && proxy.trim());
  const reportMode = useProxy ? 'proxy' : appState.mode;
  const manualIp = $('ipInput').value.trim();
  if (reportMode === 'manual' && !validManualIp(manualIp)) {
    showInputError('请输入有效的公网 IPv4 或 IPv6 地址');
    $('ipInput').focus();
    return;
  }
  showInputError();
  running = true;
  $('run').disabled = true;
  $('runProxy').disabled = true;
  $('report').classList.remove('hidden');
  $('card-verdict').classList.add('hidden');
  $('card-unlock').classList.toggle('hidden', !useProxy);
  const stages = ['detail', 'agent', 'network', 'basic', 'risk', 'dnsbl', ...(useProxy ? ['unlock'] : [])];
  stages.forEach((n) => setStatus(n, 'loading'));
  $('scoreNum').textContent = '--';
  $('scoreGrade').textContent = '检测中…';
  document.querySelector('.gauge').className = 'gauge';

  try {
    const ip = reportMode === 'manual'
      ? manualIp
      : (useProxy ? await post('/api/exit-ip', { proxy }) : await post('/api/self', {})).ip;
    if (!ip) throw new Error('无法确定出口 IP');
    $('scoreIp').textContent = ip;

    const results = {};
    const canClientTest = reportMode === 'self';
    const basicP = post('/api/basic', { ip })
      .then((d) => { results.basic = d; renderBasic(d); setStatus('basic', 'done'); return d; })
      .catch((e) => { setStatus('basic', 'error'); $('basicBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; return null; });

    const riskP = basicP.then((b) =>
      post('/api/risk', { ip, ipapiis: b?.sources?.['ipapi.is'] })
        .then((d) => { results.risk = d; renderRisk(d); setStatus('risk', 'done'); })
        .catch((e) => { setStatus('risk', 'error'); $('riskBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; })
    );

    const agentP = basicP.then(async (basic) => {
      if (canClientTest) results.agent = await analyzeAgent(ip, basic);
      renderDetail(ip, basic, results.agent);
      setStatus('detail', 'done');
    }).catch((e) => {
      setStatus('agent', 'error'); setStatus('detail', 'error');
      $('agentBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`;
    });

    const dnsblP = post('/api/dnsbl', { ip })
      .then((d) => { results.dnsbl = d; renderDnsbl(d); setStatus('dnsbl', 'done'); })
      .catch((e) => { setStatus('dnsbl', 'error'); $('dnsblBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; });

    const networkP = canClientTest
      ? runNetworkStability().then((data) => { results.network = data; })
      : Promise.resolve(renderNetworkUnavailable());
    const jobs = [riskP, dnsblP, agentP, networkP];
    if (useProxy) {
      jobs.push(post('/api/unlock', { proxy })
        .then((d) => { results.unlock = d; renderUnlock(d); setStatus('unlock', 'done'); })
        .catch((e) => { setStatus('unlock', 'error'); $('unlockBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; }));
    }
    await Promise.allSettled(jobs);

    const score = buildScenarioScore(results);
    const grade = renderScore(ip, score);
    renderScenarioEvidence(score, results);
    renderVerdict(score, results, reportMode);
    lastReport = { ip, results, mode: reportMode };
    const loc = results.basic?.sources?.['ip-api.com'];
    saveHistory({
      time: Date.now(), ip, proxy: useProxy ? proxy : '', total: score.estimate, grade,
      scenario: score.profile.label, mode: reportMode === 'manual' ? '指定 IP' : reportMode === 'proxy' ? '代理实测' : '当前网络',
      location: loc && !loc.error ? `${loc.country || ''} ${loc.city || ''}`.trim() : '',
    });
  } catch (e) {
    $('scoreGrade').textContent = '检测失败';
    $('scoreIp').textContent = e.message;
    stages.forEach((n) => setStatus(n, 'error'));
  } finally {
    running = false;
    $('run').disabled = false;
    $('runProxy').disabled = false;
  }
}

function setProductView(view) {
  const speed = view === 'speed';
  $('assessmentView').classList.toggle('hidden', speed);
  $('speedView').classList.toggle('hidden', !speed);
  document.querySelectorAll('.product-switch button').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelector('header .badge').textContent = speed ? '公网速度与区域链路' : '场景化网络体检';
  $('headerSub').innerHTML = speed
    ? '测下载、上传、负载延迟与区域链路，看看网络<strong>适合拿来做什么</strong>'
    : '不只判断 IP 干不干净，更告诉你它<strong>适合拿来做什么</strong>';
  document.title = speed ? 'PureIP · 网络测速' : 'PureIP · 你的 IP 适合做什么？';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('run').addEventListener('click', () => run(''));
$('rerunNetwork').addEventListener('click', runNetworkStability);
$('openSpeedTest').addEventListener('click', () => setProductView('speed'));
$('ipInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') run(''); });
document.querySelectorAll('.scenario-option').forEach((button) => button.addEventListener('click', () => setScenario(button.dataset.scenario)));
document.querySelectorAll('#modeSwitch button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('.product-switch button').forEach((button) => button.addEventListener('click', () => setProductView(button.dataset.view)));
$('runProxy').addEventListener('click', () => run($('proxy').value));
$('proxy').addEventListener('keydown', (e) => { if (e.key === 'Enter') run($('proxy').value); });
$('toggleAdv').addEventListener('click', () => {
  const panel = $('advPanel');
  const open = panel.classList.toggle('hidden');
  $('toggleAdv').textContent = (open ? '▸' : '▾') + ' 高级：检测其他地区 IP（填代理）';
});
$('clearHistory').addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });

fetch('/api/config').then((r) => r.json()).then(({ keys, proxyMode, networkProbes }) => {
  if (Array.isArray(networkProbes) && networkProbes.length) {
    appState.networkProbes = networkProbes;
    setSpeedProbes(networkProbes);
  }
  const on = Object.entries(keys).filter(([, v]) => v).map(([k]) => k);
  $('keyStatus').textContent = on.length
    ? `增强数据源已启用: ${on.join(', ')}`
    : '';
  // 公开部署默认关闭代理模式（防 SSRF），隐藏高级面板
  if (!proxyMode) {
    $('toggleAdv').parentElement.classList.add('hidden');
    $('advPanel').classList.add('hidden');
  }
  renderScenarioOptions();
}).catch(() => {});
document.addEventListener('pureip:speed-result', () => rerenderLastReport());
initSpeedTest();
renderScenarioOptions();
renderHistory();
