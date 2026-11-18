/**
 * Network layer: Open-Meteo geocoding, air quality & weather, plus GenAI
 * providers. All requests use timeouts, validated inputs and a small
 * TTL cache to avoid redundant calls.
 * @module api
 */
import { isValidCoordinate, validateCityQuery } from './validate.js';
import { AI, NETWORK } from './config.js';

/**
 * @typedef {{aqi:number, pm25:number, pm10?:number, no2?:number, o3?:number}} AirReading
 * @typedef {{temperature?:number, wind?:number}} WeatherReading
 * @typedef {{text:string, provider:string}} ModelReply
 * @typedef {import('./plan.js').ChatMessage} ChatMessage
 */

export const ENDPOINTS = Object.freeze({
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
  air: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  weather: 'https://api.open-meteo.com/v1/forecast',
  pollinations: 'https://text.pollinations.ai/openai',
  gemini: `https://generativelanguage.googleapis.com/v1beta/models/${AI.geminiModel}:generateContent`,
});

/** Simple in-memory TTL cache (keyed by URL). */
export class TtlCache {
  /** @param {number} ttlMs */
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    /** @type {Map<string, {value:unknown, expires:number}>} */
    this.store = new Map();
  }

  /**
   * @param {string} key
   * @param {number} [now]
   * @returns {unknown} cached value, or undefined when missing or expired
   */
  get(key, now = Date.now()) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  /**
   * Store a value, evicting the oldest entry when the cache is full.
   * @param {string} key
   * @param {unknown} value
   * @param {number} [now]
   */
  set(key, value, now = Date.now()) {
    this.store.set(key, { value, expires: now + this.ttlMs });
    if (this.store.size > NETWORK.cacheMaxEntries) this.store.delete(this.store.keys().next().value);
  }
}

const cache = new TtlCache(NETWORK.cacheTtlMs);

/**
 * fetch() with timeout and JSON parsing.
 * @param {string} url
 * @param {RequestInit & {timeout?:number, fetchImpl?:typeof fetch}} [options]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, options = {}) {
  const { timeout = NETWORK.requestTimeoutMs, fetchImpl = globalThis.fetch, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal, referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return await res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET JSON through the shared TTL cache.
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<any>}
 */
async function cachedJson(url, fetchImpl) {
  const hit = cache.get(url);
  if (hit) return hit;
  const data = await fetchJson(url, { fetchImpl });
  cache.set(url, data);
  return data;
}

/**
 * Search cities by name.
 * @param {string} query
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{name:string, lat:number, lon:number}[]>}
 */
export async function geocodeCity(query, fetchImpl) {
  const q = validateCityQuery(query);
  if (!q) throw new Error('Please enter a valid city name (letters only).');
  const params = new URLSearchParams({
    name: q,
    count: String(NETWORK.geocodeResults),
    language: 'en',
    format: 'json',
  });
  const data = await cachedJson(`${ENDPOINTS.geocode}?${params}`, fetchImpl);
  return (data.results ?? [])
    .filter((r) => isValidCoordinate(r.latitude, r.longitude))
    .map((r) => ({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }));
}

/**
 * Round a number, keeping missing values as undefined.
 * @param {number|null|undefined} value
 * @returns {number|undefined}
 */
const roundOrUndefined = (value) => (value === null || value === undefined ? undefined : Math.round(value));

/**
 * Normalise Open-Meteo "current" air-quality fields.
 * @param {Record<string, number>} c
 * @returns {AirReading}
 */
export function normalizeAir(c) {
  return {
    aqi: Math.round(c.us_aqi ?? 0),
    pm25: Math.round((c.pm2_5 ?? 0) * 10) / 10,
    pm10: roundOrUndefined(c.pm10),
    no2: roundOrUndefined(c.nitrogen_dioxide),
    o3: roundOrUndefined(c.ozone),
  };
}

/**
 * Normalise Open-Meteo "current" weather fields.
 * @param {Record<string, number>|undefined} current
 * @returns {WeatherReading}
 */
export function normalizeWeather(current) {
  return current
    ? { temperature: Math.round(current.temperature_2m), wind: Math.round(current.wind_speed_10m) }
    : {};
}

/**
 * Fetch current air quality, a 48-hour hourly AQI forecast and current weather.
 * @param {number} lat
 * @param {number} lon
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{air:AirReading, hourly:{time:string[], aqi:number[]}, weather:WeatherReading}>}
 */
export async function fetchConditions(lat, lon, fetchImpl) {
  if (!isValidCoordinate(lat, lon)) throw new Error('Invalid coordinates.');
  const coords = { latitude: lat.toFixed(3), longitude: lon.toFixed(3), timezone: 'auto' };
  const airParams = new URLSearchParams({
    ...coords,
    current: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone',
    hourly: 'us_aqi,pm2_5',
    forecast_days: String(NETWORK.forecastDays),
  });
  const weatherParams = new URLSearchParams({ ...coords, current: 'temperature_2m,wind_speed_10m' });
  const [air, weather] = await Promise.all([
    cachedJson(`${ENDPOINTS.air}?${airParams}`, fetchImpl),
    cachedJson(`${ENDPOINTS.weather}?${weatherParams}`, fetchImpl).catch(() => null),
  ]);
  return {
    air: normalizeAir(air.current ?? {}),
    hourly: { time: air.hourly?.time ?? [], aqi: air.hourly?.us_aqi ?? [] },
    weather: normalizeWeather(weather?.current),
  };
}

/**
 * Ask a GenAI model. Uses Google Gemini when the user supplies their own key
 * (kept only in memory), otherwise the free, key-less Pollinations
 * OpenAI-compatible endpoint.
 * @param {ChatMessage[]} messages
 * @param {{geminiKey?:string, fetchImpl?:typeof fetch, json?:boolean}} [opts]
 * @returns {Promise<ModelReply>}
 */
export async function askModel(messages, opts = {}) {
  const { geminiKey, fetchImpl, json = true } = opts;
  return geminiKey
    ? askGemini(messages, geminiKey, { fetchImpl, json })
    : askPollinations(messages, { fetchImpl, json });
}

/**
 * Call Google Gemini (generateContent) with the user's own API key.
 * The key is sent in a header, never in the URL.
 * @param {ChatMessage[]} messages
 * @param {string} geminiKey
 * @param {{fetchImpl?:typeof fetch, json:boolean}} opts
 * @returns {Promise<ModelReply>}
 */
async function askGemini(messages, geminiKey, { fetchImpl, json }) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const data = await fetchJson(ENDPOINTS.gemini, {
    method: 'POST',
    timeout: NETWORK.aiTimeoutMs,
    fetchImpl,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: AI.temperature,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return { text: parts.map((p) => p.text).join(''), provider: AI.geminiLabel };
}

/**
 * Call the free, key-less Pollinations OpenAI-compatible endpoint.
 * @param {ChatMessage[]} messages
 * @param {{fetchImpl?:typeof fetch, json:boolean}} opts
 * @returns {Promise<ModelReply>}
 */
async function askPollinations(messages, { fetchImpl, json }) {
  const data = await fetchJson(ENDPOINTS.pollinations, {
    method: 'POST',
    timeout: NETWORK.aiTimeoutMs,
    fetchImpl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI.pollinationsModel,
      messages,
      private: true,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  return { text: data.choices?.[0]?.message?.content ?? '', provider: AI.pollinationsLabel };
}
