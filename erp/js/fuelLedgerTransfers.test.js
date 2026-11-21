import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingSiteFuelIssues, siteFuelIssues, tankTransferDelta } from './fuelLedger.js';

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

test('drilled fuel changes the donor and recipients without leaving site stock', () => {
  const transfers = [
    { date: '2026-11-19', project: 'Kangidi', equipment: 'Pastor (Osaro)', recipient: 'Saheed (Osaro)', purpose: 'Tank Transfer', litres: 90 },
    { date: '2026-11-19', project: 'Kangidi', equipment: 'Pastor (Osaro)', recipient: 'EMG-004', purpose: 'Tank Transfer', litres: 60 },
  ];
  assert.equal(siteFuelIssues(transfers, []).length, 0);
  assert.equal(tankTransferDelta(transfers, 'Pastor (Osaro)', '2026-11-19'), -150);
  assert.equal(tankTransferDelta(transfers, 'Saheed (Osaro)', '2026-11-19'), 90);
  assert.equal(tankTransferDelta(transfers, 'EMG-004', '2026-11-19'), 60);
});
