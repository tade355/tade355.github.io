import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingSiteFuelIssues, siteFuelIssues, siteFuelRecoveries, tankTransferDelta } from './fuelLedger.js';
import { siteOnGroundAsOf } from './dieselReconciliation.js';
import { previousDieselClosing } from './dieselReportChain.js';

test('multiple daily reports suggest one handout, and confirmation replaces it', () => {
  const operations = [
    { date: '2026-11-20', siteName: 'Blue Sky', equipment: 'EMG-004', dieselSupplied: 100 },
    { date: '2026-11-20', siteName: 'Blue Sky', equipment: 'EMG-004', dieselSupplied: 50 },
  ];
  assert.equal(pendingSiteFuelIssues([], operations)[0].litres, 150);
  const confirmed = [{ date: '2026-11-20', project: 'Blue Sky', equipment: 'EMG-004', purpose: 'Dozer', litres: 150 }];
  assert.equal(pendingSiteFuelIssues(confirmed, operations).length, 0);
  assert.equal(siteFuelIssues(confirmed, operations).reduce((n, r) => n + r.litres, 0), 150);
});

test('historical direct transfers change tanks without leaving site stock', () => {
  const transfers = [
    { date: '2026-11-19', project: 'Kangidi', equipment: 'Pastor (Osaro)', recipient: 'Saheed (Osaro)', purpose: 'Tank Transfer', litres: 90 },
    { date: '2026-11-19', project: 'Kangidi', equipment: 'Pastor (Osaro)', recipient: 'EMG-004', purpose: 'Tank Transfer', litres: 60 },
  ];
  assert.equal(siteFuelIssues(transfers, []).length, 0);
  assert.equal(tankTransferDelta(transfers, 'Pastor (Osaro)', '2026-11-19'), -150);
  assert.equal(tankTransferDelta(transfers, 'Saheed (Osaro)', '2026-11-19'), 90);
  assert.equal(tankTransferDelta(transfers, 'EMG-004', '2026-11-19'), 60);
});

test('drilling enters ground stock until separate issues to multiple dozers', () => {
  const drill = { date: '2026-11-21', project: 'Kangidi', equipment: 'Pastor (Osaro)', purpose: 'Tank Drill', litres: 150 };
  const saheed = { date: '2026-11-22', project: 'Kangidi', equipment: 'Saheed (Osaro)', purpose: 'Dozer', litres: 90 };
  const ephraim = { date: '2026-11-23', project: 'Kangidi', equipment: 'EMG-004', purpose: 'Dozer', litres: 60 };
  const balance = (date, distributions) => siteOnGroundAsOf({ project: 'Kangidi', date,
    receipts: [], distributions, operations: [], counts: [] }).onGround;
  assert.equal(siteFuelRecoveries([drill])[0].litres, 150);
  assert.equal(siteFuelIssues([drill], []).length, 0);
  assert.equal(balance('2026-11-21', [drill]), 150);
  assert.equal(balance('2026-11-22', [drill, saheed]), 60);
  assert.equal(balance('2026-11-23', [drill, saheed, ephraim]), 0);
  assert.equal(tankTransferDelta([drill], 'Pastor (Osaro)', '2026-11-21'), -150);
  assert.equal(tankTransferDelta([drill], 'Saheed (Osaro)', '2026-11-21'), 0);
  assert.equal(previousDieselClosing([{ date: '2026-11-20', equipment: 'Pastor (Osaro)', closingDiesel: 200 }],
    { date: '2026-11-22', equipment: 'Pastor (Osaro)' }, [drill]), 50);
});
