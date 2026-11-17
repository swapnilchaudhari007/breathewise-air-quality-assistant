/**
 * Network layer: Open-Meteo geocoding, air quality & weather, plus GenAI
 * providers. All requests use timeouts, validated inputs and a small
 * TTL cache to avoid redundant calls.
 * @module api
 */
import { isValidCoordinate, validateCityQuery } from './validate.js';
import { NETWORK } from './config.js';

export const ENDPOINTS = Object.freeze({
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
  air: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  weather: 'https://api.open-meteo.com/v1/forecast',
  pollinations: 'https://text.pollinations.ai/openai',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
});

/** Simple in-memory TTL cache (keyed by URL). */
export class TtlCache {
  /** @param {number} ttlMs */
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    /** @type {Map<string, {value:unknown, expires:number}>} */
    this.store = new Map();
  }

  get(key, now = Date.now()) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

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
  const params = new URLSearchParams({ name: q, count: String(NETWORK.geocodeResults), language: 'en', format: 'json' });
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
 * Fetch current air quality, a 48-hour hourly AQI forecast and current weather.
 * @param {number} lat
 * @param {number} lon
 * @param {typeof fetch} [fetchImpl]
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
  const c = air.current ?? {};
  return {
    air: {
      aqi: Math.round(c.us_aqi ?? 0),
      pm25: Math.round((c.pm2_5 ?? 0) * 10) / 10,
      pm10: c.pm10 != null ? Math.round(c.pm10) : undefined,
      no2: c.nitrogen_dioxide != null ? Math.round(c.nitrogen_dioxide) : undefined,
      o3: c.ozone != null ? Math.round(c.ozone) : undefined,
    },
    hourly: { time: air.hourly?.time ?? [], aqi: air.hourly?.us_aqi ?? [] },
    weather: weather?.current
      ? { temperature: Math.round(weather.current.temperature_2m), wind: Math.round(weather.current.wind_speed_10m) }
      : {},
  };
}

/**
 * Ask a GenAI model. Uses Google Gemini when the user supplies their own key
 * (kept only in memory), otherwise the free, key-less Pollinations
 * OpenAI-compatible endpoint.
 * @param {{role:string, content:string}[]} messages
 * @param {{geminiKey?:string, fetchImpl?:typeof fetch, json?:boolean}} [opts]
 * @returns {Promise<{text:string, provider:string}>}
 */
export async function askModel(messages, opts = {}) {
  const { geminiKey, fetchImpl, json = true } = opts;
  if (geminiKey) {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
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
        generationConfig: { temperature: 0.6, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    return { text, provider: 'Google Gemini 2.5 Flash' };
  }
  const data = await fetchJson(ENDPOINTS.pollinations, {
    method: 'POST',
    timeout: NETWORK.aiTimeoutMs,
    fetchImpl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai', messages, private: true, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  return { text: data.choices?.[0]?.message?.content ?? '', provider: 'Pollinations (OpenAI-compatible LLM)' };
}
