# BreatheWise: Urban Air Quality Assistant

> A GenAI assistant that helps families and communities get through severe winter smog. It suggests **low-emission daily routines**, **indoor air quality hacks** and **sustainable alternatives** fitted to the family's **location and lifestyle**, and it **explains the direct impact of each choice in numbers**.

**Live demo:** https://swapnilchaudhari007.github.io/breathewise-air-quality-assistant/
**Challenge:** PromptWars Virtual, Challenge 6: Urban Air Quality Assistant

---

## The problem

In winter, cities like Delhi, Lahore and Mumbai often go past AQI 300. Families know the air is bad, but they don't know **what to do about it today**: when it's safe to step out, how to protect a child with asthma, whether a purifier is worth it, or how their own commute adds to the smog. Most AQI apps stop at a number.

## What BreatheWise does

| Step | Feature | How |
|---|---|---|
| 1 | **Location-aware** | Search any city (any script, e.g. ठाणे) or use GPS |
| 2 | **Live air right now** | US AQI, PM2.5, PM10, NO₂, O₃, wind and temperature from Open-Meteo (Copernicus CAMS) |
| 3 | **"Cigarette equivalent"** | Converts PM2.5 into cigarettes per day (Berkeley Earth rule: 22 µg/m³ ≈ 1 cigarette) so the risk is easy to grasp |
| 4 | **24-hour forecast + best time outdoors** | Accessible SVG chart; an algorithm picks the cleanest non-overlapping daytime windows |
| 5 | **GenAI personalised plan** | An LLM produces three sections (low-emission routine, indoor air hacks, sustainable swaps). Every item includes a quantified **impact** |
| 6 | **Impact calculator** | Weekly and yearly CO₂ saved by switching commute mode, with a tree equivalent |
| 7 | **Follow-up chat** | Ask anything ("Can my kids play outside at 5 pm?"). Answers are grounded in your live data and household |
| 8 | **Never fails** | If the AI is unreachable, a deterministic expert-rules engine still produces a complete, quantified plan |

## Generative AI usage

| Where | Model | Purpose |
|---|---|---|
| `src/plan.js` → `buildPlanMessages` | **Google Gemini 2.5 Flash** (with your own API key) or a free OpenAI-compatible LLM via Pollinations (no key) | Builds a grounded prompt from live AQI, the forecast, cleanest windows, weather and the household profile. Asks for **structured JSON** (`responseMimeType: application/json` / `response_format: json_object`) |
| `src/plan.js` → `parsePlan` | — | Strictly validates and sanitises the model output: schema check, length caps, item limits |
| `src/plan.js` → `buildChatMessages` | Same models | Context-grounded follow-up Q&A with short history |
| Development | Claude, Gemini | Used to design, write, test and document the code |

## Architecture

```
index.html ── src/app.js               entry point: plan flow + controller wiring
               ├── src/location.js         city search (radio group) + geolocation
               ├── src/impact-calculator.js commute CO₂ calculator controller
               ├── src/chat.js             grounded follow-up chat controller
               ├── src/api.js              Open-Meteo + GenAI clients, timeouts, TTL cache
               ├── src/plan.js             prompt builders + strict JSON parser/validator
               ├── src/offline-plan.js     deterministic rules engine (AI fallback)
               ├── src/aqi.js              EPA AQI categories, PM2.5→AQI, best windows
               ├── src/impact.js           CO₂ savings, indoor PM2.5, exposure-dose model
               ├── src/validate.js         input sanitisation & whitelisting
               ├── src/format.js           pure formatters (hours, units)
               ├── src/ui.js               safe DOM rendering (textContent only), SVG chart
               ├── src/dom.js              typed element lookups + status region
               ├── src/state.js            typed in-memory app state
               └── src/config.js           every limit, threshold and constant (frozen)
```

There's no framework and no build step: vanilla ES modules, zero runtime dependencies (dev tools only), and the repo is well under 1 MB.

## Evaluation criteria: how they're covered

### Code quality
- **Single-responsibility modules** (15): network, prompt/parsing, offline rules, domain maths, validation, formatting, rendering, typed DOM access, state, and one small controller per feature. Pure logic has no DOM access.
- **Statically type-checked**: `tsc --checkJs` with `strictNullChecks`, `noUnusedLocals` and `noUnusedParameters` passes with **zero errors**. Shared shapes (`Plan`, `PlanContext`, `Profile`, `AirReading`, `ChatTurn`…) are JSDoc `@typedef`s, and DOM lookups are typed (`inputById`, `selectById`, `formById`).
- **Lint-clean** with `@eslint/js` recommended + `eslint-plugin-jsdoc` (JSDoc with `@param`/`@returns` required on every function), complexity ≤ 10, max depth 3, ≤ 4 params, ≤ 50 lines per function, ≤ 300 lines per file.
- **Consistently formatted** with Prettier (`npm run format:check`) and `.editorconfig`.
- **No magic numbers**: limits, health thresholds, AI settings, profile ranges and carbon constants all live in a frozen `src/config.js`.
- One command runs every gate: `npm run check` (lint → format → typecheck → tests), and CI runs the same steps on every push.

### Security
- **Strict Content-Security-Policy**: `script-src 'self'`, no inline scripts or styles, `connect-src` limited to the 5 required APIs, `object-src 'none'`, `base-uri 'none'`.
- **No `innerHTML` anywhere.** All API and AI text is rendered with `textContent`, so XSS through model output isn't possible.
- **Prompt-injection guard**: user free text is sanitised, angle brackets are stripped, the text is fenced in `<notes>` / `<question>` tags, and the system prompt marks it as data.
- **Input validation**: city names use a Unicode letter regex, coordinates are range-checked, and every enum is whitelisted, so the profile can't carry unexpected keys.
- **API keys**: the optional Gemini key stays in memory only (never stored) and is sent in the `x-goog-api-key` header, not the URL.
- `referrerPolicy: no-referrer` and request timeouts via `AbortController`.

### Efficiency
- A TTL cache (10 min) removes repeated geocoding and AQI calls; the air and weather requests run in parallel (`Promise.all`).
- Zero dependencies, no bundle and native ES modules, so it loads in a fraction of a second.
- The chat sends only the last 6 turns to keep prompts small.

### Testing
- **51 tests** using Node's built-in `node:test`: unit tests for every pure module plus **DOM integration tests** that load the real `index.html` into happy-dom and drive the full user flows (search, pick a city, generate a plan, impact calculator, chat, chips, geolocation, AI-down fallback). Line coverage is about **99.2%** and function coverage about **98.8%** across all 15 modules.
- They cover AQI breakpoints, forecast windows, impact maths, validation and injection cases, prompt building, JSON parsing of malformed or hostile output, the offline planner, and API clients with mocked `fetch`, including timeouts and HTTP errors.
- GitHub Actions CI runs lint, formatting, type-check and tests on every push.

```bash
npm install             # dev tools only (ESLint, Prettier, TypeScript, happy-dom)
npm test                # run tests
npm run test:coverage   # with coverage
npm run lint            # ESLint + JSDoc rules
npm run typecheck       # tsc --checkJs
npm run check           # every quality gate
npm start               # serve locally on :8080
```

### Accessibility (WCAG 2.1 AA)
- Semantic landmarks, a skip link, a labelled form, `fieldset`/`legend` groups and `aria-describedby` hints and errors.
- `aria-live` status, results and chat; `aria-busy` while the plan is generating.
- The chart is an `role="img"` SVG with a title and description, **plus a hidden data table** for screen readers.
- AA-contrast AQI colours, visible `:focus-visible` rings, 44 px touch targets, `prefers-reduced-motion` support, and fully keyboard-operable controls.

### Problem statement alignment
| Requirement | Implementation |
|---|---|
| Families & communities | Household profile (children, elderly, asthma, pets, size); community tips (report burning, plant greenery) |
| Severe winter smog | Live AQI, forecast peaks, low-wind smog warning |
| Low-emission daily routines | Routine timed to the cleanest forecast windows; commute swaps |
| Indoor air quality hacks | Window strategy, DIY box-fan purifier, cooking smoke, wet cleaning |
| Sustainable alternatives | Transit or cycle swaps, no waste burning, efficient heating, greenery |
| Tailored to location & lifestyle | City/GPS, commute, exercise, windows, purifier, cooking fuel, free-text notes |
| Clearly explaining direct impact | Every item has an "Impact" line; exposure-reduction %, indoor PM2.5 estimate, CO₂ kg, cigarette equivalent |

## Run locally
```bash
git clone https://github.com/Swapnilchaudhari007/breathewise-air-quality-assistant.git
cd breathewise-air-quality-assistant
npm start   # or any static server, then open http://localhost:8080
```

## Data & disclaimer
Air quality data comes from [Open-Meteo](https://open-meteo.com/) (CAMS). Emission factors are approximate Indian averages. BreatheWise gives general guidance, **not medical advice**.

## License
MIT © 2026 Swapnil Dinkar Chaudhari
