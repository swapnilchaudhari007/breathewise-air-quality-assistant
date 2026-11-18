/**
 * Air-quality maths: US EPA AQI categories, PM2.5 → AQI conversion,
 * forecast summarising and "best time to go outside" windows.
 * Pure functions only — safe to unit test in Node without a DOM.
 * @module aqi
 */
import { HEALTH } from './config.js';

/** US EPA AQI categories (index ranges are inclusive). */
export const AQI_CATEGORIES = Object.freeze([
  {
    max: 50,
    level: 'good',
    label: 'Good',
    color: '#1e7b3c',
    advice: 'Air quality is satisfactory. Enjoy outdoor activities.',
  },
  {
    max: 100,
    level: 'moderate',
    label: 'Moderate',
    color: '#c9a400',
    advice: 'Unusually sensitive people should limit long outdoor exertion.',
  },
  {
    max: 150,
    level: 'usg',
    label: 'Unhealthy for Sensitive Groups',
    color: '#c2410c',
    advice: 'Children, older adults and people with asthma or heart disease should reduce outdoor exertion.',
  },
  {
    max: 200,
    level: 'unhealthy',
    label: 'Unhealthy',
    color: '#c5221f',
    advice: 'Everyone should reduce prolonged outdoor exertion; sensitive groups should stay indoors.',
  },
  {
    max: 300,
    level: 'very-unhealthy',
    label: 'Very Unhealthy',
    color: '#8e3fa8',
    advice: 'Health alert: avoid outdoor activity and keep indoor air filtered.',
  },
  {
    max: Infinity,
    level: 'hazardous',
    label: 'Hazardous',
    color: '#7e0023',
    advice: 'Emergency conditions: stay indoors with windows closed and air purifiers running.',
  },
]);

/**
 * EPA PM2.5 breakpoints (24-hour, µg/m³) — 2024 revision.
 * Each row: [concLow, concHigh, aqiLow, aqiHigh].
 */
const PM25_BREAKPOINTS = Object.freeze([
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 500.4, 301, 500],
]);

/**
 * Returns true when value is a finite number.
 * @param {unknown} value
 * @returns {value is number}
 */
export const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Map an AQI value to its EPA category.
 * @param {number} aqi
 * @returns {{max:number, level:string, label:string, color:string, advice:string}}
 */
export function categorize(aqi) {
  if (!isFiniteNumber(aqi) || aqi < 0) {
    throw new RangeError('AQI must be a non-negative finite number');
  }
  const rounded = Math.round(aqi);
  return AQI_CATEGORIES.find((c) => rounded <= c.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

/**
 * Convert a PM2.5 concentration (µg/m³) to a US AQI value.
 * @param {number} concentration
 * @returns {number} integer AQI (capped at 500)
 */
export function pm25ToAqi(concentration) {
  if (!isFiniteNumber(concentration) || concentration < 0) {
    throw new RangeError('Concentration must be a non-negative finite number');
  }
  // EPA truncates PM2.5 to one decimal place before lookup.
  const c = Math.floor(concentration * 10) / 10;
  const row =
    PM25_BREAKPOINTS.find(([lo, hi]) => c >= lo && c <= hi) ?? PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1];
  const [cLo, cHi, iLo, iHi] = row;
  const aqi = ((iHi - iLo) / (cHi - cLo)) * (Math.min(c, cHi) - cLo) + iLo;
  return Math.min(500, Math.round(aqi));
}

/**
 * PM2.5 exposure expressed as "cigarettes per day" (Berkeley Earth rule of thumb:
 * 22 µg/m³ for 24 h ≈ 1 cigarette). Helps families grasp the impact.
 * @param {number} pm25
 * @returns {number} rounded to one decimal place
 */
export function cigaretteEquivalent(pm25) {
  if (!isFiniteNumber(pm25) || pm25 < 0) return 0;
  return Math.round((pm25 / HEALTH.pm25PerCigarette) * 10) / 10;
}

/**
 * True when a window starting at `iso` and lasting `length` hours lies within daytime.
 * @param {string} iso
 * @param {number} length
 * @param {number} startHour
 * @param {number} endHour
 * @returns {boolean}
 */
function isDaytimeWindow(iso, length, startHour, endHour) {
  const hourStart = new Date(iso).getHours();
  return !Number.isNaN(hourStart) && hourStart >= startHour && hourStart + length <= endHour + 1;
}

/**
 * Pick up to `limit` non-overlapping candidates (input sorted cleanest first).
 * @template {{index:number}} T
 * @param {T[]} sorted
 * @param {number} length window length in hours
 * @param {number} limit
 * @returns {T[]}
 */
function pickNonOverlapping(sorted, length, limit) {
  /** @type {T[]} */
  const chosen = [];
  for (const candidate of sorted) {
    if (chosen.length >= limit) break;
    if (chosen.every((p) => Math.abs(p.index - candidate.index) >= length)) chosen.push(candidate);
  }
  return chosen;
}

/**
 * Every fully-valued daytime window of `length` hours, with its average AQI.
 * @param {string[]} times
 * @param {number[]} values
 * @param {{length:number, startHour:number, endHour:number}} opts
 * @returns {{index:number, start:string, end:string, average:number}[]}
 */
function windowCandidates(times, values, { length, startHour, endHour }) {
  const candidates = [];
  for (let i = 0; i + length <= times.length; i += 1) {
    const slice = values.slice(i, i + length);
    if (slice.every(isFiniteNumber) && isDaytimeWindow(times[i], length, startHour, endHour)) {
      const average = Math.round(slice.reduce((a, b) => a + b, 0) / length);
      candidates.push({ index: i, start: times[i], end: times[i + length - 1], average });
    }
  }
  return candidates;
}

/**
 * Find the cleanest continuous window of `length` hours within daytime hours.
 * @param {string[]} times ISO local timestamps (e.g. "2026-11-17T06:00")
 * @param {number[]} values AQI values aligned with `times`
 * @param {{length?:number, startHour?:number, endHour?:number, limit?:number}} [opts]
 * @returns {{start:string, end:string, average:number}[]} best windows, cleanest first
 */
export function bestWindows(times, values, opts = {}) {
  const { length = 2, startHour = 6, endHour = 21, limit = 2 } = opts;
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
    return [];
  }
  const candidates = windowCandidates(times, values, { length, startHour, endHour });
  candidates.sort((a, b) => a.average - b.average || a.index - b.index);
  return pickNonOverlapping(candidates, length, limit).map(({ start, end, average }) => ({
    start,
    end,
    average,
  }));
}

/**
 * @typedef {{time:string, aqi:number}} ForecastPoint
 * @typedef {{
 *   min:number,
 *   max:number,
 *   average:number,
 *   peakTime:string|null,
 *   points:ForecastPoint[]
 * }} ForecastSummary
 */

/**
 * Summarise the next `hours` of an hourly AQI forecast.
 * @param {string[]} times
 * @param {number[]} values
 * @param {number} [hours=24]
 * @param {Date} [now=new Date()]
 * @returns {ForecastSummary}
 */
export function summarizeForecast(times, values, hours = 24, now = new Date()) {
  const points = [];
  const nowHour = new Date(now);
  nowHour.setMinutes(0, 0, 0);
  for (let i = 0; i < times.length && points.length < hours; i += 1) {
    if (new Date(times[i]) >= nowHour && isFiniteNumber(values[i])) {
      points.push({ time: times[i], aqi: Math.round(values[i]) });
    }
  }
  if (points.length === 0) return { min: 0, max: 0, average: 0, peakTime: null, points };
  const aqis = points.map((p) => p.aqi);
  const max = Math.max(...aqis);
  return {
    min: Math.min(...aqis),
    max,
    average: Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length),
    peakTime: points.find((p) => p.aqi === max)?.time ?? null,
    points,
  };
}
