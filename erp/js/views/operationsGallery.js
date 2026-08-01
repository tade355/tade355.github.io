import { store } from '../store.js';
import { formatDate, el, dateInRange } from '../utils.js';
import { openCustomModal } from '../ui.js';
import { filterByProject } from '../session.js';

function isImageAttachment(att) {
  return att.dataUrl.startsWith('data:image');
}

function siteOptions(rows) {
  return [...new Set(rows.map((r) => r.siteName).filter(Boolean))].sort();
}

function openLightbox(photos, startIndex) {
  openCustomModal({
    title: 'Photo',
    wide: true,
    build: (bodyContainer) => {
      function renderAt(i) {
        bodyContainer.innerHTML = '';
        const { att, report } = photos[i];
        const img = el('img', { src: att.dataUrl, class: 'lightbox-image' });
        const caption = el('div', { class: 'lightbox-caption' }, [
          el('strong', {}, report.siteName || 'Unspecified site'),
          el('span', {}, ` — ${report.operationType} — ${formatDate(report.date)}`),
        ]);
        const nav = el('div', { class: 'lightbox-nav' }, [
          el('button', { type: 'button', class: 'btn btn-ghost', onClick: () => renderAt((i - 1 + photos.length) % photos.length) }, '‹ Prev'),
          el('span', {}, `${i + 1} / ${photos.length}`),
          el('button', { type: 'button', class: 'btn btn-ghost', onClick: () => renderAt((i + 1) % photos.length) }, 'Next ›'),
        ]);
        bodyContainer.appendChild(img);
        bodyContainer.appendChild(caption);
        bodyContainer.appendChild(nav);
      }
      renderAt(startIndex);
    },
  });
}

export function renderOperationsGallery(container) {
  container.innerHTML = '';

  const baseRows = filterByProject(store.get('operations'), 'siteName');

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
  container.appendChild(filterBar);

  const grid = el('div', { class: 'photo-grid' });
  container.appendChild(grid);

  function collectPhotos() {
    const site = siteSelect.value;
    const from = fromInput.value;
    const to = toInput.value;
    const photos = [];
    baseRows
      .filter((r) => (!site || r.siteName === site) && dateInRange(r.date, from, to))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((r) => {
        (r.attachments || []).filter(isImageAttachment).forEach((att) => photos.push({ att, report: r }));
      });
    return photos;
  }

  function refresh() {
    const photos = collectPhotos();
    grid.innerHTML = '';
    if (!photos.length) {
      grid.appendChild(el('p', { class: 'table-empty' }, 'No photos uploaded for these filters yet.'));
      return;
    }
    photos.forEach((p, i) => {
      const thumb = el('img', {
        src: p.att.dataUrl,
        class: 'photo-thumb',
        title: `${p.report.siteName || 'Unspecified site'} — ${formatDate(p.report.date)}`,
      });
      thumb.addEventListener('click', () => openLightbox(photos, i));
      grid.appendChild(thumb);
    });
  }

  [siteSelect, fromInput, toInput].forEach((input) => input.addEventListener('change', refresh));
  refresh();
}
