import dns from 'node:dns/promises';

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
 * DNS 黑名单查询（判断 IP 是不是"万人骑"发过垃圾/滥用的重要信号）。
 * 命中 = 解析成功返回 127.0.0.x；NXDOMAIN = 干净。
 */
export async function dnsblCheck(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return { supported: false, note: '仅支持 IPv4', lists: [] };
  }
  const reversed = ip.split('.').reverse().join('.');
  const resolver = new dns.Resolver({ timeout: 5000, tries: 1 });

  const lists = await Promise.all(
    LISTS.map(async ({ zone, name }) => {
      try {
        const answers = await resolver.resolve4(`${reversed}.${zone}`);
        // Spamhaus 对公共 DNS 返回 127.255.255.x 表示"拒绝查询"而非命中
        const blockedQuery = answers.some((a) => a.startsWith('127.255.255.'));
        if (blockedQuery) return { name, status: 'unknown', note: '查询被拒（公共DNS限制）' };
        return { name, status: 'listed', answers };
      } catch (e) {
        if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') return { name, status: 'clean' };
        return { name, status: 'unknown', note: e.code || 'timeout' };
      }
    })
  );

  const listedCount = lists.filter((l) => l.status === 'listed').length;
  const checkedCount = lists.filter((l) => l.status !== 'unknown').length;
  return { supported: true, listedCount, checkedCount, lists };
}
