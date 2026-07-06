import { getJson } from '../http.js';

/** 通过代理探测出口 IP（多源兜底） */
export async function detectExitIp(dispatcher) {
  const sources = [
    'https://api.ipify.org?format=json',
    'https://api.ip.sb/jsonip',
    'https://ipinfo.io/json',
  ];
  for (const url of sources) {
    const data = await getJson(url, { dispatcher, timeout: 10_000 });
    if (data && !data.__error && (data.ip || data.query)) return data.ip || data.query;
  }
  throw new Error('无法通过该出口获取 IP，请检查代理是否可用');
}

/**
 * 多源基础信息。查询"关于某个 IP"的接口直连即可（不需要走代理），更快更稳。
 * keys: { ipinfo, ipapiis }
 */
export async function basicInfo(ip, keys = {}) {
  const [ipapi, ipwhois, ipapiIs, ipinfo] = await Promise.all([
    // ip-api.com 免费版仅 http
    getJson(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`
    ),
    getJson(`https://ipwho.is/${ip}`),
    getJson(`https://api.ipapi.is/?q=${ip}${keys.ipapiis ? `&key=${keys.ipapiis}` : ''}`),
    keys.ipinfo
      ? getJson(`https://api.ipinfo.io/lite/${ip}?token=${keys.ipinfo}`)
      : Promise.resolve(null),
  ]);

  return {
    ip,
    sources: {
      'ip-api.com': ipapi.__error
        ? { error: ipapi.__error }
        : {
            country: ipapi.country,
            countryCode: ipapi.countryCode,
            region: ipapi.regionName,
            city: ipapi.city,
            timezone: ipapi.timezone,
            isp: ipapi.isp,
            org: ipapi.org,
            asn: ipapi.as,
            rdns: ipapi.reverse || null,
            flags: { mobile: ipapi.mobile, proxy: ipapi.proxy, hosting: ipapi.hosting },
          },
      'ipwho.is': ipwhois.__error
        ? { error: ipwhois.__error }
        : {
            country: ipwhois.country,
            countryCode: ipwhois.country_code,
            city: ipwhois.city,
            timezone: ipwhois.timezone?.id,
            isp: ipwhois.connection?.isp,
            org: ipwhois.connection?.org,
            asn: ipwhois.connection?.asn ? `AS${ipwhois.connection.asn}` : null,
          },
      'ipapi.is': ipapiIs.__error
        ? { error: ipapiIs.__error }
        : {
            country: ipapiIs.location?.country,
            countryCode: ipapiIs.location?.country_code,
            region: ipapiIs.location?.state,
            city: ipapiIs.location?.city,
            timezone: ipapiIs.location?.timezone,
            isp: ipapiIs.company?.name,
            org: ipapiIs.asn?.org,
            asn: ipapiIs.asn?.asn ? `AS${ipapiIs.asn.asn}` : null,
            companyType: ipapiIs.company?.type, // isp / hosting / business / education
            asnType: ipapiIs.asn?.type,
            asDomain: ipapiIs.company?.domain || ipapiIs.asn?.domain || null,
            network: ipapiIs.company?.network || null, // IP 段
            route: ipapiIs.asn?.route || null, // 路由前缀
            abuserScore: ipapiIs.asn?.abuser_score || ipapiIs.company?.abuser_score || null,
            flags: {
              datacenter: ipapiIs.is_datacenter,
              proxy: ipapiIs.is_proxy,
              vpn: ipapiIs.is_vpn,
              tor: ipapiIs.is_tor,
              abuser: ipapiIs.is_abuser,
              crawler: ipapiIs.is_crawler,
              mobile: ipapiIs.is_mobile,
            },
          },
      'ipinfo Lite': !ipinfo
        ? { skipped: '未配置 API key' }
        : ipinfo.__error
          ? { error: ipinfo.__error }
          : {
              country: ipinfo.country,
              countryCode: ipinfo.country_code,
              org: ipinfo.as_name,
              asn: ipinfo.asn,
              asDomain: ipinfo.as_domain,
            },
    },
  };
}
