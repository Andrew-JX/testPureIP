import { getJson } from '../http.js';

/** ProxyCheck.io：风险分 0-100 + proxy/vpn 判定。无 key 100次/天，免费 key 1000次/天 */
async function proxycheck(ip, key) {
  const data = await getJson(
    `https://proxycheck.io/v2/${ip}?vpn=3&asn=1&risk=2${key ? `&key=${key}` : ''}`
  );
  if (data.__error) return { error: data.__error };
  if (data.status && data.status !== 'ok' && data.status !== 'warning') {
    return { error: data.message || data.status };
  }
  const d = data[ip];
  if (!d) return { error: '无返回数据' };
  return {
    score: typeof d.risk === 'number' ? d.risk : Number(d.risk) || 0,
    type: d.type, // Residential / Wireless / Business / Hosting / VPN ...
    proxy: d.proxy === 'yes',
    vpn: d.vpn === 'yes',
    operator: d.operator?.name,
  };
}

/** Shodan InternetDB：开放端口/漏洞/标签，免费无限制。住宅 IP 挂着代理端口 = 万人骑信号 */
async function internetdb(ip) {
  const data = await getJson(`https://internetdb.shodan.io/${ip}`);
  if (data.__error) {
    // 404 = Shodan 没扫到任何暴露面，是好事
    if (String(data.__error).includes('404')) return { clean: true, ports: [], tags: [], vulns: [] };
    return { error: data.__error };
  }
  return {
    clean: !(data.ports?.length || data.vulns?.length),
    ports: data.ports || [],
    tags: data.tags || [],
    vulns: (data.vulns || []).slice(0, 10),
    hostnames: data.hostnames || [],
  };
}

/** AbuseIPDB：滥用置信度 0-100 + 举报数 */
async function abuseipdb(ip, key) {
  if (!key) return { skipped: '未配置 API key' };
  const data = await getJson(
    `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`,
    { headers: { Key: key, Accept: 'application/json' } }
  );
  if (data.__error) return { error: data.__error };
  const d = data.data || {};
  return {
    score: d.abuseConfidenceScore,
    totalReports: d.totalReports,
    lastReportedAt: d.lastReportedAt,
    usageType: d.usageType,
    isTor: d.isTor,
  };
}

/** IPQualityScore：欺诈分 0-100 + 各风险标记 */
async function ipqs(ip, key) {
  if (!key) return { skipped: '未配置 API key' };
  const data = await getJson(
    `https://ipqualityscore.com/api/json/ip/${key}/${ip}?strictness=1&allow_public_access_points=true`
  );
  if (data.__error) return { error: data.__error };
  if (data.success === false) return { error: data.message };
  return {
    score: data.fraud_score,
    flags: {
      proxy: data.proxy,
      vpn: data.vpn,
      activeVpn: data.active_vpn,
      tor: data.tor,
      recentAbuse: data.recent_abuse,
      botStatus: data.bot_status,
      isCrawler: data.is_crawler,
    },
    connectionType: data.connection_type,
    abuseVelocity: data.abuse_velocity,
    sharedConnection: data.shared_connection, // 万人骑指标
  };
}

/** ipapi.is 的滥用/代理布尔标记折算为分数参考 */
function ipapiIsRisk(ipapiIsData) {
  if (!ipapiIsData || ipapiIsData.error || ipapiIsData.skipped) return null;
  const f = ipapiIsData.flags || {};
  let score = 0;
  if (f.abuser) score += 50;
  if (f.proxy) score += 30;
  if (f.vpn) score += 20;
  if (f.tor) score += 50;
  if (f.datacenter) score += 15;
  return Math.min(100, score);
}

export async function riskScores(ip, keys = {}, basicResult = null) {
  const [pc, idb, abuse, quality] = await Promise.all([
    proxycheck(ip, keys.proxycheck),
    internetdb(ip),
    abuseipdb(ip, keys.abuseipdb),
    ipqs(ip, keys.ipqs),
  ]);
  return {
    proxycheck: pc,
    internetdb: idb,
    abuseipdb: abuse,
    ipqs: quality,
    ipapiis: {
      score: ipapiIsRisk(basicResult?.sources?.['ipapi.is']),
      note: '由 ipapi.is 布尔风险标记折算',
    },
  };
}
