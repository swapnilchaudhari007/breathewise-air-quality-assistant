/**
 * Impact calculators that turn choices into concrete numbers:
 * personal PM2.5 exposure, indoor air estimates and commute CO₂ savings.
 * Pure functions — no DOM, no network.
 * @module impact
 */

import { CARBON, PROFILE } from './config.js';

/** @typedef {{label:string, kgPerKm:number}} CommuteMode */

/**
 * Approximate tailpipe/lifecycle CO₂ per passenger-km (kg), India-centric averages.
 * @type {Readonly<Record<string, CommuteMode>>}
 */
export const COMMUTE_EMISSIONS = Object.freeze({
  car: { label: 'Petrol/diesel car', kgPerKm: 0.17 },
  'two-wheeler': { label: 'Two-wheeler', kgPerKm: 0.07 },
  'auto-rickshaw': { label: 'Auto-rickshaw / cab share', kgPerKm: 0.09 },
  bus: { label: 'Public bus', kgPerKm: 0.03 },
  metro: { label: 'Metro / local train', kgPerKm: 0.02 },
  ev: { label: 'Electric vehicle', kgPerKm: 0.06 },
  cycle: { label: 'Cycle', kgPerKm: 0 },
  walk: { label: 'Walk', kgPerKm: 0 },
  wfh: { label: 'Work from home', kgPerKm: 0 },
});

/** Fraction of outdoor PM2.5 that enters a home (infiltration factor). */
const INFILTRATION = Object.freeze({ open: 0.8, closed: 0.45, sealed: 0.3 });

/** Fraction of PM2.5 a mask removes when worn correctly. */
export const MASK_FILTRATION = Object.freeze({ none: 0, cloth: 0.3, surgical: 0.6, n95: 0.95 });

/**
 * Round to one decimal place.
 * @param {number} n
 * @returns {number}
 */
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Coerce to a number (non-numeric → 0) and clamp to [min, max].
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const clamp = (value, min, max) => Math.max(min, Math.min(Number(value) || 0, max));

/** Hours in a day, for daily-dose calculations. */
const DAY_HOURS = 24;

/** Share of outdoor PM2.5 a purifier removes by default, and its upper bound. */
const PURIFIER = Object.freeze({ defaultEfficiency: 0.5, maxEfficiency: 0.9 });

/**
 * Weekly CO₂ saved by switching commute mode.
 * @param {string} fromMode key of COMMUTE_EMISSIONS
 * @param {string} toMode key of COMMUTE_EMISSIONS
 * @param {number} oneWayKm
 * @param {number} [daysPerWeek=CARBON.defaultDaysPerWeek]
 * @returns {{weeklyKg:number, yearlyKg:number, treesEquivalent:number}}
 */
export function commuteSavings(fromMode, toMode, oneWayKm, daysPerWeek = CARBON.defaultDaysPerWeek) {
  const from = COMMUTE_EMISSIONS[fromMode];
  const to = COMMUTE_EMISSIONS[toMode];
  if (!from || !to) throw new RangeError('Unknown commute mode');
  const km = clamp(oneWayKm, PROFILE.commuteKm.min, PROFILE.commuteKm.max);
  const days = clamp(daysPerWeek, PROFILE.daysPerWeek.min, PROFILE.daysPerWeek.max);
  const weeklyKg = Math.max(0, (from.kgPerKm - to.kgPerKm) * km * 2 * days);
  const yearlyKg = weeklyKg * CARBON.workingWeeksPerYear;
  return {
    weeklyKg: round1(weeklyKg),
    yearlyKg: Math.round(yearlyKg),
    treesEquivalent: Math.round(yearlyKg / CARBON.kgPerTreePerYear),
  };
}

/**
 * Estimate indoor PM2.5 from outdoor levels and household measures.
 * @param {number} outdoorPm25 µg/m³
 * @param {{windows?:'open'|'closed'|'sealed', purifier?:boolean, purifierEfficiency?:number}} [home]
 * @returns {number} estimated indoor PM2.5 (µg/m³)
 */
export function estimateIndoorPm25(outdoorPm25, home = {}) {
  const outdoor = Math.max(0, Number(outdoorPm25) || 0);
  const infiltration = INFILTRATION[home.windows ?? 'closed'] ?? INFILTRATION.closed;
  const purifierCut = home.purifier
    ? Math.min(Math.max(home.purifierEfficiency ?? PURIFIER.defaultEfficiency, 0), PURIFIER.maxEfficiency)
    : 0;
  return round1(outdoor * infiltration * (1 - purifierCut));
}

/**
 * @typedef {{
 *   outdoorHours:number,
 *   mask:keyof typeof MASK_FILTRATION,
 *   windows:'open'|'closed'|'sealed',
 *   purifier:boolean
 * }} Habits
 */

/**
 * Daily inhaled-dose comparison between current habits and a recommended plan.
 * Dose is proportional to Σ(concentration × hours).
 * @param {number} outdoorPm25
 * @param {Habits} before
 * @param {Habits} after
 * @returns {{beforeDose:number, afterDose:number, reductionPercent:number}}
 */
export function exposureReduction(outdoorPm25, before, after) {
  /**
   * Daily PM2.5 dose for one set of habits.
   * @param {Habits} p
   * @returns {number}
   */
  const dose = (p) => {
    const outHours = clamp(p.outdoorHours, 0, DAY_HOURS);
    const maskCut = MASK_FILTRATION[p.mask] ?? 0;
    const indoor = estimateIndoorPm25(outdoorPm25, { windows: p.windows, purifier: p.purifier });
    return outdoorPm25 * (1 - maskCut) * outHours + indoor * (DAY_HOURS - outHours);
  };
  const beforeDose = dose(before);
  const afterDose = dose(after);
  const reductionPercent = beforeDose > 0 ? Math.round(((beforeDose - afterDose) / beforeDose) * 100) : 0;
  return {
    beforeDose: Math.round(beforeDose),
    afterDose: Math.round(afterDose),
    reductionPercent: Math.max(0, reductionPercent),
  };
}
