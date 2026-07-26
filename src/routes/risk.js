import { isPublicIp } from '../../public/ip-validation.js';

/**
 * 风险路由只接收客户端提供的 IP；所有评分证据必须由服务端加载。
 * 依赖以函数注入，便于测试信任边界且不触发真实第三方 API。
 */
export function createRiskHandler({ loadBasic, scoreRisk }) {
  if (typeof loadBasic !== 'function' || typeof scoreRisk !== 'function') {
    throw new TypeError('createRiskHandler requires loadBasic and scoreRisk');
  }

  return async function riskHandler(req, res) {
    const { ip } = req.body || {};
    if (!isPublicIp(ip)) return res.status(400).json({ error: '请输入有效的公网 IP 地址' });
    const trustedBasic = await loadBasic(ip);
    return res.json(await scoreRisk(ip, trustedBasic));
  };
}
