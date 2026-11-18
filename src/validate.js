/**
 * Input validation & sanitisation. Every value that reaches the AI prompt,
 * the network or the DOM passes through here first.
 * @module validate
 */
import { COMMUTE_EMISSIONS } from './impact.js';
import { LIMITS, PROFILE } from './config.js';

const CONTROL_RANGES = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
];
const CONTROL_CHARS = new RegExp(
  `[${CONTROL_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`,
  'g',
);

/**
 * Remove control/zero-width characters, collapse whitespace and cap length.
 * @param {unknown} value
 * @param {number} [maxLength=LIMITS.defaultText]
 * @returns {string}
 */
export function sanitizeText(value, maxLength = LIMITS.defaultText) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Validate a city search query: letters (any script), spaces and , . ' - only.
 * @param {unknown} query
 * @returns {string|null} cleaned query or null when invalid
 */
export function validateCityQuery(query) {
  const q = sanitizeText(query, LIMITS.cityQuery);
  if (q.length < LIMITS.minCityQuery) return null;
  return /^[\p{L}\p{M}\s,.'-]+$/u.test(q) ? q : null;
}

/**
 * Validate latitude/longitude.
 * @param {unknown} lat
 * @param {unknown} lon
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Return `value` when it is one of `allowed`, otherwise `fallback`.
 * @template {string} T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @param {T} fallback
 * @returns {T}
 */
export function pick(value, allowed, fallback) {
  return allowed.includes(/** @type {T} */ (value)) ? /** @type {T} */ (value) : fallback;
}

/**
 * Coerce to a number and clamp to `range`, using its fallback when not numeric.
 * Empty strings and null count as missing.
 * @param {unknown} value
 * @param {{min:number, max:number, fallback:number}} range
 * @returns {number}
 */
export function clampNumber(value, { min, max, fallback }) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/**
 * @typedef {'open'|'closed'|'sealed'} WindowHabit
 * @typedef {{
 *   household:{children:boolean, elderly:boolean, respiratory:boolean, pets:boolean, size:number},
 *   commute:{mode:string, km:number},
 *   home:{windows:WindowHabit, purifier:boolean},
 *   lifestyle:{exercise:'morning'|'evening'|'none', cooking:'lpg'|'electric'|'biomass'},
 *   notes:string
 * }} Profile
 */

/**
 * Normalise a raw household profile (e.g. from a form) into a safe, typed object.
 * Unknown keys are dropped; unknown enum values fall back to defaults.
 * @param {Record<string, unknown>} [raw]
 * @returns {Profile}
 */
export function validateProfile(raw = {}) {
  const r = raw ?? {};
  return {
    household: {
      children: r.children === true,
      elderly: r.elderly === true,
      respiratory: r.respiratory === true,
      pets: r.pets === true,
      size: Math.round(clampNumber(r.size, PROFILE.size)),
    },
    commute: {
      mode: pick(r.commuteMode, Object.keys(COMMUTE_EMISSIONS), PROFILE.defaultCommute),
      km: clampNumber(r.commuteKm, PROFILE.commuteKm),
    },
    home: {
      windows: pick(r.windows, PROFILE.windows, 'open'),
      purifier: r.purifier === true,
    },
    lifestyle: {
      exercise: pick(r.exercise, PROFILE.exercise, 'morning'),
      cooking: pick(r.cooking, PROFILE.cooking, 'lpg'),
    },
    notes: sanitizeText(r.notes, LIMITS.notes),
  };
}
