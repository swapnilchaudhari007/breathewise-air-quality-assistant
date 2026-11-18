/**
 * Deterministic, rule-based planner used when the AI is unreachable, so the
 * family always receives useful, quantified guidance. Each tip is chosen by a
 * small rule function; the static wording lives in `tips.js`.
 * Pure functions — no DOM, no network.
 * @module offline-plan
 */
import { categorize, cigaretteEquivalent } from './aqi.js';
import { commuteSavings, estimateIndoorPm25, exposureReduction, COMMUTE_EMISSIONS } from './impact.js';
import { sanitizeText } from './validate.js';
import { formatHour } from './format.js';
import { tip, ROUTINE, INDOOR, SWAPS } from './tips.js';
import { CARBON, HEALTH, LIMITS } from './config.js';

/**
 * @typedef {import('./plan.js').PlanContext} PlanContext
 * @typedef {import('./plan.js').PlanItem} PlanItem
 * @typedef {import('./plan.js').Plan} Plan
 */

/**
 * Percentage less pollution breathed in the clean window versus the peak.
 * @param {number} windowAqi
 * @param {number} peakAqi
 * @returns {number}
 */
export function windowBenefitPercent(windowAqi, peakAqi) {
  return Math.max(0, Math.round((1 - windowAqi / Math.max(peakAqi, 1)) * 100));
}

/**
 * True when today's AQI is high enough to move exertion indoors.
 * @param {number} aqi
 * @returns {boolean}
 */
const isSevere = (aqi) => aqi > HEALTH.severeAqi;

/**
 * Daily PM2.5 dose reduction from following the plan versus current habits.
 * @param {PlanContext} ctx
 * @returns {ReturnType<typeof exposureReduction>}
 */
function planReduction({ air, profile }) {
  const current = {
    outdoorHours: HEALTH.baselineOutdoorHours,
    mask: /** @type {const} */ ('none'),
    windows: profile.home.windows,
    purifier: profile.home.purifier,
  };
  const recommended = {
    outdoorHours: isSevere(air.aqi) ? HEALTH.severeOutdoorHours : HEALTH.planOutdoorHours,
    mask: /** @type {const} */ ('n95'),
    windows: /** @type {const} */ ('closed'),
    purifier: true,
  };
  return exposureReduction(air.pm25, current, recommended);
}

/* ---------- Routine ---------- */

/**
 * Time outdoor activity to the cleanest forecast window.
 * @param {PlanContext['forecast']} forecast
 * @returns {PlanItem}
 */
function cleanWindowTip(forecast) {
  const best = forecast.best[0];
  if (!best) return ROUTINE.noWindow;
  const window = `${formatHour(best.start)}–${formatHour(best.end)}`;
  return tip(
    `Go outside ${window}`,
    `Schedule walks, school runs and exercise in the cleanest window (avg AQI ${best.average}) ` +
      `and avoid the peak around ${formatHour(forecast.peakTime)}.`,
    `Breathing AQI ${best.average} instead of ${forecast.max} cuts pollutant intake during outdoor time ` +
      `by ~${windowBenefitPercent(best.average, forecast.max)}%.`,
  );
}

/**
 * Mask advice, quantified by the whole plan's dose reduction.
 * @param {number} reductionPercent
 * @returns {PlanItem}
 */
function maskTip(reductionPercent) {
  return tip(
    'Wear a fitted N95 outdoors',
    ROUTINE.maskAction,
    `Combined with the steps below, your family's daily PM2.5 dose drops by ~${reductionPercent}%.`,
  );
}

/**
 * Exercise advice for active households, errands advice otherwise.
 * @param {PlanContext} ctx
 * @returns {PlanItem}
 */
function activityTip({ air, profile }) {
  if (profile.lifestyle.exercise === 'none') return ROUTINE.errands;
  const action = isSevere(air.aqi) ? ROUTINE.exerciseSevere : ROUTINE.exerciseMild;
  return tip('Move workouts indoors', action, ROUTINE.exerciseImpact);
}

/**
 * Extra protection when children, elders or people with respiratory conditions live at home.
 * @param {PlanContext} ctx
 * @returns {PlanItem|null}
 */
function vulnerableTip({ air, profile }) {
  const { children, elderly, respiratory } = profile.household;
  if (!children && !elderly && !respiratory) return null;
  return tip(
    'Protect vulnerable members',
    ROUTINE.vulnerableAction,
    `${categorize(air.aqi).label} air hits sensitive lungs first — staying in reduces their dose most.`,
  );
}

/**
 * Low-emission daily routine timed to the forecast.
 * @param {PlanContext} ctx
 * @returns {PlanItem[]}
 */
function buildRoutine(ctx) {
  const items = [
    cleanWindowTip(ctx.forecast),
    maskTip(planReduction(ctx).reductionPercent),
    activityTip(ctx),
    vulnerableTip(ctx),
  ];
  return items.filter((item) => item !== null);
}

/* ---------- Indoor ---------- */

/**
 * Window strategy with the estimated indoor PM2.5 change.
 * @param {PlanContext} ctx
 * @returns {PlanItem}
 */
function windowsTip({ air, forecast, profile }) {
  const { windows, purifier } = profile.home;
  const best = forecast.best[0];
  const now = estimateIndoorPm25(air.pm25, { windows, purifier });
  const closed = estimateIndoorPm25(air.pm25, { windows: 'closed', purifier });
  return tip(
    windows === 'open' ? 'Close windows at peak hours' : 'Keep windows closed',
    `Ventilate only for 10–15 minutes during ${best ? formatHour(best.start) : 'the cleanest hour'}; ` +
      'seal gaps with door snakes or weather strips.',
    `Lowers indoor PM2.5 from ~${now} to ~${closed} µg/m³.`,
  );
}

/**
 * Purifier advice (use it well, or build a DIY one) with the filtered estimate.
 * @param {PlanContext} ctx
 * @returns {PlanItem}
 */
function purifierTip({ air, profile }) {
  const { windows, purifier } = profile.home;
  const now = estimateIndoorPm25(air.pm25, { windows, purifier });
  const filtered = estimateIndoorPm25(air.pm25, { windows: 'closed', purifier: true });
  return tip(
    purifier ? 'Run purifier on high' : 'Add a HEPA filter (DIY works)',
    purifier ? INDOOR.purifierOwned : INDOOR.purifierDiy,
    `A HEPA/MERV-13 filter brings indoor PM2.5 to ~${filtered} µg/m³ ` +
      `(≈${cigaretteEquivalent(filtered)} cigarettes/day instead of ${cigaretteEquivalent(now)}).`,
  );
}

/**
 * Indoor smoke advice tailored to the cooking fuel.
 * @param {PlanContext['profile']} profile
 * @returns {PlanItem}
 */
function smokeTip(profile) {
  const action = profile.lifestyle.cooking === 'biomass' ? INDOOR.smokeBiomass : INDOOR.smokeDefault;
  return tip(INDOOR.smokeTitle, action, INDOOR.smokeImpact);
}

/**
 * Indoor air-quality hacks with estimated indoor PM2.5 impact.
 * @param {PlanContext} ctx
 * @returns {PlanItem[]}
 */
function buildIndoorHacks(ctx) {
  return [windowsTip(ctx), purifierTip(ctx), smokeTip(ctx.profile), INDOOR.wetClean];
}

/* ---------- Sustainable swaps ---------- */

/**
 * Quantified commute swap, or praise for an already-clean commute.
 * @param {PlanContext['profile']} profile
 * @returns {PlanItem}
 */
function commuteTip({ commute }) {
  const target = commute.km <= HEALTH.cycleMaxKm ? 'cycle' : 'metro';
  const from = COMMUTE_EMISSIONS[commute.mode];
  const to = COMMUTE_EMISSIONS[target];
  if (from.kgPerKm <= to.kgPerKm) return SWAPS.cleanCommute;
  const saving = commuteSavings(commute.mode, target, commute.km, CARBON.defaultDaysPerWeek);
  return tip(
    `Swap ${from.label.toLowerCase()} for ${to.label.toLowerCase()}`,
    `Take ${to.label.toLowerCase()} for your ${commute.km} km commute, ` +
      'or work from home on severe-smog days.',
    `Saves ~${saving.weeklyKg} kg CO₂ a week ` +
      `(${saving.yearlyKg} kg/yr ≈ ${saving.treesEquivalent} trees) ` +
      'and removes tailpipe emissions from your street.',
  );
}

/**
 * Sustainable lifestyle swaps, led by a quantified commute change.
 * @param {PlanContext['profile']} profile
 * @returns {PlanItem[]}
 */
function buildSwaps(profile) {
  return [commuteTip(profile), ...SWAPS.community];
}

/* ---------- Plan ---------- */

/**
 * One-paragraph summary of today's air and the plan's overall benefit.
 * @param {PlanContext} ctx
 * @returns {string}
 */
function summarize(ctx) {
  const { air } = ctx;
  const cat = categorize(air.aqi);
  const place = sanitizeText(ctx.place, LIMITS.place);
  const { reductionPercent } = planReduction(ctx);
  return (
    `Air in ${place} is ${cat.label.toLowerCase()} (AQI ${air.aqi}, PM2.5 ${air.pm25} µg/m³ ` +
    `≈ ${cigaretteEquivalent(air.pm25)} cigarettes/day). ${cat.advice} ` +
    `Following this plan can cut your family's daily exposure by about ${reductionPercent}%.`
  );
}

/**
 * Build a complete offline plan from the live context.
 * @param {PlanContext} ctx
 * @returns {Plan}
 */
export function buildOfflinePlan(ctx) {
  /**
   * Keep at most `LIMITS.planItems` items.
   * @param {PlanItem[]} items
   * @returns {PlanItem[]}
   */
  const cap = (items) => items.slice(0, LIMITS.planItems);
  return {
    summary: summarize(ctx),
    routine: cap(buildRoutine(ctx)),
    indoor: cap(buildIndoorHacks(ctx)),
    alternatives: cap(buildSwaps(ctx.profile)),
    source: 'offline',
  };
}
