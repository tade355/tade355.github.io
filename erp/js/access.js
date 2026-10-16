// Who may download the Operations Profitability Report. This is a UI-level
// gate (like the access tiers elsewhere in the ERP): the button and builder are
// only shown to Olumide Davidson's account, and the download action checks again.
import { getCurrentUser } from './session.js';

export const REPORT_DOWNLOAD_EMPLOYEE_IDS = ['EMP-26']; // Olumide Davidson

export function canDownloadProfitReports() {
  const user = getCurrentUser();
  return !!user && REPORT_DOWNLOAD_EMPLOYEE_IDS.includes(user.id);
}

// Who may upload Excel data into the ERP (Data Import page). Same UI-level gate
// as above: the page, its menu entry and the import button are Olumide's only,
// and the import action checks again.
export const DATA_IMPORT_EMPLOYEE_IDS = ['EMP-26']; // Olumide Davidson

export function canImportData() {
  const user = getCurrentUser();
  return !!user && DATA_IMPORT_EMPLOYEE_IDS.includes(user.id);
}
