import test from 'node:test';
import assert from 'node:assert/strict';
import { itemsToLines, parseWorkOrder } from './workOrderParse.js';

// Lines as read from the three Rex work orders sent on 24 Sep and 8 Oct 2026.
const WO1775 = [
  '24/09/2026 18:05:15 Page 1 of 2',
  'Rex Forestry Ltd Order for Work WO Number: 1775',
  'Supplier: Emagrims Company Ltd Authorisation:',
  'Period: September 2026 Johannes Mokwena (Approved)',
  'Plantation: Block OA1 (1224822795) Blessing Mutambukye (Approved)',
  'Issued by: Kingsely Anunobi',
  'Status: Authorised',
  'Compt Species Category Effa Budget Year To Date',
  'E121 -Bush Clearing Dozer',
  'A72 GMEL Default 15.53 3.22 ha 845,000.00 2 720 900.00 0.00',
  'G01 Eucp Default 30.00 15.48 ha 845,000.00 13 080 600.00 0.00',
  'G02 GMEL Default 20.00 12.56 ha 845,000.00 10 613 200.00 0.00',
  'Total Act: E121 - Bush Clearing Dozer 65.53 31.26 26,414,700.00 0.00 0.00',
  'Total WO: 1775 65.53 31.26 26,414,700.00 0.00 0.00',
];
const WO1768 = [
  'Rex Forestry Ltd Order for Work WO Number: 1768',
  'Period: September 2026', 'Plantation: Block OA6 (1224822795)',
  'E124 -Bush Clearing Dozer (Phase 2)',
  'F18 Aman Default 20.00 1.30 ha 455,000.00 591 500.00 0.00',
  'F19 GMEL Default 16.00 1.29 ha 455,000.00 586 950.00 0.00',
  'F21 Eucp Default 20.00 5.89 ha 455,000.00 2 679 950.00 0.00',
  'F22 GMEL Default 20.00 4.80 ha 455,000.00 2 184 000.00 0.00',
  'F24 GMEL Default 15.00 3.14 ha 455,000.00 1 428 700.00 0.00',
  'F38 Eucp Default 15.00 1.58 ha 455,000.00 718 900.00 0.00',
  'F39 Eucp Default 15.00 2.73 ha 455,000.00 1 242 150.00 0.00',
  'Total Act: E124 - Bush Clearing Dozer (P 121.00 20.73 9,432,150.00 0.00 0.00',
  'Total WO: 1768 121.00 20.73 9,432,150.00 0.00 0.00',
];
const WO1795 = [
  '08/10/2026 19:16:56 Page 1 of 2', 'Rex Forestry Ltd Order for Work WO Number: 1795',
  'Period: October 2026', 'Plantation: Block OA1 (1224822795)', 'E121 -Bush Clearing Dozer',
  'G01 Eucp Default 30.00 13.27 ha 845,000.00 11 213 150.00 0.00',
  'G02 GMEL Default 20.00 10.13 ha 845,000.00 8 559 850.00 0.00',
  'Total Act: E121 - Bush Clearing Dozer 50.00 23.40 19,773,000.00 0.00 0.00',
  'Total WO: 1795 50.00 23.40 19,773,000.00 0.00 0.00',
];

test('Phase 1 work order 1775', () => {
  const r = parseWorkOrder(WO1775);
  assert.equal(r.wo, '1775');
  assert.equal(r.period, 'September 2026');
  assert.equal(r.block, 'OA1');
  assert.equal(r.supplier, 'Emagrims Company Ltd');
  assert.equal(r.phase1, 31.26);
  assert.equal(r.phase2, 0);
  assert.equal(r.compartments.length, 3);
  assert.deepEqual(r.compartments[0], { compt: 'A72', species: 'GMEL', effa: 15.53, ha: 3.22, rate: 845000, amount: 2720900, phase: 'Phase 1' });
  assert.deepEqual(r.messages, []);
  assert.ok(r.ok);
});

test('Phase 2 work order 1768 (E124)', () => {
  const r = parseWorkOrder(WO1768);
  assert.equal(r.wo, '1768');
  assert.equal(r.block, 'OA6');
  assert.equal(r.phase1, 0);
  assert.equal(r.phase2, 20.73);
  assert.equal(r.compartments.length, 7);
  assert.ok(r.ok);
});

test('work order 1795 (October, Phase 1)', () => {
  const r = parseWorkOrder(WO1795);
  assert.equal(r.phase1, 23.4);
  assert.equal(r.printedOn, '2026-10-08');
  assert.ok(r.ok);
});

test('a misread is reported rather than trusted', () => {
  const broken = WO1775.filter((l) => !l.startsWith('G02'));
  const r = parseWorkOrder(broken);
  assert.equal(r.ok, false);
  assert.match(r.messages.join(' '), /differ from the Total WO/);
  assert.equal(parseWorkOrder(['nothing useful here']).ok, false);
});

test('pdf text items become rows ordered by position', () => {
  const it = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
  const lines = itemsToLines([it('1775', 300, 700), it('WO Number:', 200, 700), it('Order for Work', 50, 701), it('Supplier:', 20, 650), it('Emagrims Company Ltd', 120, 650)]);
  assert.deepEqual(lines, ['Order for Work WO Number: 1775', 'Supplier: Emagrims Company Ltd']);
});
