const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

  // 附加标记
  const tags = [];
  const f = s.flags || {};
  if (f.proxy) tags.push('<span class="tag bad">代理</span>');
  if (f.vpn) tags.push('<span class="tag warn">VPN</span>');
  if (f.abuser) tags.push('<span class="tag bad">滥用记录</span>');

  const rtc = meta.rtcLeak
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
    ['浏览器指纹', `<span class="mono">${esc(meta.fingerprint || '—')}</span> <span class="dim">（本机浏览器画像）</span>`],
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

/* ---------- 结论与建议（大白话总结 + 可操作项） ---------- */

function renderVerdict(total, grade, agent, results) {
  const overall =
    total >= 85 ? { cls: 'good', text: '这个 IP 很干净，可放心用于注册 / 登录 Claude、ChatGPT 等对 IP 敏感的服务。' } :
    total >= 70 ? { cls: 'good', text: '基本可用。有少量风险点（见下），敏感操作前建议先优化。' } :
    total >= 55 ? { cls: 'warn', text: '质量一般。登录 AI 服务可能偶发验证码，不建议用于重要 / 长期账号。' } :
                  { cls: 'bad', text: '风险较高，容易被 AI 服务拦截或风控。建议更换 IP，或先修复下面的问题。' };

  // 收集问题：AI Agent 的 bad/warn 信号（自带建议）+ DNS 黑名单命中
  const issues = [];
  (agent?.signals || []).forEach((s) => {
    if ((s.level === 'bad' || s.level === 'warn') && s.advice) {
      issues.push({ level: s.level, label: s.label, advice: s.advice });
    }
  });
  const db = results?.dnsbl;
  if (db?.supported && db.listedCount > 0) {
    issues.push({
      level: 'bad',
      label: `IP 命中 ${db.listedCount} 个 DNS 黑名单`,
      advice: '这个 IP 被人发过垃圾邮件 / 滥用过（常见于被很多人共用的“万人骑”IP），换一个独享的干净 IP 更安全。',
    });
  }
  // 按严重度排序（bad 在前）
  issues.sort((a, b) => (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1));

  const issueHtml = issues.length
    ? issues.slice(0, 6).map((i) =>
        `<li class="issue ${i.level}"><b>${esc(i.label)}</b><span>${esc(i.advice)}</span></li>`).join('')
    : '<li class="issue good"><b>没有发现明显风险点</b><span>各项指标正常，可以放心使用。</span></li>';

  $('verdictBody').innerHTML = `
    <div class="verdict-overall ${overall.cls}">${esc(overall.text)}</div>
    <div class="verdict-sub dim">${issues.length ? '检测到的风险点与建议：' : ''}</div>
    <ul class="issue-list">${issueHtml}</ul>`;
  $('card-verdict').classList.remove('hidden');
}

/* ---------- 综合评分 ---------- */

function computeScore(basic, risk, dnsbl, unlock, agent) {
  const parts = {};

  const scores = [risk?.proxycheck?.score, risk?.abuseipdb?.score, risk?.ipqs?.score, risk?.ipapiis?.score]
    .filter((v) => typeof v === 'number');
  parts.risk = scores.length ? 100 - scores.reduce((a, b) => a + b, 0) / scores.length : 60;
  const idb = risk?.internetdb;
  if (idb && !idb.error && !idb.clean) {
    if (proxyPorts(idb.ports) || /proxy|vpn/i.test((idb.tags || []).join())) parts.risk -= 35;
    else if (idb.vulns?.length) parts.risk -= 15;
  }
  parts.risk = Math.max(0, parts.risk);

  let type = 100;
  const srcs = basic?.sources || {};
  const ipapiFlags = srcs['ipapi.is']?.flags || {};
  const ipapiCom = srcs['ip-api.com']?.flags || {};
  if (ipapiCom.hosting || ipapiFlags.datacenter || srcs['ipapi.is']?.companyType === 'hosting') type -= 45;
  if (ipapiCom.proxy || ipapiFlags.proxy) type -= 30;
  if (ipapiFlags.vpn) type -= 15;
  if (ipapiFlags.tor) type -= 60;
  if (ipapiFlags.mobile || srcs['ipapi.is']?.companyType === 'isp') type = Math.min(100, type + 10);
  parts.type = Math.max(0, type);

  // DNS 黑名单：命中扣分；命中 0 时按"有效查询覆盖度"给分，覆盖太低不给满分（防假阴性）
  if (!dnsbl?.supported) {
    parts.dnsbl = 70;
  } else if (dnsbl.listedCount >= 2) {
    parts.dnsbl = 10;
  } else if (dnsbl.listedCount === 1) {
    parts.dnsbl = 45;
  } else {
    const checked = dnsbl.checkedCount ?? 0;
    parts.dnsbl = checked >= 5 ? 100 : checked >= 3 ? 88 : checked >= 1 ? 75 : 55;
  }
  parts.agent = agent?.score ?? 60;

  if (unlock) {
    const u = (st) => ({ yes: 100, partial: 50, no: 0 }[st] ?? 60);
    parts.unlock = u(unlock.claude?.status) * 0.6 + u(unlock.chatgpt?.status) * 0.4;
    // 代理模式：含实测解锁
    const total = Math.round(parts.risk * 0.32 + parts.type * 0.22 + parts.dnsbl * 0.12 + parts.agent * 0.14 + parts.unlock * 0.2);
    return { total, parts, hasUnlock: true };
  }
  // 自测模式：无实测解锁，AI Agent 权重更高
  const total = Math.round(parts.risk * 0.36 + parts.type * 0.26 + parts.dnsbl * 0.14 + parts.agent * 0.24);
  return { total, parts, hasUnlock: false };
}

function renderScore(ip, score) {
  const { total, parts, hasUnlock } = score;
  const cls = total >= 80 ? 'good' : total >= 55 ? 'warn' : 'bad';
  const grade = total >= 85 ? '纯净' : total >= 70 ? '良好' : total >= 55 ? '一般' : total >= 35 ? '较差' : '高风险预警';
  $('scoreNum').textContent = total;
  document.querySelector('.gauge').className = `gauge ${cls}`;
  $('scoreGrade').textContent = grade;
  $('scoreIp').textContent = ip;
  const bits = [
    `<span>风险 ${Math.round(parts.risk)}</span>`,
    `<span>IP 类型 ${Math.round(parts.type)}</span>`,
    `<span>黑名单 ${Math.round(parts.dnsbl)}</span>`,
    `<span>AI Agent ${Math.round(parts.agent)}</span>`,
  ];
  if (hasUnlock) bits.push(`<span>解锁 ${Math.round(parts.unlock)}</span>`);
  $('scoreBreakdown').innerHTML = bits.join('');
  return grade;
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
          <span class="tag dim">${esc(h.grade)}</span>
          <span class="dim">${esc(h.proxy || '自测')}</span>
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

async function run(proxy) {
  if (running) return;
  running = true;
  const useProxy = Boolean(proxy && proxy.trim());
  $('run').disabled = true;
  $('runProxy').disabled = true;
  $('report').classList.remove('hidden');
  $('card-verdict').classList.add('hidden');
  $('card-unlock').classList.toggle('hidden', !useProxy);
  const stages = ['detail', 'agent', 'basic', 'risk', 'dnsbl', ...(useProxy ? ['unlock'] : [])];
  stages.forEach((n) => setStatus(n, 'loading'));
  $('scoreNum').textContent = '--';
  $('scoreGrade').textContent = '检测中…';
  document.querySelector('.gauge').className = 'gauge';

  try {
    const { ip } = useProxy ? await post('/api/exit-ip', { proxy }) : await post('/api/self', {});
    if (!ip) throw new Error('无法确定出口 IP');
    $('scoreIp').textContent = ip;

    const results = {};
    const basicP = post('/api/basic', { ip })
      .then((d) => { results.basic = d; renderBasic(d); setStatus('basic', 'done'); return d; })
      .catch((e) => { setStatus('basic', 'error'); $('basicBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; return null; });

    const riskP = basicP.then((b) =>
      post('/api/risk', { ip, ipapiis: b?.sources?.['ipapi.is'] })
        .then((d) => { results.risk = d; renderRisk(d); setStatus('risk', 'done'); })
        .catch((e) => { setStatus('risk', 'error'); $('riskBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; })
    );

    // AI Agent 分析依赖基础信息里的地理数据；IP 详情同时用到 basic + agent(指纹/WebRTC)
    const agentP = basicP.then(async (b) => {
      results.agent = await analyzeAgent(ip, b);
      renderAgent(results.agent);
      setStatus('agent', 'done');
      renderDetail(ip, b, results.agent);
      setStatus('detail', 'done');
    }).catch((e) => {
      setStatus('agent', 'error'); setStatus('detail', 'error');
      $('agentBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`;
    });

    const dnsblP = post('/api/dnsbl', { ip })
      .then((d) => { results.dnsbl = d; renderDnsbl(d); setStatus('dnsbl', 'done'); })
      .catch((e) => { setStatus('dnsbl', 'error'); $('dnsblBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; });

    const jobs = [riskP, dnsblP, agentP];
    if (useProxy) {
      jobs.push(post('/api/unlock', { proxy })
        .then((d) => { results.unlock = d; renderUnlock(d); setStatus('unlock', 'done'); })
        .catch((e) => { setStatus('unlock', 'error'); $('unlockBody').innerHTML = `<span class="dim">${esc(e.message)}</span>`; }));
    }
    await Promise.allSettled(jobs);

    const score = computeScore(results.basic, results.risk, results.dnsbl, results.unlock, results.agent);
    const grade = renderScore(ip, score);
    renderVerdict(score.total, grade, results.agent, results);
    const loc = results.basic?.sources?.['ip-api.com'];
    saveHistory({
      time: Date.now(), ip, proxy: useProxy ? proxy : '', total: score.total, grade,
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

$('run').addEventListener('click', () => run(''));
$('runProxy').addEventListener('click', () => run($('proxy').value));
$('proxy').addEventListener('keydown', (e) => { if (e.key === 'Enter') run($('proxy').value); });
$('toggleAdv').addEventListener('click', () => {
  const panel = $('advPanel');
  const open = panel.classList.toggle('hidden');
  $('toggleAdv').textContent = (open ? '▸' : '▾') + ' 高级：检测其他地区 IP（填代理）';
});
$('clearHistory').addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });

fetch('/api/config').then((r) => r.json()).then(({ keys, proxyMode }) => {
  const on = Object.entries(keys).filter(([, v]) => v).map(([k]) => k);
  $('keyStatus').textContent = on.length
    ? `增强数据源已启用: ${on.join(', ')}`
    : '';
  // 公开部署默认关闭代理模式（防 SSRF），隐藏高级面板
  if (!proxyMode) {
    $('toggleAdv').parentElement.classList.add('hidden');
    $('advPanel').classList.add('hidden');
  }
}).catch(() => {});
renderHistory();
