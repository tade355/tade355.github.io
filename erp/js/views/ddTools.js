// Extra tools on the Daily Operations Dashboard:
//  - "Ask the ERP": plain-English questions answered from the data already in
//    the ERP (see askErp.js — a rule-based assistant, not a generative AI).
//  - Operations Profitability Report builder: pick a date range and the
//    sections to include, then download the report as a single HTML file.
//    Only Olumide's account sees this (see access.js).
import { el, formatDate } from '../utils.js';
import { todayISOString, addDays, mondayOf } from '../dateUtils.js';
import { liveContext } from '../reportContext.js';
import { answerQuestion, EXAMPLE_QUESTIONS } from '../askErp.js';
import { FACT_EXAMPLES } from '../askErpFacts.js';
import { buildProfitReport, REPORT_SECTIONS } from '../profitReportData.js';
import { buildProfitReportHtml, profitReportFileName } from '../profitReportHtml.js';
import { canDownloadProfitReports } from '../access.js';
import { DASHBOARD_BASIS_FROM } from '../dashboardBasis.js';
import { projectNames } from './profitability.js';
import { store } from '../store.js';
import { ICONS } from '../icons.js';

function answerBlock(question, answer) {
  const box = el('div', { class: 'dd-chat-item' }, [el('div', { class: 'dd-chat-q' }, question)]);
  const a = el('div', { class: 'dd-chat-a' });
  answer.text.split('\n').forEach((line) => a.appendChild(el('p', {}, line)));
  if (answer.table && answer.table.rows.length) {
    const table = el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, answer.table.head.map((h) => el('th', {}, h)))]),
      el('tbody', {}, answer.table.rows.map((r) => el('tr', {}, r.map((c) => el('td', {}, String(c)))))),
    ]);
    a.appendChild(el('div', { class: 'table-wrap' }, [table]));
  }
  (answer.notes || []).forEach((n) => a.appendChild(el('p', { class: 'dd-muted' }, n)));
  box.appendChild(a);
  return box;
}

export function askCard(getProject) {
  const input = el('input', { type: 'text', class: 'dd-ask-input', placeholder: 'Ask a question, e.g. "What was the profit yesterday?"', 'aria-label': 'Ask the ERP a question' });
  const history = el('div', { class: 'dd-chat' });
  const submit = el('button', { type: 'button', class: 'btn btn-primary' }, 'Ask');

  function ask(question) {
    const q = (question || input.value).trim();
    if (!q) return;
    let answer;
    try {
      const project = getProject();
      answer = answerQuestion(q, liveContext(project), { today: todayISOString(), project });
    } catch (e) {
      answer = { text: 'Sorry, I could not work that out from the data. Try rephrasing the question, or give a date and a dozer or person.' };
      console.error('Ask the ERP failed:', e);
    }
    history.insertBefore(answerBlock(q, answer), history.firstChild);
    input.value = '';
  }
  submit.addEventListener('click', () => ask());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });

  const chips = el('div', { class: 'dd-chips' }, [...EXAMPLE_QUESTIONS.slice(0, 6), ...FACT_EXAMPLES.slice(0, 5)].map((q) => el('button', { type: 'button', class: 'dd-chip', onClick: () => ask(q) }, q)));
  const card = el('details', { class: 'dd-tool' }, [
    el('summary', {}, 'Ask the ERP'),
    el('p', { class: 'section-subtitle' }, 'Ask in plain English. Answers are worked out only from the data already loaded in the ERP (operations, diesel, requests, fuel credit, fleet, sites, staff and profit). It does not use outside information, and if it cannot match a question it says so.'),
    el('div', { class: 'dd-ask-row' }, [input, submit]),
    chips, history,
  ]);
  return card;
}

export function reportBuilderCard(getProject) {
  if (!canDownloadProfitReports()) return null;
  const today = todayISOString();
  const projects = projectNames();
  const site = el('select', {}, projects.map((p) => el('option', { value: p }, p)));
  site.value = getProject() || projects[0] || '';
  const fromInput = el('input', { type: 'date', value: DASHBOARD_BASIS_FROM });
  const toInput = el('input', { type: 'date', value: today });
  const boxes = REPORT_SECTIONS.map((s) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = s.default;
    return { key: s.key, cb, node: el('label', { class: 'dd-check' }, [cb, ` ${s.label}`]) };
  });
  const message = el('p', { class: 'section-subtitle' }, '');

  function setRange(from, to) { fromInput.value = from; toInput.value = to; }
  const presets = el('div', { class: 'dd-chips' }, [
    ['Since 10 Oct', () => setRange(DASHBOARD_BASIS_FROM, today)],
    ['Yesterday', () => setRange(addDays(today, -1), addDays(today, -1))],
    ['Last 7 days', () => setRange(addDays(today, -6), today)],
    ['This week', () => setRange(mondayOf(today), today)],
    ['All reports', () => {
      const dates = store.get('operations').filter((o) => o.siteName === site.value).map((o) => o.date).sort();
      if (dates.length) setRange(dates[0], dates[dates.length - 1]);
    }],
  ].map(([label, fn]) => el('button', { type: 'button', class: 'dd-chip', onClick: fn }, label)));

  function build() {
    // Re-checked at the moment of download, not only when the button is drawn.
    if (!canDownloadProfitReports()) { message.textContent = 'Only Olumide can download this report.'; return null; }
    const from = fromInput.value; const to = toInput.value;
    if (!from || !to || from > to) { message.textContent = 'Choose a valid date range (From must not be after To).'; return null; }
    const sections = boxes.filter((b) => b.cb.checked).map((b) => b.key);
    if (!sections.length) { message.textContent = 'Tick at least one section to include.'; return null; }
    const report = buildProfitReport(liveContext(site.value), { project: site.value, from, to, sections });
    if (!report.workingDays) { message.textContent = `There are no Daily Operations reports for ${site.value} between ${formatDate(from)} and ${formatDate(to)}.`; return null; }
    message.textContent = '';
    return { report, html: buildProfitReportHtml(report) };
  }

  const downloadBtn = el('button', { type: 'button', class: 'btn btn-primary', onClick: () => {
    const built = build();
    if (!built) return;
    const url = URL.createObjectURL(new Blob([built.html], { type: 'text/html;charset=utf-8' }));
    const a = el('a', { href: url, download: profitReportFileName(built.report.from, built.report.to) });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } }, [el('span', { html: ICONS.download }), 'Download report (HTML)']);
  const previewBtn = el('button', { type: 'button', class: 'btn btn-ghost', onClick: () => {
    const built = build();
    if (!built) return;
    const url = URL.createObjectURL(new Blob([built.html], { type: 'text/html;charset=utf-8' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } }, 'Preview');

  return el('details', { class: 'dd-tool' }, [
    el('summary', {}, 'Operations Profitability Report (Olumide only)'),
    el('p', { class: 'section-subtitle' }, 'Choose the site, the dates and the sections to include. The report is a single HTML file in the same design as the daily dashboard, with the profit, output, start times, dozers, operators and supervisors for the selected period.'),
    el('div', { class: 'filter-bar' }, [
      el('label', { class: 'filter-field' }, [el('span', {}, 'Site'), site]),
      el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]),
      el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]),
    ]),
    presets,
    el('div', { class: 'dd-checks' }, boxes.map((b) => b.node)),
    el('div', { class: 'dd-actions' }, [downloadBtn, previewBtn]),
    message,
  ]);
}
