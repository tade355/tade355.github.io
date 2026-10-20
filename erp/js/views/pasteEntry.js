// Paste Entry: paste a WhatsApp message (an end-of-day report, Oki's diesel
// list, a fund request, the Midejab "Grands Total/Analysis" message), see the ERP
// rows it would make, and save the ones you tick. Nothing is saved until the
// "Confirm and save" button is pressed. The reading itself lives in
// whatsappParse.js, which has no store or DOM code.
import { store } from '../store.js';
import { el, ico } from '../utils.js';
import { sectionHeader, statCard, renderTable } from '../ui.js';
import { todayISOString } from '../dateUtils.js';
import { liveContext } from '../reportContext.js';
import { parseWhatsApp, KIND_LABELS } from '../whatsappParse.js';

const PILL = {
  ok: ['pill pill-good', 'Ready'],
  check: ['pill pill-warning', 'Check'],
  exists: ['pill pill-neutral', 'Already in ERP'],
  blocked: ['pill pill-critical', 'Not saved'],
  saved: ['pill pill-good', 'Saved'],
  failed: ['pill pill-critical', 'Failed'],
};
const FLAG_PREFIX = { block: 'Not saved: ', check: 'Check: ', info: '' };
const LINKS = {
  operations: ['#/operations', 'Open Daily Operations'],
  dieselSiteDistributions: ['#/resourceManagement', 'Open Diesel Management'],
  fundRequests: ['#/fundRequests', 'Open Fund Requests'],
  fuelCreditCollections: ['#/purchasing', 'Open Fuel Credit'],
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function renderPasteEntry(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Paste Entry', 'Paste a WhatsApp message to turn it into ERP rows. You review the rows first; nothing is saved until you confirm.'));

  const box = el('textarea', { class: 'paste-box', rows: '12', placeholder: 'Paste one message or a whole chat here: end-of-day report, diesel distribution list, fund request, or the Midejab "Grands Total/Analysis" message.', spellcheck: 'false' });
  const readBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [ico('clipboard'), 'Read message']);
  const clearBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Clear');
  const out = el('div', {});

  container.appendChild(el('div', { class: 'dd-tool dd-static' }, [
    el('h3', { class: 'dd-static-title' }, '1. Paste the message'),
    el('p', { class: 'section-subtitle' }, 'Reads end-of-day dozer reports, Oki\'s diesel distribution lists, fund request messages and the Midejab station analysis. Names that do not match the ERP are shown and their rows are not saved. Fund requests are always saved as Pending.'),
    el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'WhatsApp message'), box]),
    el('div', { class: 'dd-actions' }, [readBtn, clearBtn]),
  ]));
  container.appendChild(out);

  let result = null;
  let picked = new Map(); // row n -> ticked
  let done = new Map(); // row n -> 'saved' | 'failed'
  let saving = false;

  function read() {
    done = new Map();
    out.innerHTML = '';
    const text = box.value;
    if (!text.trim()) { result = null; out.appendChild(el('p', { class: 'table-empty' }, 'Paste a message first.')); return; }
    try {
      result = parseWhatsApp(text, liveContext(null), { today: todayISOString() });
    } catch (e) {
      result = null;
      out.appendChild(el('p', { class: 'table-empty' }, `Could not read that message: ${e.message}`));
      return;
    }
    picked = new Map(result.rows.map((r) => [r.n, r.selected]));
    draw();
  }

  function draw() {
    out.innerHTML = '';
    const { rows, warnings, unmatched, reconciliation, ignored } = result;
    if (!rows.length) {
      out.appendChild(el('p', { class: 'table-empty' }, 'No ERP rows could be made from this text.'));
      if (warnings.length) out.appendChild(el('ul', {}, warnings.map((w) => el('li', {}, w))));
      if (ignored.length) out.appendChild(ignoredBlock(ignored));
      return;
    }
    const count = (s) => rows.filter((r) => r.status === s).length;
    out.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ icon: 'check', label: 'Ready to save', value: String(count('ok')), tone: count('ok') ? 'good' : undefined }),
      statCard({ icon: 'alert', label: 'Need checking', value: String(count('check')), tone: count('check') ? 'warning' : undefined }),
      statCard({ icon: 'file', label: 'Already in the ERP', value: String(count('exists')) }),
      statCard({ icon: 'alert', label: 'Not saved (missing or unmatched)', value: String(count('blocked')), tone: count('blocked') ? 'critical' : 'good' }),
    ]));

    if (warnings.length) out.appendChild(listBlock('Notes on this message', warnings));
    if (reconciliation.length) {
      out.appendChild(el('div', { class: 'dd-tool dd-static' }, [
        el('h3', { class: 'dd-static-title' }, 'Station grand total check'),
        el('ul', { class: 'paste-recon' }, reconciliation.map((r) => el('li', {}, [el('span', { class: r.ok ? PILL.ok[0] : PILL.check[0] }, r.ok ? 'Matches' : 'Differs'), ` ${r.text}`]))),
      ]));
    }

    // ------------------------------------------------------------ the rows
    const tableHost = el('div', { class: 'table-wrap' });
    const summary = el('p', { class: 'section-subtitle' }, '');
    const confirmBtn = el('button', { type: 'button', class: 'btn btn-primary', disabled: '' }, [ico('upload'), 'Confirm and save']);
    const result2 = el('div', {});

    const ticked = () => rows.filter((r) => picked.get(r.n) && !done.has(r.n) && r.record);
    function sync() {
      const n = ticked().length;
      confirmBtn.disabled = saving || n === 0;
      confirmBtn.lastChild.textContent = n ? `Confirm and save ${plural(n, 'row')}` : 'Confirm and save';
      summary.textContent = n ? `${plural(n, 'row')} ticked. Rows marked Check are unticked until you tick them yourself.` : 'Tick the rows you want to save.';
    }
    function drawTable() {
      renderTable(tableHost, {
        exportFilename: 'paste-entry-preview',
        rowClass: (r) => (done.get(r.n) === 'failed' || r.status === 'blocked' ? 'row-critical' : r.status === 'check' ? 'row-warning' : undefined),
        columns: [
          {
            key: 'save', label: 'Save',
            render: (r) => {
              const can = !!r.record && r.status !== 'exists' && !done.has(r.n);
              const cb = el('input', { type: 'checkbox', title: can ? 'Save this row' : 'This row cannot be saved' });
              cb.checked = can && !!picked.get(r.n);
              cb.disabled = !can || saving;
              cb.addEventListener('change', () => { picked.set(r.n, cb.checked); sync(); });
              return cb;
            },
          },
          { key: 'n', label: '#' },
          { key: 'kind', label: 'Type', render: (r) => KIND_LABELS[r.kind] || r.kind },
          { key: 'title', label: 'Row', wrap: true },
          {
            key: 'status', label: 'Status',
            render: (r) => { const p = PILL[done.get(r.n) || r.status]; return el('span', { class: p[0] }, p[1]); },
          },
          {
            key: 'flags', label: 'Notes', wrap: true,
            render: (r) => {
              const lines = [...r.flags];
              if (r.existing.length) lines.push({ level: 'info', text: `In the ERP as ${r.existing.join(', ')}.` });
              return el('div', { class: 'paste-flags' }, lines.length ? lines.map((f) => el('div', { class: `paste-flag paste-flag-${f.level}` }, `${FLAG_PREFIX[f.level]}${f.text}`)) : [el('span', {}, '—')]);
            },
          },
        ],
        rows,
      });
    }

    out.appendChild(el('div', { class: 'dd-tool dd-static' }, [
      el('h3', { class: 'dd-static-title' }, `2. Check the rows (${KIND_LABELS[result.kind] || (result.kind === 'mixed' ? 'several message types' : 'message')})`),
      tableHost,
    ]));
    if (unmatched.length) {
      const host = el('div', { class: 'table-wrap' });
      renderTable(host, {
        exportFilename: 'paste-entry-unmatched',
        columns: [{ key: 'row', label: 'Row' }, { key: 'kind', label: 'What' }, { key: 'text', label: 'Text in the message' }, { key: 'reason', label: 'Why it is not matched', wrap: true }],
        rows: unmatched,
      });
      out.appendChild(el('div', { class: 'dd-tool dd-static' }, [
        el('h3', { class: 'dd-static-title' }, 'Not matched to the ERP'),
        el('p', { class: 'section-subtitle' }, 'These names were not guessed. Fix the name in the message (a staff ID such as EMP-11 always matches) and read it again.'),
        host,
      ]));
    }
    if (ignored.length) out.appendChild(ignoredBlock(ignored));

    out.appendChild(el('div', { class: 'dd-tool dd-static' }, [
      el('h3', { class: 'dd-static-title' }, '3. Confirm'),
      summary,
      el('div', { class: 'dd-actions' }, [confirmBtn]),
      result2,
    ]));

    confirmBtn.addEventListener('click', async () => {
      const todo = ticked();
      if (!todo.length || saving) return;
      saving = true; sync(); drawTable();
      const failed = [];
      let saved = 0;
      for (let i = 0; i < todo.length; i += 1) {
        const r = todo[i];
        result2.textContent = `Saving ${i + 1} of ${todo.length}…`;
        try {
          await store.add(r.collection, JSON.parse(JSON.stringify(r.record)));
          done.set(r.n, 'saved'); saved += 1;
        } catch (e) {
          done.set(r.n, 'failed'); failed.push(`Row ${r.n} (${r.title}): ${e.message}`);
        }
      }
      saving = false;
      result2.innerHTML = '';
      result2.appendChild(el('p', { class: 'dd-import-done' }, `Saved ${plural(saved, 'row')} of ${todo.length}${failed.length ? `; ${failed.length} failed` : ''}.`));
      if (failed.length) result2.appendChild(el('ul', {}, failed.map((f) => el('li', {}, f))));
      const touched = [...new Set(todo.filter((r) => done.get(r.n) === 'saved').map((r) => r.collection))];
      result2.appendChild(el('div', { class: 'dd-actions' }, touched.filter((c) => LINKS[c]).map((c) => el('a', { class: 'btn btn-ghost', href: LINKS[c][0] }, LINKS[c][1]))));
      sync(); drawTable();
    });

    drawTable();
    sync();
  }

  function listBlock(title, items) {
    return el('div', { class: 'dd-tool dd-static' }, [el('h3', { class: 'dd-static-title' }, title), el('ul', {}, items.map((w) => el('li', {}, w)))]);
  }
  function ignoredBlock(items) {
    return el('details', { class: 'dd-tool' }, [
      el('summary', {}, `Text that was not read (${items.length})`),
      el('ul', {}, items.map((i) => el('li', {}, `"${i.text}": ${i.reason}`))),
    ]);
  }

  readBtn.addEventListener('click', read);
  clearBtn.addEventListener('click', () => { if (saving) return; box.value = ''; result = null; out.innerHTML = ''; box.focus(); });
}
