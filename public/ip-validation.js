function parseIpv4(value) {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  if (!parts.every((part) => /^\d{1,3}$/.test(part) && !(part.length > 1 && part.startsWith('0')))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function parseIpv6(value) {
  if (!value || value.includes('.') || !/^[0-9a-f:]+$/i.test(value)) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;

  const parseHalf = (half) => {
    if (!half) return [];
    const parts = half.split(':');
    if (!parts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) return null;
    return parts.map((part) => Number.parseInt(part, 16));
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] || '');
  if (!left || !right) return null;

  const compressed = halves.length === 2;
  const explicitCount = left.length + right.length;
  if ((!compressed && explicitCount !== 8) || (compressed && explicitCount >= 8)) return null;
  return [...left, ...Array(compressed ? 8 - explicitCount : 0).fill(0), ...right];
}

function inIpv6Cidr(groups, base, prefixLength) {
  const fullGroups = Math.floor(prefixLength / 16);
  for (let index = 0; index < fullGroups; index++) {
    if (groups[index] !== base[index]) return false;
  }
  const remaining = prefixLength % 16;
  if (!remaining) return true;
  const mask = (0xffff << (16 - remaining)) & 0xffff;
  return (groups[fullGroups] & mask) === (base[fullGroups] & mask);
}

const blockedIpv6 = [
  ['2001::', 23], // IETF 协议分配（含 Teredo、基准测试等），不是普通主机地址
  ['2001:db8::', 32], // 文档示例
  ['2002::', 16], // 已弃用的 6to4
  ['3fff::', 20], // 文档示例
].map(([address, prefix]) => [parseIpv6(address), prefix]);

function isPublicIpv4(octets) {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/**
 * 浏览器与服务端共用的公网 IP 校验。
 * 拒绝私网、共享地址、链路本地、组播、文档与其他保留地址。
 */
export function isPublicIp(value) {
  if (typeof value !== 'string' || value.length < 2 || value.length > 45 || value !== value.trim()) return false;
  if (value.includes('.')) {
    const ipv4 = parseIpv4(value);
    return Boolean(ipv4 && isPublicIpv4(ipv4));
  }
  if (!value.includes(':')) return false;
  const ipv6 = parseIpv6(value);
  if (!ipv6 || ipv6[0] < 0x2000 || ipv6[0] > 0x3fff) return false;
  return !blockedIpv6.some(([base, prefix]) => inIpv6Cidr(ipv6, base, prefix));
}
