/**
 * End-to-end UI tests: the real index.html is loaded into happy-dom, the
 * network is replaced by a fake fetch, and the user flows are driven through
 * DOM events exactly as a browser user would.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const hourly = Array.from({ length: 48 }, (_, i) => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + i);
  return d.toISOString().slice(0, 16);
});
const aiPlan = {
  summary: 'Severe smog today.',
  routine: [{ title: 'Walk at 2 pm', action: 'Go out in the clean window.', impact: 'Cuts dose by 30%.' }],
  indoor: [{ title: 'Close windows', action: 'Keep them shut.', impact: 'Lowers indoor PM2.5.' }],
  alternatives: [{ title: 'Take the metro', action: 'Swap the car.', impact: 'Saves 20 kg CO2.' }],
};

/** Programmable fake network. */
const net = { places: [], aiFails: false, answer: 'Yes, **between 2 and 4 pm**.' };

/**
 * Route a request to a canned JSON body.
 * @param {string} url
 * @param {{body?:string}} [init]
 * @returns {Promise<{ok:boolean, status:number, json:() => Promise<unknown>}>}
 */
function fakeFetch(url, init = {}) {
  const reply = (body, ok = true) =>
    Promise.resolve({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) });
  if (url.includes('geocoding')) return reply({ results: net.places });
  if (url.includes('air-quality')) {
    return reply({
      current: { us_aqi: 245, pm2_5: 180, pm10: 260, nitrogen_dioxide: 60, ozone: 20 },
      hourly: { time: hourly, us_aqi: hourly.map((_, i) => 150 + ((i * 37) % 160)) },
    });
  }
  if (url.includes('api.open-meteo.com')) {
    return reply({ current: { temperature_2m: 14, wind_speed_10m: 4 } });
  }
  if (net.aiFails) return reply({}, false);
  const json = JSON.parse(init.body ?? '{}').response_format;
  const content = json ? JSON.stringify(aiPlan) : net.answer;
  return reply({ choices: [{ message: { content } }] });
}

const $ = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
const delhi = { name: 'Delhi', admin1: 'Delhi', country: 'India', latitude: 28.6, longitude: 77.2 };

before(async () => {
  GlobalRegistrator.register({ url: 'http://localhost:8080/' });
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  globalThis.fetch = fakeFetch;
  Element.prototype.scrollIntoView = () => {};
  console.warn = () => {};
  await import('../src/app.js');
});

after(() => GlobalRegistrator.unregister());

test('submitting without a city shows an accessible error', async () => {
  $('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  assert.match($('city-error').textContent, /search for and select your city/);
  assert.equal($('city').getAttribute('aria-invalid'), 'true');
});

test('invalid and unknown city searches are reported', async () => {
  $('city').value = '<script>';
  $('search-btn').click();
  await flush();
  assert.match($('city-error').textContent, /valid city name/);
  $('city').value = 'Atlantis';
  net.places = [];
  $('search-btn').click();
  await flush();
  assert.match($('city-error').textContent, /No matching places/);
});

test('several matches become a radio group the user can pick from', async () => {
  net.places = [delhi, { ...delhi, name: 'New Delhi' }];
  $('city').value = 'Delhi';
  $('city').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
  await flush();
  const radios = $('city-results').querySelectorAll('input[type="radio"]');
  assert.equal(radios.length, 2);
  assert.equal($('city-results').hidden, false);
  radios[1].dispatchEvent(new Event('change'));
  assert.match($('selected-place').textContent, /New Delhi/);
  $('city').dispatchEvent(new Event('input'));
  assert.equal($('selected-place').textContent, '');
});

test('generating a plan renders live air, forecast, AI plan and impact', async () => {
  net.places = [delhi];
  $('city').value = 'Old Delhi'; // a fresh query (the earlier one is cached)
  $('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  assert.equal($('results').hidden, false);
  assert.equal($('aqi-value').textContent, '245');
  assert.equal($('aqi-label').textContent, 'Very Unhealthy');
  assert.match($('cigarette').textContent, /8\.2 cigarettes/);
  assert.match($('forecast-summary').textContent, /Low wind/);
  assert.ok($('forecast-chart').querySelector('svg[role="img"] rect'));
  assert.ok($('forecast-chart').querySelector('table caption'));
  assert.ok($('best-windows').children.length >= 1);
  assert.equal($('plan-summary').textContent, 'Severe smog today.');
  assert.match($('plan-source').textContent, /Pollinations/);
  assert.equal($('plan-routine').querySelectorAll('li').length, 1);
  assert.match($('impact-result').textContent, /Switching saves about/);
  assert.equal($('generate-btn').disabled, false);
  assert.equal($('plan-section').getAttribute('aria-busy'), 'false');
  assert.equal($('status').dataset.type, 'success');
});

test('the impact calculator updates as the user edits it', () => {
  $('impact-from').value = 'metro';
  $('impact-to').value = 'car';
  $('impact-form').dispatchEvent(new Event('input'));
  assert.match($('impact-result').textContent, /does not reduce emissions/);
});

test('follow-up questions are answered and cleaned of markdown', async () => {
  $('chat-input').value = 'Can my kids play outside?';
  $('chat-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  const bubbles = $('chat-log').querySelectorAll('.bubble');
  assert.equal(bubbles.length, 2);
  assert.match(bubbles[1].textContent, /between 2 and 4 pm/);
  assert.doesNotMatch(bubbles[1].textContent, /\*/);
  assert.equal($('chat-input').value, '');
});

test('suggestion chips ask their question; failures show a friendly message', async () => {
  net.aiFails = true;
  document.querySelector('.chip').click();
  await flush();
  const last = [...$('chat-log').querySelectorAll('.bubble')].at(-1);
  assert.match(last.textContent, /unreachable right now/);
});

test('when the AI is down the offline planner still delivers a full plan', async () => {
  $('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  assert.match($('plan-source').textContent, /Offline expert rules/);
  assert.ok($('plan-indoor').querySelectorAll('li').length >= 3);
  assert.match($('status').textContent, /generated offline/);
  assert.equal($('chat-log').children.length, 0);
});

test('geolocation success and denial are both handled', async () => {
  let succeed = true;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok, fail) =>
        succeed ? ok({ coords: { latitude: 19.2, longitude: 73.0 } }) : fail(new Error('denied')),
    },
  });
  $('locate-btn').click();
  assert.match($('selected-place').textContent, /current location/);
  succeed = false;
  $('locate-btn').click();
  assert.match($('city-error').textContent, /permission denied/);
});
