import { getJson } from '../http.js';

// 每个 DNSBL 用 host(reversed) 构造查询域名。Spamhaus 在有 DQS key 时走专用 dq 域名。
function buildLists(dqsKey) {
  const spamhaus = dqsKey
    ? { host: (r) => `${r}.${dqsKey}.zen.dq.spamhaus.net`, name: 'Spamhaus ZEN', dqs: true }
    : { host: (r) => `${r}.zen.spamhaus.org`, name: 'Spamhaus ZEN' };
  return [
    spamhaus,
    { host: (r) => `${r}.bl.spamcop.net`, name: 'SpamCop' },
    { host: (r) => `${r}.b.barracudacentral.org`, name: 'Barracuda' },
    { host: (r) => `${r}.dnsbl.dronebl.org`, name: 'DroneBL' },
    { host: (r) => `${r}.psbl.surriel.com`, name: 'PSBL' },
    { host: (r) => `${r}.all.s5h.net`, name: 's5h.net' },
    { host: (r) => `${r}.db.wpbl.info`, name: 'WPBL' },
    { host: (r) => `${r}.ix.dnsbl.manitu.net`, name: 'NiX Spam' },
  ];
}

/**
 * 用 DoH（DNS over HTTPS）查询，规避云主机 UDP 53 被墙 / 超时。
 * 优先 Google，失败退 Cloudflare。返回 { Status, Answer:[{type,data}] }。
 */
async function dohQuery(host) {
  let data = await getJson(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, { timeout: 6000 });
  if (data.__error) {
    data = await getJson(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, {
      timeout: 6000,
      headers: { Accept: 'application/dns-json' },
    });
  }
  return data;
}

// Spamhaus / Barracuda 等对公共解析器的"拒绝"标记（藏在 NXDOMAIN 的 SOA 里）
const REFUSAL = /need\.to\.know|not\.available|not\.authorized|refused|blocked|rbl\.local/i;

/** 解析单个 DNSBL 查询结果。authenticated=true（DQS 等已授权）时 NXDOMAIN 即为干净。 */
async function queryList(host, authenticated) {
  const data = await dohQuery(host);
  if (data.__error) return { status: 'unknown', note: data.__error };
  // DNS Status: 3 = NXDOMAIN（未列入）；0 = NOERROR（有记录）
  if (data.Status === 3) {
    // 未授权（公共版）时，Spamhaus/Barracuda 的拒绝也是 NXDOMAIN，需靠 SOA 标记识别；
    // 已授权（DQS key）时同样的 SOA 代表真正"未命中"，直接判干净。
    if (!authenticated) {
      const soa = (data.Authority || []).find((a) => a.type === 6);
      if (soa && REFUSAL.test(soa.data || '')) {
        return { status: 'unknown', note: '拒绝公共解析器（需自建 / 付费解析器）' };
      }
    }
    return { status: 'clean' };
  }
  if (data.Status === 0) {
    const ips = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
    if (!ips.length) return { status: 'clean' };
    // 127.255.255.x = 拒绝公共解析器查询；DQS key 无效也会返回该段
    if (ips.some((ip) => ip.startsWith('127.255.255.'))) {
      return { status: 'unknown', note: '查询被拒（公共解析器限制 / DQS key 无效）' };
    }
    return { status: 'listed', answers: ips };
  }
  return { status: 'unknown', note: `DNS status ${data.Status}` };
}

/**
 * DNS 黑名单查询。dqsKey 存在时 Spamhaus 走 DQS 专用域名（能真正查到，金标准）。
 * checkedCount 只统计有效（clean/listed）的库，供上层判断覆盖度、避免假阴性。
 */
export async function dnsblCheck(ip, dqsKey) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return { supported: false, note: '仅支持 IPv4', lists: [] };
  }
  const reversed = ip.split('.').reverse().join('.');
  const defs = buildLists(dqsKey);
  const lists = await Promise.all(
    defs.map(async ({ host, name, dqs }) => ({ name, ...(await queryList(host(reversed), dqs)) }))
  );

  const listedCount = lists.filter((l) => l.status === 'listed').length;
  const cleanCount = lists.filter((l) => l.status === 'clean').length;
  const checkedCount = listedCount + cleanCount;
  return { supported: true, listedCount, cleanCount, checkedCount, total: defs.length, lists };
}
