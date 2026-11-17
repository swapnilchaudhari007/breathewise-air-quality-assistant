/**
 * DOM rendering helpers. All dynamic text is inserted with textContent /
 * createTextNode — never innerHTML — so AI or API output cannot inject markup.
 * @module ui
 */
import { categorize } from './aqi.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Format an ISO timestamp as a short local hour, e.g. "7 am". */
export const hour = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true });

/**
 * Render an accessible SVG bar chart of hourly AQI plus a screen-reader table.
 * @param {HTMLElement} container
 * @param {{time:string, aqi:number}[]} points
 */
export function renderForecastChart(container, points) {
  container.replaceChildren();
  if (points.length === 0) {
    container.append(el('p', {}, ['Forecast unavailable for this location.']));
    return;
  }
  const width = 720;
  const height = 220;
  const pad = { top: 16, right: 8, bottom: 30, left: 36 };
  const max = Math.max(200, ...points.map((p) => p.aqi));
  const barW = (width - pad.left - pad.right) / points.length;
  const y = (v) => pad.top + (height - pad.top - pad.bottom) * (1 - v / max);

  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'chart-title chart-desc', class: 'chart-svg' });
  const title = svg('title', { id: 'chart-title' });
  title.textContent = 'Hourly AQI forecast for the next 24 hours';
  const desc = svg('desc', { id: 'chart-desc' });
  desc.textContent = `AQI ranges from ${Math.min(...points.map((p) => p.aqi))} to ${Math.max(...points.map((p) => p.aqi))}.`;
  chart.append(title, desc);

  for (const tick of [50, 100, 150, 200].filter((t) => t <= max)) {
    chart.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: y(tick), y2: y(tick), class: 'grid' }));
    const label = svg('text', { x: pad.left - 6, y: y(tick) + 4, 'text-anchor': 'end', class: 'axis' });
    label.textContent = String(tick);
    chart.append(label);
  }
  points.forEach((p, i) => {
    const x = pad.left + i * barW + 2;
    const bar = svg('rect', { x, y: y(p.aqi), width: Math.max(1, barW - 4), height: y(0) - y(p.aqi), rx: 3, fill: categorize(p.aqi).color });
    const tip = svg('title');
    tip.textContent = `${hour(p.time)}: AQI ${p.aqi} (${categorize(p.aqi).label})`;
    bar.append(tip);
    chart.append(bar);
    if (i % 3 === 0) {
      const label = svg('text', { x: x + barW / 2 - 2, y: height - 10, 'text-anchor': 'middle', class: 'axis' });
      label.textContent = hour(p.time);
      chart.append(label);
    }
  });

  const table = el('table', { class: 'visually-hidden' }, [
    el('caption', {}, ['Hourly AQI forecast']),
    el('thead', {}, [el('tr', {}, [el('th', { scope: 'col' }, ['Time']), el('th', { scope: 'col' }, ['AQI'])])]),
    el('tbody', {}, points.map((p) => el('tr', {}, [el('td', {}, [hour(p.time)]), el('td', {}, [`${p.aqi} ${categorize(p.aqi).label}`])]))),
  ]);
  container.append(chart, table);
}

/**
 * Render a list of plan items.
 * @param {HTMLElement} list
 * @param {{title:string, action:string, impact:string}[]} items
 */
export function renderPlanItems(list, items) {
  list.replaceChildren(...items.map((item) => el('li', { class: 'plan-item' }, [
    el('h4', {}, [item.title]),
    el('p', {}, [item.action]),
    el('p', { class: 'impact' }, [el('span', { class: 'impact-label' }, ['Impact: ']), item.impact]),
  ])));
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
  text.split(/\n+/).filter(Boolean).forEach((line) => bubble.append(el('p', {}, [line])));
  log.append(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}
