import { getJson } from '../http.js';

const LISTS = [
  { zone: 'zen.spamhaus.org', name: 'Spamhaus ZEN' },
  { zone: 'bl.spamcop.net', name: 'SpamCop' },
  { zone: 'b.barracudacentral.org', name: 'Barracuda' },
  { zone: 'dnsbl.dronebl.org', name: 'DroneBL' },
  { zone: 'psbl.surriel.com', name: 'PSBL' },
  { zone: 'all.s5h.net', name: 's5h.net' },
  { zone: 'db.wpbl.info', name: 'WPBL' },
  { zone: 'ix.dnsbl.manitu.net', name: 'NiX Spam' },
];

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

/** 解析单个 DNSBL 查询结果 */
async function queryList(reversed, zone) {
  const data = await dohQuery(`${reversed}.${zone}`);
  if (data.__error) return { status: 'unknown', note: data.__error };
  // DNS Status: 3 = NXDOMAIN（未列入）；0 = NOERROR（有记录）
  if (data.Status === 3) {
    // 部分 DNSBL 对公共解析器返回 NXDOMAIN + 特殊 SOA 表示"拒绝"，不能当作干净
    const soa = (data.Authority || []).find((a) => a.type === 6);
    if (soa && REFUSAL.test(soa.data || '')) {
      return { status: 'unknown', note: '拒绝公共解析器（需自建 / 付费解析器）' };
    }
    return { status: 'clean' };
  }
  if (data.Status === 0) {
    const ips = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
    if (!ips.length) return { status: 'clean' };
    // 127.255.255.x = 该 DNSBL 拒绝来自公共解析器的查询（非真正命中）
    if (ips.some((ip) => ip.startsWith('127.255.255.'))) {
      return { status: 'unknown', note: '查询被拒（公共解析器限制，需自建解析器）' };
    }
    return { status: 'listed', answers: ips };
  }
  return { status: 'unknown', note: `DNS status ${data.Status}` };
}

/**
 * DNS 黑名单查询：判断 IP 是否被垃圾邮件 / 滥用黑名单收录（“万人骑”共享 IP 的信号）。
 * checkedCount 只统计真正有效（clean/listed）的库，供上层判断覆盖度、避免假阴性。
 */
export async function dnsblCheck(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return { supported: false, note: '仅支持 IPv4', lists: [] };
  }
  const reversed = ip.split('.').reverse().join('.');
  const lists = await Promise.all(
    LISTS.map(async ({ zone, name }) => ({ name, ...(await queryList(reversed, zone)) }))
  );

  const listedCount = lists.filter((l) => l.status === 'listed').length;
  const cleanCount = lists.filter((l) => l.status === 'clean').length;
  const checkedCount = listedCount + cleanCount; // 真正有效查询数
  return { supported: true, listedCount, cleanCount, checkedCount, total: LISTS.length, lists };
}
