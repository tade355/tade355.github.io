import test from 'node:test';
import assert from 'node:assert/strict';
import { splitRate, phaseBlock, amountInWords, buildLandClearingInvoice, buildSecurityInvoice, landClearingRecords, securityRecords, longDate, naira } from './rexInvoice.js';

test('a rate splits into diesel, machine, service charge and VAT exactly as on the sent letters', () => {
  assert.deepEqual(splitRate(845000), { diesel: 253500, machine: 464750, serviceCharge: 117906.97, vat: 8843.03 });
  assert.deepEqual(splitRate(455000), { diesel: 136500, machine: 250250, serviceCharge: 63488.37, vat: 4761.63 });
});

test('the 24 Sep 2026 letter (WO 1775 & 1768) is reproduced to the kobo', () => {
  const p1 = phaseBlock('Phase 1', 845000, 31.26);
  assert.deepEqual(p1.lines.map((l) => l.total), [7924410, 14528085, 3685771.88, 276433.12]);
  assert.equal(p1.subTotal, 26414700);
  const p2 = phaseBlock('Phase 2', 455000, 20.73);
  assert.deepEqual(p2.lines.map((l) => l.total), [2829645, 5187682.5, 1316113.91, 98708.59]);
  assert.equal(p2.subTotal, 9432150);
  const inv = buildLandClearingInvoice({ date: '2026-09-24', workOrders: [{ wo: '1775', project: 'K', phase1: 31.26, phase2: 20.73 }, { wo: '1768', project: 'K', phase1: 0, phase2: 0 }] });
  assert.equal(inv.total, 35846850);
  assert.equal(inv.totalText, 'N35,846,850.00');
  assert.equal(inv.totalWords, 'Thirty-Five Million, Eight Hundred and Forty-Six Thousand, Eight Hundred and Fifty Naira Only');
  assert.equal(inv.subject, 'PAYMENT FOR LAND CLEARING SERVICES – (WO No: 1775)');
  assert.equal(buildLandClearingInvoice({ date: '2026-09-24', workOrders: [{ wo: '1775', phase1: 1 }, { wo: '1768', phase2: 1 }] }).subject, 'PAYMENT FOR LAND CLEARING SERVICES – (WO No: 1775 & 1768)');
  assert.equal(buildLandClearingInvoice({ date: '2026-09-24', workOrders: [{ wo: 'A', phase1: 1 }, { wo: 'B', phase1: 1 }, { wo: 'C', phase1: 1 }] }).woLabel, 'A, B & C');
});

test('earlier invoices in the ERP come out at the same totals', () => {
  const t = (p1, p2) => buildLandClearingInvoice({ date: '2026-08-06', workOrders: [{ wo: 'x', phase1: p1, phase2: p2 }] }).total;
  assert.equal(t(4.83, 6.04), 6829550);
  assert.equal(t(5.77, 29.52), 18307250);
  assert.equal(t(0, 18.62), 8472100);
  assert.equal(t(0, 84.94), 38647700);
  assert.equal(t(23.4, 0), 19773000);
});

test('a phase with no hectares is left off the letter', () => {
  const inv = buildLandClearingInvoice({ date: '2026-10-08', workOrders: [{ wo: '1795', phase1: 23.4, phase2: 0 }] });
  assert.deepEqual(inv.phases.map((p) => p.name), ['Phase 1']);
});

test('amounts in words', () => {
  assert.equal(amountInWords(800000), 'Eight Hundred Thousand Naira Only');
  assert.equal(amountInWords(1200000), 'One Million, Two Hundred Thousand Naira Only');
  assert.equal(amountInWords(19773000), 'Nineteen Million, Seven Hundred and Seventy-Three Thousand Naira Only');
  assert.equal(amountInWords(1050), 'One Thousand and Fifty Naira Only');
  assert.equal(amountInWords(125.5), 'One Hundred and Twenty-Five Naira, Fifty Kobo Only');
  assert.equal(amountInWords(0), 'Zero Naira Only');
  assert.equal(amountInWords(38647700), 'Thirty-Eight Million, Six Hundred and Forty-Seven Thousand, Seven Hundred Naira Only');
});

test('dates and money read like the letters', () => {
  assert.equal(longDate('2026-09-24').text, '24th September 2026');
  assert.equal(longDate('2026-10-01').text, '1st October 2026');
  assert.equal(longDate('2026-10-02').text, '2nd October 2026');
  assert.equal(longDate('2026-10-11').text, '11th October 2026');
  assert.equal(longDate('2026-10-23').text, '23rd October 2026');
  assert.equal(naira(800000), 'N800,000.00');
});

test('the site-security letter', () => {
  const s = buildSecurityInvoice({ date: '2026-09-24', monthLabel: 'September 2026', sites: [{ name: 'Kajola', rate: 400000, months: 1 }, { name: 'Kangidi', rate: 400000, months: 1 }] });
  assert.equal(s.total, 800000);
  assert.equal(s.totalText, 'N800,000.00');
  assert.equal(s.totalWords, 'Eight Hundred Thousand Naira Only');
  assert.equal(s.subject, 'PAYMENT FOR LAND CLEARING – SITE SECURITY (KAJOLA & KANGIDI SITES)');
  assert.equal(s.rateText, 'N400,000.00');
});

test('ERP invoice records: one per project with a line per phase', () => {
  const recs = landClearingRecords({ date: '2026-09-24', customerId: 'CUS-1', workOrders: [
    { wo: '1775', project: 'Kangidi', phase1: 31.26, phase2: 0 }, { wo: '1768', project: 'Kajola', phase1: 0, phase2: 20.73 }, { wo: '1769', project: 'Kajola', phase2: 1 }] });
  assert.equal(recs.length, 2);
  const kaj = recs.find((r) => r.project === 'Kajola').invoice;
  assert.equal(kaj.items.length, 1);
  assert.deepEqual(kaj.items[0], { description: 'Land Clearing — Phase 2 (WO 1768 & 1769)', qty: 21.73, price: 455000, operationType: 'Phase 2' });
  assert.equal(kaj.status, 'Unpaid');
  const sec = securityRecords({ date: '2026-09-24', customerId: 'CUS-1', monthLabel: 'September 2026', sites: [{ name: 'Kajola', project: 'PK', rate: 400000, months: 1 }] });
  assert.deepEqual(sec[0].invoice.items, [{ description: 'Site Security - Kajola (September 2026)', qty: 1, price: 400000 }]);
});
