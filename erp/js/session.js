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

export function canViewStaffActivity() {
  const user = getCurrentUser();
  return user?.id === 'EMP-26' || /^agrimo\b/i.test(String(user?.name || '').trim());
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

// Named responsibility overrides sit above the broad access tiers. This keeps
// the existing RLS/tier model intact while making the navigation match the
// real organogram: the secretary is operationally broad but cannot open HR or
// sensitive finance; CEO/COO can see the business but only Olumide opens the
// backend/data tools.
export function canAccessRoute(route) {
  if (!route) return false;
  const user = getCurrentUser() || {};
  const name = String(user.name || '').toLowerCase();
  const role = String(user.role || '').toLowerCase();
  const isSecretary = /secretary|company secretary/.test(role) || /gladness/.test(name);
  const isExecutive = /ceo|chief executive|coo|chief operating/.test(role) || /gideon|olumide/.test(name);
  const isHrmOrAccounts = /human resources|hrm|hr manager|accounts?|finance/.test(role) || /victoria/.test(name);
  const isManager = /manager|supervisor/.test(role) || /oki|godstime/.test(name);
  const isMaintenanceManager = /maintenance|mechanical|fleet manager|machine manager/.test(role) || /ola sodunke|sodunke/.test(name);
  const isOlumide = /olumide/.test(name);
  const backend = ['dataImport', 'pasteEntry', 'backup'].includes(route.path);
  if (backend) return isOlumide;
  // Gladness supports requests, procurement, sales and finance, and needs leave and salary self-service.\n  // HR administration remains restricted; backend/data tools are handled above.\n  if (isSecretary && ['hr', 'payroll', 'loans'].includes(route.path)) return false;
  if (isSecretary) return true;
  if (isExecutive || isHrmOrAccounts) return true;
  if (isManager && ['dailyDashboard', 'operations', 'dailyStatus', 'dozerIssues', 'noticeBoard'].includes(route.path)) return true;
  if (isMaintenanceManager && ['dailyDashboard', 'dailyStatus', 'dozerIssues', 'fleet', 'noticeBoard'].includes(route.path)) return true;
  return canAccess(route.tiers);
}

export function defaultRouteForTier(tier) {
  if (tier === 'Admin' || tier === 'Accounts') return 'dashboard';
  if (tier === 'Supervisor') return 'operations';
  if (tier === 'Staff') return 'dailyDashboard';
  return 'leave';
}

// Restricts rows to the current Supervisor's assigned project (Admin/Accounts see everything).
export function filterByProject(rows, projectKey) {
  const tier = getCurrentTier();
  if (tier === 'Admin' || tier === 'Accounts') return rows;
  if (tier === 'Supervisor' && getCurrentUser()?.canManageAllProjects) return rows;
  const project = getAssignedProject();
  if (!project) return [];
  return rows.filter((r) => r[projectKey] === project);
}

// A non-finance user sees a request only when they submitted it, were
// explicitly tagged, or their unique full name appears in its description.
export function requestMentionsEmployee(request, employee, employees) {
  if (!employee?.name) return false;
  const normalize = (value) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const name = normalize(employee.name);
  if (name.length < 5 || employees.filter((person) => person.status === 'Active' && !person.archivedAt && normalize(person.name) === name).length !== 1) return false;
  const text = normalize([request.description, ...(request.items || []).map((item) => item.description)].join(' '));
  return (' ' + text + ' ').includes(' ' + name + ' ');
}

export function filterFundRequests(rows) {
  const tier = getCurrentTier();
  if (tier === 'Admin' || tier === 'Accounts') return rows;
  const userId = getCurrentUserId();
  const employee = getCurrentUser();
  const employees = store.get('employees');
  return rows.filter((request) => request.submittedBy === userId
    || (Array.isArray(request.concernedStaff) && request.concernedStaff.includes(userId))
    || requestMentionsEmployee(request, employee, employees));
}

// Leave requests: Supervisors see requests from staff on their assigned project, Staff see only their own.
export function filterLeaveRequests(rows) {
  const tier = getCurrentTier();
  if (tier === 'Admin' || tier === 'Accounts') return rows;
  if (tier === 'Supervisor' && getCurrentUser()?.canManageAllProjects) return rows;
  if (tier === 'Supervisor') {
    const project = getAssignedProject();
    if (!project) return rows.filter((r) => r.employeeId === getCurrentUserId());
    const employees = store.get('employees');
    return rows.filter((r) => employees.find((e) => e.id === r.employeeId)?.assignedProject === project);
  }
  const userId = getCurrentUserId();
  return rows.filter((r) => r.employeeId === userId);
}

// Training submissions: same visibility rule as leave requests — Admin/Accounts
// see everyone, a Supervisor sees their project's staff, Staff see only their own.
export function filterTrainingSubmissions(rows) {
  const tier = getCurrentTier();
  if (tier === 'Admin' || tier === 'Accounts') return rows;
  if (tier === 'Supervisor' && getCurrentUser()?.canManageAllProjects) return rows;
  if (tier === 'Supervisor') {
    const project = getAssignedProject();
    if (!project) return rows.filter((r) => r.employeeId === getCurrentUserId());
    const employees = store.get('employees');
    return rows.filter((r) => employees.find((e) => e.id === r.employeeId)?.assignedProject === project);
  }
  const userId = getCurrentUserId();
  return rows.filter((r) => r.employeeId === userId);
}

