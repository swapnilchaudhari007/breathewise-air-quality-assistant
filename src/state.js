/**
 * Application state shared by the controllers. Kept in memory only: nothing
 * (including the optional API key) is ever written to storage.
 * @module state
 */

/**
 * @typedef {{name:string, lat:number, lon:number}} Place
 * @typedef {{role:'user'|'assistant', content:string}} ChatTurn
 * @typedef {{
 *   place: Place|null,
 *   context: import('./plan.js').PlanContext|null,
 *   plan: import('./plan.js').Plan|null,
 *   chat: ChatTurn[],
 *   busy: boolean,
 * }} AppState
 */

/** @type {AppState} */
export const state = {
  place: null,
  context: null,
  plan: null,
  chat: [],
  busy: false,
};
