// Matches the terminology actually used on the field (daily logs, milestone
// trackers) rather than the placeholder names this app originally shipped
// with. "Tree Felling", "Direct Clearing", "Phase 1", "Phase 2", and
// "Corrections" never appear in any real record — see LEGACY_OPERATION_TYPE_UNITS
// below for why they're still recognized even though they're gone from this list.
export const OPERATION_TYPES = [
  { value: 'Felling', unit: 'Ha' },
  { value: 'Stacking', unit: 'Ha' },
  { value: 'Direct Stacking', unit: 'Ha' },
  { value: 'Root Picking', unit: 'Ha' },
  { value: 'Zero Bonding', unit: 'Ha' },
  { value: 'Nursery', unit: 'Ha' },
  { value: 'Road', unit: 'KM' },
  { value: 'Trekking', unit: 'hrs' },
];

// Old operation-type names this app used to offer, kept resolvable (unit
// only, not relabeled) so any report already saved under one of these
// still counts toward Ha totals and Profitability instead of silently
// dropping out after the rename above. Never shown in the dropdown.
const LEGACY_OPERATION_TYPE_UNITS = {
  'Tree Felling': 'Ha',
  'Direct Clearing': 'Ha',
  'Phase 1': 'Ha',
  'Phase 2': 'Ha',
  Corrections: 'Ha',
};

export function unitForOperationType(type) {
  return OPERATION_TYPES.find((t) => t.value === type)?.unit || LEGACY_OPERATION_TYPE_UNITS[type] || '';
}

export function isHaOperationType(type) {
  return unitForOperationType(type) === 'Ha';
}

// Fixed hex colors (not the themed --series-N chart vars) so each
// operation type reads consistently on the map regardless of light/dark
// mode and works as a plain SVG path color in Leaflet. Legacy names keep
// their original color too, for the same backward-compatibility reason.
const OPERATION_TYPE_COLORS = {
  Felling: '#2a78d6',
  Stacking: '#1baf7a',
  'Direct Stacking': '#eda100',
  'Root Picking': '#4a3aa7',
  'Zero Bonding': '#e34948',
  Nursery: '#2fa84f',
  Road: '#3d3d3d',
  Trekking: '#e87ba4',
  'Tree Felling': '#2a78d6',
  'Direct Clearing': '#eda100',
  'Phase 1': '#4a3aa7',
  'Phase 2': '#8e44ad',
  Corrections: '#eb6834',
};

export function colorForOperationType(type) {
  return OPERATION_TYPE_COLORS[type] || '#607d8b';
}

export const FUEL_STATIONS = [
  'Midejab Ltd',
  'SK Gold',
  'Asolak Ltd',
  'Iloamachi Ltd',
  'Total Enugu',
  'Akuebuolo Ltd',
  'Kabir Ltd',
];

// Fuel types tracked on credit from filling stations — see Fuel Credit Tracking.
export const FUEL_TYPES = ['Diesel', 'PMS'];

export const LEAVE_TYPES = [
  'Annual',
  'Sick',
  'Casual',
  'Compassionate',
  'Unpaid',
];

// Shared "cost head" categories — used by Expenses, Fund Requests (once
// approved/disbursed), and manual entries so all three group together
// consistently on the Income & Expenditure report.
export const EXPENSE_CATEGORIES = [
  'Fuel',
  'Maintenance',
  'Payroll',
  'Logistics',
  'Administration',
  'Equipment Rental',
  'Mobilization & Demobilization',
  'Other',
];

// Fleet ownership categories — see Fleet Management and Dozer Economics.
// Company: company owns + maintains it, pays operators per day.
// Partnership: a 2nd-party owner; company pays a day-rate rental, retains
// a flat management fee, and still pays the operators directly.
// Rented: a 3rd-party owner who pays their own operators; company just
// pays a day rate.
export const OWNERSHIP_CATEGORIES = ['Company', 'Partnership', 'Rented'];

// Default overtime rate for day-rate dozer operators (₦/hr after the first
// 8 hours in a day) — editable per payroll line for exceptions.
export const DOZER_OVERTIME_RATE_DEFAULT = 10000;

export const INCOME_CATEGORIES = [
  'Invoicing / Sales',
  'Loan / Advance',
  'Equity Injection',
  'Interest Income',
  'Other Income',
];

// Soft, UI-level access tiers only — not real security. See session.js.
export const ACCESS_TIERS = ['Admin', 'Accounts', 'Supervisor', 'Staff'];

export const ACCESS_TIER_LABELS = {
  Admin: 'Admin / Management — full access',
  Accounts: 'Office / Accounts — Sales, Purchasing, Accounting, Profitability',
  Supervisor: 'Site Supervisor — Operations, Fleet, Inventory for their project',
  Staff: 'General Staff — Leave, Attendance, Fund Requests only',
};
