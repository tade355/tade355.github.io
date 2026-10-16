// Who may download the Operations Profitability Report. This is a UI-level
// gate (like the access tiers elsewhere in the ERP): the button and builder are
// only shown to Olumide Davidson's account, and the download action checks again.
import { getCurrentUser } from './session.js';

export const REPORT_DOWNLOAD_EMPLOYEE_IDS = ['EMP-26']; // Olumide Davidson

export function canDownloadProfitReports() {
  const user = getCurrentUser();
  return !!user && REPORT_DOWNLOAD_EMPLOYEE_IDS.includes(user.id);
}
