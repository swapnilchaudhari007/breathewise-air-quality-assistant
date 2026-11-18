/**
 * DOM rendering helpers. All dynamic text is inserted with textContent /
 * createTextNode — never innerHTML — so AI or API output cannot inject markup.
 * @module ui
 */
import { categorize } from './aqi.js';
import { formatHour } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Forecast chart geometry (SVG user units) and axis settings. */
const CHART = Object.freeze({
  width: 720,
  height: 220,
  pad: Object.freeze({ top: 16, right: 8, bottom: 30, left: 36 }),
  minScale: 200,
  labelEvery: 3,
  ticks: Object.freeze([50, 100, 150, 200]),
});

/**
 * Create an element with attributes and children.
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {(Node|string)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * Create an SVG element with attributes.
 * @param {string} tag
 * @param {Record<string, string|number>} [attrs]
 * @param {string} [text] optional text content
 * @returns {SVGElement}
 */
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @typedef {{time:string, aqi:number}} ForecastPoint
 * @typedef {{max:number, barW:number, y:(v:number) => number}} ChartScale
 */

/**
 * Compute the vertical scale and bar width for the given points.
 * @param {ForecastPoint[]} points
 * @returns {ChartScale}
 */
function chartScale(points) {
  const { width, height, pad, minScale } = CHART;
  const max = Math.max(minScale, ...points.map((p) => p.aqi));
  return {
    max,
    barW: (width - pad.left - pad.right) / points.length,
    y: (v) => pad.top + (height - pad.top - pad.bottom) * (1 - v / max),
  };
}

/**
 * Horizontal grid lines with AQI labels.
 * @param {ChartScale} scale
 * @returns {SVGElement[]}
 */
function chartGrid({ max, y }) {
  const { width, pad } = CHART;
  return CHART.ticks
    .filter((t) => t <= max)
    .flatMap((tick) => [
      svg('line', { x1: pad.left, x2: width - pad.right, y1: y(tick), y2: y(tick), class: 'grid' }),
      svg('text', { x: pad.left - 6, y: y(tick) + 4, 'text-anchor': 'end', class: 'axis' }, String(tick)),
    ]);
}

/**
 * One coloured bar per hour, with a tooltip and periodic hour labels.
 * @param {ForecastPoint[]} points
 * @param {ChartScale} scale
 * @returns {SVGElement[]}
 */
function chartBars(points, { barW, y }) {
  const { height, pad, labelEvery } = CHART;
  return points.flatMap((p, i) => {
    const x = pad.left + i * barW + 2;
    const cat = categorize(p.aqi);
    const bar = svg('rect', {
      x,
      y: y(p.aqi),
      width: Math.max(1, barW - 4),
      height: y(0) - y(p.aqi),
      rx: 3,
      fill: cat.color,
    });
    bar.append(svg('title', {}, `${formatHour(p.time)}: AQI ${p.aqi} (${cat.label})`));
    if (i % labelEvery !== 0) return [bar];
    const label = svg(
      'text',
      { x: x + barW / 2 - 2, y: height - 10, 'text-anchor': 'middle', class: 'axis' },
      formatHour(p.time),
    );
    return [bar, label];
  });
}

/**
 * Visually hidden data table mirroring the chart for screen readers.
 * @param {ForecastPoint[]} points
 * @returns {HTMLElement}
 */
function chartTable(points) {
  const header = el('tr', {}, [el('th', { scope: 'col' }, ['Time']), el('th', { scope: 'col' }, ['AQI'])]);
  const rows = points.map((p) =>
    el('tr', {}, [el('td', {}, [formatHour(p.time)]), el('td', {}, [`${p.aqi} ${categorize(p.aqi).label}`])]),
  );
  return el('table', { class: 'visually-hidden' }, [
    el('caption', {}, ['Hourly AQI forecast']),
    el('thead', {}, [header]),
    el('tbody', {}, rows),
  ]);
}

/**
 * Render an accessible SVG bar chart of hourly AQI plus a screen-reader table.
 * @param {HTMLElement} container
 * @param {ForecastPoint[]} points
 */
export function renderForecastChart(container, points) {
  if (points.length === 0) {
    container.replaceChildren(el('p', {}, ['Forecast unavailable for this location.']));
    return;
  }
  const aqis = points.map((p) => p.aqi);
  const scale = chartScale(points);
  const chart = svg('svg', {
    viewBox: `0 0 ${CHART.width} ${CHART.height}`,
    role: 'img',
    'aria-labelledby': 'chart-title chart-desc',
    class: 'chart-svg',
  });
  chart.append(
    svg('title', { id: 'chart-title' }, 'Hourly AQI forecast for the next 24 hours'),
    svg('desc', { id: 'chart-desc' }, `AQI ranges from ${Math.min(...aqis)} to ${Math.max(...aqis)}.`),
    ...chartGrid(scale),
    ...chartBars(points, scale),
  );
  container.replaceChildren(chart, chartTable(points));
}

/**
 * Render a list of plan items.
 * @param {HTMLElement} list
 * @param {import('./plan.js').PlanItem[]} items
 */
export function renderPlanItems(list, items) {
  list.replaceChildren(
    ...items.map((item) =>
      el('li', { class: 'plan-item' }, [
        el('h4', {}, [item.title]),
        el('p', {}, [item.action]),
        el('p', { class: 'impact' }, [el('span', { class: 'impact-label' }, ['Impact: ']), item.impact]),
      ]),
    ),
  );
}

/**
 * Append a chat bubble.
 * @param {HTMLElement} log
 * @param {'user'|'assistant'} role
 * @param {string} text
 * @returns {HTMLElement}
 */
export function addChatMessage(log, role, text) {
  const bubble = el('div', { class: `bubble ${role}` }, [
    el('span', { class: 'visually-hidden' }, [role === 'user' ? 'You said: ' : 'BreatheWise says: ']),
  ]);
  text
    .split(/\n+/)
    .filter(Boolean)
    .forEach((line) => bubble.append(el('p', {}, [line])));
  log.append(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}
