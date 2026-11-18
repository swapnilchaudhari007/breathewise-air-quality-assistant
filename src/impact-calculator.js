/**
 * Impact calculator controller: shows the CO₂ saved by switching commute mode.
 * @module impact-calculator
 */
import { COMMUTE_EMISSIONS, commuteSavings } from './impact.js';
import { el } from './ui.js';
import { byId, formById, inputById, selectById } from './dom.js';

/**
 * Populate a commute-mode select.
 * @param {HTMLSelectElement} select
 * @param {string} value mode to pre-select
 */
function fillModeSelect(select, value) {
  select.replaceChildren(
    ...Object.entries(COMMUTE_EMISSIONS).map(([key, mode]) => el('option', { value: key }, [mode.label])),
  );
  select.value = value;
}

/**
 * Describe a commute saving in plain words.
 * @param {ReturnType<typeof commuteSavings>} saving
 * @returns {string}
 */
export function describeSaving(saving) {
  return saving.weeklyKg > 0
    ? `Switching saves about ${saving.weeklyKg} kg of CO₂ every week: ${saving.yearlyKg} kg a year, ` +
        `the same as ${saving.treesEquivalent} trees absorb. It also means less exhaust on your street.`
    : 'This switch does not reduce emissions. ' +
        'Try a lower-emission option such as metro, bus, cycling or walking.';
}

/** Recalculate and announce the CO₂ saving for the chosen switch. */
export function updateImpact() {
  const saving = commuteSavings(
    selectById('impact-from').value,
    selectById('impact-to').value,
    Number(inputById('impact-km').value),
    Number(inputById('impact-days').value),
  );
  byId('impact-result').textContent = describeSaving(saving);
}

/**
 * Pre-fill the calculator with the household's commute.
 * @param {import('./validate.js').Profile} profile
 */
export function syncImpactDefaults(profile) {
  selectById('impact-from').value = profile.commute.mode;
  inputById('impact-km').value = String(profile.commute.km);
  updateImpact();
}

/** Wire up the calculator form. */
export function initImpactCalculator() {
  fillModeSelect(selectById('impact-from'), 'two-wheeler');
  fillModeSelect(selectById('impact-to'), 'metro');
  const form = formById('impact-form');
  form.addEventListener('input', updateImpact);
  form.addEventListener('submit', (e) => e.preventDefault());
  updateImpact();
}
