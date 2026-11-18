/**
 * Location controller: city search with an accessible radio group of matches,
 * and the optional browser Geolocation API.
 * @module location
 */
import { geocodeCity } from './api.js';
import { el } from './ui.js';
import { byId, inputById, setStatus, errorMessage } from './dom.js';
import { state } from './state.js';

/** Geolocation options: 10 s timeout, accept a fix up to 10 minutes old. */
const GEO_OPTIONS = Object.freeze({ timeout: 10_000, maximumAge: 600_000 });

/**
 * Show or clear the city field error and keep aria-invalid in sync.
 * @param {string} message empty string clears the error
 */
export function setCityError(message) {
  const err = byId('city-error');
  err.textContent = message;
  err.hidden = !message;
  inputById('city').setAttribute('aria-invalid', message ? 'true' : 'false');
}

/**
 * Remember the chosen location and confirm it to the user.
 * @param {import('./state.js').Place} place
 */
function selectPlace(place) {
  state.place = place;
  byId('selected-place').textContent = `Selected: ${place.name}`;
  byId('city-results').hidden = true;
  setCityError('');
}

/**
 * Offer several matches as a radio group and move focus to the first one.
 * @param {import('./state.js').Place[]} results
 */
function renderChoices(results) {
  const box = byId('city-results');
  box.replaceChildren(
    ...results.map((place, i) => {
      const id = `place-${i}`;
      const input = el('input', { type: 'radio', name: 'place', id, value: String(i) });
      input.addEventListener('change', () => selectPlace(place));
      return el('label', { for: id, class: 'choice' }, [input, place.name]);
    }),
  );
  box.hidden = false;
  box.querySelector('input')?.focus();
}

/**
 * Geocode the typed city and select it, or offer the matches.
 * @returns {Promise<void>}
 */
export async function searchCity() {
  setCityError('');
  try {
    const results = await geocodeCity(inputById('city').value);
    if (results.length === 0) {
      byId('city-results').replaceChildren();
      setCityError('No matching places found. Try a nearby larger city.');
    } else if (results.length === 1) {
      selectPlace(results[0]);
    } else {
      renderChoices(results);
    }
  } catch (err) {
    setCityError(errorMessage(err));
  }
}

/** Use the browser Geolocation API (with permission) as the location. */
function useMyLocation() {
  if (!('geolocation' in navigator)) {
    setCityError('Location is not available in this browser. Please search instead.');
    return;
  }
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      selectPlace({
        name: 'Your current location',
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      });
      setStatus('Location found. Fill in your household details and generate your plan.');
    },
    () => {
      setStatus('');
      setCityError('Location permission denied. Please search for your city instead.');
    },
    GEO_OPTIONS,
  );
}

/**
 * Ensure a location is selected, searching for the typed city if needed.
 * @returns {Promise<boolean>} true when a place is ready
 */
export async function ensurePlace() {
  const city = inputById('city');
  if (!state.place && city.value.trim()) await searchCity();
  if (state.place) return true;
  if (!byId('city-error').textContent) setCityError('Please search for and select your city first.');
  city.focus();
  return false;
}

/** Wire up the location controls. */
export function initLocation() {
  const city = inputById('city');
  byId('search-btn').addEventListener('click', searchCity);
  byId('locate-btn').addEventListener('click', useMyLocation);
  city.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchCity();
    }
  });
  city.addEventListener('input', () => {
    state.place = null;
    byId('selected-place').textContent = '';
  });
}
