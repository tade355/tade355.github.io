import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDieselReceipts, isSoldOn } from './dieselSupply.js';

const receipts = [
  { id: 'DR-1', date: '2026-09-03', litres: 1000, unitCost: 1800, station: 'Midejab', project: 'Kajola' },
  { id: 'DR-2', date: '2026-09-04', litres: 450, unitCost: 1900, station: 'Midejab', project: 'Kajola' },
];
const collections = [
  { id: 'FCC-1', date: '2026-09-04', fuelType: 'Diesel', litres: 450, unitPrice: 1900, station: 'Midejab Ltd' }, // same delivery as DR-2
  { id: 'FCC-2', date: '2026-10-14', fuelType: 'Diesel', litres: 2725, unitPrice: 1900, station: 'Midejab Ltd', notes: 'Station collection report' },
  { id: 'FCC-3', date: '2026-10-15', fuelType: 'Diesel', litres: 1950, unitPrice: 1900, station: 'Midejab Ltd', notes: 'Sold to the CEO - not site diesel' },
  { id: 'FCC-4', date: '2026-10-15', fuelType: 'PMS', litres: 20, unitPrice: 1385, station: 'Midejab Ltd' },
  { id: 'FCC-5', date: '2026-10-16', fuelType: 'Diesel', litres: 700, unitPrice: 1900, station: 'Midejab Ltd', notes: 'Supplied today' },
];
const operations = [
  { date: '2026-09-03', siteName: 'Kajola' }, { date: '2026-10-01', siteName: 'Kangidi' }, { date: '2026-10-02', siteName: 'Kangidi' }, { date: '2026-10-03', siteName: 'Kajola' },
];

test('diesel collections after the last saved receipt count as site supply; sold-on diesel and PMS do not', () => {
  const all = mergeDieselReceipts({ receipts, collections, operations });
  assert.equal(all.length, 4); // 2 saved + 2 from Fuel Credit
  const synthetic = all.filter((r) => r.fromFuelCredit);
  assert.deepEqual(synthetic.map((r) => [r.id, r.litres]), [['FCC-2', 2725], ['FCC-5', 700]]);
  assert.equal(synthetic[0].unitCost, 1900);
  assert.equal(synthetic[0].station, 'Midejab Ltd');
  assert.equal(synthetic[0].project, 'Kangidi'); // the site reporting since the cutoff
  assert.equal(all.reduce((s, r) => s + r.litres, 0), 1000 + 450 + 2725 + 700);
});

test('nothing is double counted: collections on or before the last receipt are ignored', () => {
  const all = mergeDieselReceipts({ receipts, collections: [collections[0]], operations });
  assert.equal(all.length, 2);
  assert.equal(mergeDieselReceipts({ receipts, collections: [], operations }), receipts);
});

test('isSoldOn reads the note', () => {
  assert.ok(isSoldOn({ notes: 'Sold to the CEO' }));
  assert.ok(!isSoldOn({ notes: 'Supplied today' }));
  assert.ok(!isSoldOn({}));
});
