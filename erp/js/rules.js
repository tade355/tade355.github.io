// The business rules the ERP counts by, in one place. Dates before
// DASHBOARD_BASIS_FROM keep the older Profitability rules and must not move;
// from that date every dashboard, report, planner and Ask answer uses the
// values below. Change a number here and add a rate-history entry or a test;
// do not copy it into another file.

export const DASHBOARD_BASIS_FROM = '2026-10-10';

// Diesel
export const LITRES_PER_HOUR = 25; // diesel counted per hour worked
export const LITRES_PER_HOUR_AFTER_HOURS = 20; // per hour beyond TARGET_HOURS
export const TARGET_HOURS = 8;
export const DIESEL_RESERVE_LITRES = 50;
export const DIESEL_FILL_LITRES = TARGET_HOURS * LITRES_PER_HOUR + DIESEL_RESERVE_LITRES; // 250 L target per working dozer
export const KEG_LITRES = 30;
export const DIESEL_LOGISTICS_PER_LITRE = 50; // naira per litre supplied to Company-owned and Rented dozers

// Output
export const EXPECTED_HA_PER_8HRS = 1.3;
export const IDEAL_START = '07:00';
export const LATE_FLAG_MINUTES = 60; // a start this much past IDEAL_START is flagged

// Operator pay
export const DOZER_OVERTIME_RATE_DEFAULT = 10000; // naira per hour beyond TARGET_HOURS
export const SUNDAY_FLAT_DAY_RATE = 50000;

// Sunday bonus policy for supervisors: dozers working at least the minimum hours -> naira, then a factor for days worked that week.
export const SUNDAY_BONUS_MIN_HOURS = 6;
export const SUNDAY_BONUS_TIERS = [[3, 20000], [2, 10000], [1, 5000]]; // [dozers at minimum hours or more, naira]
export const SUNDAY_BONUS_DAYS = [[5, 1], [3, 0.5]]; // [days worked Monday to Saturday or more, share of the bonus]

// What the dashboards flag as needing attention (attention.js)
export const REQUEST_WAIT_DAYS = 7; // a Pending or Approved request older than this is chased
export const VOUCHER_WAIT_DAYS = 1; // a fueling voucher waiting for approval longer than this is chased
export const STOCK_COUNT_MAX_AGE_DAYS = 2; // diesel on ground is a calculation until Oki counts again
export const BACKUP_MAX_AGE_DAYS = 7;
