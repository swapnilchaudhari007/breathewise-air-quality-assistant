import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, pm25ToAqi, cigaretteEquivalent, bestWindows, summarizeForecast } from '../src/aqi.js';

test('categorize maps AQI boundaries to EPA categories', () => {
  assert.equal(categorize(0).level, 'good');
  assert.equal(categorize(50).level, 'good');
  assert.equal(categorize(51).level, 'moderate');
  assert.equal(categorize(150).level, 'usg');
  assert.equal(categorize(151).level, 'unhealthy');
  assert.equal(categorize(250).level, 'very-unhealthy');
  assert.equal(categorize(999).level, 'hazardous');
});

test('categorize rejects invalid input', () => {
  assert.throws(() => categorize(-1), RangeError);
  assert.throws(() => categorize(Number.NaN), RangeError);
  assert.throws(() => categorize('100'), RangeError);
});

test('pm25ToAqi follows 2024 EPA breakpoints', () => {
  assert.equal(pm25ToAqi(0), 0);
  assert.equal(pm25ToAqi(9.0), 50);
  assert.equal(pm25ToAqi(35.4), 100);
  assert.equal(pm25ToAqi(55.4), 150);
  assert.equal(pm25ToAqi(125.4), 200);
  assert.equal(pm25ToAqi(1000), 500);
  assert.throws(() => pm25ToAqi(-5), RangeError);
});

test('cigaretteEquivalent converts PM2.5 to cigarettes per day', () => {
  assert.equal(cigaretteEquivalent(22), 1);
  assert.equal(cigaretteEquivalent(110), 5);
  assert.equal(cigaretteEquivalent(-3), 0);
  assert.equal(cigaretteEquivalent(undefined), 0);
});

const hours = Array.from({ length: 24 }, (_, h) => `2026-11-17T${String(h).padStart(2, '0')}:00`);

test('bestWindows finds the cleanest non-overlapping daytime windows', () => {
  const values = hours.map((_, h) => (h >= 13 && h <= 15 ? 60 : 200));
  const windows = bestWindows(hours, values, { length: 2, limit: 2 });
  assert.equal(windows.length, 2);
  assert.equal(windows[0].average, 60);
  assert.ok(windows[0].start.includes('T13:00'));
  const startIdx = (w) => hours.indexOf(w.start);
  assert.ok(Math.abs(startIdx(windows[0]) - startIdx(windows[1])) >= 2, 'windows must not overlap');
});

test('bestWindows ignores night hours and bad data', () => {
  const values = hours.map((_, h) => (h < 5 ? 10 : 150));
  values[10] = Number.NaN;
  const windows = bestWindows(hours, values, { length: 2, limit: 3 });
  windows.forEach((w) => assert.ok(new Date(w.start).getHours() >= 6));
  assert.deepEqual(bestWindows(hours, [1, 2]), []);
  assert.deepEqual(bestWindows(null, null), []);
});

test('summarizeForecast returns range, peak and future points only', () => {
  const values = hours.map((_, h) => 100 + h);
  const s = summarizeForecast(hours, values, 6, new Date('2026-11-17T10:30'));
  assert.equal(s.points.length, 6);
  assert.equal(s.points[0].aqi, 110);
  assert.equal(s.min, 110);
  assert.equal(s.max, 115);
  assert.ok(s.peakTime.includes('T15:00'));
  assert.equal(summarizeForecast([], [], 24).peakTime, null);
});
