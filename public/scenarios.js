export const SCENARIOS = {
  ai: {
    label: 'AI 工具', noun: 'AI 工具', icon: 'AI',
    desc: '重点检查地区可达性、IP 信誉、住宅属性和浏览器一致性；地区限制会优先于纯净度。',
    weights: { reputation: 25, identity: 20, environment: 15, region: 30, network: 5, service: 5 },
  },
  browse: {
    label: '轻松上网', noun: '日常跨境浏览', icon: 'WEB',
    desc: '重点检查网页响应、抖动、失败率、带宽和线路可达性。',
    weights: { reputation: 15, identity: 10, environment: 10, region: 20, network: 40, service: 5 },
  },
  account: {
    label: '账号 / 邮箱', noun: '账号与邮箱登录', icon: 'ID',
    desc: '重点检查 IP 信誉、位置与浏览器环境是否像一个稳定的真实用户。',
    weights: { reputation: 25, identity: 20, environment: 30, region: 15, network: 10, service: 0 },
  },
  stream: {
    label: '看剧', noun: '流媒体观看', icon: '4K',
    desc: '重点检查目标地区、代理识别、解锁结果、稳定带宽和缓冲风险。',
    weights: { reputation: 10, identity: 10, environment: 5, region: 25, network: 30, service: 20 },
  },
  game: {
    label: '打游戏', noun: '游戏连接', icon: 'PING',
    desc: '重点检查目标区服延迟、负载延迟、抖动和请求失败率。',
    weights: { reputation: 5, identity: 5, environment: 0, region: 15, network: 70, service: 5 },
  },
};

export const DIMENSION_LABELS = {
  reputation: '信誉与滥用', identity: '网络身份', environment: '环境一致性',
  region: '地区与可达性', network: '网络质量', service: '服务实测',
};

/** 将场景权重与已知维度组合成估算值、缺失权重和保守区间。 */
export function calculateScenarioScore(profile, values, { maximumScore = 100 } = {}) {
  const dimensions = Object.entries(profile.weights).map(([key, weight]) => ({
    key,
    label: DIMENSION_LABELS[key] || key,
    weight,
    score: values[key],
    available: values[key] != null || weight === 0,
  }));
  const relevant = dimensions.filter((item) => item.weight > 0);
  const known = relevant.filter((item) => item.available);
  const knownWeight = known.reduce((sum, item) => sum + item.weight, 0);
  const weightedKnown = known.reduce((sum, item) => sum + item.score * item.weight / 100, 0);
  const rawEstimate = knownWeight ? Math.round(weightedKnown * 100 / knownWeight) : 0;
  const estimate = Math.min(rawEstimate, maximumScore);
  const missingWeight = 100 - knownWeight;
  const range = [
    Math.min(Math.round(weightedKnown), maximumScore),
    Math.min(Math.round(Math.min(100, weightedKnown + missingWeight)), maximumScore),
  ];
  const confidence = knownWeight >= 90 ? 'high' : knownWeight >= 60 ? 'medium' : 'low';
  const grade = estimate >= 85 ? '非常适合' : estimate >= 70 ? '适合' : estimate >= 55 ? '勉强可用' : '不推荐';
  const cls = estimate >= 75 ? 'good' : estimate >= 55 ? 'warn' : 'bad';
  return { profile, dimensions, estimate, knownWeight, missingWeight, range, confidence, grade, cls, maximumScore };
}
