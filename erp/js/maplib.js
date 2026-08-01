// Lazy-loads Leaflet from a CDN only when a map is actually opened, so
// pages that never touch the Map View tab pay nothing for it.
const LEAFLET_VERSION = '1.9.4';
let loadPromise = null;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Could not load the map library. Check your internet connection.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
