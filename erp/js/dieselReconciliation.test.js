import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSiteDay, reconcileDozerDay } from './dieselReconciliation.js';

test('site fuel reconciles deliveries, issues and a physical count without double-counting a report', () => {
  const args = {
    project: 'Kangidi', date: '2026-11-14',
    receipts: [{ project: 'Kangidi', date: '2026-11-14', litres: 300 }],
    distributions: [{ project: 'Kangidi', equipment: 'EMG-005', date: '2026-11-14', litres: 200 }],
    operations: [{ siteName: 'Kangidi', equipment: 'EMG-005', date: '2026-11-14', dieselSupplied: 200 }],
    counts: [{ project: 'Kangidi', date: '2026-11-13', countedLitres: 50 }, { project: 'Kangidi', date: '2026-11-14', countedLitres: 150 }],
  };
  const actual = reconcileSiteDay(args);
  assert.equal(actual.distributed, 200);
  assert.equal(actual.expected, 150);
  assert.equal(actual.variance, 0);
  assert.equal(actual.status, 'Reconciled');
  assert.equal(reconcileSiteDay({ ...args, counts: args.counts.slice(0, 1) }).status, 'Physical count needed');
});

test('shortage is flagged only after comparison with a physical count', () => {
  const result = reconcileSiteDay({ project: 'Kangidi', date: '2026-11-14',
    receipts: [{ project: 'Kangidi', date: '2026-11-14', litres: 100 }],
    distributions: [], operations: [], counts: [
      { project: 'Kangidi', date: '2026-11-13', countedLitres: 20 },
      { project: 'Kangidi', date: '2026-11-14', countedLitres: 100 },
    ] });
  assert.equal(result.variance, -20);
  assert.equal(result.status, 'Shortage — investigate');
});

test('dozer issued without a daily report is flagged for follow-up', () => {
  const rows = reconcileDozerDay({ project: 'Kangidi', date: '2026-11-14',
    distributions: [{ project: 'Kangidi', date: '2026-11-14', equipment: 'EMG-005', litres: 50 }],
    operations: [] });
  assert.equal(rows[0].status, 'Daily report needed');
});

