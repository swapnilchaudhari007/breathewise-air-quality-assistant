/**
 * Deterministic, rule-based planner used when the AI is unreachable, so the
 * family always receives useful, quantified guidance.
 * Pure functions — no DOM, no network.
 * @module offline-plan
 */
import { categorize, cigaretteEquivalent } from './aqi.js';
import { commuteSavings, estimateIndoorPm25, exposureReduction, COMMUTE_EMISSIONS } from './impact.js';
import { sanitizeText } from './validate.js';
import { formatHour } from './format.js';
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
 * Daily PM2.5 dose reduction from following the plan versus current habits.
 * @param {PlanContext} ctx
 * @returns {ReturnType<typeof exposureReduction>}
 */
function planReduction({ air, profile }) {
  return exposureReduction(
    air.pm25,
    {
      outdoorHours: HEALTH.baselineOutdoorHours,
      mask: 'none',
      windows: profile.home.windows,
      purifier: profile.home.purifier,
    },
    {
      outdoorHours: air.aqi > HEALTH.severeAqi ? HEALTH.severeOutdoorHours : HEALTH.planOutdoorHours,
      mask: 'n95',
      windows: 'closed',
      purifier: true,
    },
  );
}

/**
 * Low-emission daily routine timed to the forecast.
 * @param {PlanContext} ctx
 * @returns {PlanItem[]}
 */
function buildRoutine(ctx) {
  const { air, forecast, profile } = ctx;
  const cat = categorize(air.aqi);
  const best = forecast.best[0];
  const severe = air.aqi > HEALTH.severeAqi;
  const { household } = profile;
  const sensitive = household.children || household.elderly || household.respiratory;
  const reduction = planReduction(ctx);
  const routine = [
    best
      ? {
          title: `Go outside ${formatHour(best.start)}–${formatHour(best.end)}`,
          action: `Schedule walks, school runs and exercise in the cleanest window (avg AQI ${best.average}) and avoid the peak around ${formatHour(forecast.peakTime)}.`,
          impact: `Breathing AQI ${best.average} instead of ${forecast.max} cuts pollutant intake during outdoor time by ~${windowBenefitPercent(best.average, forecast.max)}%.`,
        }
      : {
          title: 'Limit time outdoors',
          action: 'No clean window today — keep outdoor trips short and essential.',
          impact: 'Every hour indoors with filtered air avoids a full hour of outdoor PM2.5.',
        },
    {
      title: 'Wear a fitted N95 outdoors',
      action: 'Use N95/FFP2 masks (not cloth) for commutes and errands; check the seal around the nose.',
      impact: `Combined with the steps below, your family's daily PM2.5 dose drops by ~${reduction.reductionPercent}%.`,
    },
    profile.lifestyle.exercise !== 'none'
      ? {
          title: 'Move workouts indoors',
          action: severe
            ? 'Switch running and cycling to indoor yoga or bodyweight workouts until AQI falls below 100.'
            : 'Exercise lightly outdoors only in the clean window; heavy breathing multiplies intake.',
          impact:
            'Intense exercise raises breathing rate up to 10×, so moving it indoors avoids most of that extra dose.',
        }
      : {
          title: 'Plan errands smartly',
          action: 'Batch shopping and errands into a single trip during the clean window.',
          impact: 'Fewer trips mean less exposure and fewer vehicle emissions.',
        },
  ];
  if (sensitive) {
    routine.push({
      title: 'Protect vulnerable members',
      action:
        'Keep children, elders and anyone with asthma indoors during peak hours; keep inhalers handy and seek a doctor if breathing worsens.',
      impact: `${cat.label} air hits sensitive lungs first — staying in reduces their dose most.`,
    });
  }
  return routine;
}

/**
 * Indoor air-quality hacks with estimated indoor PM2.5 impact.
 * @param {PlanContext} ctx
 * @returns {PlanItem[]}
 */
function buildIndoorHacks({ air, forecast, profile }) {
  const best = forecast.best[0];
  const indoorNow = estimateIndoorPm25(air.pm25, {
    windows: profile.home.windows,
    purifier: profile.home.purifier,
  });
  const indoorBetter = estimateIndoorPm25(air.pm25, { windows: 'closed', purifier: true });
  return [
    {
      title: profile.home.windows === 'open' ? 'Close windows at peak hours' : 'Keep windows closed',
      action: `Ventilate only for 10–15 minutes during ${best ? formatHour(best.start) : 'the cleanest hour'}; seal gaps with door snakes or weather strips.`,
      impact: `Lowers indoor PM2.5 from ~${indoorNow} to ~${estimateIndoorPm25(air.pm25, { windows: 'closed', purifier: profile.home.purifier })} µg/m³.`,
    },
    {
      title: profile.home.purifier ? 'Run purifier on high' : 'Add a HEPA filter (DIY works)',
      action: profile.home.purifier
        ? 'Keep the purifier in the bedroom at night, doors closed, and change filters on schedule.'
        : 'Strap a MERV-13 filter to a box fan (a ~₹2,500 DIY purifier) and run it in the room where you sleep.',
      impact: `A HEPA/MERV-13 filter brings indoor PM2.5 to ~${indoorBetter} µg/m³ (≈${cigaretteEquivalent(indoorBetter)} cigarettes/day instead of ${cigaretteEquivalent(indoorNow)}).`,
    },
    {
      title: 'Cut indoor smoke sources',
      action:
        profile.lifestyle.cooking === 'biomass'
          ? 'Shift from wood/coal to LPG or induction; until then cook with the exhaust on and the door shut.'
          : 'Use the kitchen chimney/exhaust while cooking; avoid incense, mosquito coils and candles.',
      impact:
        'Incense and frying can spike indoor PM2.5 above 300 µg/m³ for hours — removing them is a free, instant win.',
    },
    {
      title: 'Wet-clean dust daily',
      action: 'Mop floors and wipe surfaces with a damp cloth instead of sweeping; keep shoes at the door.',
      impact: 'Wet cleaning traps settled particles instead of resuspending them into the air you breathe.',
    },
  ];
}

/**
 * Sustainable lifestyle swaps, led by a quantified commute change.
 * @param {PlanContext['profile']} profile
 * @returns {PlanItem[]}
 */
function buildSwaps(profile) {
  const mode = profile.commute.mode;
  const target = profile.commute.km <= HEALTH.cycleMaxKm ? 'cycle' : 'metro';
  const swaps = [];
  if (COMMUTE_EMISSIONS[mode].kgPerKm > COMMUTE_EMISSIONS[target].kgPerKm) {
    const s = commuteSavings(mode, target, profile.commute.km, CARBON.defaultDaysPerWeek);
    swaps.push({
      title: `Swap ${COMMUTE_EMISSIONS[mode].label.toLowerCase()} for ${COMMUTE_EMISSIONS[target].label.toLowerCase()}`,
      action: `Take ${COMMUTE_EMISSIONS[target].label.toLowerCase()} for your ${profile.commute.km} km commute, or work from home on severe-smog days.`,
      impact: `Saves ~${s.weeklyKg} kg CO₂ a week (${s.yearlyKg} kg/yr ≈ ${s.treesEquivalent} trees) and removes tailpipe emissions from your street.`,
    });
  } else {
    swaps.push({
      title: 'Keep your clean commute',
      action: 'Your commute is already low-emission — encourage colleagues to car-pool or use transit.',
      impact: 'Each car taken off the road avoids ~3.4 kg CO₂ per 20 km round trip.',
    });
  }
  swaps.push(
    {
      title: 'Never burn waste or leaves',
      action:
        'Compost kitchen and garden waste and report open burning in your area to the municipal helpline.',
      impact: 'Open burning is a major winter PM2.5 source; one pile can pollute a whole street for hours.',
    },
    {
      title: 'Grow air-friendly greenery',
      action:
        'Plant native trees or shrubs on balconies and society compounds; a green barrier helps beside busy roads.',
      impact: 'Roadside hedges can lower nearby particulate levels by up to ~20% while absorbing CO₂.',
    },
    {
      title: 'Choose energy-efficient heating',
      action: 'Avoid coal/wood heaters; use efficient electric heaters with timers and seal drafts instead.',
      impact: 'Cuts household emissions and indoor smoke at the same time.',
    },
  );
  return swaps;
}

/**
 * Build a complete offline plan from the live context.
 * @param {PlanContext} ctx
 * @returns {Plan}
 */
export function buildOfflinePlan(ctx) {
  const { air } = ctx;
  const cat = categorize(air.aqi);
  const reduction = planReduction(ctx);
  return {
    summary: `Air in ${sanitizeText(ctx.place, LIMITS.place)} is ${cat.label.toLowerCase()} (AQI ${air.aqi}, PM2.5 ${air.pm25} µg/m³ ≈ ${cigaretteEquivalent(air.pm25)} cigarettes/day). ${cat.advice} Following this plan can cut your family's daily exposure by about ${reduction.reductionPercent}%.`,
    routine: buildRoutine(ctx).slice(0, LIMITS.planItems),
    indoor: buildIndoorHacks(ctx).slice(0, LIMITS.planItems),
    alternatives: buildSwaps(ctx.profile).slice(0, LIMITS.planItems),
    source: 'offline',
  };
}
