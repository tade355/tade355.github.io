import { store } from './store.js';

// Who's logged in is now backed by a real Supabase Auth session (see
// auth.js) — this just caches which employee record that session maps to,
// set once at login/restore and read synchronously everywhere else. Tier
// filtering below is still soft/UI-level (not row-level security), but
// getting into the app at all now requires a real account and password.
let currentEmployeeId = null;

export function setCurrentEmployeeId(id) {
  currentEmployeeId = id;
}

export function getCurrentUserId() {
  return currentEmployeeId;
}

export function getCurrentUser() {
  if (!currentEmployeeId) return null;
  return store.find('employees', currentEmployeeId);
}

export function getCurrentTier() {
  return getCurrentUser()?.accessTier || 'Staff';
}

export function getAssignedProject() {
  return getCurrentUser()?.assignedProject || '';
}

export function canAccess(tiers) {
  if (!tiers || !tiers.length) return true;
  return tiers.includes(getCurrentTier());
}

export function defaultRouteForTier(tier) {
  if (tier === 'Admin' || tier === 'Accounts') return 'dashboard';
  if (tier === 'Supervisor') return 'operations';
  return 'leave';
}

// Restricts rows to the current Supervisor's assigned project (Admin/Accounts see everything).
export function filterByProject(rows, projectKey) {
  const tier = getCurrentTier();
  if (tier === 'Admin' || tier === 'Accounts') return rows;
  const project = getAssignedProject();
  if (!project) return rows;
  return rows.filter((r) => r[projectKey] === project);
}

// Fund requests: Supervisors see their project's requests, Staff see only their own.
export function filterFundRequests(rows) {
  const tier = getCurrentTier();
  if (tier === 'Admin' || tier === 'Accounts') return rows;
  if (tier === 'Supervisor') {
    const project = getAssignedProject();
    return project ? rows.filter((r) => r.project === project) : rows;
  }
  const userId = getCurrentUserId();
  return rows.filter((r) => r.submittedBy === userId);
}

// Leave requests: Supervisors see requests from staff on their assigned project, Staff see only their own.
export function filterLeaveRequests(rows) {
  const tier = getCurrentTier();
  if (tier === 'Admin' || tier === 'Accounts') return rows;
  if (tier === 'Supervisor') {
    const project = getAssignedProject();
    if (!project) return rows;
    const employees = store.get('employees');
    return rows.filter((r) => employees.find((e) => e.id === r.employeeId)?.assignedProject === project);
  }
  const userId = getCurrentUserId();
  return rows.filter((r) => r.employeeId === userId);
}
