// Minimal KML reader for the shapes site teams actually export (GPS/drone
// survey boundaries, road centerlines, point markers) — no styles, no
// networked resources, no multi-track features. Holes in polygons
// (innerBoundaryIs) are intentionally ignored since land-clearing boundary
// KML never has them in practice.

function coordsFromElement(el) {
  const text = el.textContent.trim();
  if (!text) return [];
  return text.split(/\s+/).map((pair) => {
    const [lng, lat] = pair.split(',').map(Number);
    return [lat, lng];
  }).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

// Returns [{ type: 'Point'|'LineString'|'Polygon', coords: [[lat,lng], ...] }]
export function parseKml(kmlText) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(kmlText, 'text/xml');
  } catch {
    return [];
  }
  if (doc.querySelector('parsererror')) return [];

  const geometries = [];

  [...doc.getElementsByTagName('Placemark')].forEach((pm) => {
    [...pm.getElementsByTagName('Point')].forEach((geom) => {
      const coordsEl = geom.getElementsByTagName('coordinates')[0];
      if (coordsEl) geometries.push({ type: 'Point', coords: coordsFromElement(coordsEl) });
    });
    [...pm.getElementsByTagName('LineString')].forEach((geom) => {
      const coordsEl = geom.getElementsByTagName('coordinates')[0];
      if (coordsEl) geometries.push({ type: 'LineString', coords: coordsFromElement(coordsEl) });
    });
    [...pm.getElementsByTagName('Polygon')].forEach((geom) => {
      const outer = geom.getElementsByTagName('outerBoundaryIs')[0] || geom;
      const coordsEl = outer.getElementsByTagName('coordinates')[0];
      if (coordsEl) geometries.push({ type: 'Polygon', coords: coordsFromElement(coordsEl) });
    });
  });

  return geometries.filter((g) => g.coords.length);
}

export function isKmlAttachment(attachment) {
  return /\.kml$/i.test(attachment.name || '') || attachment.dataUrl.includes('vnd.google-earth.kml');
}

export function decodeAttachmentText(attachment) {
  const base64 = attachment.dataUrl.slice(attachment.dataUrl.indexOf(',') + 1);
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return atob(base64);
  }
}
