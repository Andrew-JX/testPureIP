const FACTOR_KEYS = ['reputation', 'identity', 'environment', 'region', 'network', 'service'];

export const AI_SERVICES = Object.freeze({
  claude: { label: 'Claude Code / Claude', unlockKey: 'claude' },
  chatgpt: { label: 'ChatGPT', unlockKey: 'chatgpt' },
  gemini: { label: 'Gemini', unlockKey: 'gemini' },
  any: { label: '任一已测 AI 服务', unlockKey: null },
});

function factor(weight, strength, reason, { effect = 'weighted', evidence = 'derived', mayGate = false } = {}) {
  return { weight, strength, effect, evidence, mayGate, reason };
}

function scenario(config, factors) {
  return { ...config, factors, weights: Object.fromEntries(FACTOR_KEYS.map((key) => [key, factors[key].weight])) };
}

/**
 * 每个场景都明确说明六类因素是否计分、证据强度和理由。
 * 权重只表示 PureIP 的用途排序，不是任何平台公开的风控权重。
 */
export const SCENARIOS = {
  ai: scenario({
    label: 'AI 工具', noun: 'AI 工具', icon: 'AI',
    desc: '服务地区与真实可达性优先；滥用记录和泄漏是直接证据，机房、代理、VPN、共享出口只作弱上下文。',
  }, {
    reputation: factor(25, 'strong', '使用滥用记录、Tor、DNSBL 和公开代理暴露，不把“代理”标签本身当作违规。', { evidence: 'threat-intelligence' }),
    identity: factor(8, 'weak', '机房、代理、VPN 与共享出口可能影响挑战频率或稳定性，但没有公开固定权重，只作小幅上下文。', { evidence: 'provider-classification' }),
    environment: factor(7, 'medium', '仅计当前浏览器的真实 WebRTC 泄漏和自动化标志；时区、语言、字体只展示。', { evidence: 'browser-observation' }),
    region: factor(25, 'hard', '已知不支持地区可形成资格门槛；真实服务成功可覆盖可能过期的地理库结果。', { evidence: 'country-and-service-policy', mayGate: true }),
    network: factor(15, 'medium', '延迟、抖动、失败率和带宽决定交互体验。', { evidence: 'active-measurement' }),
    service: factor(20, 'strong', 'Claude、ChatGPT、Gemini 的实际可达结果比网络类型标签更直接。', { evidence: 'service-probe' }),
  }),
  browse: scenario({
    label: '轻松上网', noun: '日常跨境浏览', icon: 'WEB',
    desc: '网络质量和代表性网站实测优先；机房、代理、VPN、时区和浏览器画像会展示，但不降低日常浏览得分。',
  }, {
    reputation: factor(5, 'weak', '严重滥用或黑名单可能造成验证码和拒绝访问，但通常不是浏览体验的主因。', { evidence: 'threat-intelligence' }),
    identity: factor(0, 'none', '代理、VPN、机房和共享出口会在技术详情展示，但不代表网页一定不好用。', { effect: 'informational', evidence: 'provider-classification' }),
    environment: factor(0, 'none', '时区、语言、字体、自动化标志不用于判断普通网页速度与可达性。', { effect: 'informational', evidence: 'browser-observation' }),
    region: factor(10, 'hard', '出口所在地区只在存在明确跨境可达性限制时形成门槛。', { evidence: 'country-and-service-policy', mayGate: true }),
    network: factor(70, 'strong', '响应、抖动、失败率和实测带宽直接决定浏览体验。', { evidence: 'active-measurement' }),
    service: factor(15, 'strong', '代表性跨境网站的真实可达结果用于补充网络测量。', { evidence: 'service-probe' }),
  }),
  account: scenario({
    label: '账号 / 邮箱', noun: '账号与邮箱登录', icon: 'ID',
    desc: '已确认的滥用与服务实测优先；出口类型、共享程度和浏览器泄漏作为弱上下文，不能单独推出封号结论。',
  }, {
    reputation: factor(30, 'strong', '滥用举报、Tor、DNSBL 和公开代理暴露与账号挑战更直接相关。', { evidence: 'threat-intelligence' }),
    identity: factor(15, 'weak', '机房、代理、VPN、共享出口只提示可能的共享或漂移背景，不等于账号违规。', { evidence: 'provider-classification' }),
    environment: factor(10, 'weak', '真实 IP 泄漏与自动化标志可作为登录环境上下文；语言、字体、时区不作确定性判断。', { evidence: 'browser-observation' }),
    region: factor(15, 'medium', '不同账号服务支持地区不同；未选择具体服务时保持未测，不按国家标签猜满分。', { evidence: 'country-and-service-policy' }),
    network: factor(15, 'medium', '失败率和会话稳定性影响登录、验证与长连接。', { evidence: 'active-measurement' }),
    service: factor(15, 'strong', '目标账号服务的真实登录或 API 结果最直接；当前未选择具体服务时保持未测。', { evidence: 'service-probe' }),
  }),
  stream: scenario({
    label: '看剧', noun: '流媒体观看', icon: '4K',
    desc: '目标地区、真实解锁和稳定带宽决定结果；代理/VPN/机房标签只作弱上下文，不能覆盖成功的解锁实测。',
  }, {
    reputation: factor(5, 'weak', '严重滥用可能触发访问限制，但不是播放质量主因。', { evidence: 'threat-intelligence' }),
    identity: factor(5, 'weak', '流媒体可能识别代理或共享出口，但应让真实解锁结果占更高权重。', { evidence: 'provider-classification' }),
    environment: factor(0, 'none', '浏览器时区、语言和字体不用于判断流媒体解锁或带宽。', { effect: 'informational', evidence: 'browser-observation' }),
    region: factor(15, 'strong', '出口需匹配所选内容地区；明确不可达时可形成门槛。', { evidence: 'country-and-service-policy', mayGate: true }),
    network: factor(40, 'strong', '持续带宽、失败率与负载延迟直接决定缓冲风险。', { evidence: 'active-measurement' }),
    service: factor(35, 'strong', '所选流媒体的真实完整/部分/失败结果是最直接证据。', { evidence: 'service-probe' }),
  }),
  game: scenario({
    label: '打游戏', noun: '游戏连接', icon: 'PING',
    desc: '目标区服延迟、抖动、丢失和负载延迟占绝对主导；信誉与出口类型仅保留很弱的辅助影响。',
  }, {
    reputation: factor(3, 'weak', '严重滥用或黑名单偶尔影响登录与反作弊，但不代表线路延迟。', { evidence: 'threat-intelligence' }),
    identity: factor(2, 'weak', '代理、VPN、机房或共享出口可能影响个别游戏接入，只作极小幅上下文。', { evidence: 'provider-classification' }),
    environment: factor(0, 'none', '网页中的时区、语言、字体和 WebRTC 不代表游戏客户端链路。', { effect: 'informational', evidence: 'browser-observation' }),
    region: factor(20, 'strong', '目标区服的实测区域链路比 IP 注册国家更重要。', { evidence: 'active-measurement' }),
    network: factor(70, 'strong', '延迟、抖动、失败率和负载延迟直接决定游戏体验。', { evidence: 'active-measurement' }),
    service: factor(5, 'medium', '目标区服探针可达用于确认路由存在，不等于具体游戏账号状态。', { evidence: 'service-probe' }),
  }),
};

export const DIMENSION_LABELS = {
  reputation: '信誉与滥用', identity: '网络身份', environment: '环境一致性',
  region: '地区与可达性', network: '网络质量', service: '服务实测',
};

/** 多源国家结果取多数票；数据源一致率只表示证据可信度，不作为用途得分。 */
export function getCountryEvidence(basic) {
  const countries = Object.values(basic?.sources || {})
    .filter((source) => source && !source.error && !source.skipped && source.countryCode)
    .map((source) => String(source.countryCode).toUpperCase());
  if (!countries.length) return { country: '', agreement: null, samples: 0 };
  const counts = countries.reduce((map, country) => map.set(country, (map.get(country) || 0) + 1), new Map());
  const country = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return {
    country,
    agreement: Math.round(counts.get(country) / countries.length * 100),
    samples: countries.length,
  };
}

/** 已知服务地区限制是硬门槛；真实服务实测可以覆盖可能过期的地理数据库结果。 */
export function getRegionalAvailability(scenarioKey, basic, unlock, { streamService = 'netflix', aiService = 'claude' } = {}) {
  if (getCountryEvidence(basic).country !== 'CN') return null;

  const restrictions = {
    ai: {
      label: `中国大陆出口的 ${AI_SERVICES[aiService]?.label || AI_SERVICES.claude.label} 地区限制`,
      advice: 'IP 信誉干净不代表目标 AI 服务可用；应以该服务的官方支持地区和真实可达性为准。',
    },
    browse: {
      label: '中国大陆出口的跨境网站可达性限制',
      advice: '纯净度不能证明跨境网站可直接访问；应以目标网站的真实可达性和网络质量为准。',
    },
    stream: {
      label: '中国大陆出口的国际流媒体可达性限制',
      advice: '纯净度不能证明国际流媒体已解锁；应以目标服务的真实解锁结果为准。',
    },
  }[scenarioKey];
  if (!restrictions) return null;

  const streamKey = { netflix: 'netflix', disney: 'disneyPlus', youtube: 'youtubePremium' }[streamService];
  const fullyVerified = scenarioKey === 'ai'
    ? (aiService === 'any'
      ? [unlock?.claude?.status, unlock?.chatgpt?.status, unlock?.gemini?.status].some((status) => status === 'yes')
      : unlock?.[AI_SERVICES[aiService]?.unlockKey || AI_SERVICES.claude.unlockKey]?.status === 'yes')
    : scenarioKey === 'browse'
      ? unlock?.youtubePremium?.status === 'yes'
      : scenarioKey === 'stream'
        ? unlock?.[streamKey]?.status === 'yes'
        : false;
  if (fullyVerified) return null;

  return { score: 0, maximumScore: 45, ...restrictions };
}

function usable(value) {
  return value && !value.error && !value.skipped;
}

function hasType(value, pattern) {
  return pattern.test(String(value || ''));
}

/**
 * 将代理/VPN/机房/共享出口与第三方通用风险分保留为弱上下文。
 * 返回的分数只进入“网络身份”维度，绝不冒充已确认滥用或平台封号概率。
 */
export function calculateIdentityEvidence(scenarioKey, basic, risk) {
  const observations = [];
  const sources = Object.values(basic?.sources || {}).filter(usable);
  const pc = usable(risk?.proxycheck) ? risk.proxycheck : null;
  const ipqs = usable(risk?.ipqs) ? risk.ipqs : null;
  const hasEvidence = sources.length > 0 || Boolean(pc) || Boolean(ipqs);
  if (!hasEvidence) return { score: null, observations, available: false };

  const basicFlags = sources.map((source) => source.flags || {});
  const hosting = basicFlags.some((flags) => flags.hosting || flags.datacenter)
    || sources.some((source) => hasType(source.companyType, /hosting|datacenter|cloud/i))
    || hasType(pc?.type, /hosting|datacenter|cloud/i)
    || hasType(ipqs?.connectionType, /hosting|datacenter|cloud/i);
  const vpn = basicFlags.some((flags) => flags.vpn)
    || pc?.vpn === true
    || ipqs?.flags?.vpn === true
    || ipqs?.flags?.activeVpn === true
    || hasType(pc?.type, /vpn/i)
    || hasType(ipqs?.connectionType, /vpn/i);
  const proxy = basicFlags.some((flags) => flags.proxy)
    || pc?.proxy === true
    || ipqs?.flags?.proxy === true;
  const shared = ipqs?.sharedConnection === true;
  const highGenericScore = [pc?.score, ipqs?.score].some((value) => typeof value === 'number' && value >= 75);

  if (hosting) observations.push({ key: 'hosting', label: '机房 / 云网络标签', strength: 'weak' });
  if (vpn) observations.push({ key: 'vpn', label: 'VPN 标签', strength: 'weak' });
  else if (proxy) observations.push({ key: 'proxy', label: '代理标签', strength: 'weak' });
  if (shared) observations.push({ key: 'shared', label: '共享出口标签', strength: 'weak' });
  if (highGenericScore) observations.push({ key: 'generic-score', label: '第三方通用风险分偏高', strength: 'weak' });

  const penalties = {
    ai: { hosting: 10, vpn: 5, proxy: 6, shared: 12, 'generic-score': 5, cap: 28 },
    browse: { hosting: 0, vpn: 0, proxy: 0, shared: 0, 'generic-score': 0, cap: 0 },
    account: { hosting: 12, vpn: 6, proxy: 8, shared: 15, 'generic-score': 6, cap: 35 },
    stream: { hosting: 3, vpn: 6, proxy: 7, shared: 6, 'generic-score': 3, cap: 18 },
    game: { hosting: 1, vpn: 2, proxy: 2, shared: 3, 'generic-score': 1, cap: 7 },
  }[scenarioKey] || { cap: 0 };
  let remainingPenalty = penalties.cap;
  const appliedObservations = observations.map((item) => {
    const applied = Math.min(penalties[item.key] || 0, remainingPenalty);
    remainingPenalty -= applied;
    return { ...item, penalty: applied };
  });
  const penalty = penalties.cap - remainingPenalty;
  return {
    score: 100 - penalty,
    observations: appliedObservations,
    available: true,
  };
}

const PROXY_PORTS = new Set([1080, 3128, 8080, 8118, 9050, 1194, 51820]);

/**
 * 信誉分只使用滥用/Tor/黑名单/公开代理暴露等证据。
 * ProxyCheck/IPQS 的通用“代理/欺诈分”和 VPN/机房标签仍展示，但不自动等同于账号风险。
 */
export function calculateReputationScore(risk, dnsbl) {
  const cleanSignals = [];
  const abuse = risk?.abuseipdb?.score;
  if (typeof abuse === 'number') cleanSignals.push(100 - Math.max(0, Math.min(100, abuse)));
  const ipapi = risk?.ipapiis?.score;
  if (typeof ipapi === 'number') cleanSignals.push(100 - Math.max(0, Math.min(100, ipapi)));

  const quality = risk?.ipqs;
  if (quality && !quality.error && !quality.skipped) {
    const flags = quality.flags || {};
    const velocity = String(quality.abuseVelocity || '').toLowerCase();
    const explicitRisk = Math.max(
      flags.tor ? 100 : 0,
      flags.recentAbuse ? 80 : 0,
      flags.botStatus ? 60 : 0,
      velocity === 'high' ? 70 : velocity === 'medium' ? 40 : 0,
    );
    cleanSignals.push(100 - explicitRisk);
  }

  let clean = cleanSignals.length
    ? cleanSignals.reduce((sum, value) => sum + value, 0) / cleanSignals.length
    : null;
  const internetdb = risk?.internetdb;
  if (clean != null && internetdb && !internetdb.error && !internetdb.clean) {
    const hasOpenProxy = (internetdb.ports || []).some((port) => PROXY_PORTS.has(port))
      || /proxy|vpn/i.test((internetdb.tags || []).join());
    if (hasOpenProxy) clean -= 30;
    else if (internetdb.vulns?.length) clean -= 15;
  }

  let blacklist = null;
  if (dnsbl?.supported) {
    if (dnsbl.listedCount >= 2) blacklist = 10;
    else if (dnsbl.listedCount === 1) blacklist = 45;
    else {
      const checked = dnsbl.checkedCount ?? 0;
      blacklist = checked >= 5 ? 100 : checked >= 3 ? 88 : checked >= 1 ? 75 : 55;
    }
  }
  if (clean == null) return blacklist;
  if (blacklist == null) return Math.max(0, clean);
  return Math.max(0, clean * 0.75 + blacklist * 0.25);
}

/** 将场景权重与已知维度组合成估算值、缺失权重和保守区间。 */
export function calculateScenarioScore(profile, values, { maximumScore = 100 } = {}) {
  const dimensions = Object.entries(profile.weights).map(([key, weight]) => ({
    key,
    label: DIMENSION_LABELS[key] || key,
    weight,
    ...profile.factors?.[key],
    score: values[key],
    available: values[key] != null || weight === 0,
  }));
  const relevant = dimensions.filter((item) => item.weight > 0);
  const known = relevant.filter((item) => item.available);
  const knownWeight = known.reduce((sum, item) => sum + item.weight, 0);
  const weightedKnown = known.reduce((sum, item) => sum + item.score * item.weight / 100, 0);
  const rawEstimate = knownWeight ? Math.round(weightedKnown + (100 - knownWeight) * 0.5) : 0;
  const estimate = Math.min(rawEstimate, maximumScore);
  const missingWeight = 100 - knownWeight;
  const range = [
    Math.min(Math.round(weightedKnown), maximumScore),
    Math.min(Math.round(Math.min(100, weightedKnown + missingWeight)), maximumScore),
  ];
  const confidence = knownWeight >= 90 ? 'high' : knownWeight >= 60 ? 'medium' : 'low';
  const grade = estimate >= 85 ? '非常适合' : estimate >= 70 ? '适合' : estimate >= 55 ? '勉强可用' : '不推荐';
  const cls = estimate >= 75 ? 'good' : estimate >= 55 ? 'warn' : 'bad';
  return { profile, dimensions, estimate, knownWeight, missingWeight, range, confidence, grade, cls, maximumScore };
}

function statusScore(status) {
  return ({ yes: 100, partial: 55, no: 0 }[status] ?? null);
}

function selectedAiServiceScore(unlock, aiService) {
  if (!unlock) return null;
  if (aiService === 'any') {
    return averageKnown([
      statusScore(unlock.claude?.status),
      statusScore(unlock.chatgpt?.status),
      statusScore(unlock.gemini?.status),
    ]);
  }
  const key = AI_SERVICES[aiService]?.unlockKey || AI_SERVICES.claude.unlockKey;
  return statusScore(unlock[key]?.status);
}

function averageKnown(values) {
  const known = values.filter((value) => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

function targetRegionScore(scenarioKey, basic, network, regionalAvailability, options) {
  const country = getCountryEvidence(basic).country;
  if (regionalAvailability) return regionalAvailability.score;
  if (scenarioKey === 'stream') return country ? (country === options.streamRegion ? 100 : 42) : null;
  if (scenarioKey === 'game') {
    const region = network?.regions?.find((item) => item.id === options.gameRegion);
    return region?.available ? Math.max(25, region.score) : null;
  }
  if (scenarioKey === 'account') return Number.isFinite(options.accountRegionScore) ? options.accountRegionScore : null;
  return country ? 100 : null;
}

function selectedNetworkScore(scenarioKey, network, options) {
  if (!network) return null;
  const publicSpeed = options.publicSpeed;
  if (scenarioKey === 'stream') {
    const required = { '720p': 3, '1080p': 5, '4k': 15 }[options.streamQuality] ?? 15;
    const measuredDownload = publicSpeed?.downloadMbps ?? network.downloadMbps;
    const throughput = measuredDownload == null ? null : Math.min(100, measuredDownload / required * 100);
    return throughput == null ? network.score : Math.round(network.score * 0.7 + throughput * 0.3);
  }
  if (scenarioKey !== 'game') {
    if (!Number.isFinite(publicSpeed?.score)) return network.score;
    const speedWeight = scenarioKey === 'browse' ? 0.35 : 0.18;
    return Math.round(network.score * (1 - speedWeight) + publicSpeed.score * speedWeight);
  }
  const region = network.regions?.find((item) => item.id === options.gameRegion);
  if (!region?.available) return network.score;
  if (options.gameStyle === 'competitive') {
    const latencyPenalty = Math.max(0, region.avg - 35) * 0.65;
    const jitterPenalty = Math.max(0, region.jitter - 8) * 1.8;
    const loadPenalty = publicSpeed ? Math.max(0, publicSpeed.bufferbloat - 30) * 0.12 : 0;
    return Math.max(0, Math.round(100 - latencyPenalty - jitterPenalty - loadPenalty - region.loss * 8));
  }
  if (options.gameStyle === 'cloud') {
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

function selectedServiceScore(scenarioKey, unlock, network, options) {
  if (scenarioKey === 'ai') return selectedAiServiceScore(unlock, options.aiService);
  if (scenarioKey === 'browse' && unlock) return statusScore(unlock.youtubePremium?.status);
  if (scenarioKey === 'stream' && unlock) {
    const key = { netflix: 'netflix', disney: 'disneyPlus', youtube: 'youtubePremium' }[options.streamService];
    return statusScore(unlock[key]?.status);
  }
  if (scenarioKey === 'game') {
    const region = network?.regions?.find((item) => item.id === options.gameRegion);
    return region?.available ? 100 : null;
  }
  if (scenarioKey === 'account') return Number.isFinite(options.accountServiceScore) ? options.accountServiceScore : null;
  return null;
}

/** 单一场景评估入口：调用方只提供事实，所有权重、弱信号和硬门槛在这里统一解释。 */
export function evaluateScenario(scenarioKey, evidence = {}, options = {}) {
  const profile = SCENARIOS[scenarioKey];
  if (!profile) throw new Error(`Unknown scenario: ${scenarioKey}`);
  const resolvedOptions = {
    aiService: 'claude',
    streamService: 'netflix',
    streamRegion: 'US',
    streamQuality: '4k',
    gameRegion: 'oregon',
    gameStyle: 'casual',
    accountRegionScore: null,
    accountServiceScore: null,
    publicSpeed: null,
    ...options,
  };
  const regionalAvailability = getRegionalAvailability(scenarioKey, evidence.basic, evidence.unlock, resolvedOptions);
  const identity = calculateIdentityEvidence(scenarioKey, evidence.basic, evidence.risk);
  const values = {
    reputation: calculateReputationScore(evidence.risk, evidence.dnsbl),
    identity: identity.score,
    environment: profile.weights.environment > 0 ? evidence.agent?.score ?? null : null,
    region: targetRegionScore(scenarioKey, evidence.basic, evidence.network, regionalAvailability, resolvedOptions),
    network: selectedNetworkScore(scenarioKey, evidence.network, resolvedOptions),
    service: selectedServiceScore(scenarioKey, evidence.unlock, evidence.network, resolvedOptions),
  };
  const score = calculateScenarioScore(profile, values, { maximumScore: regionalAvailability?.maximumScore });
  return { ...score, regionalAvailability, identityEvidence: identity };
}
