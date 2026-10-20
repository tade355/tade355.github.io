import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsApp, splitMessages, findDate, cleanName, parseAccount, amountIn, reconcileStation } from './whatsappParse.js';

const SITE = 'REX Forestry Project - Kangidi';
const heavy = (name, ownership = 'Company') => ({ name, category: 'Heavy Equipment', ownership });
const ctx = (extra = {}) => ({
  today: '2026-10-19',
  projects: [{ name: SITE }, { name: 'REX Forestry Project - Kajola' }],
  inventory: [heavy('EMG-004'), heavy('EMG-006'), heavy('EMG-007'), heavy('EMG-008'), heavy('D8K Collins', 'Rented'), heavy('CHI-002', 'Partnership')],
  employees: [
    { id: 'EMP-1', name: 'Oki Christopher', role: 'Site Manager', status: 'Active' },
    { id: 'EMP-11', name: 'Adebayo Tope', role: 'Operator/EMG007', status: 'Active' },
    { id: 'EMP-12', name: 'Paul Joshua', role: 'Operator/EMG008', status: 'Active' },
    { id: 'EMP-37', name: 'Joshua (Kangidi)', role: 'Operator (Unassigned)', status: 'Active' },
    { id: 'EMP-20', name: 'Jessie Daniel', role: 'Operator/EMG006', status: 'Active' },
    { id: 'EMP-40', name: 'Ewanchia Collins', role: '3rd-Party Operator/D8K Collins', status: 'Active' },
    { id: 'EMP-50', name: 'Godstime Hussein', role: 'Supervisor', status: 'Active' },
    { id: 'EMP-51', name: 'Ephraim Okon', role: 'Operator/EMG004', status: 'Active' },
  ],
  operations: [
    { id: 'OPS-1', date: '2026-10-18', equipment: 'EMG-007', siteName: SITE, operatorId: 'EMP-11', hoursWorked: 8 },
    { id: 'OPS-2', date: '2026-10-18', equipment: 'EMG-008', siteName: SITE, operatorId: 'EMP-12', hoursWorked: 8 },
    { id: 'OPS-3', date: '2026-10-18', equipment: 'EMG-006', siteName: SITE, operatorId: 'EMP-20', hoursWorked: 8 },
    { id: 'OPS-4', date: '2026-10-18', equipment: 'D8K Collins', siteName: SITE, operatorId: 'EMP-40', hoursWorked: 8 },
  ],
  distributions: [], fuelCreditCollections: [], fuelCreditPayments: [], fundRequests: [],
  dieselRateAsOf: () => 1900,
  ...extra,
});
const parse = (text, extra) => parseWhatsApp(text, ctx(extra), { today: '2026-10-19' });
const texts = (row) => row.flags.map((f) => f.text).join(' | ');

const report = (o = {}) => `*End of the Day Report*

▪️ Date: ${o.date ?? '19/10/2026'}
▪️ Machine: ${o.machine ?? 'D8H'}
▪️ Status: Active
▪️ Operator: ${o.operator ?? 'Tope'}
▪️ Supervisor: ${o.supervisor ?? 'Christopher'}
▪️ Diesel Supplied:${o.supplied ?? '200 liters'}
▪️ Opening Diesel:${o.opening ?? '200Litres'}
▪️ Time Started ${o.start ?? '8.00 am'}
▪️ Time Stopped:${o.stop ?? '4:00 pm'}
▪️ Hours Worked: ${o.hours ?? '8hrs'}

▪️ Closing Diesel: ${o.closing ?? 'Nill'}

▪️ Hectares Achieve:${o.ha ?? '1.0ha'}

▪️ Block: G 4(first phase)
▪️ Next Day Work:
▪️ Remarks: ${o.remarks ?? 'Active'}
* Cumulative - 21.3`;

// ------------------------------------------------------------- dates and names
test('dates are found in the forms used in the chats; a missing year is this year', () => {
  const t = { today: '2026-10-19' };
  assert.equal(findDate('Date: 19/10/2026', t).iso, '2026-10-19');
  assert.equal(findDate('20/10/26', t).iso, '2026-10-20');
  assert.equal(findDate('as 17th October 2026 @1900', t).iso, '2026-10-17');
  assert.equal(findDate('21th September 2026', t).iso, '2026-09-21');
  assert.equal(findDate('Oct 14, 2026.', t).iso, '2026-10-14');
  assert.equal(findDate('16th Sept ,2026', t).iso, '2026-09-16');
  const noYear = findDate('17 Oct', t);
  assert.equal(noYear.iso, '2026-10-17');
  assert.equal(noYear.assumedYear, true);
  assert.equal(findDate('as 17th October @1900', t).iso, '2026-10-17'); // 1900 is a price, not a year
  assert.equal(findDate('no date here', t), null);
  assert.match(findDate('31/02/2026', t).error, /not a valid date/);
  const day = findDate('Diesel distributed 13th  1500L', t);
  assert.equal(day.iso, '2026-10-13');
  assert.equal(day.dayOnly, true);
  assert.equal(findDate('13th', { today: '2026-10-19', stamp: { y: 2026, m: 9, d: 13 } }).iso, '2026-09-13');
});

test('name spellings from the chats are normalised', () => {
  assert.equal(cleanName('Jassy'), 'Jessie');
  assert.equal(cleanName('Jessy '), 'Jessie');
  assert.equal(cleanName('Jassie'), 'Jessie');
  assert.equal(cleanName("God's time"), 'Godstime');
  assert.equal(cleanName('Godsime'), 'Godstime');
  assert.equal(cleanName('D8H Conlins'), 'Collins');
  assert.equal(cleanName('Engr Oki C.'), 'Oki C.');
});

test('a pasted chat is split on its "[time] Name:" prefixes, in both export formats', () => {
  const m = splitMessages('[10/16, 1:04 AM] Engr Oki C.: first one\n[12:50 am, 11/10/2026] Midejab Manager: second\n[9/16/26, 9:50:55 PM] Gladness: third', '2026-10-19');
  assert.deepEqual(m.map((x) => x.sender), ['Engr Oki C.', 'Midejab Manager', 'Gladness']);
  assert.deepEqual(m[0].stamp, { y: 2026, m: 10, d: 16 }); // month first
  assert.deepEqual(m[1].stamp, { y: 2026, m: 10, d: 11 }); // day first
  assert.deepEqual(m[2].stamp, { y: 2026, m: 9, d: 16 });
  assert.equal(splitMessages('just text').length, 1);
  assert.equal(splitMessages('just text')[0].sender, null);
});

// ------------------------------------------------------------ end-of-day report
test('an end-of-day report becomes an operations row; the machine comes from the operator\'s latest run', () => {
  const r = parse(report());
  assert.equal(r.kind, 'dailyReport');
  assert.equal(r.rows.length, 1);
  const row = r.rows[0];
  assert.equal(row.status, 'ok');
  assert.equal(row.selected, true);
  assert.equal(row.collection, 'operations');
  const rec = row.record;
  assert.equal(rec.date, '2026-10-19');
  assert.equal(rec.equipment, 'EMG-007');
  assert.equal(rec.siteName, SITE);
  assert.equal(rec.operatorId, 'EMP-11');
  assert.equal(rec.supervisorId, 'EMP-1');
  assert.equal(rec.hoursWorked, 8);
  assert.equal(rec.quantity, 1);
  assert.equal(rec.timeResumed, '08:00');
  assert.equal(rec.timeClosed, '16:00');
  assert.equal(rec.dieselSupplied, 200);
  assert.equal(rec.openingDiesel, 200);
  assert.equal(rec.closingDiesel, 0); // "Nill"
  assert.equal(rec.fuelUsed, 200);
  assert.equal(rec.operationType, 'Phase 1');
  assert.equal(rec.blockNumber, 'G 4');
  assert.match(rec.notes, /Cumulative reported: 21.3 ha/);
  assert.match(texts(row), /Machine EMG-007 taken from Adebayo Tope's latest run/);
});

test('operator spellings (Jessy, Conlins) and a stamp prefix are handled; the sender is ignored for reports', () => {
  const r = parse(`[10/18, 9:51 PM] God'stime Benin Driver: ${report({ operator: 'Jessy ', supervisor: 'Christopher/Godstime', closing: '10lits', supplied: '150 liters' })}\n[10/18, 9:52 PM] Engr Oki C.: ${report({ operator: 'Conlins', hours: '6hrs' })}`);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].record.equipment, 'EMG-006');
  assert.equal(r.rows[0].record.closingDiesel, 10);
  assert.equal(r.rows[0].record.supervisorId, 'EMP-1'); // the first name listed
  assert.match(r.rows[0].record.notes, /Supervisors reported: Christopher \/ Godstime/);
  assert.equal(r.rows[1].record.equipment, 'D8K Collins');
  assert.equal(r.rows[1].record.workType, 'Office'); // rented dozer
  assert.equal(r.rows[1].record.hoursWorked, 6);
});

test('"8hrs + 2 Extra hours (1 hour paid)" is read as 10 hrs and flagged for a look', () => {
  for (const hours of ['8hrs + 2 Extra hours (1 hour paid)', '8hrs  2 Extra hours (1 hour paid)', '8hrs + 2 hours (1 hour paid)']) {
    const row = parse(report({ hours })).rows[0];
    assert.equal(row.record.hoursWorked, 10);
    assert.equal(row.status, 'check');
    assert.equal(row.selected, false);
    assert.match(texts(row), /read as 10 hrs/);
  }
});

test('reports in the decorated style (*Label:* with emoji bullets) are read', () => {
  const t = `*END OF DAY REPORT – LAND CLEARING (Kangidi)*
*Date:* 19/10/2026

✍️ *Machine:* D8H
✍️ *Status:* Active
✍️ *Operator:* Joshua
✍️ *Supervisor:* Godstime
✍️ *Diesel Supplied (today):* 210L
✍️ *Opening Diesel:* 495L
✍️ *Closing Diesel:*295L
✍️ *Time Start:* 8:50am
✍️ *Time Stop:* 4:55 pm
✍️ *Hours Worked:* 8 hours
✍️ *Hectares Achieved* 1.8ha (Stacking)
✍️ *Next Work Day:* 19/10/26
✍️ *Remarks:*
✍️ Cumulative: 91.9Ha`;
  const row = parse(t).rows[0];
  assert.equal(row.record.equipment, 'EMG-008'); // the operator who ran, not the other "Joshua"
  assert.equal(row.record.operatorId, 'EMP-12');
  assert.equal(row.record.operationType, 'Stacking');
  assert.equal(row.record.openingDiesel, 495);
  assert.equal(row.record.timeClosed, '16:55');
  assert.equal(row.record.supervisorId, 'EMP-50');
});

test('reports without the header line are still found, and several in a row stay separate', () => {
  const noHeader = (o) => report(o).split('\n').slice(2).join('\n');
  const r = parse(`${noHeader({ operator: 'Tope' })}\n${noHeader({ operator: 'Joshua' })}`);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map((x) => x.record.equipment), ['EMG-007', 'EMG-008']);
});

test('an unknown operator blocks the row and is listed as unmatched, never guessed', () => {
  const r = parse(report({ operator: 'Zebedee' }));
  assert.equal(r.rows[0].status, 'blocked');
  assert.equal(r.rows[0].record, null);
  assert.equal(r.rows[0].selected, false);
  assert.equal(r.unmatched[0].kind, 'operator');
  assert.equal(r.unmatched[0].text, 'Zebedee');
  assert.equal(r.unmatched[0].row, 1);
});

test('with no recorded run the machine comes from the staff role, else the row cannot be placed', () => {
  const other = [{ id: 'X', date: '2026-10-01', equipment: 'EMG-004', siteName: SITE, operatorId: 'EMP-99' }]; // someone else ran it
  const byRole = parse(report({ operator: 'Ephraim', machine: 'D8H' }), { operations: other });
  assert.equal(byRole.rows[0].record.equipment, 'EMG-004');
  assert.match(texts(byRole.rows[0]), /from the staff role/);
  const r = parse(report({ operator: 'Godstime', machine: 'D8H' }), { operations: [] });
  assert.equal(r.rows[0].status, 'blocked');
  assert.ok(r.unmatched.some((u) => u.kind === 'machine'));
  const withCode = parse(report({ operator: 'Godstime', machine: 'EMG-004' }), { operations: [{ id: 'X', date: '2026-10-01', equipment: 'EMG-004', siteName: SITE }] });
  assert.equal(withCode.rows[0].record.equipment, 'EMG-004'); // a machine code on the report is trusted
});

test('a report with no date, a future date or an unreadable number is blocked, not invented', () => {
  assert.match(texts(parse(report({ date: '' })).rows[0]), /No date/);
  assert.match(texts(parse(report({ date: '25/10/2026' })).rows[0]), /in the future/);
  assert.equal(parse(report({ date: '25/10/2026' })).rows[0].status, 'blocked');
  assert.equal(parse(report({ hours: '' })).rows[0].status, 'blocked');
  assert.equal(parse(report({ ha: 'abc' })).rows[0].status, 'blocked');
  assert.match(texts(parse(report({ start: 'morning' })).rows[0]), /not a time/);
});

test('a date without a year uses this year, with a note', () => {
  const row = parse(report({ date: '19/10' })).rows[0];
  assert.equal(row.record.date, '2026-10-19');
  assert.match(texts(row), /No year in the date; 2026 used/);
});

test('a report already in the ERP is marked exists and cannot be saved again', () => {
  const r = parse(report(), { operations: [...ctx().operations, { id: 'OPS-9', date: '2026-10-19', equipment: 'EMG-007', siteName: SITE }] });
  assert.equal(r.rows[0].status, 'exists');
  assert.equal(r.rows[0].selected, false);
  assert.equal(r.rows[0].record, null);
  assert.deepEqual(r.rows[0].existing, ['OPS-9']);
  // the same report pasted twice is only offered once
  const twice = parse(`${report()}\n${report()}`);
  assert.deepEqual(twice.rows.map((x) => x.status), ['ok', 'exists']);
});

test('planner warnings (very long day, closing above opening plus supplied) make the row "check"', () => {
  assert.equal(parse(report({ hours: '14hrs' })).rows[0].status, 'check');
  const row = parse(report({ closing: '900L' })).rows[0];
  assert.equal(row.status, 'check');
  assert.match(texts(row), /Closing diesel \(900 L\) is more than/);
});

// ------------------------------------------------------------ diesel distribution
const dist = `[10/19, 10:17 PM] Engr Oki C.: Diesel Supply 570

Diesel distributed against tomorrow work 18/10/26

* Tope - 150L
• Joshua - 210L
- Jessy - 210

Total supply - 570L
leftover -230L

Total 800L`;

test('a diesel list becomes one row per dozer on the date stated, operators mapped through their latest run', () => {
  const r = parse(dist);
  assert.equal(r.kind, 'dieselDistribution');
  assert.deepEqual(r.rows.map((x) => [x.record.equipment, x.record.litres, x.record.date, x.record.project]), [
    ['EMG-007', 150, '2026-10-18', SITE], ['EMG-008', 210, '2026-10-18', SITE], ['EMG-006', 210, '2026-10-18', SITE],
  ]);
  assert.ok(r.rows.every((x) => x.status === 'ok' && x.collection === 'dieselSiteDistributions'));
  assert.ok(r.warnings.some((w) => /Leftover of 230 L/.test(w)));
});

test('the date of the supply is the date stated, so a list for tomorrow is blocked until that day', () => {
  const r = parse(dist.replace('18/10/26', '20/10/26'));
  assert.ok(r.rows.every((x) => x.status === 'blocked' && /in the future/.test(texts(x))));
  assert.match(r.rows[0].title, /^2026-10-20/);
});

test('bullets, units and separators vary: "Collins - 180", "Idowu - 90", "Tope 60 L", "D8H Conlins -163L litres"', () => {
  const r = parse(`Diesel distributed 17/10/26

* Collins - 180
▪️ D8H Conlins -163L litres
* Tope 60 L
• EMG-008 - 100ltrs
-Jassy – 50 liters
*

Total 553L`, {});
  assert.deepEqual(r.rows.map((x) => x.title), ['2026-10-17 · D8K Collins · 180 L', '2026-10-17 · D8K Collins · 163 L', '2026-10-17 · EMG-007 · 60 L', '2026-10-17 · EMG-008 · 100 L', '2026-10-17 · EMG-006 · 50 L']);
  // the second Collins line for the same dozer and day is not saved twice
  assert.equal(r.rows[1].status, 'exists');
  assert.match(texts(r.rows[1]), /Listed twice in this paste/);
});

test('a day number only ("13th") is read in the month of the message, with a check flag', () => {
  const r = parse('[10/13, 10:46 PM] Engr Oki C.: Diesel distributed 13th  1500L\n\n* Tope - 200L\n\nTotal 200L');
  assert.equal(r.rows[0].record.date, '2026-10-13');
  assert.equal(r.rows[0].status, 'check');
  assert.match(texts(r.rows[0]), /Only a day number/);
  const noDate = parse('Diesel distributed\n* Tope - 200L\nTotal 200L');
  assert.equal(noDate.rows[0].status, 'blocked');
  assert.match(texts(noDate.rows[0]), /No date/);
});

test('an unmatched name is reported and its row blocked; the other rows are unaffected', () => {
  const r = parse('Diesel distributed 17/10/26\n* Tope - 100L\n* Zebedee - 50L\nTotal 150L');
  assert.deepEqual(r.rows.map((x) => x.status), ['ok', 'blocked']);
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.unmatched[0].text, 'Zebedee');
  assert.equal(r.unmatched[0].row, 2);
});

test('a list that does not add up to the stated total is flagged on every row', () => {
  const r = parse('Diesel distributed 17/10/26\n* Tope - 100L\n* Joshua - 50L\nTotal supply - 200L');
  assert.ok(r.rows.every((x) => x.status === 'check' && /adds up to 150 L but the message says total supply 200 L/.test(texts(x))));
  assert.ok(r.warnings.some((w) => /150 L/.test(w)));
});

test('diesel drilled from one machine into another gives a positive row and a negative donor row', () => {
  const r = parse('Diesel distributed 17/10/26\n* Joshua - 165L( 60L drilled from Ephraim machine) in\n* Tope - 150L\nTotal supply - 315L');
  assert.equal(r.rows.length, 3);
  assert.deepEqual([r.rows[0].record.equipment, r.rows[0].record.litres], ['EMG-008', 165]);
  assert.match(r.rows[0].record.notes, /60 L drilled from Ephraim/);
  assert.deepEqual([r.rows[1].record.equipment, r.rows[1].record.litres], ['EMG-004', -60]);
  assert.match(r.rows[1].record.notes, /into EMG-008/);
  assert.equal(r.rows[1].status, 'ok');
  assert.equal(r.rows[2].record.litres, 150);
});

test('a donor that cannot be matched gives no negative row and a check flag, with the donor listed as unmatched', () => {
  const r = parse('Diesel distributed 17/10/26\n* Joshua - 165L (60L drilled from chizon machine)\nTotal supply - 165L');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, 'check');
  assert.match(texts(r.rows[0]), /no negative row was made/);
  assert.equal(r.unmatched[0].text, 'chizon');
});

test('a dozer already in the ERP for that day is not added again', () => {
  const r = parse('Diesel distributed 17/10/26\n* Tope - 100L\nTotal 100L', { distributions: [{ id: 'DSD-5', date: '2026-10-17', equipment: 'EMG-007', project: SITE, litres: 100 }] });
  assert.equal(r.rows[0].status, 'exists');
  assert.deepEqual(r.rows[0].existing, ['DSD-5']);
});

// ----------------------------------------------------------------- fund requests
const request = (o = {}) => `[10/17, 7:26 AM] ${o.sender ?? 'Engr Oki C.'}: *Request Submission – REX Forestry Project*

▪️ Date: ${o.date ?? '17/10/2026'}
▪️ Description: ${o.description ?? 'Hiring bike and Diesel transportation'}

16/10/26
Bike - 15,000
24- kegs x 24 = #36,000

17/10/26
Bike -  15,000
34kegs x 1500 #51,000

----------------------------------
▪️ Total Amount: ${o.total ?? '#117,000'}
▪️ Account Details: Test Payee 0123456789
Opay

Thank you.`;

test('a fund request becomes a Pending request with its items, account details and sender', () => {
  const r = parse(request());
  assert.equal(r.kind, 'fundRequest');
  const row = r.rows[0];
  assert.equal(row.collection, 'fundRequests');
  assert.equal(row.status, 'ok');
  const rec = row.record;
  assert.equal(rec.status, 'Pending');
  assert.equal(rec.date, '2026-10-17');
  assert.equal(rec.description, 'Hiring bike and Diesel transportation');
  assert.equal(rec.submittedBy, 'EMP-1');
  assert.equal(rec.project, SITE); // "REX Forestry Project" fits two sites; the one with the latest reports
  assert.deepEqual(rec.items.map((i) => [i.description, i.amount]), [['Bike (16/10/26)', 15000], ['24- kegs x 24 (16/10/26)', 36000], ['Bike (17/10/26)', 15000], ['34kegs x 1500 (17/10/26)', 51000]]);
  assert.deepEqual([rec.items[0].accountName, rec.items[0].accountNumber, rec.items[0].bankName], ['Test Payee', '0123456789', 'OPay']);
  assert.ok(!JSON.stringify(rec).includes('Approved'));
});

test('subtotal lines are not counted as items, and an amount-only line uses the description', () => {
  const t = `*Request Submission – REX Forestry Project*
Date: 18/10/2026
Description: bike repair
Back hub for bike 005-₦15,000
Service oil:-₦7,000
------------------------
Subtotal=₦22,000
----------------------
Starting coil for bike 006-₦ 12,000
-----------------------
Subtotal=₦12,000
Total amount ₦34,000
Account Details:0123456780 opay Test Payee
Thank you.
*Request Submission – REX Forestry Project*
Date: 18/10/2026
Description: allowance for training ( Dickson )
#15,000
Total Amount: #15,000
Thank you.`;
  const r = parse(t);
  assert.deepEqual(r.rows[0].record.items.map((i) => i.amount), [15000, 7000, 12000]);
  assert.equal(r.rows[0].status, 'ok');
  assert.deepEqual(r.rows[1].record.items.map((i) => [i.description, i.amount]), [['allowance for training ( Dickson )', 15000]]);
});

test('lines that do not add up to the stated total are flagged (the bolts request)', () => {
  const row = parse(request({ total: '#55,000' })).rows[0];
  assert.equal(row.status, 'check');
  assert.equal(row.selected, false);
  assert.match(texts(row), /add up to ₦117,000 but the message total is ₦55,000/);
});

test('a request already in the ERP (same description and total, within 14 days) is flagged as a duplicate', () => {
  const existing = [{ id: 'FR-90', date: '2026-10-16', project: SITE, description: 'hiring bike and diesel transportation', status: 'Pending', items: [{ amount: 117000 }] }];
  const row = parse(request(), { fundRequests: existing }).rows[0];
  assert.equal(row.status, 'check');
  assert.deepEqual(row.existing, ['FR-90']);
  assert.match(texts(row), /Possible duplicate of FR-90/);
  // the same request a month earlier is only a note
  const old = parse(request(), { fundRequests: [{ ...existing[0], date: '2026-08-01' }] }).rows[0];
  assert.equal(old.status, 'ok');
  assert.match(texts(old), /Same description and amount earlier: FR-90/);
});

test('the same request sent twice in one paste is flagged the second time', () => {
  const r = parse(`${request()}\n${request()}`);
  assert.deepEqual(r.rows.map((x) => x.status), ['ok', 'check']);
  assert.match(texts(r.rows[1]), /earlier message in this paste/);
});

test('account details: bank typos, names and odd numbers', () => {
  assert.deepEqual(parseAccount('0123456789 abdsalam abeeb first 5'), { accountName: 'Abdsalam Abeeb', accountNumber: '0123456789', bankName: 'First Bank', oddNumber: false });
  assert.deepEqual(parseAccount('0123456781 0pay Test Payee'), { accountName: 'Test Payee', accountNumber: '0123456781', bankName: 'OPay', oddNumber: false });
  assert.equal(parseAccount('Test Payee 01234567\nUBA').oddNumber, true);
  assert.equal(parseAccount(''), null);
});

test('item amounts: = wins, then a naira mark, then a trailing figure; small counts are not amounts', () => {
  assert.equal(amountIn('1 keg @;1500 x 15 = 22,500').amount, 22500);
  assert.equal(amountIn('34kegs x 1500 #51,000').amount, 51000);
  assert.equal(amountIn('Joshua - 1 hour - 10,000').amount, 10000);
  assert.equal(amountIn('T -far of mechanic to farm -15,000').amount, 15000);
  assert.equal(amountIn('Starting coil for bike 006'), null);
  assert.equal(amountIn('16/10/26'), null);
});

test('an unknown sender leaves Submitted By empty with a check flag; a missing date blocks the request', () => {
  const row = parse(request({ sender: 'Somebody Else' })).rows[0];
  assert.equal(row.record.submittedBy, null);
  assert.equal(row.status, 'check');
  assert.equal(parse(request({ sender: 'Somebody Else' })).unmatched[0].kind, 'person');
  assert.equal(parse(request({ date: '' })).rows[0].status, 'blocked');
});

// -------------------------------------------------------- station analysis
const station = (o = {}) => `[10/19, 4:31 AM] Midejab Manager: Grands Total/Analysis as ${o.date ?? '18th October 2026'} @1900

Collected today
Ago=${o.ago ?? '955'}@1900
PMS=20L @1,385

G Total Ago=${o.gAgo ?? '12,038'} L @1900

G Total  PMs =${o.gPms ?? '205'} L @ 1,385`;
const erpCollections = [
  { id: 'FCC-1', date: '2026-10-16', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 10000, unitPrice: 1900 },
  { id: 'FCC-2', date: '2026-10-17', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 1083, unitPrice: 1900 },
  { id: 'FCC-3', date: '2026-10-17', station: 'Midejab Ltd', fuelType: 'PMS', litres: 185, unitPrice: 1385 },
];

test('the Midejab analysis gives a diesel and a PMS collection row with the station price', () => {
  const r = parse(station(), { fuelCreditCollections: erpCollections });
  assert.equal(r.kind, 'stationCollection');
  assert.deepEqual(r.rows.map((x) => x.record), [
    { date: '2026-10-18', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 955, unitPrice: 1900, notes: 'Station analysis: grand total 12,038 L.' },
    { date: '2026-10-18', station: 'Midejab Ltd', fuelType: 'PMS', litres: 20, unitPrice: 1385, notes: 'Station analysis: grand total 205 L.' },
  ]);
  assert.ok(r.rows.every((x) => x.status === 'ok' && x.collection === 'fuelCreditCollections'));
});

test('the station grand total is reconciled with the ERP collections; a difference in litres is flagged', () => {
  const ok = parse(station(), { fuelCreditCollections: erpCollections });
  assert.deepEqual(ok.reconciliation.map((x) => [x.fuelType, x.ok, x.difference]), [['Diesel', true, 0], ['PMS', true, 0]]);
  assert.deepEqual(ok.warnings, []);
  const off = parse(station({ gAgo: '12,338' }), { fuelCreditCollections: erpCollections });
  const d = off.reconciliation[0];
  assert.equal(d.ok, false);
  assert.equal(d.difference, 300);
  assert.equal(d.erpTotal, 12038);
  assert.match(d.text, /station is higher/);
  assert.ok(off.warnings.some((w) => /Difference 300 L/.test(w)));
});

test('the total is also tried from the last payment, because the station restarts its running total after a settlement', () => {
  const rows = [{ id: 'A', date: '2026-10-10', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 5000, unitPrice: 1900 }, ...erpCollections];
  const r = reconcileStation({ station: 'Midejab Ltd', fuelType: 'Diesel', date: '2026-10-18', messageTotal: 12038, collectedToday: 955 },
    { fuelCreditCollections: rows, fuelCreditPayments: [{ id: 'P', date: '2026-10-12', station: 'Midejab Ltd', amount: 1 }] });
  assert.equal(r.ok, true);
  assert.match(r.basis, /after the 2026-10-12 payment/);
});

test('a collection already saved for the day is "exists"; one saved with different litres is flagged', () => {
  const saved = [...erpCollections, { id: 'FCC-9', date: '2026-10-18', station: 'Midejab Ltd', fuelType: 'Diesel', litres: 955, unitPrice: 1900 }];
  assert.equal(parse(station(), { fuelCreditCollections: saved }).rows[0].status, 'exists');
  const typo = parse(station(), { fuelCreditCollections: [...erpCollections, { ...saved[3], litres: 1255 }] }).rows[0];
  assert.equal(typo.status, 'check');
  assert.match(texts(typo), /already has 1,255 L \(FCC-9\) for this day; the message says 955 L/);
});

test('a missing price falls back to the grand total line price; a mention of a sale is flagged for splitting', () => {
  const t = `Grands Total/Analysis as 17th October 2026 @1900
Collected today
Ago=1,018L
G Total Ago= 11,083 L @1900
1018 litres - 900 litre = what was sold`;
  const row = parse(t, { fuelCreditCollections: erpCollections }).rows[0];
  assert.equal(row.record.unitPrice, 1900);
  assert.equal(row.status, 'check');
  assert.match(texts(row), /mentions a sale/);
});

// ---------------------------------------------------------- mixed and unknown
test('several message types in one paste are all read, and chatter is reported as ignored', () => {
  const r = parse(`${report()}\n[10/19, 8:45 PM] DO X: Ok, well done\n${dist}\n${request()}\n${station()}`, { fuelCreditCollections: erpCollections });
  assert.equal(r.kind, 'mixed');
  assert.deepEqual([...new Set(r.rows.map((x) => x.kind))], ['dailyReport', 'dieselDistribution', 'fundRequest', 'stationCollection']);
  assert.ok(r.rows.every((x, i) => x.n === i + 1));
  assert.ok(r.ignored.some((x) => /well done/.test(x.text)));
});

test('text that is not one of the supported messages gives kind "unknown" and no rows', () => {
  const r = parse('Good evening sir, please send the diesel request for tomorrow. Thank you.');
  assert.equal(r.kind, 'unknown');
  assert.deepEqual(r.rows, []);
  assert.ok(r.warnings.length > 0);
  assert.equal(parse('').kind, 'unknown');
  const chatter = parse('Please send the end of day report now');
  assert.equal(chatter.rows.length, 0);
  assert.ok(chatter.ignored.length > 0);
});
