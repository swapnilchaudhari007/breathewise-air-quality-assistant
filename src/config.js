/**
 * Central configuration: every tunable limit, timeout and domain constant
 * lives here so behaviour is easy to audit and adjust in one place.
 * @module config
 */

/** Locale used for all user-facing time formatting. */
export const LOCALE = 'en-IN';

/** Network behaviour. */
export const NETWORK = Object.freeze({
  requestTimeoutMs: 15_000,
  aiTimeoutMs: 45_000,
  cacheTtlMs: 10 * 60 * 1000,
  cacheMaxEntries: 50,
  geocodeResults: 5,
  forecastDays: 2,
});

/** Maximum lengths / counts for user input and model output. */
export const LIMITS = Object.freeze({
  cityQuery: 80,
  place: 80,
  notes: 300,
  question: 300,
  answer: 1500,
  apiKey: 100,
  chatHistory: 6,
  planItems: 5,
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

/** Constants for carbon-impact calculations. */
export const CARBON = Object.freeze({
  kgPerTreePerYear: 21,
  workingWeeksPerYear: 48,
});

/** Milliseconds in one hour. */
export const HOUR_MS = 3_600_000;
