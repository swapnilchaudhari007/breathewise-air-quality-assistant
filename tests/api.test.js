import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache, fetchJson, geocodeCity, fetchConditions, askModel, ENDPOINTS } from '../src/api.js';

const okResponse = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

test('TtlCache expires entries', () => {
  const c = new TtlCache(1000);
  c.set('a', 1, 0);
  assert.equal(c.get('a', 500), 1);
  assert.equal(c.get('a', 1500), undefined);
});

test('fetchJson throws on HTTP errors and timeouts', async () => {
  await assert.rejects(fetchJson('https://x', { fetchImpl: () => Promise.resolve({ ok: false, status: 500 }) }), /500/);
  const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' }))));
  await assert.rejects(fetchJson('https://x', { fetchImpl: hang, timeout: 10 }), /timed out/);
});

test('geocodeCity validates input before any network call', async () => {
  let called = false;
  await assert.rejects(geocodeCity('<script>', () => { called = true; }), /valid city/);
  assert.equal(called, false);
});

test('geocodeCity maps results and drops invalid coordinates', async () => {
  let url = '';
  const results = await geocodeCity('Thane', (u) => {
    url = u;
    return okResponse({ results: [
      { name: 'Thane', admin1: 'Maharashtra', country: 'India', latitude: 19.19, longitude: 72.97 },
      { name: 'Bad', latitude: 999, longitude: 0 },
    ] });
  });
  assert.ok(url.startsWith(ENDPOINTS.geocode));
  assert.deepEqual(results, [{ name: 'Thane, Maharashtra, India', lat: 19.19, lon: 72.97 }]);
});

test('fetchConditions normalises air and weather data', async () => {
  const data = await fetchConditions(28.61, 77.21, (u) => okResponse(u.startsWith(ENDPOINTS.air)
    ? { current: { us_aqi: 245.4, pm2_5: 180.27, pm10: 260.2, nitrogen_dioxide: 60.4, ozone: 20.1 }, hourly: { time: ['t1'], us_aqi: [200] } }
    : { current: { temperature_2m: 14.4, wind_speed_10m: 4.2 } }));
  assert.deepEqual(data.air, { aqi: 245, pm25: 180.3, pm10: 260, no2: 60, o3: 20 });
  assert.deepEqual(data.weather, { temperature: 14, wind: 4 });
  assert.deepEqual(data.hourly, { time: ['t1'], aqi: [200] });
  await assert.rejects(fetchConditions(200, 0), /Invalid coordinates/);
});

test('askModel uses Pollinations by default and Gemini when a key is given', async () => {
  const msgs = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }];
  let req;
  const free = await askModel(msgs, { fetchImpl: (u, init) => { req = { u, init }; return okResponse({ choices: [{ message: { content: 'free' } }] }); } });
  assert.equal(free.text, 'free');
  assert.equal(req.u, ENDPOINTS.pollinations);
  assert.equal(JSON.parse(req.init.body).response_format.type, 'json_object');

  const gem = await askModel(msgs, { geminiKey: 'k', json: false, fetchImpl: (u, init) => { req = { u, init }; return okResponse({ candidates: [{ content: { parts: [{ text: 'gem' }] } }] }); } });
  assert.equal(gem.text, 'gem');
  assert.equal(req.u, ENDPOINTS.gemini);
  assert.equal(req.init.headers['x-goog-api-key'], 'k', 'key sent in header, not URL');
  const body = JSON.parse(req.init.body);
  assert.equal(body.systemInstruction.parts[0].text, 'sys');
  assert.equal(body.contents[0].role, 'user');
});
