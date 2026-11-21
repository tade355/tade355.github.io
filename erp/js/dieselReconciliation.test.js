import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSiteDay, reconcileDozerDay, siteOnGroundAsOf } from './dieselReconciliation.js';

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


test('site stock carries 720 L received, 600 L to a dozer and 20 L other use', () => {
  const args = {
    project: 'Blue Sky', date: '2026-11-14',
    receipts: [{ project: 'Blue Sky', date: '2026-11-13', litres: 720 }],
    distributions: [
      { project: 'Blue Sky', date: '2026-11-14', equipment: 'EMG-007', litres: 600 },
      { project: 'Blue Sky', date: '2026-11-14', purpose: 'Site use', litres: 20 },
    ],
    operations: [], counts: [],
  };
  assert.equal(siteOnGroundAsOf({ ...args, date: '2026-11-13' }).onGround, 720);
  assert.equal(siteOnGroundAsOf(args).onGround, 100);
  assert.equal(reconcileSiteDay(args).onGround, 100);
  const counted = { ...args, counts: [{ project: 'Blue Sky', date: '2026-11-14', countedLitres: 100 }] };
  assert.equal(siteOnGroundAsOf(counted).onGround, 100);
  assert.equal(reconcileSiteDay(counted).variance, 0);
});

test('Blue Sky pre-delivery count carries Midejab supply into the following day', () => {
  const project = 'Blue Sky Project - Ajue-Ore';
  const args = {
    project,
    receipts: [
      { project, date: '2026-11-13', litres: 720, station: 'Midejab Ltd' },
      { project, date: '2026-11-14', litres: 1500, station: 'Midejab Ltd' },
    ],
    distributions: [
      { project, date: '2026-11-14', equipment: 'EMG-007', litres: 600 },
      { project, date: '2026-11-14', purpose: 'Other use', litres: 20 },
      { project, date: '2026-11-15', equipment: 'EMG-007', litres: 200 },
    ],
    operations: [],
    counts: [{ project, date: '2026-11-14', countedLitres: 100 }],
  };
  const day14 = reconcileSiteDay({ ...args, date: '2026-11-14' });
  assert.equal(day14.measured, 100);
  assert.equal(day14.postCountSupply, 1500);
  assert.equal(day14.onGround, 1600);
  assert.equal(day14.variance, 0);
  assert.equal(day14.status, 'Pre-delivery count — closing projected');
  const day15 = reconcileSiteDay({ ...args, date: '2026-11-15' });
  assert.equal(day15.opening, 1600);
  assert.equal(day15.onGround, 1400);
  assert.equal(siteOnGroundAsOf({ ...args, date: '2026-11-15' }).onGround, 1400);
});

test('preliminary zero counts do not erase Blue Sky recorded stock movements', () => {
  const project = 'Blue Sky Project - Ajue-Ore';
  const args = {
    project, date: '2026-11-21',
    receipts: [
      { project, date: '2026-11-14', litres: 1500, station: 'Midejab Ltd' },
      { project, date: '2026-11-20', litres: 1470, station: 'Midejab Ltd' },
      { project, date: '2026-11-20', litres: 579.92, station: 'Midejab Ltd' },
    ],
    distributions: [
      { project, date: '2026-11-15', equipment: 'EMG-007', purpose: 'Dozer', litres: 1400 },
      { project, date: '2026-11-16', equipment: 'EMG-007', purpose: 'Dozer', litres: 170 },
      { project, date: '2026-11-20', equipment: 'EMG-006', purpose: 'Tank Drill', litres: 210 },
      { project, date: '2026-11-20', equipment: 'EMG-004', purpose: 'Dozer', litres: 579.92 },
      { project, date: '2026-11-20', equipment: 'EMG-007', purpose: 'Dozer', litres: 180 },
      { project, date: '2026-11-20', equipment: 'EMG-008', purpose: 'Dozer', litres: 30 },
      { project, date: '2026-11-21', equipment: 'EMG-007', purpose: 'Dozer', litres: 510 },
      { project, date: '2026-11-21', equipment: 'EMG-008', purpose: 'Dozer', litres: 480 },
      { project, date: '2026-11-21', equipment: 'EMG-006', purpose: 'Dozer', litres: 490 },
    ],
    operations: [],
    counts: [
      { project, date: '2026-11-14', countedLitres: 100 },
      { project, date: '2026-11-20', countedLitres: 0, notes: 'NON_CLOSING_COUNT: before movements' },
      { project, date: '2026-11-21', countedLitres: 0, notes: 'NON_CLOSING_COUNT: placeholder' },
    ],
  };
  assert.equal(siteOnGroundAsOf(args).onGround, 20);
  assert.equal(reconcileSiteDay(args).measured, null);
  assert.equal(reconcileSiteDay(args).status, 'Physical count needed');
});
