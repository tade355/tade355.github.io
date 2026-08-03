export const OPERATION_TYPES = [
  { value: 'Tree Felling', unit: 'Ha' },
  { value: 'Stacking', unit: 'Ha' },
  { value: 'Direct Clearing', unit: 'Ha' },
  { value: 'Phase 1', unit: 'Ha' },
  { value: 'Phase 2', unit: 'Ha' },
  { value: 'Zero Bonding', unit: 'Ha' },
  { value: 'Corrections', unit: 'Ha' },
  { value: 'Road', unit: 'KM' },
  { value: 'Trekking', unit: 'hrs' },
];

export function unitForOperationType(type) {
  return OPERATION_TYPES.find((t) => t.value === type)?.unit || '';
}

// Fixed hex colors (not the themed --series-N chart vars) so each
// operation type reads consistently on the map regardless of light/dark
// mode and works as a plain SVG path color in Leaflet.
const OPERATION_TYPE_COLORS = {
  'Tree Felling': '#2a78d6',
  Stacking: '#1baf7a',
  'Direct Clearing': '#eda100',
  'Phase 1': '#4a3aa7',
  'Phase 2': '#8e44ad',
  'Zero Bonding': '#e34948',
  Corrections: '#eb6834',
  Road: '#3d3d3d',
  Trekking: '#e87ba4',
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
