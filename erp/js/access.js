// Who may download the Operations Profitability Report. This is a UI-level
// gate (like the access tiers elsewhere in the ERP): the button and builder are
// only shown to Olumide Davidson's account, and the download action checks again.
import { getCurrentUser } from './session.js';

// HRM's leave decision authority is checked again by the database trigger.
export const HRM_EMPLOYEE_ID = 'EMP-27'; // Atabo Victoria
export function canDecideLeave() {
  return getCurrentUser()?.id === HRM_EMPLOYEE_ID;
}

export const REPORT_DOWNLOAD_EMPLOYEE_IDS = ['EMP-26']; // Olumide Davidson

// The owner flag lives on the employee record (employees.is_owner, migration 0041);
// until that column exists the fixed ids above are used.
const isOwnerAccount = (user, ids) => !!user && (typeof user.isOwner === 'boolean' ? user.isOwner : ids.includes(user.id));

export function canDownloadProfitReports() {
  return isOwnerAccount(getCurrentUser(), REPORT_DOWNLOAD_EMPLOYEE_IDS);
}

// Who may upload Excel data into the ERP (Data Import page). Same UI-level gate
// as above: the page, its menu entry and the import button are Olumide's only,
// and the import action checks again.
export const DATA_IMPORT_EMPLOYEE_IDS = ['EMP-26']; // Olumide Davidson

export function canImportData() {
  return isOwnerAccount(getCurrentUser(), DATA_IMPORT_EMPLOYEE_IDS);
}

export function canDecideFundRequests() {
  return ['EMP-28', 'EMP-26'].includes(getCurrentUser()?.id);
}
