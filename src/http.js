import { fetch } from 'undici';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 带超时的 fetch。dispatcher 为 undici dispatcher（决定直连还是走代理）。
 */
export async function get(url, { dispatcher, timeout = 12_000, headers = {}, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      dispatcher,
      redirect,
      signal: controller.signal,
      headers: { 'User-Agent': UA, ...headers },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET 并解析 JSON，失败返回 { __error } 而不是抛异常 */
export async function getJson(url, opts = {}) {
  try {
    const res = await get(url, opts);
    if (!res.ok) return { __error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { __error: e.cause?.code || e.message || String(e) };
  }
}

/** GET 并返回文本，失败返回 null */
export async function getText(url, opts = {}) {
  try {
    const res = await get(url, opts);
    return { status: res.status, url: res.url, text: await res.text() };
  } catch (e) {
    return { status: 0, url, text: '', error: e.cause?.code || e.message };
  }
}
