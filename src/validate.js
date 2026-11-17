/**
 * Input validation & sanitisation. Every value that reaches the AI prompt,
 * the network or the DOM passes through here first.
 * @module validate
 */
import { COMMUTE_EMISSIONS } from './impact.js';

const CONTROL_RANGES = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e]];
const CONTROL_CHARS = new RegExp(`[${CONTROL_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`, 'g');

/**
 * Remove control/zero-width characters, collapse whitespace and cap length.
 * @param {unknown} value
 * @param {number} [maxLength=200]
 * @returns {string}
 */
export function sanitizeText(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Validate a city search query: letters (any script), spaces and , . ' - only.
 * @param {unknown} query
 * @returns {string|null} cleaned query or null when invalid
 */
export function validateCityQuery(query) {
  const q = sanitizeText(query, 80);
  if (q.length < 2) return null;
  return /^[\p{L}\p{M}\s,.'-]+$/u.test(q) ? q : null;
}

/**
 * Validate latitude/longitude.
 * @param {unknown} lat
 * @param {unknown} lon
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number'
    && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/**
 * Normalise a raw household profile (e.g. from a form) into a safe, typed object.
 * Unknown keys are dropped; unknown enum values fall back to defaults.
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   household:{children:boolean, elderly:boolean, respiratory:boolean, pets:boolean, size:number},
 *   commute:{mode:string, km:number},
 *   home:{windows:'open'|'closed'|'sealed', purifier:boolean},
 *   lifestyle:{exercise:'morning'|'evening'|'none', cooking:'lpg'|'electric'|'biomass'},
 *   notes:string
 * }}
 */
export function validateProfile(raw = {}) {
  const r = raw ?? {};
  return {
    household: {
      children: r.children === true,
      elderly: r.elderly === true,
      respiratory: r.respiratory === true,
      pets: r.pets === true,
      size: Math.round(clampNumber(r.size, 1, 20, 4)),
    },
    commute: {
      mode: pick(r.commuteMode, Object.keys(COMMUTE_EMISSIONS), 'two-wheeler'),
      km: clampNumber(r.commuteKm, 0, 200, 10),
    },
    home: {
      windows: pick(r.windows, ['open', 'closed', 'sealed'], 'open'),
      purifier: r.purifier === true,
    },
    lifestyle: {
      exercise: pick(r.exercise, ['morning', 'evening', 'none'], 'morning'),
      cooking: pick(r.cooking, ['lpg', 'electric', 'biomass'], 'lpg'),
    },
    notes: sanitizeText(r.notes, 300),
  };
}
