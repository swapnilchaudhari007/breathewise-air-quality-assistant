/**
 * BreatheWise app controller: wires the form, data fetching, GenAI plan,
 * impact calculator and follow-up chat together.
 * @module app
 */
import { categorize, cigaretteEquivalent, bestWindows, summarizeForecast } from './aqi.js';
import { COMMUTE_EMISSIONS, commuteSavings } from './impact.js';
import { validateProfile, sanitizeText } from './validate.js';
import { geocodeCity, fetchConditions, askModel } from './api.js';
import { buildPlanMessages, buildChatMessages, parsePlan, buildOfflinePlan } from './plan.js';
import { el, hour, renderForecastChart, renderPlanItems, addChatMessage } from './ui.js';

const $ = (id) => document.getElementById(id);

/** Application state (kept in memory only). */
const state = {
  place: /** @type {{name:string, lat:number, lon:number}|null} */ (null),
  context: null,
  plan: null,
  chat: /** @type {{role:string, content:string}[]} */ ([]),
  busy: false,
};

function setStatus(message, type = 'info') {
  const box = $('status');
  box.textContent = message;
  box.dataset.type = type;
}

function setCityError(message) {
  const err = $('city-error');
  err.textContent = message;
  err.hidden = !message;
  $('city').setAttribute('aria-invalid', message ? 'true' : 'false');
}

function selectPlace(place) {
  state.place = place;
  $('selected-place').textContent = `Selected: ${place.name}`;
  $('city-results').hidden = true;
  setCityError('');
}

async function searchCity() {
  setCityError('');
  try {
    const results = await geocodeCity($('city').value);
    const box = $('city-results');
    box.replaceChildren();
    if (results.length === 0) {
      setCityError('No matching places found. Try a nearby larger city.');
      return;
    }
    if (results.length === 1) {
      selectPlace(results[0]);
      return;
    }
    results.forEach((r, i) => {
      const id = `place-${i}`;
      const input = el('input', { type: 'radio', name: 'place', id, value: String(i) });
      input.addEventListener('change', () => selectPlace(r));
      box.append(el('label', { for: id, class: 'choice' }, [input, r.name]));
    });
    box.hidden = false;
    box.querySelector('input')?.focus();
  } catch (err) {
    setCityError(err.message);
  }
}

function useMyLocation() {
  if (!('geolocation' in navigator)) {
    setCityError('Location is not available in this browser. Please search instead.');
    return;
  }
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      selectPlace({ name: 'Your current location', lat: pos.coords.latitude, lon: pos.coords.longitude });
      setStatus('Location found. Fill in your household details and generate your plan.');
    },
    () => {
      setStatus('');
      setCityError('Location permission denied. Please search for your city instead.');
    },
    { timeout: 10000, maximumAge: 600000 },
  );
}

function readProfile() {
  const form = $('profile-form');
  const data = new FormData(form);
  return validateProfile({
    size: data.get('size'),
    children: data.has('children'),
    elderly: data.has('elderly'),
    respiratory: data.has('respiratory'),
    pets: data.has('pets'),
    commuteMode: data.get('commuteMode'),
    commuteKm: data.get('commuteKm'),
    windows: data.get('windows'),
    purifier: data.has('purifier'),
    exercise: data.get('exercise'),
    cooking: data.get('cooking'),
    notes: data.get('notes'),
  });
}

function renderConditions(ctx, forecast) {
  const cat = categorize(ctx.air.aqi);
  $('aqi-value').textContent = String(ctx.air.aqi);
  $('aqi-label').textContent = cat.label;
  $('aqi-badge').style.setProperty('--aqi-color', cat.color);
  $('aqi-badge').dataset.level = cat.level;
  $('aqi-advice').textContent = `${ctx.place}: ${cat.advice}`;
  const rows = [
    ['PM2.5', `${ctx.air.pm25} µg/m³`],
    ['PM10', ctx.air.pm10 != null ? `${ctx.air.pm10} µg/m³` : 'n/a'],
    ['NO₂', ctx.air.no2 != null ? `${ctx.air.no2} µg/m³` : 'n/a'],
    ['Ozone', ctx.air.o3 != null ? `${ctx.air.o3} µg/m³` : 'n/a'],
    ['Wind', ctx.weather.wind != null ? `${ctx.weather.wind} km/h` : 'n/a'],
    ['Temp', ctx.weather.temperature != null ? `${ctx.weather.temperature} °C` : 'n/a'],
  ];
  $('pollutants').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, [k]), el('dd', {}, [v])]));
  $('cigarette').textContent = `Breathing this air all day is like smoking about ${cigaretteEquivalent(ctx.air.pm25)} cigarettes.`;

  $('forecast-summary').textContent = forecast.points.length
    ? `AQI will range from ${forecast.min} to ${forecast.max}, peaking around ${hour(forecast.peakTime)}.${ctx.weather.wind != null && ctx.weather.wind < 8 ? ' Low wind means smog can build up.' : ''}`
    : 'Hourly forecast unavailable.';
  renderForecastChart($('forecast-chart'), forecast.points);
  $('best-windows').replaceChildren(...(ctx.forecast.best.length
    ? ctx.forecast.best.map((w, i) => el('li', {}, [
      el('strong', {}, [i === 0 ? 'Best time outdoors: ' : 'Next best: ']),
      `${hour(w.start)} – ${hour(new Date(new Date(w.end).getTime() + 3600000).toISOString())} (avg AQI ${w.average}, ${categorize(w.average).label})`,
    ]))
    : [el('li', {}, ['No clean daytime window today — keep outdoor time short.'])]));
}

function renderPlan(plan, provider) {
  $('plan-summary').textContent = plan.summary;
  $('plan-source').textContent = plan.source === 'ai' ? `Generated by ${provider}` : 'Offline expert rules (AI unavailable)';
  renderPlanItems($('plan-routine'), plan.routine);
  renderPlanItems($('plan-indoor'), plan.indoor);
  renderPlanItems($('plan-alternatives'), plan.alternatives);
}

async function generatePlan(event) {
  event.preventDefault();
  if (state.busy) return;
  if (!state.place) {
    if ($('city').value.trim()) await searchCity();
    if (!state.place) {
      setCityError(state.place ? '' : ($('city-error').textContent || 'Please search for and select your city first.'));
      $('city').focus();
      return;
    }
  }
  state.busy = true;
  $('generate-btn').disabled = true;
  $('plan-section').setAttribute('aria-busy', 'true');
  try {
    setStatus('Fetching live air quality…');
    const profile = readProfile();
    const data = await fetchConditions(state.place.lat, state.place.lon);
    const forecast = summarizeForecast(data.hourly.time, data.hourly.aqi, 24);
    const best = bestWindows(forecast.points.map((p) => p.time), forecast.points.map((p) => p.aqi), { length: 2, limit: 2 });
    const ctx = {
      place: state.place.name,
      air: data.air,
      weather: data.weather,
      forecast: { min: forecast.min, max: forecast.max, peakTime: forecast.peakTime, best },
      profile,
    };
    state.context = ctx;
    $('results').hidden = false;
    renderConditions(ctx, forecast);
    syncImpactDefaults(profile);

    setStatus('Asking the AI for your personalised plan…');
    const geminiKey = sanitizeText($('geminiKey').value, 100);
    let plan = null;
    let provider = '';
    try {
      const res = await askModel(buildPlanMessages(ctx), { geminiKey: geminiKey || undefined });
      plan = parsePlan(res.text);
      provider = res.provider;
    } catch (err) {
      console.warn('AI request failed, using offline plan:', err.message);
    }
    if (!plan) plan = buildOfflinePlan(ctx);
    state.plan = plan;
    state.chat = [];
    $('chat-log').replaceChildren();
    renderPlan(plan, provider);
    setStatus(plan.source === 'ai' ? 'Your plan is ready.' : 'Your plan is ready (generated offline because the AI service was unavailable).', 'success');
    $('air-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } catch (err) {
    setStatus(`Something went wrong: ${err.message}`, 'error');
  } finally {
    state.busy = false;
    $('generate-btn').disabled = false;
    $('plan-section').setAttribute('aria-busy', 'false');
  }
}

/* ---------- Impact calculator ---------- */

function fillModeSelect(select, value) {
  select.replaceChildren(...Object.entries(COMMUTE_EMISSIONS).map(([key, m]) => {
    const opt = el('option', { value: key }, [m.label]);
    if (key === value) opt.selected = true;
    return opt;
  }));
}

function syncImpactDefaults(profile) {
  $('impact-from').value = profile.commute.mode;
  $('impact-km').value = String(profile.commute.km);
  updateImpact();
}

function updateImpact() {
  const from = $('impact-from').value;
  const to = $('impact-to').value;
  const s = commuteSavings(from, to, $('impact-km').value, $('impact-days').value);
  $('impact-result').textContent = s.weeklyKg > 0
    ? `Switching saves about ${s.weeklyKg} kg of CO₂ every week: ${s.yearlyKg} kg a year, the same as ${s.treesEquivalent} trees absorb. It also means less exhaust on your street.`
    : 'This switch does not reduce emissions. Try a lower-emission option such as metro, bus, cycling or walking.';
}

/* ---------- Follow-up chat ---------- */

async function askFollowUp(question) {
  const q = sanitizeText(question, 300);
  if (!q || state.busy) return;
  if (!state.context) {
    setStatus('Generate your plan first so answers can use your local air data.', 'error');
    return;
  }
  const log = $('chat-log');
  addChatMessage(log, 'user', q);
  $('chat-input').value = '';
  const pending = addChatMessage(log, 'assistant', 'Thinking…');
  state.busy = true;
  state.chat.push({ role: 'user', content: q });
  try {
    const res = await askModel(buildChatMessages(state.context, state.chat), {
      geminiKey: sanitizeText($('geminiKey').value, 100) || undefined,
      json: false,
    });
    const answer = sanitizeText(res.text.replace(/[*#`]/g, ''), 1500) || 'Sorry, I could not answer that. Please try rephrasing.';
    state.chat.push({ role: 'assistant', content: answer });
    pending.replaceWith(addChatMessage(log, 'assistant', answer));
  } catch {
    pending.replaceWith(addChatMessage(log, 'assistant', 'The AI service is unreachable right now. Your plan above still applies. Please try again shortly.'));
  } finally {
    pending.remove();
    state.busy = false;
  }
}

/* ---------- Init ---------- */

function init() {
  $('profile-form').addEventListener('submit', generatePlan);
  $('search-btn').addEventListener('click', searchCity);
  $('locate-btn').addEventListener('click', useMyLocation);
  $('city').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchCity();
    }
  });
  $('city').addEventListener('input', () => {
    state.place = null;
    $('selected-place').textContent = '';
  });

  fillModeSelect($('impact-from'), 'two-wheeler');
  fillModeSelect($('impact-to'), 'metro');
  $('impact-form').addEventListener('input', updateImpact);
  $('impact-form').addEventListener('submit', (e) => e.preventDefault());
  updateImpact();

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    askFollowUp($('chat-input').value);
  });
  document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => askFollowUp(chip.dataset.q)));
}

init();
