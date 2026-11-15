import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDieselBatch } from './dieselBatch.js';
const line = (equipment, litres, selected = true) => ({ equipment, litres, selected });
test('multiple dozers tally to physical litres', () => assert.equal(validateDieselBatch([line('A', 200), line('B', 150)], 350).length, 2));
test('unselected dozers do not affect total', () => assert.equal(validateDieselBatch([line('A', 200), line('B', 100, false)], 200).length, 1));
test('decimal litres tally without floating point drift', () => assert.equal(validateDieselBatch([line('A', 0.1), line('B', 0.2)], 0.3).length, 2));
test('mismatch blocks submission', () => assert.throws(() => validateDieselBatch([line('A', 200)], 250), /match/));
test('empty selection is rejected', () => assert.throws(() => validateDieselBatch([], 250), /Select/));
test('zero negative blank and invalid quantities are rejected', () => { for (const value of [0, -1, '', 'bad', Infinity]) assert.throws(() => validateDieselBatch([line('A', value)], 250)); });
test('duplicate dozer is rejected', () => assert.throws(() => validateDieselBatch([line('A', 100), line('A', 100)], 200), /once/));

