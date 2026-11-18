/**
 * Typed DOM lookups and shared page-level helpers. Keeping these in one place
 * gives the controllers precise element types and a single failure point when
 * the markup and the scripts drift apart.
 * @module dom
 */

/**
 * Look up an element by id, failing loudly if the markup is missing it.
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new () => T} [type] expected element constructor
 * @returns {T}
 */
export function byId(id, type) {
  const node = document.getElementById(id);
  if (!node || (type && !(node instanceof type))) {
    throw new Error(`Missing #${id}${type ? ` (${type.name})` : ''} element`);
  }
  return /** @type {T} */ (node);
}

/**
 * @param {string} id
 * @returns {HTMLInputElement}
 */
export const inputById = (id) => byId(id, HTMLInputElement);

/**
 * @param {string} id
 * @returns {HTMLSelectElement}
 */
export const selectById = (id) => byId(id, HTMLSelectElement);

/**
 * @param {string} id
 * @returns {HTMLFormElement}
 */
export const formById = (id) => byId(id, HTMLFormElement);

/**
 * @param {string} id
 * @returns {HTMLButtonElement}
 */
export const buttonById = (id) => byId(id, HTMLButtonElement);

/**
 * Announce a status message through the aria-live status region.
 * @param {string} message
 * @param {'info'|'success'|'error'} [type]
 */
export function setStatus(message, type = 'info') {
  const box = byId('status');
  box.textContent = message;
  box.dataset.type = type;
}

/**
 * Scroll behaviour that respects the user's reduced-motion preference.
 * @returns {ScrollBehavior}
 */
export function scrollBehavior() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/**
 * Normalise an unknown thrown value into a user-readable message.
 * @param {unknown} err
 * @returns {string}
 */
export function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
