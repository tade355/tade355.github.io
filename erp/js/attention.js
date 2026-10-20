// What needs the manager's attention, as one list of flags. The Daily Operations
// Dashboard (screen and downloaded HTML) and the main Dashboard's alert centre
// both read this, so they always warn about the same things under the same rules
// (the limits are in rules.js).
//
// Pure (no store / DOM imports). ctx: fundRequests, fuelingVouchers,
// dieselStockCounts, operations, inventory, project; `date` is the day viewed.
import { addDays } from './dateUtils.js';
import { findDuplicateRequests, requestTotal } from './requestDuplicates.js';
import { REQUEST_WAIT_DAYS, VOUCHER_WAIT_DAYS, STOCK_COUNT_MAX_AGE_DAYS, BACKUP_MAX_AGE_DAYS } from './rules.js';

const DAY = 86400000;
const ms = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
const naira = (n) => `₦${Math.round(n).toLocaleString('en-US')}`;
const dmy = (iso) => new Date(ms(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function buildAttention(ctx, { date, lastBackupAt } = {}) {
  const flags = []; // every flag below is company-wide: scope 'company' lets a caller show it once however many projects it reads

  // Requests waiting for a decision or for payment.
  const waiting = (ctx.fundRequests || []).filter((r) => (r.status === 'Pending' || r.status === 'Approved') && r.date && daysBetween(r.date, date) > REQUEST_WAIT_DAYS);
  if (waiting.length) {
    const oldest = [...waiting].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    const pending = waiting.filter((r) => r.status === 'Pending');
    flags.push({
      tone: 'warning',
      text: `${waiting.length} fund request(s) have waited more than ${REQUEST_WAIT_DAYS} days (${naira(waiting.reduce((s, r) => s + requestTotal(r), 0))}): ${pending.length} not yet decided, ${waiting.length - pending.length} approved but unpaid. The oldest is ${oldest.id}, ${dmy(oldest.date)}.`,
      action: 'Decide or pay the oldest, or reject it.',
    });
  }

  // Two open requests that look like the same one (the site manager resends them).
  const open = (ctx.fundRequests || []).filter((r) => r.status === 'Pending' || r.status === 'Approved');
  const pairs = [];
  open.forEach((r, i) => {
    findDuplicateRequests(r, open.slice(i + 1), { days: 14 }).forEach((d) => pairs.push(`${r.id} and ${d.id}`));
  });
  if (pairs.length) flags.push({ tone: 'warning', text: `Possible duplicate requests: ${pairs.slice(0, 4).join('; ')}${pairs.length > 4 ? ` (and ${pairs.length - 4} more)` : ''}.`, action: 'Cancel the repeat before anything is paid.' });

  // Fueling vouchers waiting for approval.
  const vouchers = (ctx.fuelingVouchers || []).filter((v) => v.status === 'Pending Approval' && v.date && daysBetween(v.date, date) > VOUCHER_WAIT_DAYS);
  if (vouchers.length) flags.push({ tone: 'warning', text: `${vouchers.length} fueling voucher(s) are still waiting for approval: ${vouchers.slice(0, 4).map((v) => `${v.id} (${dmy(v.date)})`).join(', ')}.`, action: 'The station cannot be paid against an unapproved voucher.' });

  // The diesel on ground is a calculation; flag it when the last count is old.
  const counts = (ctx.dieselStockCounts || []).filter((c) => c.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (counts.length && daysBetween(counts[0].date, date) > STOCK_COUNT_MAX_AGE_DAYS) {
    flags.push({ tone: 'warning', text: `The last diesel stock count was ${dmy(counts[0].date)} (${daysBetween(counts[0].date, date)} days ago), so diesel on ground is a calculation, not a count.`, action: 'Ask the site manager to count the tank stock.' });
  }

  // Yesterday's reports missing while dozers were active before that.
  const project = ctx.project;
  const ops = (ctx.operations || []).filter((o) => !project || o.siteName === project);
  const prev = addDays(date, -1);
  if (ops.some((o) => o.date === addDays(date, -2) && (o.hoursWorked || 0) > 0) && !ops.some((o) => o.date === prev) && date > prev) {
    flags.push({ tone: 'warning', text: `No end-of-day report was recorded for ${dmy(prev)}, although machines worked the day before.`, action: 'Ask the site manager for the reports, or confirm nothing worked.' });
  }

  // Backups.
  if (lastBackupAt !== undefined) {
    if (!lastBackupAt) flags.push({ tone: 'warning', text: 'The data has never been backed up from this browser.', action: 'Open Backup & Data and download a backup.' });
    else if (daysBetween(lastBackupAt, date) > BACKUP_MAX_AGE_DAYS) flags.push({ tone: 'warning', text: `The last backup was ${daysBetween(lastBackupAt, date)} days ago.`, action: 'Open Backup & Data and download a new one.' });
  }
  return flags.map((f) => ({ ...f, scope: 'company' }));
}
