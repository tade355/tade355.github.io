import { formatDate } from './utils.js';

// Centralized date handling, replacing the ad-hoc date math that used to be
// duplicated (and independently bugged) across dashboard.js, profitability.js,
// weeklyReport.js and others. Two rules, strictly separated:
//
// 1. "What is today" is inherently local — todayISOString() reads the
//    viewer's own local calendar date, so a user in a different timezone
//    sees their own today.
// 2. Everything else here treats a 'YYYY-MM-DD' string as a pure calendar
//    date and does arithmetic entirely in UTC space (Date.UTC / getUTCDate /
//    setUTCDate / toISOString), so results never depend on the browser's
//    timezone. Never build a date via `new Date(iso + 'T00:00:00')` and then
//    call .toISOString() on the result (or on a Date derived from it) — that
//    mixes local-time parsing with a UTC read-out, and in any timezone ahead
//    of UTC (e.g. WAT, UTC+1) the result lands one calendar day earlier than
//    intended. That exact bug has shown up twice already (the dashboard's
//    date-nav, and profitability's weekOf()) — new date math belongs here,
//    not reinvented per view.

export function todayISOString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toUTCDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTCDate(d) {
  return d.toISOString().slice(0, 10);
}

// Shift a 'YYYY-MM-DD' string by `n` calendar days (negative to go back).
export function addDays(iso, n) {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTCDate(d);
}

// The `n` calendar days up to and including `anchorISO` (defaults to today),
// oldest first.
export function lastNDayKeys(n, anchorISO = todayISOString()) {
  const anchor = toUTCDate(anchorISO);
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(fromUTCDate(d));
  }
  return keys;
}

// The `n` months up to and including the month of `anchorISO`, as
// 'YYYY-MM' keys, oldest first.
export function lastNMonthKeys(n, anchorISO = todayISOString()) {
  const anchor = toUTCDate(anchorISO);
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    keys.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// { from, to } ISO bounds of a 'YYYY-MM' month key.
export function monthBounds(key) {
  const [y, m] = key.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this one
  return { from: `${key}-01`, to: fromUTCDate(to) };
}

// The Monday of the Monday-start week containing `iso`.
export function mondayOf(iso) {
  const d = toUTCDate(iso);
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return fromUTCDate(d);
}

// Monday-start week containing `iso`, as a stable sort/group key (the
// Monday's date) plus a human-readable "Mon – Sun" label.
export function weekOf(iso) {
  const key = mondayOf(iso);
  const sunday = addDays(key, 6);
  return { key, label: `${formatDate(key)} – ${formatDate(sunday)}` };
}
