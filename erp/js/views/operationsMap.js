import { store } from '../store.js';
import { formatDate, el } from '../utils.js';
import { colorForOperationType, unitForOperationType } from '../constants.js';
import { filterByProject } from '../session.js';
import { loadLeaflet } from '../maplib.js';
import { parseKml, isKmlAttachment, decodeAttachmentText } from '../kml.js';

function siteOptions(rows) {
  return [...new Set(rows.map((r) => r.siteName).filter(Boolean))].sort();
}

export function renderOperationsMap(container) {
  container.innerHTML = '';

  const baseRows = filterByProject(store.get('operations'), 'siteName');

  const filterBar = el('div', { class: 'filter-bar' });
  const siteSelect = el('select', {}, [
    el('option', { value: '' }, 'All Sites'),
    ...siteOptions(baseRows).map((s) => el('option', { value: s }, s)),
  ]);
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Site'), siteSelect]));
  container.appendChild(filterBar);

  const mapShell = el('div', { class: 'map-shell' });
  const legend = el('div', { class: 'map-legend' });
  const mapEl = el('div', { class: 'map-canvas' });
  mapShell.appendChild(legend);
  mapShell.appendChild(mapEl);
  container.appendChild(mapShell);

  const status = el('p', { class: 'table-empty' }, 'Loading map…');
  legend.appendChild(status);

  let leaflet;
  let map;
  let layerGroups = {};

  function draw() {
    Object.values(layerGroups).forEach((lg) => lg.remove());
    layerGroups = {};

    const site = siteSelect.value;
    const rows = baseRows.filter((r) => !site || r.siteName === site);

    const bounds = [];
    const typesPresent = new Set();

    rows.forEach((r) => {
      const kmlAttachments = (r.attachments || []).filter(isKmlAttachment);
      kmlAttachments.forEach((att) => {
        let geometries;
        try {
          geometries = parseKml(decodeAttachmentText(att));
        } catch {
          return;
        }
        if (!geometries.length) return;

        typesPresent.add(r.operationType);
        const color = colorForOperationType(r.operationType);
        const group = layerGroups[r.operationType] || leaflet.layerGroup();
        layerGroups[r.operationType] = group;

        const popupHtml = `<strong>${r.operationType}</strong><br>${r.siteName} — ${formatDate(r.date)}<br>${r.quantity} ${unitForOperationType(r.operationType)}`;

        geometries.forEach((g) => {
          let layer;
          if (g.type === 'Polygon') layer = leaflet.polygon(g.coords, { color, fillColor: color, fillOpacity: 0.35, weight: 2 });
          else if (g.type === 'LineString') layer = leaflet.polyline(g.coords, { color, weight: 4 });
          else layer = leaflet.circleMarker(g.coords[0], { color, radius: 6, fillOpacity: 0.9 });
          layer.bindPopup(popupHtml);
          layer.addTo(group);
          g.coords.forEach((c) => bounds.push(c));
        });
        group.addTo(map);
      });
    });

    legend.innerHTML = '';
    if (!typesPresent.size) {
      legend.appendChild(el('p', { class: 'table-empty' }, 'No KML boundaries uploaded for these filters yet.'));
    } else {
      [...typesPresent].sort().forEach((type) => {
        const checkbox = el('input', { type: 'checkbox' });
        checkbox.checked = true;
        checkbox.addEventListener('change', () => {
          const group = layerGroups[type];
          if (!group) return;
          if (checkbox.checked) group.addTo(map);
          else group.remove();
        });
        const swatch = el('span', { class: 'legend-swatch', style: `background:${colorForOperationType(type)}` });
        legend.appendChild(el('label', { class: 'legend-item' }, [checkbox, swatch, el('span', {}, type)]));
      });
    }

    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
  }

  loadLeaflet().then((L) => {
    leaflet = L;
    status.remove();
    map = L.map(mapEl).setView([9.082, 8.6753], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    draw();
  }).catch((err) => {
    status.textContent = err.message;
  });

  siteSelect.addEventListener('change', () => { if (map) draw(); });
}
