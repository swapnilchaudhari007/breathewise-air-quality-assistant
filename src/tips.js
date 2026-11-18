/**
 * Static advice copy used by the offline planner. Keeping the wording here
 * separates content from the rules that choose it.
 * @module tips
 */

/** @typedef {import('./plan.js').PlanItem} PlanItem */

/**
 * Build a frozen plan item.
 * @param {string} title
 * @param {string} action
 * @param {string} impact
 * @returns {Readonly<PlanItem>}
 */
export const tip = (title, action, impact) => Object.freeze({ title, action, impact });

/** Routine tips that do not depend on live numbers. */
export const ROUTINE = Object.freeze({
  noWindow: tip(
    'Limit time outdoors',
    'No clean window today — keep outdoor trips short and essential.',
    'Every hour indoors with filtered air avoids a full hour of outdoor PM2.5.',
  ),
  errands: tip(
    'Plan errands smartly',
    'Batch shopping and errands into a single trip during the clean window.',
    'Fewer trips mean less exposure and fewer vehicle emissions.',
  ),
  maskAction: 'Use N95/FFP2 masks (not cloth) for commutes and errands; check the seal around the nose.',
  exerciseSevere:
    'Switch running and cycling to indoor yoga or bodyweight workouts until AQI falls below 100.',
  exerciseMild: 'Exercise lightly outdoors only in the clean window; heavy breathing multiplies intake.',
  exerciseImpact:
    'Intense exercise raises breathing rate up to 10×, so moving it indoors avoids most of that extra dose.',
  vulnerableAction:
    'Keep children, elders and anyone with asthma indoors during peak hours; ' +
    'keep inhalers handy and seek a doctor if breathing worsens.',
});

/** Indoor tips that do not depend on live numbers. */
export const INDOOR = Object.freeze({
  purifierOwned: 'Keep the purifier in the bedroom at night, doors closed, and change filters on schedule.',
  purifierDiy:
    'Strap a MERV-13 filter to a box fan (a ~₹2,500 DIY purifier) and run it in the room where you sleep.',
  smokeBiomass:
    'Shift from wood/coal to LPG or induction; until then cook with the exhaust on and the door shut.',
  smokeDefault: 'Use the kitchen chimney/exhaust while cooking; avoid incense, mosquito coils and candles.',
  smokeTitle: 'Cut indoor smoke sources',
  smokeImpact:
    'Incense and frying can spike indoor PM2.5 above 300 µg/m³ for hours — ' +
    'removing them is a free, instant win.',
  wetClean: tip(
    'Wet-clean dust daily',
    'Mop floors and wipe surfaces with a damp cloth instead of sweeping; keep shoes at the door.',
    'Wet cleaning traps settled particles instead of resuspending them into the air you breathe.',
  ),
});

/** Sustainable swaps that do not depend on live numbers. */
export const SWAPS = Object.freeze({
  cleanCommute: tip(
    'Keep your clean commute',
    'Your commute is already low-emission — encourage colleagues to car-pool or use transit.',
    'Each car taken off the road avoids ~3.4 kg CO₂ per 20 km round trip.',
  ),
  community: Object.freeze([
    tip(
      'Never burn waste or leaves',
      'Compost kitchen and garden waste and report open burning in your area to the municipal helpline.',
      'Open burning is a major winter PM2.5 source; one pile can pollute a whole street for hours.',
    ),
    tip(
      'Grow air-friendly greenery',
      'Plant native trees or shrubs on balconies and society compounds; ' +
        'a green barrier helps beside busy roads.',
      'Roadside hedges can lower nearby particulate levels by up to ~20% while absorbing CO₂.',
    ),
    tip(
      'Choose energy-efficient heating',
      'Avoid coal/wood heaters; use efficient electric heaters with timers and seal drafts instead.',
      'Cuts household emissions and indoor smoke at the same time.',
    ),
  ]),
});
