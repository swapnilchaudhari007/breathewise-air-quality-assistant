import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHour, addHours, formatMeasure } from '../src/format.js';
import { NETWORK, LIMITS, FORECAST, CARBON, HOUR_MS } from '../src/config.js';
import { normalizeAir, normalizeWeather } from '../src/api.js';

test('formatHour formats valid timestamps and guards bad input', () => {
  assert.match(formatHour('2026-11-17T07:00'), /^7\s?am$/i);
  assert.match(formatHour('2026-11-17T19:00'), /^7\s?pm$/i);
  assert.equal(formatHour(''), 'unknown');
  assert.equal(formatHour(null), 'unknown');
  assert.equal(formatHour('not-a-date'), 'unknown');
});

test('addHours shifts a timestamp by whole hours', () => {
  assert.equal(addHours('2026-11-17T10:00:00Z', 1), '2026-11-17T11:00:00.000Z');
  assert.equal(addHours('2026-11-17T23:00:00Z', 2), '2026-11-18T01:00:00.000Z');
});

test('formatMeasure appends units and handles missing values', () => {
  assert.equal(formatMeasure(42, 'µg/m³'), '42 µg/m³');
  assert.equal(formatMeasure(0, 'km/h'), '0 km/h');
  assert.equal(formatMeasure(undefined, '°C'), 'n/a');
  assert.equal(formatMeasure(null, '°C'), 'n/a');
});

test('configuration is immutable and internally consistent', () => {
  for (const group of [NETWORK, LIMITS, FORECAST, CARBON]) assert.ok(Object.isFrozen(group));
  assert.ok(NETWORK.aiTimeoutMs > NETWORK.requestTimeoutMs);
  assert.ok(FORECAST.dayStartHour < FORECAST.dayEndHour);
  assert.ok(LIMITS.answer > LIMITS.question);
  assert.equal(HOUR_MS, 60 * 60 * 1000);
});

test('normalizeAir rounds values and keeps missing pollutants undefined', () => {
  assert.deepEqual(normalizeAir({ us_aqi: 99.6, pm2_5: 12.34 }), {
    aqi: 100,
    pm25: 12.3,
    pm10: undefined,
    no2: undefined,
    o3: undefined,
  });
  assert.deepEqual(normalizeAir({}), { aqi: 0, pm25: 0, pm10: undefined, no2: undefined, o3: undefined });
});

test('normalizeWeather handles present and missing data', () => {
  assert.deepEqual(normalizeWeather({ temperature_2m: 21.6, wind_speed_10m: 3.2 }), {
    temperature: 22,
    wind: 3,
  });
  assert.deepEqual(normalizeWeather(undefined), {});
});
