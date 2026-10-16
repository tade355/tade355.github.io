// Sales & Invoicing → Work Order Invoices: upload Rex Forestry's work orders
// (PDF), check the hectares, and print the payment-request letter — the Rex
// template with the Diesel / Machine / Service Charge / VAT breakdown — ready to
// send; or the monthly site-security letter. The invoice can also be saved into
// Sales & Invoicing from here.
import { store } from '../store.js';
import { el, ico, formatCurrency } from '../utils.js';
import { statCard } from '../ui.js';
import { todayISOString } from '../dateUtils.js';
import { projectNames } from './profitability.js';
import { printHtmlDocument } from '../print.js';
import { itemsToLines, parseWorkOrder } from '../workOrderParse.js';
import { DEFAULT_RATES, BANK, ADDRESSEE, SIGNATORY, buildLandClearingInvoice, buildSecurityInvoice, landClearingRecords, securityRecords } from '../rexInvoice.js';
import { rexLetterHtml } from '../rexInvoiceHtml.js';

let pdfPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfPromise) {
    pdfPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; resolve(window.pdfjsLib); };
      s.onerror = () => { pdfPromise = null; reject(new Error('Could not load the PDF reader. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return pdfPromise;
}

async function readWorkOrderPdf(file) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...itemsToLines(content.items));
  }
  return parseWorkOrder(lines);
}

const BLOCK_KEY = 'emagrims_wo_block_projects';
const readMap = () => { try { return JSON.parse(localStorage.getItem(BLOCK_KEY) || '{}'); } catch (e) { return {}; } };
const saveMap = (m) => { try { localStorage.setItem(BLOCK_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } };
function guessProject(block, projects) {
  const saved = readMap()[block];
  if (saved && projects.includes(saved)) return saved;
  const byName = { OA1: /kangidi/i, OA6: /kajola/i }[block];
  return (byName && projects.find((p) => byName.test(p))) || '';
}

const shortSite = (p) => p.replace(/^REX Forestry Project\s*-\s*/i, '');
const monthOf = (iso) => {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = iso.split('-').map(Number); return `${names[m - 1]} ${y}`;
};

export function renderWorkOrderInvoices(container) {
  container.innerHTML = '';
  const projects = projectNames();
  const customer = store.get('customers').find((c) => /rex/i.test(c.name)) || store.get('customers')[0];
  const today = todayISOString();

  container.appendChild(el('p', { class: 'section-subtitle' }, 'Upload the Rex Forestry work orders (PDF) and the ERP reads the hectares, builds the payment letter on the Emagrims letterhead with the Diesel / Machine / Service Charge / VAT breakdown, and prints it ready to send. Check the hectares first.'));

  // ------------------------------------------------------------------ setup
  const kind = el('select', {}, [el('option', { value: 'landClearing' }, 'Land clearing (from work orders)'), el('option', { value: 'security' }, 'Site security (monthly)')]);
  const dateInput = el('input', { type: 'date', value: today });
  const field = (label, input) => el('label', { class: 'filter-field' }, [el('span', {}, label), input]);
  container.appendChild(el('div', { class: 'filter-bar' }, [field('Letter', kind), field('Invoice date', dateInput)]));

  // ---------------------------------------------------------- work orders UI
  const woBody = el('tbody');
  const woInfo = el('p', { class: 'section-subtitle' }, '');
  const fileInput = el('input', { type: 'file', accept: '.pdf,application/pdf', multiple: '', class: 'imp-file' });
  const addBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '+ Add a work order by hand');
  const woCard = el('div', { class: 'dd-tool dd-static' }, [
    el('h3', { class: 'dd-static-title' }, '1. Work orders'),
    el('p', { class: 'section-subtitle' }, 'Choose one or more Rex "Order for Work" PDFs. Each is read for its WO number, block and the Phase 1 (E121, ₦845,000/ha) and Phase 2 (E124, ₦455,000/ha) hectares, and checked against the totals printed on it.'),
    el('div', { class: 'imp-row' }, [fileInput]),
    woInfo,
    el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table wo-table' }, [
      el('thead', {}, [el('tr', {}, ['WO No', 'Block', 'Project / site', 'Phase 1 (ha)', 'Phase 2 (ha)', 'Check', ''].map((h) => el('th', {}, h)))]),
      woBody,
    ])]),
    el('div', { class: 'dd-actions' }, [addBtn]),
  ]);
  container.appendChild(woCard);
  const rows = []; // { wo, block, project, p1, p2, note, noteClass, remove }

  function addRow(init = {}) {
    const wo = el('input', { type: 'text', value: init.wo || '', placeholder: '1775' });
    const block = el('input', { type: 'text', value: init.block || '', placeholder: 'OA1' });
    const project = el('select', {}, [el('option', { value: '' }, '— choose —'), ...projects.map((p) => el('option', { value: p }, p))]);
    project.value = init.project || '';
    const p1 = el('input', { type: 'number', min: '0', step: '0.01', value: init.phase1 ? String(init.phase1) : '' });
    const p2 = el('input', { type: 'number', min: '0', step: '0.01', value: init.phase2 ? String(init.phase2) : '' });
    const note = el('p', { class: `wo-note ${init.noteClass || ''}` }, init.note || '');
    const removeBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove' }, [ico('trash')]);
    const tr = el('tr', {}, [el('td', {}, [wo]), el('td', {}, [block]), el('td', {}, [project]), el('td', {}, [p1]), el('td', {}, [p2]), el('td', {}, [note]), el('td', {}, [removeBtn])]);
    const row = { wo, block, project, p1, p2, note, tr };
    rows.push(row); woBody.appendChild(tr);
    const refreshDup = () => {
      const dup = invoicedBefore(wo.value.trim());
      if (dup && !note.textContent.includes('already')) { note.textContent = `${note.textContent ? `${note.textContent} ` : ''}WO ${wo.value.trim()} is already on ${dup}.`; note.className = 'wo-note warn'; }
    };
    [wo, block, p1, p2].forEach((i) => i.addEventListener('input', () => { refreshDup(); update(); }));
    block.addEventListener('change', () => { const g = guessProject(block.value.trim().toUpperCase(), projects); if (g && !project.value) { project.value = g; update(); } });
    project.addEventListener('change', () => { const b = block.value.trim().toUpperCase(); if (b && project.value) { const m = readMap(); m[b] = project.value; saveMap(m); } update(); });
    removeBtn.addEventListener('click', () => { rows.splice(rows.indexOf(row), 1); tr.remove(); update(); });
    refreshDup();
    return row;
  }
  function invoicedBefore(woNo) {
    if (!woNo) return null;
    const re = new RegExp(`\\b${woNo.replace(/[^0-9A-Za-z]/g, '')}\\b`);
    const hit = store.get('invoices').find((inv) => (inv.items || []).some((it) => re.test(it.description || '')));
    return hit ? `invoice ${hit.id}` : null;
  }
  addBtn.addEventListener('click', () => { addRow(); update(); });

  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    // drop the empty starter row once real work orders arrive
    rows.filter((r) => !r.wo.value && !r.p1.value && !r.p2.value).forEach((r) => { rows.splice(rows.indexOf(r), 1); r.tr.remove(); });
    woInfo.textContent = `Reading ${files.length} file${files.length === 1 ? '' : 's'}…`;
    const msgs = [];
    for (const f of files) {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { msgs.push(`${f.name}: only PDF work orders can be read. Add it by hand below.`); continue; }
      try {
        const r = await readWorkOrderPdf(f);
        if (r.wo && rows.some((x) => x.wo.value.trim() === r.wo)) { msgs.push(`${f.name}: WO ${r.wo} is already in the list.`); continue; }
        const project = guessProject(r.block || '', projects);
        addRow({
          wo: r.wo || '', block: r.block || '', project, phase1: r.phase1, phase2: r.phase2,
          note: r.ok ? `Read from the PDF: ${r.compartments.length} compartment(s), ₦${(r.totalWo?.amount || 0).toLocaleString()}.` : r.messages.join(' '),
          noteClass: r.ok ? 'ok' : 'bad',
        });
        if (!r.ok) msgs.push(`${f.name}: ${r.messages.join(' ')} Check the hectares by hand.`);
      } catch (e) { msgs.push(`${f.name}: could not read it (${e.message}). Add it by hand below.`); }
    }
    fileInput.value = '';
    woInfo.textContent = msgs.join(' ');
    update();
  });

  // ------------------------------------------------------- letter details UI
  const addressee = el('textarea', { rows: '3', class: 'dd-message' }); addressee.value = ADDRESSEE.join('\n');
  const bankName = el('input', { type: 'text', value: BANK.name });
  const bankAccount = el('input', { type: 'text', value: BANK.account });
  const bankHolder = el('input', { type: 'text', value: BANK.holder });
  const rate1 = el('input', { type: 'number', min: '0', step: '1000', value: String(DEFAULT_RATES['Phase 1']) });
  const rate2 = el('input', { type: 'number', min: '0', step: '1000', value: String(DEFAULT_RATES['Phase 2']) });
  const monthLabel = el('input', { type: 'text', value: monthOf(today) });
  const secRate = el('input', { type: 'number', min: '0', step: '1000', value: '400000' });
  const secBody = el('tbody');
  const secRows = [];
  function addSecRow(init = {}) {
    const project = el('select', {}, [el('option', { value: '' }, '— choose —'), ...projects.map((p) => el('option', { value: p }, p))]); project.value = init.project || '';
    const months = el('input', { type: 'number', min: '0', step: '1', value: String(init.months ?? 1) });
    const removeBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove' }, [ico('trash')]);
    const tr = el('tr', {}, [el('td', {}, [project]), el('td', {}, [months]), el('td', {}, [removeBtn])]);
    const row = { project, months, tr };
    secRows.push(row); secBody.appendChild(tr);
    [project, months].forEach((i) => i.addEventListener('input', update));
    removeBtn.addEventListener('click', () => { secRows.splice(secRows.indexOf(row), 1); tr.remove(); update(); });
  }
  ['kajola', 'kangidi'].forEach((k) => addSecRow({ project: projects.find((p) => new RegExp(k, 'i').test(p)) || '' }));
  const addSecBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '+ Add a site');
  addSecBtn.addEventListener('click', () => { addSecRow(); update(); });
  const secCard = el('div', { class: 'dd-tool dd-static' }, [
    el('h3', { class: 'dd-static-title' }, '1. Security sites'),
    el('div', { class: 'filter-bar' }, [field('Month', monthLabel), field('Rate per site per month (₦)', secRate)]),
    el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table wo-table' }, [el('thead', {}, [el('tr', {}, ['Site', 'No. of months', ''].map((h) => el('th', {}, h)))]), secBody])]),
    el('div', { class: 'dd-actions' }, [addSecBtn]),
  ]);
  container.appendChild(secCard);

  container.appendChild(el('details', { class: 'dd-tool' }, [
    el('summary', {}, 'Letter details (addressee, bank, rates)'),
    el('div', { class: 'filter-bar' }, [field('Phase 1 rate (₦/ha)', rate1), field('Phase 2 rate (₦/ha)', rate2), field('Bank', bankName), field('Account number', bankAccount), field('Account name', bankHolder)]),
    el('p', { class: 'section-subtitle' }, 'Addressee (one line each):'),
    addressee,
  ]));

  // ---------------------------------------------------------------- preview
  const summary = el('div', { class: 'stats-grid' });
  const preview = el('div', { class: 'rex-preview' });
  const status = el('p', { class: 'section-subtitle' }, '');
  const printBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [ico('printer'), 'Print / Save as PDF']);
  const saveBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, [ico('file'), 'Save to Sales & Invoicing']);
  container.appendChild(el('h3', { class: 'subsection-title' }, '2. The letter'));
  container.appendChild(summary);
  container.appendChild(el('div', { class: 'dd-actions' }, [printBtn, saveBtn]));
  container.appendChild(status);
  container.appendChild(preview);

  function lines() {
    return rows.map((r) => ({ wo: r.wo.value.trim(), block: r.block.value.trim().toUpperCase(), project: r.project.value, phase1: Number(r.p1.value) || 0, phase2: Number(r.p2.value) || 0 }));
  }
  function secSites() {
    return secRows.map((r) => ({ name: shortSite(r.project.value), project: r.project.value, rate: Number(secRate.value) || 0, months: Number(r.months.value) || 0 })).filter((s) => s.name);
  }
  function model() {
    if (kind.value === 'security') return buildSecurityInvoice({ date: dateInput.value || today, monthLabel: monthLabel.value.trim() || monthOf(dateInput.value || today), sites: secSites() });
    return buildLandClearingInvoice({ date: dateInput.value || today, workOrders: lines(), rates: { 'Phase 1': Number(rate1.value) || DEFAULT_RATES['Phase 1'], 'Phase 2': Number(rate2.value) || DEFAULT_RATES['Phase 2'] } });
  }
  const opts = () => ({ addressee: addressee.value.split('\n').map((s) => s.trim()).filter(Boolean), bank: { name: bankName.value.trim(), account: bankAccount.value.trim(), holder: bankHolder.value.trim() }, signatory: SIGNATORY });

  function update() {
    woCard.style.display = kind.value === 'security' ? 'none' : '';
    secCard.style.display = kind.value === 'security' ? '' : 'none';
    const m = model();
    summary.innerHTML = '';
    if (m.kind === 'security') {
      summary.appendChild(statCard({ icon: 'bag', label: 'Sites', value: String(m.rows.length) }));
      summary.appendChild(statCard({ icon: 'banknote', label: 'Letter total', value: formatCurrency(m.total) }));
    } else {
      m.phases.forEach((p) => summary.appendChild(statCard({ icon: 'leaf', label: p.name, value: `${p.ha.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`, hint: `${formatCurrency(p.subTotal)} at ${formatCurrency(p.rate)}/ha` })));
      summary.appendChild(statCard({ icon: 'banknote', label: 'Letter total', value: formatCurrency(m.total), hint: `${m.workOrders.length} work order(s)` }));
    }
    const empty = m.kind === 'security' ? !m.rows.length : !m.phases.length;
    printBtn.disabled = empty; saveBtn.disabled = empty;
    preview.innerHTML = '';
    if (empty) { preview.appendChild(el('p', { class: 'table-empty' }, m.kind === 'security' ? 'Choose the sites to bill.' : 'Upload a work order, or add one by hand and enter its hectares, to see the letter.')); return; }
    preview.appendChild(el('div', { class: 'rex-preview-inner', html: rexLetterHtml(m, opts()) }));
  }
  [kind, dateInput, rate1, rate2, bankName, bankAccount, bankHolder, addressee, monthLabel, secRate].forEach((i) => i.addEventListener('input', () => { if (i === dateInput && kind.value === 'security') monthLabel.value = monthOf(dateInput.value || today); update(); }));
  kind.addEventListener('change', update);

  printBtn.addEventListener('click', () => { const m = model(); printHtmlDocument(rexLetterHtml(m, opts())); });

  saveBtn.addEventListener('click', async () => {
    const m = model();
    if (!customer) { status.textContent = 'Add Rex Forestry as a customer first (Customers tab).'; return; }
    let records;
    if (m.kind === 'security') records = securityRecords({ date: m.date, customerId: customer.id, monthLabel: m.monthLabel, sites: secSites() });
    else {
      const ls = lines();
      const missing = ls.filter((w) => (w.phase1 || w.phase2) && !w.project);
      if (missing.length) { status.textContent = `Choose the project for WO ${missing.map((w) => w.wo || '(no number)').join(', ')} first, so each invoice goes against the right site.`; return; }
      records = landClearingRecords({ date: m.date, customerId: customer.id, workOrders: ls, rates: { 'Phase 1': Number(rate1.value) || DEFAULT_RATES['Phase 1'], 'Phase 2': Number(rate2.value) || DEFAULT_RATES['Phase 2'] } });
    }
    if (!records.length) { status.textContent = 'Nothing to save.'; return; }
    const dup = m.kind === 'landClearing' ? rows.map((r) => invoicedBefore(r.wo.value.trim())).filter(Boolean) : [];
    const summaryText = records.map((r) => `${shortSite(r.project)}: ${formatCurrency(r.invoice.items.reduce((s, i) => s + i.qty * i.price, 0))}`).join('\n');
    if (!window.confirm(`Save ${records.length} unpaid invoice${records.length === 1 ? '' : 's'} for ${customer.name} dated ${m.date}?\n\n${summaryText}${dup.length ? `\n\nNote: ${[...new Set(dup)].join(', ')} already include one of these work orders.` : ''}`)) return;
    saveBtn.disabled = true;
    try {
      const ids = [];
      for (const r of records) { const saved = await store.add('invoices', r.invoice); ids.push(saved.id); }
      status.innerHTML = '';
      status.appendChild(document.createTextNode(`Saved ${ids.join(', ')} as Unpaid in Sales & Invoicing. Log the payment there when Rex pays. `));
      status.appendChild(el('a', { href: '#', onClick: (e) => { e.preventDefault(); [...document.querySelectorAll('.tab-btn')].find((b) => b.textContent.trim() === 'Invoices')?.click(); } }, 'Open Invoices'));
    } catch (e) { status.textContent = e.message || 'Could not save the invoices.'; } finally { saveBtn.disabled = false; }
  });

  addRow();
  update();
}
