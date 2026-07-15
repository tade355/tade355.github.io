export const OPERATION_TYPES = [
  { value: 'Tree Felling', unit: 'Ha' },
  { value: 'Stacking', unit: 'Ha' },
  { value: 'Direct Clearing', unit: 'Ha' },
  { value: 'Zero Bonding', unit: 'Ha' },
  { value: 'Road', unit: 'KM' },
  { value: 'Trekking', unit: 'hrs' },
];

export function unitForOperationType(type) {
  return OPERATION_TYPES.find((t) => t.value === type)?.unit || '';
}

export const FUEL_STATIONS = [
  'Midejab Ltd',
  'SK Gold',
  'Asolak Ltd',
  'Iloamachi Ltd',
];

export const LEAVE_TYPES = [
  'Annual',
  'Sick',
  'Casual',
  'Compassionate',
  'Unpaid',
];

// Soft, UI-level access tiers only — not real security. See session.js.
export const ACCESS_TIERS = ['Admin', 'Accounts', 'Supervisor', 'Staff'];

export const ACCESS_TIER_LABELS = {
  Admin: 'Admin / Management — full access',
  Accounts: 'Office / Accounts — Sales, Purchasing, Accounting, Profitability',
  Supervisor: 'Site Supervisor — Operations, Fleet, Inventory for their project',
  Staff: 'General Staff — Leave, Attendance, Fund Requests only',
};
