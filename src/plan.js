/**
 * GenAI plan contract: the grounded prompt builders and a strict
 * parser/validator for model output. The offline fallback planner lives in
 * `offline-plan.js`.
 * @module plan
 */
import { categorize, cigaretteEquivalent } from './aqi.js';
import { COMMUTE_EMISSIONS } from './impact.js';
import { sanitizeText } from './validate.js';
import { formatHour } from './format.js';
import { PERSONA, PLAN_INSTRUCTIONS, CHAT_INSTRUCTIONS } from './prompts.js';
import { LIMITS } from './config.js';

/** Sections every plan must contain. */
export const PLAN_SECTIONS = Object.freeze(/** @type {const} */ (['routine', 'indoor', 'alternatives']));

/** Impact text used when the model omits one. */
const DEFAULT_IMPACT = 'Reduces your exposure to polluted air.';

/**
 * @typedef {{title:string, action:string, impact:string}} PlanItem
 * @typedef {{
 *   summary:string,
 *   routine:PlanItem[],
 *   indoor:PlanItem[],
 *   alternatives:PlanItem[],
 *   source:'ai'|'offline'
 * }} Plan
 * @typedef {{start:string, end:string, average:number}} CleanWindow
 * @typedef {{
 *   place:string,
 *   air:import('./api.js').AirReading,
 *   forecast:{min:number, max:number, peakTime:string|null, best:CleanWindow[]},
 *   weather?:import('./api.js').WeatherReading,
 *   profile:import('./validate.js').Profile
 * }} PlanContext
 * @typedef {{role:'system'|'user'|'assistant', content:string}} ChatMessage
 */

/**
 * Describe who lives in the household in plain words.
 * @param {PlanContext['profile']} profile
 * @returns {string}
 */
export function describeHousehold(profile) {
  const h = profile.household;
  const parts = [`${h.size} people`];
  if (h.children) parts.push('young children');
  if (h.elderly) parts.push('elderly members');
  if (h.respiratory) parts.push('someone with asthma/respiratory or heart conditions');
  if (h.pets) parts.push('pets');
  return parts.join(', ');
}

/**
 * Remove angle brackets so user text cannot close or forge prompt tags.
 * @param {string} text
 * @returns {string}
 */
const stripTags = (text) => text.replace(/[<>]/g, '');

/**
 * Show a missing reading as "n/a" in the prompt.
 * @param {number|undefined} value
 * @returns {string}
 */
const orNa = (value) => (value === undefined ? 'n/a' : String(value));

/**
 * Build chat messages for the LLM. User-supplied free text is fenced and
 * explicitly marked as data to mitigate prompt injection.
 * @param {PlanContext} ctx
 * @returns {ChatMessage[]}
 */
export function buildPlanMessages(ctx) {
  const system = [PERSONA, PLAN_INSTRUCTIONS].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: describeContext(ctx) },
  ];
}

/**
 * Build messages for a follow-up question, grounded in the same context.
 * @param {PlanContext} ctx
 * @param {import('./state.js').ChatTurn[]} history previous turns (latest last)
 * @returns {ChatMessage[]}
 */
export function buildChatMessages(ctx, history) {
  const system = [PERSONA, CHAT_INSTRUCTIONS, 'Context:', describeContext(ctx)].join('\n');
  const turns = history.slice(-LIMITS.chatHistory).map((m) => ({
    role: m.role,
    content:
      m.role === 'user'
        ? `<question>${stripTags(sanitizeText(m.content, LIMITS.question))}</question>`
        : sanitizeText(m.content, LIMITS.answer),
  }));
  return [{ role: 'system', content: system }, ...turns];
}

/**
 * Plain-text description of the location, air and household for the model.
 * @param {PlanContext} ctx
 * @returns {string}
 */
export function describeContext(ctx) {
  const { air, forecast, weather = {}, profile } = ctx;
  const { home, lifestyle, commute } = profile;
  const best =
    forecast.best
      .map((w) => `${formatHour(w.start)}–${formatHour(w.end)} (avg AQI ${w.average})`)
      .join('; ') || 'none identified';
  return [
    `Location: ${sanitizeText(ctx.place, LIMITS.place)}`,
    `Current US AQI: ${air.aqi} (${categorize(air.aqi).label}); ` +
      `PM2.5 ${air.pm25} µg/m³ (≈${cigaretteEquivalent(air.pm25)} cigarettes/day); ` +
      `PM10 ${orNa(air.pm10)}; NO2 ${orNa(air.no2)}; O3 ${orNa(air.o3)}.`,
    `Next 24h AQI range ${forecast.min}–${forecast.max}, peak around ${formatHour(forecast.peakTime)}. ` +
      `Cleanest windows: ${best}.`,
    `Weather: ${orNa(weather.temperature)}°C, wind ${orNa(weather.wind)} km/h.`,
    `Household: ${describeHousehold(profile)}.`,
    `Commute: ${COMMUTE_EMISSIONS[commute.mode].label}, ${commute.km} km one way.`,
    `Home: windows usually ${home.windows}; air purifier ${home.purifier ? 'yes' : 'no'}; ` +
      `cooking fuel ${lifestyle.cooking}; exercise ${lifestyle.exercise}.`,
    `<notes>${stripTags(sanitizeText(profile.notes, LIMITS.notes)) || 'none'}</notes>`,
  ].join('\n');
}

/**
 * Validate & clean a single plan item.
 * @param {unknown} item
 * @returns {PlanItem|null}
 */
function cleanItem(item) {
  if (!item || typeof item !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (item);
  const title = sanitizeText(raw.title, LIMITS.itemTitle);
  const action = sanitizeText(raw.action, LIMITS.itemAction);
  const impact = sanitizeText(raw.impact, LIMITS.itemImpact) || DEFAULT_IMPACT;
  return title && action ? { title, action, impact } : null;
}

/**
 * Clean one plan section, keeping at most `LIMITS.planItems` valid items.
 * @param {unknown} list
 * @returns {PlanItem[]}
 */
function cleanSection(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(cleanItem)
    .filter((item) => item !== null)
    .slice(0, LIMITS.planItems);
}

/**
 * Extract and parse the outermost JSON object in a string.
 * @param {string} text
 * @returns {Record<string, unknown>|null}
 */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Parse raw model text into a validated Plan. Tolerates code fences and
 * surrounding prose; returns null when the output is unusable.
 * @param {unknown} text
 * @returns {Plan|null}
 */
export function parsePlan(text) {
  if (typeof text !== 'string') return null;
  const data = extractJson(text);
  if (!data) return null;
  const summary = sanitizeText(data.summary, LIMITS.summary);
  const routine = cleanSection(data.routine);
  const indoor = cleanSection(data.indoor);
  const alternatives = cleanSection(data.alternatives);
  if (!summary || !routine.length || !indoor.length || !alternatives.length) return null;
  return { summary, routine, indoor, alternatives, source: 'ai' };
}
