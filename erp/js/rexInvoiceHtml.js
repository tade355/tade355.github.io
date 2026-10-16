// The Rex Forestry payment-request letter as HTML: Emagrims letterhead, the
// phase tables (or the site-security table), bank details and the CEO's
// signature — laid out on an A4 page so it prints, or saves as PDF, ready to send.
//
// Pure: takes the model from rexInvoice.js (buildLandClearingInvoice /
// buildSecurityInvoice) and returns a string.
import { ADDRESSEE, BANK, SIGNATORY, num2 } from './rexInvoice.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function dateLine(p) {
  return `${p.day}<sup>${p.suffix}</sup> ${esc(p.month)} ${p.year}`;
}

function phaseTable(p) {
  const rows = p.lines.map((l) => `<tr><td class="rex-l">${esc(l.label)}</td><td class="rex-c">${num2(l.rate)}</td><td class="rex-c">${num2(l.ha)}</td><td class="rex-r">${num2(l.total)}</td></tr>`).join('');
  return `<p class="rex-phase">${esc(p.name)}</p>
    <table class="rex-table"><colgroup><col style="width:42%"><col style="width:19%"><col style="width:15%"><col style="width:24%"></colgroup>
      <thead><tr><th class="rex-l rex-plain">Cost breakdown</th><th>Rate/Ha (₦)</th><th>Area (Ha)</th><th class="rex-r">Total (₦)</th></tr></thead>
      <tbody>${rows}<tr class="rex-sub"><td class="rex-l">Sub-Total</td><td class="rex-c">${num2(p.rate)}</td><td></td><td class="rex-r">${num2(p.subTotal)}</td></tr></tbody>
    </table>`;
}

function securityTable(m) {
  const rows = m.rows.map((r) => `<tr><td class="rex-l rex-n">${esc(r.name)}</td><td class="rex-c rex-n">${num2(r.rate)}</td><td class="rex-c rex-n">${r.months}</td><td class="rex-r rex-n">${num2(r.total)}</td></tr>`).join('');
  return `<table class="rex-table rex-sec"><colgroup><col style="width:28%"><col style="width:27%"><col style="width:22%"><col style="width:23%"></colgroup>
      <thead><tr><th class="rex-l">Site</th><th>Rate/Month (₦)</th><th>No. of Months</th><th class="rex-r">Total (₦)</th></tr></thead>
      <tbody>${rows}<tr class="rex-sub"><td class="rex-l">Total</td><td></td><td></td><td class="rex-r">${num2(m.total)}</td></tr></tbody>
    </table>`;
}

export function rexLetterHtml(m, { addressee = ADDRESSEE, bank = BANK, signatory = SIGNATORY, assetBase = '' } = {}) {
  let intro; let tables; let boldAccount = true;
  if (m.kind === 'security') {
    const siteList = m.siteNames.length > 1 ? `${m.siteNames.slice(0, -1).join(', ')} and ${m.siteNames[m.siteNames.length - 1]}` : (m.siteNames[0] || '');
    intro = `We kindly request for the payment of the sum of <strong>${esc(m.totalText)}</strong> (${esc(m.totalWords)}) being the cost of security personnel engaged to provide security services at the active Rex Forestry land clearing project sites (${esc(siteList)}) for the month of ${esc(m.monthLabel)}${m.rateText ? `, at the rate of ${esc(m.rateText)} per month per site` : ''}. See breakdown below.`;
    tables = securityTable(m);
    boldAccount = false;
  } else {
    intro = `We kindly request for the payment of the above-mentioned Job done which is a total sum of <strong>${esc(m.totalText)}</strong> (${esc(m.totalWords)}). See Breakdown below.`;
    tables = m.phases.map(phaseTable).join('');
  }
  const [first, ...rest] = addressee;
  return `<div class="rex-letter">
    <img class="rex-bg" src="${assetBase}assets/rex-letterhead.jpg" alt="">
    <div class="rex-body">
      <p class="rex-date">${dateLine(m.dateParts)}</p>
      <p class="rex-addr"><strong>${esc(first)}</strong><br>${rest.map(esc).join('<br>')}</p>
      <p>Dear Sir,</p>
      <p class="rex-subject"><strong>${esc(m.subject)}</strong></p>
      <p class="rex-intro">${intro}</p>
      ${tables}
      <p class="rex-bank">Kindly pay into our account, <strong>${esc(bank.holder)}</strong>.<br>
        <span class="rex-indent">Bank: ${esc(bank.name)}</span><br>
        <span class="rex-indent">Account Number: ${boldAccount ? `<strong>${esc(bank.account)}</strong>` : esc(bank.account)}</span></p>
      <p>Thanks for your cooperation.</p>
      <div class="rex-sign"><img src="${assetBase}assets/ceo-signature.png" alt=""><div><strong>${esc(signatory.name)}</strong><br><em>${esc(signatory.title)}</em></div></div>
    </div>
  </div>`;
}
