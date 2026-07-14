import emailjs from 'https://esm.sh/@emailjs/browser@4.4.1';
import { store } from './store.js';

// Filled in once the EmailJS account is set up — see erp/EMAILJS_SETUP.md.
// Until then every send is a silent no-op, so this module is safe to ship
// ahead of that setup being finished.
const EMAILJS_PUBLIC_KEY = '';
const EMAILJS_SERVICE_ID = '';
const EMAILJS_TEMPLATE_ID = '';

let initialized = false;
function ready() {
  if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) return false;
  if (!initialized) {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    initialized = true;
  }
  return true;
}

function dedupeByEmail(recipients) {
  const seen = new Set();
  return recipients.filter((r) => {
    if (!r.email || seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });
}

function adminRecipients() {
  return store.get('employees')
    .filter((e) => e.accessTier === 'Admin' && e.email)
    .map((e) => ({ name: e.name, email: e.email }));
}

// Admins can approve everything; a Supervisor only sees/approves requests
// from their own assigned project, so only that Supervisor needs the email.
function leaveApproverRecipients(employeeId) {
  const requester = store.find('employees', employeeId);
  const supervisors = requester?.assignedProject
    ? store.get('employees').filter((e) => e.accessTier === 'Supervisor' && e.email && e.assignedProject === requester.assignedProject)
      .map((e) => ({ name: e.name, email: e.email }))
    : [];
  return dedupeByEmail([...adminRecipients(), ...supervisors]);
}

// Notification emails are a best-effort side effect — a failure here must
// never block the fund/leave request itself from being submitted.
async function sendTo(recipients, params) {
  if (!ready() || !recipients.length) return;
  await Promise.all(recipients.map((r) => emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: r.email,
    to_name: r.name,
    ...params,
  }).catch((err) => console.warn(`Notification email to ${r.email} failed:`, err))));
}

export async function notifyNewFundRequest(record) {
  const submitter = store.find('employees', record.submittedBy);
  const total = (record.items || []).reduce((sum, it) => sum + (it.amount || 0), 0);
  await sendTo(adminRecipients(), {
    subject: `Fund Request awaiting approval — ${submitter?.name || 'Staff'}`,
    request_type: 'Fund Request',
    submitted_by: submitter?.name || 'Unknown',
    summary: record.description || `${(record.items || []).length} item(s), total ₦${total.toLocaleString()}`,
    link_url: 'https://tade355.github.io/erp/#/fundRequests',
  });
}

export async function notifyNewLeaveRequest(record) {
  const submitter = store.find('employees', record.employeeId);
  await sendTo(leaveApproverRecipients(record.employeeId), {
    subject: `Leave Request awaiting approval — ${submitter?.name || 'Staff'}`,
    request_type: 'Leave Request',
    submitted_by: submitter?.name || 'Unknown',
    summary: `${record.leaveType} leave, ${record.startDate} to ${record.endDate}`,
    link_url: 'https://tade355.github.io/erp/#/approvals',
  });
}
