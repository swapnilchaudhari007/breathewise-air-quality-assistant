/**
 * Shared, pure formatting helpers used by both the prompt builder and the UI.
 * @module format
 */
import { LOCALE, HOUR_MS } from './config.js';

/**
 * Format an ISO timestamp as a short local hour, e.g. "7 am".
 * @param {string|null|undefined} iso
 * @returns {string} formatted hour, or "unknown" for missing/invalid input
 */
export function formatHour(iso) {
  if (!iso) return 'unknown';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'unknown'
    : date.toLocaleTimeString(LOCALE, { hour: 'numeric', hour12: true });
}

/**
 * Return the ISO timestamp `hours` after `iso`.
 * @param {string} iso
 * @param {number} hours
 * @returns {string}
 */
export function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * HOUR_MS).toISOString();
}

/**
 * Format a measurement with its unit, or "n/a" when the value is missing.
 * @param {number|null|undefined} value
 * @param {string} unit
 * @returns {string}
 */
export function formatMeasure(value, unit) {
  return value === null || value === undefined ? 'n/a' : `${value} ${unit}`;
}
