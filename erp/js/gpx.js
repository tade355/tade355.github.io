// Minimal GPX reader for GPS track logs (BackCountry Navigator and similar
// field-tracker apps) — each <trk>/<trkseg> becomes one LineString geometry
// and each <wpt> a Point, in the same { type, coords: [[lat,lng], ...] }
// shape kml.js's parseKml() returns, so callers can treat KML and GPX track
// files identically once parsed.
export function parseGpx(gpxText) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(gpxText, 'text/xml');
  } catch {
    return [];
  }
  if (doc.querySelector('parsererror')) return [];

  const geometries = [];

  [...doc.getElementsByTagName('trkseg')].forEach((seg) => {
    const coords = [...seg.getElementsByTagName('trkpt')]
      .map((pt) => [Number(pt.getAttribute('lat')), Number(pt.getAttribute('lon'))])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (coords.length) geometries.push({ type: 'LineString', coords });
  });

  [...doc.getElementsByTagName('wpt')].forEach((pt) => {
    const lat = Number(pt.getAttribute('lat'));
    const lng = Number(pt.getAttribute('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) geometries.push({ type: 'Point', coords: [[lat, lng]] });
  });

  return geometries;
}

export function isGpxAttachment(attachment) {
  return /\.gpx$/i.test(attachment.name || '') || attachment.dataUrl.includes('gpx+xml');
}
