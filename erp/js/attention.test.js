import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttention } from './attention.js';

const req = (id, date, status, description, amount) => ({ id, date, status, description, items: [{ amount }] });
const base = (extra = {}) => ({ project: 'P', fundRequests: [], fuelingVouchers: [], dieselStockCounts: [], operations: [], inventory: [], ...extra });
const on = '2026-10-19';

test('requests older than a week are chased, newer ones are not', () => {
  const f = buildAttention(base({ fundRequests: [req('FR-1', '2026-10-05', 'Pending', 'Welding', 1000), req('FR-2', '2026-10-17', 'Pending', 'Bike', 500), req('FR-3', '2026-10-01', 'Approved', 'Rent', 2000), req('FR-4', '2026-10-01', 'Paid', 'Old', 9)] }), { date: on, lastBackupAt: on });
  const t = f.find((x) => /fund request/.test(x.text)).text;
  assert.match(t, /2 fund request\(s\) have waited more than 7 days \(₦3,000\)/);
  assert.match(t, /1 not yet decided, 1 approved but unpaid/);
  assert.match(t, /oldest is FR-3/);
});

test('a resent request is flagged as a possible duplicate', () => {
  const f = buildAttention(base({ fundRequests: [req('FR-78', '2026-10-11', 'Pending', 'Oil for Tope', 100000), req('FR-112', '2026-10-17', 'Pending', 'Oil for Tope', 100000), req('FR-5', '2026-10-17', 'Pending', 'Different', 100000)] }), { date: on, lastBackupAt: on });
  assert.match(f.find((x) => /duplicate/i.test(x.text)).text, /FR-78 and FR-112/);
});

test('vouchers waiting for approval, an old stock count and a missing report are flagged', () => {
  const ctx = base({
    fuelingVouchers: [{ id: 'FV-28', date: '2026-10-17', status: 'Pending Approval' }, { id: 'FV-1', date: '2026-10-19', status: 'Pending Approval' }, { id: 'FV-2', date: '2026-10-10', status: 'Approved' }],
    dieselStockCounts: [{ date: '2026-10-14', countedLitres: 10 }],
    operations: [{ siteName: 'P', date: '2026-10-17', hoursWorked: 8 }],
  });
  const f = buildAttention(ctx, { date: on, lastBackupAt: on });
  assert.match(f.find((x) => /voucher/.test(x.text)).text, /1 fueling voucher\(s\).*FV-28/);
  assert.match(f.find((x) => /stock count/.test(x.text)).text, /5 days ago/);
  assert.match(f.find((x) => /end-of-day report/.test(x.text)).text, /18 Oct 2026/);
});

test('backup reminder: never, stale, recent', () => {
  assert.match(buildAttention(base(), { date: on, lastBackupAt: null })[0].text, /never been backed up/);
  assert.match(buildAttention(base(), { date: on, lastBackupAt: '2026-10-05T10:00:00Z' })[0].text, /14 days ago/);
  assert.equal(buildAttention(base(), { date: on, lastBackupAt: '2026-10-15T10:00:00Z' }).length, 0);
  assert.equal(buildAttention(base(), { date: on, lastBackupAt: undefined }).length, 0, 'no backup information supplied: say nothing');
});
