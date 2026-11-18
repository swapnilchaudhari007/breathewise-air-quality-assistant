/**
 * Central configuration: every tunable limit, timeout and domain constant
 * lives here so behaviour is easy to audit and adjust in one place.
 * @module config
 */

/** Locale used for all user-facing time formatting. */
export const LOCALE = 'en-IN';

/** Milliseconds in one hour. */
export const HOUR_MS = 3_600_000;

/** Network behaviour. */
export const NETWORK = Object.freeze({
  requestTimeoutMs: 15_000,
  aiTimeoutMs: 45_000,
  cacheTtlMs: 10 * 60 * 1000,
  cacheMaxEntries: 50,
  geocodeResults: 5,
  forecastDays: 2,
});

/** GenAI provider settings. */
export const AI = Object.freeze({
  temperature: 0.6,
  geminiModel: 'gemini-2.5-flash',
  geminiLabel: 'Google Gemini 2.5 Flash',
  pollinationsModel: 'openai',
  pollinationsLabel: 'Pollinations (OpenAI-compatible LLM)',
});

/** Maximum lengths / counts for user input and model output. */
export const LIMITS = Object.freeze({
  cityQuery: 80,
  minCityQuery: 2,
  place: 80,
  notes: 300,
  question: 300,
  answer: 1500,
  apiKey: 100,
  chatHistory: 6,
  planItems: 5,
  itemTitle: 80,
  itemAction: 400,
  itemImpact: 300,
  summary: 600,
  defaultText: 200,
});

/** Allowed ranges and defaults for the household profile. */
export const PROFILE = Object.freeze({
  size: Object.freeze({ min: 1, max: 20, fallback: 4 }),
  commuteKm: Object.freeze({ min: 0, max: 200, fallback: 10 }),
  daysPerWeek: Object.freeze({ min: 0, max: 7, fallback: 5 }),
  windows: Object.freeze(/** @type {const} */ (['open', 'closed', 'sealed'])),
  exercise: Object.freeze(/** @type {const} */ (['morning', 'evening', 'none'])),
  cooking: Object.freeze(/** @type {const} */ (['lpg', 'electric', 'biomass'])),
  defaultCommute: 'two-wheeler',
});

/** Forecast analysis settings. */
export const FORECAST = Object.freeze({
  hours: 24,
  windowHours: 2,
  windows: 2,
  dayStartHour: 6,
  dayEndHour: 21,
  lowWindKmh: 8,
});

/** Health thresholds and exposure assumptions used by the offline planner. */
export const HEALTH = Object.freeze({
  /** AQI above which outdoor exercise should move indoors. */
  severeAqi: 150,
  /** Berkeley Earth rule of thumb: 22 µg/m³ PM2.5 for 24 h ≈ 1 cigarette. */
  pm25PerCigarette: 22,
  /** Typical outdoor hours before following the plan. */
  baselineOutdoorHours: 3,
  /** Outdoor hours recommended on normal / severe days. */
  planOutdoorHours: 2,
  severeOutdoorHours: 1,
  /** Short-trip threshold (km) under which cycling is suggested. */
  cycleMaxKm: 3,
});

/** Constants for carbon-impact calculations. */
export const CARBON = Object.freeze({
  kgPerTreePerYear: 21,
  workingWeeksPerYear: 48,
  defaultDaysPerWeek: 5,
});
