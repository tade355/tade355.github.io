import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency, formatDate, monthKey, monthLabel, formatMonthLong,
  invoiceTotal, poTotal, statusPillClass, dateInRange,
} from './utils.js';

test('formatCurrency prefixes the Naira sign and groups thousands', () => {
  assert.equal(formatCurrency(1234567), '₦1,234,567');
  assert.equal(formatCurrency(0), '₦0');
});

test('formatCurrency rounds to whole Naira and treats non-numeric input as zero', () => {
  assert.equal(formatCurrency(1234.7), '₦1,235');
  assert.equal(formatCurrency(undefined), '₦0');
  assert.equal(formatCurrency(null), '₦0');
  assert.equal(formatCurrency('not a number'), '₦0');
});

test('formatCurrency handles negative amounts', () => {
  assert.equal(formatCurrency(-500), '₦-500');
});

test('formatDate renders a valid ISO date, and handles blank/invalid input without throwing', () => {
  assert.equal(formatDate('2026-09-28'), '28 Sept 2026');
  assert.equal(formatDate(''), '—');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('not-a-date'), 'not-a-date');
});

test('monthKey takes the YYYY-MM prefix of an ISO date', () => {
  assert.equal(monthKey('2026-09-28'), '2026-09');
  assert.equal(monthKey('2026-01-05'), '2026-01');
});

test('monthLabel renders the short month name for a YYYY-MM key', () => {
  assert.equal(monthLabel('2026-09'), 'Sept');
  assert.equal(monthLabel('2026-01'), 'Jan');
});

test('formatMonthLong renders the full month name and year, and handles a missing key', () => {
  assert.equal(formatMonthLong('2026-09'), 'September 2026');
  assert.equal(formatMonthLong(''), '—');
  assert.equal(formatMonthLong(null), '—');
});

test('invoiceTotal sums qty x price across every line item', () => {
  const invoice = { items: [{ qty: 2, price: 1000 }, { qty: 3, price: 500 }] };
  assert.equal(invoiceTotal(invoice), 3500);
});

test('invoiceTotal returns 0 for an invoice with no line items', () => {
  assert.equal(invoiceTotal({ items: [] }), 0);
});

test('poTotal sums qty x price across every line item', () => {
  const po = { items: [{ qty: 10, price: 150 }, { qty: 1, price: 2000 }] };
  assert.equal(poTotal(po), 3500);
});

test('statusPillClass maps known statuses to the right tone, and falls back to neutral', () => {
  assert.equal(statusPillClass('Paid'), 'pill-good');
  assert.equal(statusPillClass('Unpaid'), 'pill-critical');
  assert.equal(statusPillClass('Pending'), 'pill-warning');
  assert.equal(statusPillClass('Some Unknown Status'), 'pill-neutral');
  assert.equal(statusPillClass(undefined), 'pill-neutral');
});

test('dateInRange is true when no bounds are given', () => {
  assert.equal(dateInRange('2026-09-28', null, null), true);
  assert.equal(dateInRange('2026-09-28', '', ''), true);
});

test('dateInRange respects a from-only bound', () => {
  assert.equal(dateInRange('2026-09-28', '2026-09-01', null), true);
  assert.equal(dateInRange('2026-08-31', '2026-09-01', null), false);
});

test('dateInRange respects a to-only bound', () => {
  assert.equal(dateInRange('2026-09-28', null, '2026-09-30'), true);
  assert.equal(dateInRange('2026-10-01', null, '2026-09-30'), false);
});

test('dateInRange is inclusive of both boundary dates', () => {
  assert.equal(dateInRange('2026-09-01', '2026-09-01', '2026-09-30'), true);
  assert.equal(dateInRange('2026-09-30', '2026-09-01', '2026-09-30'), true);
});

test('dateInRange returns false for a missing date', () => {
  assert.equal(dateInRange(null, '2026-09-01', '2026-09-30'), false);
  assert.equal(dateInRange('', '2026-09-01', '2026-09-30'), false);
});
