/**
 * Follow-up chat controller: questions are answered by the model, grounded in
 * the same live air and household context as the plan.
 * @module chat
 */
import { askModel } from './api.js';
import { buildChatMessages } from './plan.js';
import { sanitizeText } from './validate.js';
import { addChatMessage } from './ui.js';
import { byId, formById, inputById, setStatus } from './dom.js';
import { state } from './state.js';
import { LIMITS } from './config.js';

const FALLBACK_ANSWER = 'Sorry, I could not answer that. Please try rephrasing.';
const OFFLINE_ANSWER =
  'The AI service is unreachable right now. Your plan above still applies. Please try again shortly.';

/**
 * Read the optional Gemini key (kept in memory only, never persisted).
 * @returns {string|undefined}
 */
export function readGeminiKey() {
  return sanitizeText(inputById('geminiKey').value, LIMITS.apiKey) || undefined;
}

/**
 * Strip markdown symbols and cap the length of a model answer.
 * @param {string} text
 * @returns {string}
 */
export function cleanAnswer(text) {
  return sanitizeText(text.replace(/[*#`]/g, ''), LIMITS.answer) || FALLBACK_ANSWER;
}

/** Clear the conversation (called when a new plan is generated). */
export function resetChat() {
  state.chat = [];
  byId('chat-log').replaceChildren();
}

/**
 * Answer a follow-up question grounded in the current plan context.
 * @param {string|undefined} question
 * @returns {Promise<void>}
 */
export async function askFollowUp(question) {
  const q = sanitizeText(question, LIMITS.question);
  if (!q || state.busy) return;
  if (!state.context) {
    setStatus('Generate your plan first so answers can use your local air data.', 'error');
    return;
  }
  const log = byId('chat-log');
  addChatMessage(log, 'user', q);
  inputById('chat-input').value = '';
  const pending = addChatMessage(log, 'assistant', 'Thinking…');
  state.busy = true;
  state.chat.push({ role: 'user', content: q });
  let answer = OFFLINE_ANSWER;
  try {
    const res = await askModel(buildChatMessages(state.context, state.chat), {
      geminiKey: readGeminiKey(),
      json: false,
    });
    answer = cleanAnswer(res.text);
    state.chat.push({ role: 'assistant', content: answer });
  } catch {
    // Network or provider failure: keep the offline answer.
  } finally {
    pending.remove();
    addChatMessage(log, 'assistant', answer);
    state.busy = false;
  }
}

/** Wire up the chat form and suggestion chips. */
export function initChat() {
  formById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    askFollowUp(inputById('chat-input').value);
  });
  document.querySelectorAll('.chip').forEach((chip) => {
    if (chip instanceof HTMLElement) {
      chip.addEventListener('click', () => askFollowUp(chip.dataset.q));
    }
  });
}
