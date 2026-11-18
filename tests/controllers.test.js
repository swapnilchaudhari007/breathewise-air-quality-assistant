import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSaving } from '../src/impact-calculator.js';
import { cleanAnswer } from '../src/chat.js';
import { describeForecast } from '../src/app.js';
import { errorMessage } from '../src/dom.js';
import { pick, clampNumber } from '../src/validate.js';
import { commuteSavings } from '../src/impact.js';

test('describeSaving explains a real saving with CO₂ and trees', () => {
  const text = describeSaving(commuteSavings('car', 'metro', 10, 5));
  assert.match(text, /^Switching saves about \d+(\.\d)? kg of CO₂ every week/);
  assert.match(text, /trees absorb/);
});

test('describeSaving suggests a cleaner option when nothing is saved', () => {
  assert.match(describeSaving(commuteSavings('metro', 'car', 10, 5)), /does not reduce emissions/);
});

test('cleanAnswer strips markdown symbols and falls back when empty', () => {
  assert.equal(cleanAnswer('**Close** the `windows` #now'), 'Close the windows now');
  assert.match(cleanAnswer('***'), /could not answer/);
});

test('describeForecast summarises range and warns about low wind', () => {
  const forecast = {
    min: 120,
    max: 310,
    average: 200,
    peakTime: '2026-11-17T21:00',
    points: [{ time: 't', aqi: 1 }],
  };
  assert.match(describeForecast(forecast, 3), /from 120 to 310.*Low wind/);
  assert.doesNotMatch(describeForecast(forecast, 20), /Low wind/);
  assert.doesNotMatch(describeForecast(forecast, undefined), /Low wind/);
  assert.equal(describeForecast({ ...forecast, points: [] }, 3), 'Hourly forecast unavailable.');
});

test('errorMessage handles Error objects and other thrown values', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('plain'), 'plain');
});

test('pick whitelists values and clampNumber bounds numbers', () => {
  assert.equal(pick('closed', ['open', 'closed'], 'open'), 'closed');
  assert.equal(pick('hacked', ['open', 'closed'], 'open'), 'open');
  const range = { min: 1, max: 20, fallback: 4 };
  assert.equal(clampNumber('50', range), 20);
  assert.equal(clampNumber(-3, range), 1);
  assert.equal(clampNumber('', range), 4);
  assert.equal(clampNumber(null, range), 4);
  assert.equal(clampNumber('abc', range), 4);
});
