import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, validateCityQuery, isValidCoordinate, validateProfile } from '../src/validate.js';

test('sanitizeText strips control chars, collapses whitespace and caps length', () => {
  assert.equal(sanitizeText('  hello\u0000\n\tworld  '), 'hello world');
  assert.equal(sanitizeText(`a${String.fromCharCode(0x200b)}b`), 'a b');
  assert.equal(sanitizeText('x'.repeat(500), 10).length, 10);
  assert.equal(sanitizeText(42), '');
  assert.equal(sanitizeText(null), '');
});

test('validateCityQuery accepts real names in any script and rejects injection', () => {
  assert.equal(validateCityQuery('New Delhi'), 'New Delhi');
  assert.equal(validateCityQuery('Saint-Étienne'), 'Saint-Étienne');
  assert.equal(validateCityQuery('ठाणे'), 'ठाणे');
  assert.equal(validateCityQuery('<script>alert(1)</script>'), null);
  assert.equal(validateCityQuery('a'), null);
  assert.equal(validateCityQuery('Delhi; DROP TABLE'), null);
});

test('isValidCoordinate checks range and type', () => {
  assert.ok(isValidCoordinate(19.2, 72.97));
  assert.ok(!isValidCoordinate(91, 0));
  assert.ok(!isValidCoordinate(0, -181));
  assert.ok(!isValidCoordinate('19', '72'));
  assert.ok(!isValidCoordinate(Number.NaN, 0));
});

test('validateProfile whitelists enums and applies safe defaults', () => {
  const p = validateProfile({
    size: '999',
    children: true,
    elderly: 'yes',
    commuteMode: 'spaceship',
    commuteKm: '-4',
    windows: 'closed',
    purifier: true,
    exercise: 'evening',
    cooking: 'biomass',
    notes: '  near\u0000 highway  ',
    extra: 'ignored',
  });
  assert.equal(p.household.size, 20);
  assert.equal(p.household.children, true);
  assert.equal(p.household.elderly, false, 'only boolean true counts');
  assert.equal(p.commute.mode, 'two-wheeler');
  assert.equal(p.commute.km, 0);
  assert.equal(p.home.windows, 'closed');
  assert.equal(p.lifestyle.cooking, 'biomass');
  assert.equal(p.notes, 'near highway');
  assert.equal('extra' in p, false);
  assert.deepEqual(validateProfile(undefined).home, { windows: 'open', purifier: false });
});
