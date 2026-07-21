import SpeedTest from '/vendor/cloudflare-speedtest.js';

const HISTORY_KEY = 'pureip_speed_history_v1';
const MAX_HISTORY = 10;
const RESULT_MAX_AGE = 30 * 60_000;

const MODES = {
  quick: {
    label: '快速',
    traffic: '预计消耗 20–40 MB',
    measurements: [
      { type: 'latency', numPackets: 1 },
      { type: 'download', bytes: 100_000, count: 1, bypassMinDuration: true },
      { type: 'latency', numPackets: 12 },
      { type: 'upload', bytes: 100_000, count: 2 },
      { type: 'download', bytes: 1_000_000, count: 4 },
      { type: 'upload', bytes: 1_000_000, count: 3 },
      { type: 'download', bytes: 5_000_000, count: 2 },
      { type: 'upload', bytes: 5_000_000, count: 2 },
    ],
  },
  full: {
    label: '完整',
    traffic: '预计消耗 80–180 MB',
    measurements: [
      { type: 'latency', numPackets: 1 },
      { type: 'download', bytes: 100_000, count: 1, bypassMinDuration: true },
      { type: 'latency', numPackets: 20 },
      { type: 'upload', bytes: 100_000, count: 2 },
      { type: 'download', bytes: 1_000_000, count: 6 },
      { type: 'upload', bytes: 1_000_000, count: 4 },
      { type: 'download', bytes: 10_000_000, count: 4 },
      { type: 'upload', bytes: 10_000_000, count: 3 },
      { type: 'download', bytes: 25_000_000, count: 2 },
      { type: 'upload', bytes: 25_000_000, count: 2 },
    ],
  },
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const isFiniteNumber = (value) => Number.isFinite(value);
const formatMetric = (value, digits = 1) => isFiniteNumber(value) ? Number(value).toFixed(digits) : '—';
const toMbps = (bps) => isFiniteNumber(bps) ? bps / 1_000_000 : null;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

let speedMode = 'quick';
let activeEngine = null;
let initialized = false;
let networkProbes = [];
let prewarmPromise = null;

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(result) {
  const history = loadHistory();
  history.unshift(result);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function getLatestSpeedResult(maxAge = RESULT_MAX_AGE) {
  const result = loadHistory()[0];
  if (!result || Date.now() - Number(result.timestamp || 0) > maxAge) return null;
  return result;
}

function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    $('speedHistory').innerHTML = '<span class="dim">暂无测速记录</span>';
    return;
  }
  $('speedHistory').innerHTML = `<div class="speed-history-list">${history.map((item) => {
    const time = new Date(item.timestamp).toLocaleString('zh-CN', { hour12: false });
    return `<article>
      <div><b>${formatMetric(item.downloadMbps)} ↓</b><b>${formatMetric(item.uploadMbps)} ↑</b><span>Mbps</span></div>
      <div><strong>${Math.round(item.latency || 0)} ms</strong><span>${escapeHtml(item.grade || '已完成')} · ${escapeHtml(item.modeLabel || '')}</span></div>
      <time>${escapeHtml(time)}</time>
    </article>`;
  }).join('')}</div>`;
}

function setControls(running) {
  $('startSpeedTest').disabled = running;
  $('cancelSpeedTest').classList.toggle('hidden', !running);
  document.querySelectorAll('[data-speed-mode]').forEach((button) => { button.disabled = running; });
}

function updateProgress(progress, phase, hint) {
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  $('speedProgressText').textContent = `${percent}%`;
  $('speedProgressBar').style.width = `${percent}%`;
  $('speedDial').style.setProperty('--progress', `${percent * 3.6}deg`);
  if (phase) $('speedPhase').textContent = phase;
  if (hint) $('speedStageHint').textContent = hint;
}

function phaseCopy(type) {
  if (type === 'latency') return ['检测延迟', '正在采集空闲往返延迟与抖动…'];
  if (type === 'download') return ['下载测速', '正在从 Cloudflare 边缘节点下载测试数据…'];
  if (type === 'upload') return ['上传测速', '正在向 Cloudflare 边缘节点上传测试数据…'];
  return ['网络测速', '正在测量当前网络…'];
}

function readLiveResults(engine) {
  const results = engine.results;
  return {
    downloadMbps: toMbps(results.getDownloadBandwidth()),
    uploadMbps: toMbps(results.getUploadBandwidth()),
    latency: results.getUnloadedLatency(),
    jitter: results.getUnloadedJitter(),
    downloadLoadedLatency: results.getDownLoadedLatency(),
    uploadLoadedLatency: results.getUpLoadedLatency(),
  };
}

function renderMetrics(summary) {
  $('speedDownload').textContent = formatMetric(summary.downloadMbps);
  $('speedUpload').textContent = formatMetric(summary.uploadMbps);
  $('speedLatency').textContent = formatMetric(summary.latency, 0);
  $('speedJitter').textContent = formatMetric(summary.jitter, 1);
  $('speedDownLoadLatency').textContent = formatMetric(summary.downloadLoadedLatency, 0);
  $('speedUpLoadLatency').textContent = formatMetric(summary.uploadLoadedLatency, 0);
}

function renderLiveChart(engine, type) {
  const points = type === 'upload'
    ? engine.results.getUploadBandwidthPoints()
    : engine.results.getDownloadBandwidthPoints();
  const values = points.map((point) => toMbps(point.bps)).filter(isFiniteNumber).slice(-18);
  if (!values.length) return;
  const max = Math.max(...values, 1);
  $('speedLiveChart').innerHTML = values.map((value) =>
    `<i style="height:${Math.max(8, value / max * 100)}%" title="${value.toFixed(1)} Mbps"></i>`
  ).join('');
}

function resetDashboard() {
  renderMetrics({});
  $('speedLiveValue').textContent = '0.0';
  $('speedLiveUnit').textContent = 'Mbps';
  $('speedLiveChart').innerHTML = '<span>正在初始化测速节点…</span>';
  $('speedVerdictCard').classList.add('hidden');
  $('speedRegions').innerHTML = '<span class="dim">正在预热区域节点…</span>';
  $('speedStatus').textContent = '正在准备';
  updateProgress(0.02, '准备节点', '测速期间请保持当前页面在前台，并暂停大型下载或上传。');
}

async function pingOnce(url, timeout = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = performance.now();
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/network/ping?t=${Date.now()}-${Math.random()}`, {
      cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return performance.now() - started;
  } finally {
    clearTimeout(timer);
  }
}

function prewarmRegions() {
  prewarmPromise = Promise.allSettled(networkProbes.map((probe) => pingOnce(probe.url, 8000)));
}

async function measureProbe(probe) {
  const samples = [];
  let failures = 0;
  for (let index = 0; index < 5; index++) {
    try {
      samples.push(await pingOnce(probe.url));
    } catch {
      failures++;
    }
    if (index < 4) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (!samples.length) return { ...probe, available: false, failures };
  const jitterValues = samples.slice(1).map((value, index) => Math.abs(value - samples[index]));
  return {
    ...probe,
    available: true,
    avg: average(samples),
    min: Math.min(...samples),
    jitter: average(jitterValues) || 0,
    failures,
  };
}

async function measureRegions() {
  if (!networkProbes.length) return [];
  await prewarmPromise;
  return Promise.all(networkProbes.map(measureProbe));
}

function renderRegions(regions) {
  if (!regions.length) {
    $('speedRegions').innerHTML = '<span class="dim">未配置区域探针</span>';
    return;
  }
  $('speedRegions').innerHTML = regions.map((region) => region.available
    ? `<div class="region-probe"><span>${escapeHtml(region.label)}</span><b>${Math.round(region.avg)} ms</b><small>最低 ${Math.round(region.min)} ms · 抖动 ${Math.round(region.jitter)} ms</small></div>`
    : `<div class="region-probe unavailable"><span>${escapeHtml(region.label)}</span><b>暂不可用</b><small>节点可能正在冷启动，不计入结论</small></div>`
  ).join('');
}

function calculateQuality(result) {
  const download = result.downloadMbps || 0;
  const upload = result.uploadMbps || 0;
  const latency = result.latency ?? 200;
  const jitter = result.jitter ?? 50;
  const loadedValues = [result.downloadLoadedLatency, result.uploadLoadedLatency].filter(isFiniteNumber);
  const maxLoaded = loadedValues.length ? Math.max(...loadedValues) : latency;
  const bufferbloat = Math.max(0, maxLoaded - latency);

  const speedScore = Math.min(100, download / 100 * 65 + upload / 30 * 35);
  const latencyScore = Math.max(0, 100 - Math.max(0, latency - 20) * 0.9 - jitter * 2);
  const loadScore = Math.max(0, 100 - bufferbloat * 0.75);
  const score = Math.round(speedScore * 0.42 + latencyScore * 0.33 + loadScore * 0.25);
  const grade = score >= 85 ? '优秀' : score >= 70 ? '良好' : score >= 55 ? '一般' : '需要改善';
  const className = score >= 85 ? 'good' : score >= 55 ? 'warn' : 'bad';
  return { score, grade, className, bufferbloat };
}

function readiness(label, score, detail) {
  const className = score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';
  const verdict = score >= 85 ? '很适合' : score >= 60 ? '基本可用' : '可能卡顿';
  return { label, score: Math.round(score), detail, className, verdict };
}

function buildReadiness(result, quality) {
  const down = result.downloadMbps || 0;
  const up = result.uploadMbps || 0;
  const latency = result.latency ?? 200;
  const jitter = result.jitter ?? 50;
  const stream = Math.min(100, down / 50 * 100);
  const gaming = Math.max(0, 100 - Math.max(0, latency - 20) * 1.15 - jitter * 2.4 - quality.bufferbloat * 0.28);
  const ai = Math.min(100, down / 20 * 55 + up / 5 * 25 + Math.max(0, 20 - latency / 10));
  const meeting = Math.min(100, up / 8 * 45 + down / 15 * 25 + Math.max(0, 30 - jitter * 3 - quality.bufferbloat * 0.16));
  return [
    readiness('AI 工具', ai, down >= 10 && up >= 3 ? '对话、文件上传与生成内容传输顺畅' : '基础对话可用，大文件处理可能较慢'),
    readiness('4K 看剧', stream, down >= 50 ? '带宽余量充足' : down >= 25 ? '接近 4K 所需带宽，晚高峰建议复测' : '更适合 1080p 或更低画质'),
    readiness('在线游戏', gaming, latency <= 50 && jitter <= 10 ? '延迟和抖动适合实时操作' : '延迟、抖动或负载排队偏高'),
    readiness('视频会议', meeting, up >= 5 && jitter <= 15 ? '上下行与稳定性满足高清视频会议' : '建议降低清晰度并避免同时下载'),
  ];
}

function renderVerdict(result) {
  const quality = calculateQuality(result);
  const readinessItems = buildReadiness(result, quality);
  const loadedNote = quality.bufferbloat <= 25
    ? '负载时延迟控制得很好，多任务并行不容易互相拖慢。'
    : quality.bufferbloat <= 80
      ? '满速传输时延迟会升高，游戏或会议期间建议限制后台下载。'
      : '负载排队明显，建议在路由器启用 SQM/QoS，或避免占满带宽。';
  $('speedGrade').className = `speed-grade ${quality.className}`;
  $('speedGrade').textContent = `${quality.grade} · ${quality.score}/100`;
  $('speedVerdict').innerHTML = `<strong>${loadedNote}</strong><span>负载延迟增加约 ${Math.round(quality.bufferbloat)} ms；本结论只评估网络链路，不代表 IP 信誉或平台解锁状态。</span>`;
  $('speedReadiness').innerHTML = readinessItems.map((item) => `<article class="${item.className}">
    <div><span>${escapeHtml(item.label)}</span><b>${item.verdict}</b></div>
    <i><em style="width:${item.score}%"></em></i>
    <small>${escapeHtml(item.detail)}</small>
  </article>`).join('');
  $('speedVerdictCard').classList.remove('hidden');
  return quality;
}

function collectTrafficMb(results) {
  const downloaded = results.getDownloadBandwidthPoints().reduce((sum, point) => sum + (point.transferSize || point.bytes || 0), 0);
  const uploaded = results.getUploadBandwidthPoints().reduce((sum, point) => sum + (point.bytes || 0), 0);
  return (downloaded + uploaded) / 1_000_000;
}

async function finishSpeedTest(engine, results) {
  if (activeEngine !== engine) return;
  clearTimeout(engine.__pureipWatchdog);
  const live = readLiveResults(engine);
  if (/upload/i.test(engine.__pureipWarning || '') && !(live.uploadMbps > 0)) live.uploadMbps = null;
  if (/download/i.test(engine.__pureipWarning || '') && !(live.downloadMbps > 0)) live.downloadMbps = null;
  $('speedStatus').textContent = '公网测速完成，正在检测区域链路';
  $('speedLiveValue').textContent = formatMetric(live.downloadMbps);
  updateProgress(0.9, '区域链路', '正在检测美国、新加坡与欧洲区域节点…');
  const regions = await measureRegions();
  if (activeEngine !== engine) return;
  renderRegions(regions);

  const result = {
    ...live,
    regions,
    trafficMb: collectTrafficMb(results),
    durationMs: results.getTotalDurationMs(),
    mode: speedMode,
    modeLabel: MODES[speedMode].label,
    timestamp: Date.now(),
    source: 'Cloudflare Edge + PureIP probes',
    warning: engine.__pureipWarning || '',
  };
  const quality = renderVerdict(result);
  result.score = quality.score;
  result.grade = quality.grade;
  result.bufferbloat = quality.bufferbloat;
  saveHistory(result);
  renderHistory();
  renderMetrics(result);
  $('speedStatus').textContent = `${result.warning ? '部分指标未完成' : '完成'} · 实际传输约 ${result.trafficMb.toFixed(1)} MB`;
  $('speedLiveValue').textContent = formatMetric(result.downloadMbps);
  updateProgress(1, '测速完成', `本次耗时约 ${Math.max(1, Math.round((result.durationMs || 0) / 1000))} 秒，结果已保存在当前浏览器。`);
  setControls(false);
  activeEngine = null;
  document.dispatchEvent(new CustomEvent('pureip:speed-result', { detail: result }));
}

function startSpeedTest() {
  if (activeEngine) return;
  resetDashboard();
  setControls(true);
  prewarmRegions();
  const mode = MODES[speedMode];
  const engine = new SpeedTest({
    autoStart: false,
    logAimApiUrl: null,
    measurements: mode.measurements,
    bandwidthFinishRequestDuration: speedMode === 'quick' ? 850 : 1100,
    bandwidthAbortRequestDuration: 30_000,
    bandwidthMinRequestDuration: 30,
    measureDownloadLoadedLatency: true,
    measureUploadLoadedLatency: true,
    loadedLatencyThrottle: 350,
  });
  activeEngine = engine;

  engine.onPhaseChange = ({ measurementId, measurement }) => {
    if (activeEngine !== engine) return;
    const [phase, hint] = phaseCopy(measurement.type);
    const progress = 0.05 + measurementId / Math.max(1, mode.measurements.length) * 0.78;
    $('speedStatus').textContent = `${mode.label}模式进行中`;
    updateProgress(progress, phase, hint);
  };
  engine.onResultsChange = ({ type }) => {
    if (activeEngine !== engine) return;
    const live = readLiveResults(engine);
    renderMetrics(live);
    const liveValue = type === 'upload' ? live.uploadMbps : type === 'download' ? live.downloadMbps : live.latency;
    $('speedLiveValue').textContent = formatMetric(liveValue, type === 'latency' ? 0 : 1);
    $('speedLiveUnit').textContent = type === 'latency' ? 'ms' : 'Mbps';
    if (type === 'download' || type === 'upload') renderLiveChart(engine, type);
  };
  engine.onFinish = (results) => { finishSpeedTest(engine, results); };
  engine.onError = (message) => {
    if (activeEngine !== engine) return;
    engine.__pureipWarning = message || '部分网络请求失败';
    $('speedStatus').textContent = '部分指标异常，继续测试';
    $('speedStageHint').textContent = `已保留有效采样：${engine.__pureipWarning}`;
  };
  engine.__pureipWatchdog = setTimeout(() => {
    if (activeEngine !== engine) return;
    engine.__pureipWarning = engine.__pureipWarning || '测速超过最长等待时间，已使用当前有效采样';
    engine.pause();
    finishSpeedTest(engine, engine.results);
  }, speedMode === 'quick' ? 75_000 : 120_000);
  engine.play();
}

function cancelSpeedTest() {
  if (!activeEngine) return;
  const engine = activeEngine;
  activeEngine = null;
  clearTimeout(engine.__pureipWatchdog);
  engine.pause();
  $('speedStatus').textContent = '已停止';
  updateProgress(0, '测速停止', '你可以切换模式后重新开始。');
  setControls(false);
}

function setMode(mode) {
  if (!MODES[mode] || activeEngine) return;
  speedMode = mode;
  document.querySelectorAll('[data-speed-mode]').forEach((button) => button.classList.toggle('active', button.dataset.speedMode === mode));
  $('speedPrivacy').textContent = `${MODES[mode].traffic}。测速不会自动开始，结果仅保存在当前浏览器。`;
}

export function setSpeedProbes(probes) {
  networkProbes = Array.isArray(probes)
    ? probes.filter((probe) => probe && typeof probe.url === 'string' && probe.url).map((probe) => ({
      id: String(probe.id || ''), label: String(probe.label || '区域节点'), url: probe.url.replace(/\/$/, ''),
    }))
    : [];
}

export function initSpeedTest() {
  if (initialized) return;
  initialized = true;
  document.querySelectorAll('[data-speed-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.speedMode)));
  $('startSpeedTest').addEventListener('click', startSpeedTest);
  $('cancelSpeedTest').addEventListener('click', cancelSpeedTest);
  $('clearSpeedHistory').addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });
  if (navigator.connection?.saveData || /(^|\b)(slow-2g|2g|3g)(\b|$)/.test(navigator.connection?.effectiveType || '')) {
    speedMode = 'quick';
    $('speedPrivacy').textContent = '检测到移动网络或流量节省模式，已选择快速测速。预计消耗 20–40 MB。';
  }
  renderHistory();
}
