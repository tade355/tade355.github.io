import { store } from './store.js';

// IMPORTANT: this is a soft, UI-level access gate — not real security. There is
// no server or authentication; all data already lives in this browser's local
// storage regardless of who is "signed in". This only organizes the menu and
// filters what's shown by default, for a trusted-team, shared-device setup.
const SESSION_KEY = 'emagrims_erp_session';

export function getCurrentUserId() {
  return localStorage.getItem(SESSION_KEY) || null;
}

export function setCurrentUserId(id) {
  if (id) localStorage.setItem(SESSION_KEY, id);
  else localStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser() {
  const id = getCurrentUserId();
  if (!id) return null;
  return store.find('employees', id);
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
