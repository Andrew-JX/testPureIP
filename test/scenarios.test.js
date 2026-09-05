import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENARIOS,
  calculateIdentityEvidence,
  calculateReputationScore,
  calculateScenarioScore,
  evaluateScenario,
  getCountryEvidence,
  getRegionalAvailability,
} from '../public/scenarios.js';

test('every scenario has a complete, non-negative 100% weight profile', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const weights = Object.values(scenario.weights);
    assert.equal(weights.reduce((sum, weight) => sum + weight, 0), 100, name);
    assert.equal(weights.every((weight) => Number.isFinite(weight) && weight >= 0), true, name);
  }
});

test('scenario score reports missing weight and a conservative range', () => {
  const profile = { weights: { reputation: 60, network: 40 } };
  const score = calculateScenarioScore(profile, { reputation: 80, network: null });

  assert.equal(score.estimate, 68);
  assert.equal(score.knownWeight, 60);
  assert.equal(score.missingWeight, 40);
  assert.deepEqual(score.range, [48, 88]);
  assert.equal(score.confidence, 'medium');
});

test('scenario score does not treat zero-weight dimensions as missing', () => {
  const profile = { weights: { reputation: 100, service: 0 } };
  const score = calculateScenarioScore(profile, { reputation: 90, service: null });

  assert.equal(score.estimate, 90);
  assert.equal(score.missingWeight, 0);
  assert.equal(score.dimensions.find((item) => item.key === 'service').available, true);
});

test('every scenario classifies every factor by evidence role and strength', () => {
  const expectedFactors = ['reputation', 'identity', 'environment', 'region', 'network', 'service'];
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    assert.deepEqual(Object.keys(scenario.factors || {}), expectedFactors, name);
    for (const factor of expectedFactors) {
      const definition = scenario.factors[factor];
      assert.equal(typeof definition.reason, 'string', `${name}.${factor}.reason`);
      assert.ok(definition.reason.length > 0, `${name}.${factor}.reason`);
      assert.ok(['hard', 'strong', 'medium', 'weak', 'none'].includes(definition.strength), `${name}.${factor}.strength`);
      assert.ok(['weighted', 'informational'].includes(definition.effect), `${name}.${factor}.effect`);
      assert.equal(definition.weight, scenario.weights[factor], `${name}.${factor}.weight`);
    }
  }
});

test('weak network identity is considered where it can matter, without outweighing direct service evidence', () => {
  for (const name of ['ai', 'account', 'stream', 'game']) {
    assert.ok(SCENARIOS[name].weights.identity > 0, `${name} should consider network identity`);
    assert.equal(SCENARIOS[name].factors.identity.strength, 'weak', name);
  }
  assert.equal(SCENARIOS.browse.weights.identity, 0);
  assert.equal(SCENARIOS.browse.factors.identity.effect, 'informational');
  assert.ok(SCENARIOS.ai.weights.service > SCENARIOS.ai.weights.identity);
  assert.ok(SCENARIOS.stream.weights.service > SCENARIOS.stream.weights.identity);
});

test('scenario score honors a hard availability ceiling', () => {
  const profile = { weights: { reputation: 50, region: 50 } };
  const score = calculateScenarioScore(profile, { reputation: 100, region: 0 }, { maximumScore: 45 });

  assert.equal(score.estimate, 45);
  assert.deepEqual(score.range, [45, 45]);
  assert.equal(score.grade, '不推荐');
});

test('casual browsing is not penalized by browser fingerprint signals', () => {
  const score = calculateScenarioScore(SCENARIOS.browse, {
    reputation: 100,
    identity: 100,
    environment: 0,
    region: 100,
    network: 100,
    service: 100,
  });

  assert.equal(SCENARIOS.browse.weights.environment, 0);
  assert.equal(score.estimate, 100);
});

test('country evidence uses the majority and does not turn agreement into suitability', () => {
  const basic = { sources: {
    stale: { countryCode: 'US' },
    sourceA: { countryCode: 'CN' },
    sourceB: { countryCode: 'CN' },
  } };

  assert.deepEqual(getCountryEvidence(basic), { country: 'CN', agreement: 67, samples: 3 });
});

test('mainland China AI and browsing results have a hard ceiling without real service verification', () => {
  const basic = { sources: {
    sourceA: { countryCode: 'CN' },
    sourceB: { countryCode: 'CN' },
  } };

  assert.equal(getRegionalAvailability('ai', basic, null).maximumScore, 45);
  assert.equal(getRegionalAvailability('browse', basic, null).maximumScore, 45);
  assert.equal(getRegionalAvailability('account', basic, null), null);
  assert.equal(getRegionalAvailability('ai', basic, {
    claude: { status: 'yes' }, chatgpt: { status: 'no' }, gemini: { status: 'no' },
  }), null);

  const unmeasured = evaluateScenario('ai', {
    basic,
    risk: { ipapiis: { score: 0 } },
    dnsbl: { supported: true, listedCount: 0, checkedCount: 5 },
    agent: { score: 100 },
    network: { score: 100 },
  });
  assert.equal(unmeasured.maximumScore, 45);
  assert.equal(unmeasured.dimensions.find((item) => item.key === 'service').available, false);
});

test('AI target provider is not cleared by another provider being reachable', () => {
  const basic = { sources: {
    sourceA: { countryCode: 'CN' },
    sourceB: { countryCode: 'CN' },
  } };
  const unlock = {
    claude: { status: 'no' },
    chatgpt: { status: 'yes' },
    gemini: { status: 'yes' },
  };
  const evidence = {
    basic,
    unlock,
    risk: { ipapiis: { score: 0 } },
    dnsbl: { supported: true, listedCount: 0, checkedCount: 5 },
    agent: { score: 100 },
    network: { score: 100 },
  };

  assert.equal(getRegionalAvailability('ai', basic, unlock, { aiService: 'claude' }).maximumScore, 45);
  assert.equal(getRegionalAvailability('ai', basic, unlock, { aiService: 'chatgpt' }), null);
  assert.equal(evaluateScenario('ai', evidence, { aiService: 'claude' }).dimensions.find((item) => item.key === 'service').score, 0);
  assert.equal(evaluateScenario('ai', evidence, { aiService: 'chatgpt' }).dimensions.find((item) => item.key === 'service').score, 100);
});

test('VPN, datacenter and generic proxy scores stay out of abuse reputation but remain weak context', () => {
  const risk = {
    proxycheck: { score: 99, proxy: true, vpn: true },
    ipqs: { score: 99, sharedConnection: true, flags: { proxy: true, vpn: true, recentAbuse: false, tor: false } },
  };
  const basic = { sources: { sourceA: { countryCode: 'US', flags: { hosting: true } } } };
  const score = calculateReputationScore(risk, null);

  assert.equal(score, 100);
  assert.equal(calculateIdentityEvidence('browse', basic, risk).score, 100);
  assert.ok(calculateIdentityEvidence('ai', basic, risk).score >= 70);
  assert.ok(calculateIdentityEvidence('ai', basic, risk).score < 100);
  assert.ok(calculateIdentityEvidence('account', basic, risk).score < 100);
  assert.ok(calculateIdentityEvidence('game', basic, risk).score >= 90);
  const aiIdentity = calculateIdentityEvidence('ai', basic, risk);
  assert.equal(
    aiIdentity.observations.reduce((sum, item) => sum + item.penalty, 0),
    100 - aiIdentity.score,
  );
});

test('direct AI service results outweigh weak network identity context', () => {
  const evidence = {
    basic: { sources: { sourceA: { countryCode: 'US', flags: { hosting: true, proxy: true } } } },
    risk: {
      proxycheck: { score: 90, proxy: true, vpn: true },
      ipqs: { score: 90, sharedConnection: true, flags: { proxy: true, vpn: true } },
      ipapiis: { score: 0 },
    },
    dnsbl: { supported: true, listedCount: 0, checkedCount: 5 },
    agent: { score: 100 },
    network: { score: 100 },
  };
  const available = evaluateScenario('ai', {
    ...evidence,
    unlock: { claude: { status: 'yes' }, chatgpt: { status: 'yes' }, gemini: { status: 'yes' } },
  });
  const blocked = evaluateScenario('ai', {
    ...evidence,
    unlock: { claude: { status: 'no' }, chatgpt: { status: 'no' }, gemini: { status: 'no' } },
  });

  assert.ok(available.estimate >= 95, available.estimate);
  assert.ok(available.estimate - blocked.estimate >= 18, `${available.estimate} vs ${blocked.estimate}`);
  assert.ok(available.identityEvidence.observations.length >= 3);
});

test('account result stays explicitly incomplete until target region and service are measured', () => {
  const score = evaluateScenario('account', {
    basic: { sources: { sourceA: { countryCode: 'US', flags: {} } } },
    risk: { ipapiis: { score: 0 } },
    dnsbl: { supported: true, listedCount: 0, checkedCount: 5 },
    agent: { score: 100 },
    network: { score: 100 },
  });

  assert.equal(score.missingWeight, 30);
  assert.equal(score.confidence, 'medium');
  assert.equal(score.range[1] - score.range[0], 30);
  assert.ok(score.estimate < 90, score.estimate);
});

test('all five scenarios use their declared priorities through the same evaluator', () => {
  const evidence = {
    basic: { sources: { sourceA: { countryCode: 'US', flags: {} } } },
    risk: { ipapiis: { score: 0 } },
    dnsbl: { supported: true, listedCount: 0, checkedCount: 5 },
    agent: { score: 100 },
    network: {
      score: 100, loadedAvg: 25, downloadMbps: 100,
      regions: [{ id: 'oregon', available: true, score: 100, avg: 20, jitter: 2, loss: 0 }],
    },
    unlock: {
      claude: { status: 'yes' }, chatgpt: { status: 'yes' }, gemini: { status: 'yes' },
      netflix: { status: 'yes' }, youtubePremium: { status: 'yes' }, disneyPlus: { status: 'yes' },
    },
  };
  const options = {
    streamService: 'netflix', streamRegion: 'US', streamQuality: '4k',
    gameRegion: 'oregon', gameStyle: 'competitive',
    accountRegionScore: 100, accountServiceScore: 100,
  };

  for (const scenarioKey of Object.keys(SCENARIOS)) {
    assert.equal(evaluateScenario(scenarioKey, evidence, options).estimate, 100, scenarioKey);
  }

  const slowBrowse = evaluateScenario('browse', {
    ...evidence,
    network: { ...evidence.network, score: 20 },
  }, options);
  assert.ok(slowBrowse.estimate <= 45, slowBrowse.estimate);

  const blockedStream = evaluateScenario('stream', {
    ...evidence,
    unlock: { ...evidence.unlock, netflix: { status: 'no' } },
  }, options);
  assert.ok(blockedStream.estimate <= 65, blockedStream.estimate);

  const badGameRoute = evaluateScenario('game', {
    ...evidence,
    network: {
      ...evidence.network,
      regions: [{ id: 'oregon', available: true, score: 10, avg: 300, jitter: 50, loss: 2 }],
    },
  }, options);
  assert.ok(badGameRoute.estimate < 30, badGameRoute.estimate);
});

test('confirmed abuse evidence still lowers reputation', () => {
  const score = calculateReputationScore({
    abuseipdb: { score: 80 },
    ipapiis: { score: 70 },
    ipqs: { flags: { recentAbuse: true } },
  }, { supported: true, listedCount: 1, checkedCount: 5 });

  assert.ok(score < 40, score);
});
