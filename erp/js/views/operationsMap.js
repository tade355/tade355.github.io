import { store } from '../store.js';
import { formatDate, el, dateInRange } from '../utils.js';
import { colorForOperationType, unitForOperationType } from '../constants.js';
import { filterByProject } from '../session.js';
import { loadLeaflet } from '../maplib.js';
import { parseKml, isKmlAttachment, decodeAttachmentText } from '../kml.js';
import { printOperationsMap } from '../print.js';

function siteOptions(rows) {
  return [...new Set(rows.map((r) => r.siteName).filter(Boolean))].sort();
}

// One legend/print entry per operations record that carries at least one
// KML boundary — same attribution the on-screen tooltip already uses (every
// geometry in a record's KML is credited to that record's date/operator/
// equipment, even if the file itself covers more than one dozer), so the
// printed key never disagrees with what the map on screen is showing.
function geoEntriesFor(rows, employees) {
  return rows
    .map((r) => {
      const geometries = (r.attachments || [])
        .filter(isKmlAttachment)
        .flatMap((att) => {
          try {
            return parseKml(decodeAttachmentText(att));
          } catch {
            return [];
          }
        });
      if (!geometries.length) return null;
      return {
        date: r.date,
        operatorName: employees.find((e) => e.id === r.operatorId)?.name || 'Unknown',
        equipment: r.equipment,
        operationType: r.operationType,
        quantity: r.quantity,
        unit: unitForOperationType(r.operationType),
        geometries,
      };
    })
    .filter(Boolean);
}

export function renderOperationsMap(container) {
  container.innerHTML = '';

  const baseRows = filterByProject(store.get('operations'), 'siteName');
  const employees = store.get('employees');

  const filterBar = el('div', { class: 'filter-bar' });
  const siteSelect = el('select', {}, [
    el('option', { value: '' }, 'All Sites'),
    ...siteOptions(baseRows).map((s) => el('option', { value: s }, s)),
  ]);
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Site'), siteSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  const printBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '🖨 Print Map (PDF)');
  filterBar.appendChild(printBtn);
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

  function filteredRows() {
    const site = siteSelect.value;
    return baseRows.filter((r) => (!site || r.siteName === site) && dateInRange(r.date, fromInput.value, toInput.value));
  }

  function draw() {
    Object.values(layerGroups).forEach((lg) => lg.remove());
    layerGroups = {};

    const rows = filteredRows();

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

        const tooltipHtml = `<strong>${r.operationType}</strong> — ${r.siteName}<br>`
          + `Size: ${r.quantity} ${unitForOperationType(r.operationType)}<br>`
          + `Dozer: ${r.equipment || 'Unknown'}<br>`
          + `Date: ${formatDate(r.date)}`;

        geometries.forEach((g) => {
          let layer;
          if (g.type === 'Polygon') layer = leaflet.polygon(g.coords, { color, fillColor: color, fillOpacity: 0.35, weight: 2 });
          else if (g.type === 'LineString') layer = leaflet.polyline(g.coords, { color, weight: 4 });
          else layer = leaflet.circleMarker(g.coords[0], { color, radius: 6, fillOpacity: 0.9 });
          layer.bindTooltip(tooltipHtml, { sticky: true, direction: 'top' });
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

  [siteSelect, fromInput, toInput].forEach((input) => input.addEventListener('change', () => { if (map) draw(); }));

  printBtn.addEventListener('click', () => {
    const entries = geoEntriesFor(filteredRows(), employees);
    printOperationsMap(entries, { from: fromInput.value, to: toInput.value, site: siteSelect.value });
  });
}
