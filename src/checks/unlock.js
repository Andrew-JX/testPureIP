import { getText, getJson } from '../http.js';

/**
 * AI / 流媒体解锁实测。全部通过 dispatcher（即目标出口）发起。
 * 返回值 status: 'yes' | 'no' | 'partial' | 'unknown'
 */

async function claude(dispatcher) {
  const r = await getText('https://claude.ai/', { dispatcher, redirect: 'follow', timeout: 15_000 });
  if (r.status === 0) return { status: 'unknown', note: r.error };
  if (r.url.includes('app-unavailable') || /unavailable-in-region/i.test(r.text)) {
    return { status: 'no', note: '地区不可用（app-unavailable）' };
  }
  if (r.status === 403) {
    return { status: 'no', note: 'HTTP 403 — 被 Cloudflare 拦截，IP 信誉差的典型表现' };
  }
  if (r.status === 200) {
    // 页面含验证码挑战说明 IP 被重点盯防
    if (/cf-challenge|turnstile|Just a moment/i.test(r.text)) {
      return { status: 'partial', note: '可访问但触发人机验证（IP 信誉一般）' };
    }
    return { status: 'yes', note: '正常访问' };
  }
  return { status: 'unknown', note: `HTTP ${r.status}` };
}

async function chatgpt(dispatcher) {
  const trace = await getText('https://chatgpt.com/cdn-cgi/trace', { dispatcher, timeout: 15_000 });
  const loc = trace.text.match(/^loc=(\w+)/m)?.[1] || null;
  const api = await getJson('https://api.openai.com/compliance/cookie_requirements', {
    dispatcher,
    timeout: 15_000,
  });
  const apiBlocked = api.__error || /unsupported_country/i.test(JSON.stringify(api));
  const page = await getText('https://chatgpt.com/', { dispatcher, redirect: 'follow', timeout: 15_000 });
  const pageOk = page.status === 200 && !/Just a moment|unsupported_country/i.test(page.text);

  if (pageOk && !apiBlocked) return { status: 'yes', region: loc, note: '网页与 API 均可用' };
  if (pageOk && apiBlocked) return { status: 'partial', region: loc, note: '网页可用，API 受限' };
  if (page.status === 403) return { status: 'no', region: loc, note: 'HTTP 403 — IP 被拦截' };
  return { status: 'unknown', region: loc, note: `网页 HTTP ${page.status}` };
}

async function gemini(dispatcher) {
  const r = await getText('https://gemini.google.com/', { dispatcher, redirect: 'follow', timeout: 15_000 });
  if (r.status === 0) return { status: 'unknown', note: r.error };
  if (/not (?:currently )?available in your country/i.test(r.text)) {
    return { status: 'no', note: '地区不可用' };
  }
  return r.status === 200 ? { status: 'yes' } : { status: 'unknown', note: `HTTP ${r.status}` };
}

async function netflix(dispatcher) {
  // 81280792 = 非自制剧集，能看说明完整解锁；404 = 仅自制剧；403 = 全锁
  const r = await getText('https://www.netflix.com/title/81280792', {
    dispatcher,
    redirect: 'follow',
    timeout: 15_000,
  });
  if (r.status === 0) return { status: 'unknown', note: r.error };
  const region = r.url.match(/netflix\.com\/([a-z]{2}(?:-[a-z]+)?)\//i)?.[1]?.toUpperCase() || null;
  if (r.status === 200) return { status: 'yes', region, note: '完整解锁（含非自制剧）' };
  if (r.status === 404) return { status: 'partial', region, note: '仅解锁 Netflix 自制剧' };
  if (r.status === 403) return { status: 'no', note: '不支持该出口（403）' };
  return { status: 'unknown', note: `HTTP ${r.status}` };
}

async function youtubePremium(dispatcher) {
  const r = await getText('https://www.youtube.com/premium', {
    dispatcher,
    redirect: 'follow',
    timeout: 15_000,
    headers: { Cookie: 'CONSENT=YES+cb; SOCS=CAI' },
  });
  if (r.status !== 200) return { status: 'unknown', note: r.error || `HTTP ${r.status}` };
  const region = r.text.match(/"countryCode":"(\w+)"/)?.[1] || null;
  if (/Premium is not available in your country/i.test(r.text)) {
    return { status: 'no', region, note: 'Premium 不可用' };
  }
  return { status: 'yes', region };
}

async function disneyPlus(dispatcher) {
  const r = await getText('https://www.disneyplus.com/', { dispatcher, redirect: 'follow', timeout: 15_000 });
  if (r.status === 0) return { status: 'unknown', note: r.error };
  if (/unavailable|not available in your region/i.test(r.url + r.text.slice(0, 3000))) {
    return { status: 'no' };
  }
  const region = r.url.match(/disneyplus\.com\/([a-z]{2}(?:-[a-z]+)?)\//i)?.[1]?.toUpperCase() || null;
  return r.status === 200 ? { status: 'yes', region } : { status: 'unknown', note: `HTTP ${r.status}` };
}

async function tiktok(dispatcher) {
  const r = await getText('https://www.tiktok.com/', { dispatcher, redirect: 'follow', timeout: 15_000 });
  if (r.status === 0) return { status: 'unknown', note: r.error };
  const region = r.text.match(/"region"\s*:\s*"(\w+)"/)?.[1] || null;
  if (r.status === 200 && region) return { status: 'yes', region };
  if (r.status === 403 || r.status === 451) return { status: 'no', note: `HTTP ${r.status}` };
  return { status: r.status === 200 ? 'yes' : 'unknown', region, note: region ? null : '未识别地区' };
}

export async function unlockChecks(dispatcher) {
  const entries = await Promise.allSettled([
    claude(dispatcher),
    chatgpt(dispatcher),
    gemini(dispatcher),
    netflix(dispatcher),
    youtubePremium(dispatcher),
    disneyPlus(dispatcher),
    tiktok(dispatcher),
  ]);
  const names = ['claude', 'chatgpt', 'gemini', 'netflix', 'youtubePremium', 'disneyPlus', 'tiktok'];
  const out = {};
  entries.forEach((e, i) => {
    out[names[i]] = e.status === 'fulfilled' ? e.value : { status: 'unknown', note: String(e.reason) };
  });
  return out;
}
