import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, calculateScenarioScore } from '../public/scenarios.js';

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

  assert.equal(score.estimate, 80);
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
