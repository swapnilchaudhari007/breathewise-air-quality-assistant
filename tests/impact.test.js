import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commuteSavings, estimateIndoorPm25, exposureReduction } from '../src/impact.js';

test('commuteSavings computes weekly and yearly CO2 savings', () => {
  const s = commuteSavings('car', 'metro', 10, 5);
  // (0.17 - 0.02) * 10 km * 2 * 5 days = 15 kg
  assert.equal(s.weeklyKg, 15);
  assert.equal(s.yearlyKg, 720);
  assert.equal(s.treesEquivalent, 34);
});

test('commuteSavings never reports negative savings and clamps inputs', () => {
  assert.equal(commuteSavings('walk', 'car', 10).weeklyKg, 0);
  assert.equal(commuteSavings('car', 'walk', -5).weeklyKg, 0);
  assert.equal(
    commuteSavings('car', 'walk', 10_000, 99).weeklyKg,
    commuteSavings('car', 'walk', 200, 7).weeklyKg,
  );
  assert.throws(() => commuteSavings('rocket', 'walk', 5), RangeError);
});

test('estimateIndoorPm25 reflects windows and purifier', () => {
  assert.equal(estimateIndoorPm25(100, { windows: 'open' }), 80);
  assert.equal(estimateIndoorPm25(100, { windows: 'closed' }), 45);
  assert.equal(estimateIndoorPm25(100, { windows: 'closed', purifier: true }), 22.5);
  assert.ok(estimateIndoorPm25(100, { windows: 'sealed', purifier: true, purifierEfficiency: 5 }) >= 3);
  assert.equal(estimateIndoorPm25('bad'), 0);
});

test('exposureReduction quantifies the benefit of the plan', () => {
  const before = { outdoorHours: 3, mask: 'none', windows: 'open', purifier: false };
  const after = { outdoorHours: 1, mask: 'n95', windows: 'closed', purifier: true };
  const r = exposureReduction(150, before, after);
  assert.ok(r.afterDose < r.beforeDose);
  assert.ok(r.reductionPercent > 60 && r.reductionPercent < 100);
  assert.equal(exposureReduction(0, before, after).reductionPercent, 0);
});
