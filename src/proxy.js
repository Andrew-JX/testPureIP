import { ProxyAgent, Agent } from 'undici';
import { socksDispatcher } from 'fetch-socks';

const DEFAULT_TIMEOUT = { connectTimeout: 10_000, headersTimeout: 15_000, bodyTimeout: 15_000 };

/**
 * 根据代理地址构建 undici dispatcher。
 * 支持: 空(直连) / http(s)://[user:pass@]host:port / socks5://[user:pass@]host:port
 */
export function buildDispatcher(proxyUrl) {
  if (!proxyUrl || !proxyUrl.trim()) {
    return new Agent(DEFAULT_TIMEOUT);
  }
  const url = new URL(proxyUrl.trim());
  const protocol = url.protocol.replace(':', '').toLowerCase();

  if (protocol === 'http' || protocol === 'https') {
    return new ProxyAgent({ uri: url.href, ...DEFAULT_TIMEOUT });
  }
  if (protocol === 'socks5' || protocol === 'socks5h' || protocol === 'socks4' || protocol === 'socks') {
    return socksDispatcher({
      type: protocol.startsWith('socks4') ? 4 : 5,
      host: url.hostname,
      port: Number(url.port) || 1080,
      userId: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    });
  }
  throw new Error(`不支持的代理协议: ${protocol}（支持 http/https/socks5）`);
}
