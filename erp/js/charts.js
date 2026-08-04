const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function makeTooltip(root) {
  const tip = document.createElement('div');
  tip.className = 'chart-tooltip';
  tip.style.display = 'none';
  root.appendChild(tip);
  return tip;
}

function showTooltip(tip, root, evt, html) {
  tip.innerHTML = html;
  tip.style.display = 'block';
  const rootRect = root.getBoundingClientRect();
  let x = evt.clientX - rootRect.left + 12;
  let y = evt.clientY - rootRect.top - 12;
  const tipRect = tip.getBoundingClientRect();
  if (x + tipRect.width > rootRect.width) x = evt.clientX - rootRect.left - tipRect.width - 12;
  tip.style.left = x + 'px';
  tip.style.top = Math.max(0, y) + 'px';
}

function hideTooltip(tip) {
  tip.style.display = 'none';
}

/**
 * Vertical bar chart. `bars`: [{ label, value, colorVar? }]
 * If colorVar omitted on every bar, all bars use `defaultColor` (sequential/single-series).
 * If any bar has colorVar set, colors follow the fixed categorical order supplied.
 */
export function renderBarChart(container, { title, subtitle, bars, formatValue = (v) => v, defaultColor = 'var(--series-1)', height = 220 }) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'chart-card';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'chart-title';
    h.textContent = title;
    wrap.appendChild(h);
  }
  if (subtitle) {
    const s = document.createElement('p');
    s.className = 'chart-subtitle';
    s.textContent = subtitle;
    wrap.appendChild(s);
  }

  const root = document.createElement('div');
  root.className = 'chart-root';
  wrap.appendChild(root);
  container.appendChild(wrap);

  if (!bars.length) {
    root.innerHTML = '<p class="chart-empty">No data yet.</p>';
    return;
  }

  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const padTop = 24, padBottom = 32, padLeft = 8, padRight = 8;
  const width = 560;
  const plotH = height - padTop - padBottom;
  const gap = 14;
  const barW = (width - padLeft - padRight - gap * (bars.length - 1)) / bars.length;

  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': title || 'bar chart' });

  // gridlines (4 bands)
  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (plotH / 4) * i;
    chart.appendChild(svg('line', { x1: padLeft, x2: width - padRight, y1: y, y2: y, class: 'chart-grid' }));
  }

  const tip = makeTooltip(wrap);

  bars.forEach((b, i) => {
    const x = padLeft + i * (barW + gap);
    const h = Math.max(2, (b.value / maxVal) * plotH);
    const y = padTop + plotH - h;
    const color = b.colorVar || defaultColor;

    const rect = svg('rect', {
      x, y, width: barW, height: h, rx: 4, fill: color, class: 'chart-bar',
    });
    rect.addEventListener('mousemove', (evt) => showTooltip(tip, wrap, evt, `<strong>${b.label}</strong><br>${formatValue(b.value)}`));
    rect.addEventListener('mouseleave', () => hideTooltip(tip));
    chart.appendChild(rect);

    if (bars.length <= 8) {
      const label = svg('text', {
        x: x + barW / 2, y: height - 10, class: 'chart-axis-label', 'text-anchor': 'middle',
      });
      label.textContent = b.label;
      chart.appendChild(label);
    }
  });

  root.appendChild(chart);
}

/**
 * Line/area trend chart. `points`: [{ label, value }]
 */
export function renderLineChart(container, { title, subtitle, points, formatValue = (v) => v, color = 'var(--series-1)', height = 220 }) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'chart-card';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'chart-title';
    h.textContent = title;
    wrap.appendChild(h);
  }
  if (subtitle) {
    const s = document.createElement('p');
    s.className = 'chart-subtitle';
    s.textContent = subtitle;
    wrap.appendChild(s);
  }

  const root = document.createElement('div');
  root.className = 'chart-root';
  wrap.appendChild(root);
  container.appendChild(wrap);

  if (!points.length) {
    root.innerHTML = '<p class="chart-empty">No data yet.</p>';
    return;
  }

  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const padTop = 24, padBottom = 32, padLeft = 16, padRight = 16;
  const width = 560;
  const plotH = height - padTop - padBottom;
  const plotW = width - padLeft - padRight;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padLeft + step * i,
    y: padTop + plotH - (p.value / maxVal) * plotH,
    ...p,
  }));

  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': title || 'line chart' });

  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (plotH / 4) * i;
    chart.appendChild(svg('line', { x1: padLeft, x2: width - padRight, y1: y, y2: y, class: 'chart-grid' }));
  }

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${padTop + plotH} L${coords[0].x},${padTop + plotH} Z`;

  chart.appendChild(svg('path', { d: areaPath, class: 'chart-area', fill: color, opacity: 0.12 }));
  chart.appendChild(svg('path', { d: linePath, class: 'chart-line', fill: 'none', stroke: color }));

  const tip = makeTooltip(wrap);

  coords.forEach((c) => {
    const dot = svg('circle', { cx: c.x, cy: c.y, r: 5, fill: color, class: 'chart-dot' });
    dot.addEventListener('mousemove', (evt) => showTooltip(tip, wrap, evt, `<strong>${c.label}</strong><br>${formatValue(c.value)}`));
    dot.addEventListener('mouseleave', () => hideTooltip(tip));
    chart.appendChild(dot);

    const label = svg('text', { x: c.x, y: height - 10, class: 'chart-axis-label', 'text-anchor': 'middle' });
    label.textContent = c.label;
    chart.appendChild(label);
  });

  root.appendChild(chart);
}

/**
 * Multi-series line/trend chart on one shared y-axis. `categories`: x-axis
 * labels. `series`: [{ name, colorVar, values }], values aligned to
 * categories by index. Always show a legend (2+ series) — color is the only
 * thing distinguishing lines here, so it can never be optional.
 */
export function renderMultiLineChart(container, { title, subtitle, categories, series, formatValue = (v) => v, height = 220 }) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'chart-card';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'chart-title';
    h.textContent = title;
    wrap.appendChild(h);
  }
  if (subtitle) {
    const s = document.createElement('p');
    s.className = 'chart-subtitle';
    s.textContent = subtitle;
    wrap.appendChild(s);
  }

  if (series.length > 1) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    series.forEach((s) => {
      const item = document.createElement('span');
      item.className = 'chart-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'chart-legend-swatch';
      swatch.style.background = s.colorVar;
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(s.name));
      legend.appendChild(item);
    });
    wrap.appendChild(legend);
  }

  const root = document.createElement('div');
  root.className = 'chart-root';
  wrap.appendChild(root);
  container.appendChild(wrap);

  const allValues = series.flatMap((s) => s.values);
  if (!categories.length || !allValues.length) {
    root.innerHTML = '<p class="chart-empty">No data yet.</p>';
    return;
  }

  const maxVal = Math.max(...allValues, 1);
  const padTop = 24, padBottom = 32, padLeft = 16, padRight = 16;
  const width = 560;
  const plotH = height - padTop - padBottom;
  const plotW = width - padLeft - padRight;
  const step = categories.length > 1 ? plotW / (categories.length - 1) : 0;

  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': title || 'line chart' });

  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (plotH / 4) * i;
    chart.appendChild(svg('line', { x1: padLeft, x2: width - padRight, y1: y, y2: y, class: 'chart-grid' }));
  }

  const tip = makeTooltip(wrap);

  series.forEach((s) => {
    const coords = s.values.map((v, i) => ({
      x: padLeft + step * i,
      y: padTop + plotH - (v / maxVal) * plotH,
      value: v,
      label: categories[i],
    }));
    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
    chart.appendChild(svg('path', { d: linePath, class: 'chart-line', fill: 'none', stroke: s.colorVar }));
    coords.forEach((c) => {
      const dot = svg('circle', { cx: c.x, cy: c.y, r: 4, fill: s.colorVar, class: 'chart-dot' });
      dot.addEventListener('mousemove', (evt) => showTooltip(tip, wrap, evt, `<strong>${s.name} — ${c.label}</strong><br>${formatValue(c.value)}`));
      dot.addEventListener('mouseleave', () => hideTooltip(tip));
      chart.appendChild(dot);
    });
  });

  categories.forEach((label, i) => {
    const x = padLeft + step * i;
    const text = svg('text', { x, y: height - 10, class: 'chart-axis-label', 'text-anchor': 'middle' });
    text.textContent = label;
    chart.appendChild(text);
  });

  root.appendChild(chart);
}

export const CATEGORICAL_COLORS = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
];
