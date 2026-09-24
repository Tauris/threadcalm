/**
 * The handful of icons the script's own windows use.
 *
 * Built node by node with createElementNS rather than parsed from markup.
 * Microsoft 365 pages may enforce Trusted Types, under which assigning an SVG
 * string to innerHTML throws; constructing the elements directly is exempt,
 * and costs nothing at this size.
 *
 * Drawn on a 16-unit grid with a 1.5 stroke in currentColor, so every icon
 * takes the colour of the button it sits in and follows the theme for free.
 */

const SVG = 'http://www.w3.org/2000/svg';

/** Each icon as a list of [tag, attributes] pairs, all on one 16x16 grid. */
const ICONS = {
  pause: [
    ['path', { d: 'M6 4v8M10 4v8' }],
  ],
  play: [
    ['path', { d: 'M5.5 3.8v8.4L12 8z', fill: 'currentColor' }],
  ],
  settings: [
    ['path', { d: 'M2.5 5h7M12.5 5h1M2.5 11h1.5M7 11h6.5' }],
    ['circle', { cx: '11', cy: '5', r: '1.6' }],
    ['circle', { cx: '5.5', cy: '11', r: '1.6' }],
  ],
  help: [
    ['circle', { cx: '8', cy: '8', r: '6' }],
    ['path', { d: 'M6.4 6.3a1.7 1.7 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.2' }],
    ['circle', { cx: '8', cy: '11.1', r: '.55', fill: 'currentColor', stroke: 'none' }],
  ],
  close: [
    ['path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' }],
  ],
  copy: [
    ['rect', { x: '5.5', y: '5.5', width: '7.5', height: '7.5', rx: '1.6' }],
    ['path', { d: 'M3 10.5V4.6A1.6 1.6 0 0 1 4.6 3h5.9' }],
  ],
  link: [
    ['path', { d: 'M6.8 9.2l2.4-2.4' }],
    ['path', { d: 'M7.6 4.6l.8-.8a2.6 2.6 0 0 1 3.7 3.7l-.8.8' }],
    ['path', { d: 'M8.4 11.4l-.8.8a2.6 2.6 0 0 1-3.7-3.7l.8-.8' }],
  ],
};

function node(tag, attributes) {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

/**
 * An inline icon, hidden from assistive technology.
 *
 * Every button that carries one also carries an aria-label, so the icon is
 * decoration and must not be read out a second time.
 */
export function icon(name) {
  const svg = node('svg', {
    viewBox: '0 0 16 16',
    width: '16',
    height: '16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'tc-icon',
  });
  for (const [tag, attributes] of ICONS[name] ?? []) svg.append(node(tag, attributes));
  return svg;
}

/**
 * The project mark: three stepped bars on a teal badge.
 *
 * The same geometry as ICON_SVG in src/meta.js, which is what the userscript
 * manager shows. Repeated here rather than parsed from that string for the
 * Trusted Types reason above; if one changes, change both.
 */
export function brandMark() {
  const svg = node('svg', {
    viewBox: '0 0 40 40',
    width: '16',
    height: '16',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'tc-mark',
  });
  svg.append(node('rect', { width: '40', height: '40', rx: '10', fill: '#2f6f68' }));
  const bars = node('g', {
    transform: 'translate(4 4)',
    fill: 'none',
    stroke: '#fff',
    'stroke-width': '2.4',
    'stroke-linecap': 'round',
  });
  for (const d of ['M5 8h22', 'M11 16h16', 'M17 24h10']) bars.append(node('path', { d }));
  svg.append(bars);
  return svg;
}
