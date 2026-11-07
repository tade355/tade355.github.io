import { supabase } from '../supabaseClient.js';
import { el, formatDate, formatCurrency } from '../utils.js';
import { sectionHeader, statCard, renderTable, statusPill } from '../ui.js';
import { todayISOString, rexFortnightStart } from '../dateUtils.js';
import { formatClock, formatDateTime } from '../clockFormat.js';
import { unitForOperationType } from '../constants.js';
import { operatorPeriod } from '../operatorPortalData.js';
import { DOZER_OVERTIME_RATE_DEFAULT } from '../constants.js';

const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Every displayed field comes from the server's explicit personal projection.
// Never substitute a full store collection if this call fails.
export async function renderOperatorDashboard(container, { issuesOnly = false } = {}) {
  container.replaceChildren(sectionHeader(issuesOnly ? 'My Dozer Issues' : 'My Work & Dozer', 'Your assigned machine and your own reported work.'));
  const body = el('div', { role: 'status' }, 'Loading your records…');
  container.appendChild(body);
  try {
    const { data, error } = await supabase.rpc('erp_operator_portal');
    if (error) throw new Error('Your records could not be loaded. Please refresh or contact your administrator.');
    if (!data || data.assignmentStatus !== 'Ready') {
      body.replaceChildren(el('p', { class: 'backup-warning' }, data?.assignmentStatus === 'Needs review'
        ? 'Your dozer and project assignment need to be checked by your administrator.'
        : 'Ask your administrator to assign both your project and your dozer in your employee record. Your records will appear here after assignment.'));
      return;
    }
    body.replaceChildren(el('div', { class: 'card' }, [el('h3', {}, data.employee.name),
      el('p', {}, `${data.dozer.name} · ${data.project}`), statusPill(data.dozer.status || 'Not reported')]));

    if (!issuesOnly) {
      const today = todayISOString();
      const from = el('input', { type: 'date', value: rexFortnightStart(data.project, today) || today, 'aria-label': 'My work from' });
      const to = el('input', { type: 'date', value: today, max: today, 'aria-label': 'My work to' });
      const all = el('button', { type: 'button', class: 'btn btn-ghost' }, 'All recorded dates');
      body.appendChild(el('div', { class: 'filter-bar' }, [
        el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'From'), from]),
        el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'To'), to]), all,
      ]));
      const summary = el('div', { class: 'stats-grid' });
      const allowanceSummary = el('div', { class: 'stats-grid' });
      const allowanceLedger = el('div');
      const reports = el('div');
      body.append(summary, el('h3', {}, 'My allowance'), allowanceSummary,
        el('p', { class: 'section-subtitle' }, 'Your first 8 hours each day are prorated against your daily rate. Hours above 8 are overtime. Payments recorded by Accounts reduce the balance owed.'),
        allowanceLedger, el('h3', {}, 'My work records'), reports);
      function refreshPeriod() {
        if (from.value && to.value && from.value > to.value) {
          summary.replaceChildren(el('p', { role: 'alert' }, 'The From date must be on or before the To date.'));
          reports.replaceChildren(); return;
        }
        const period = operatorPeriod(data.reports || [], from.value, to.value);
        const rate = Number(data.allowance?.dayRate || 30000);
        const overtimeRate = Number(data.allowance?.overtimeRate || DOZER_OVERTIME_RATE_DEFAULT);
        const allowanceRows = period.rows.map(row => {
          const hours = Number(row.hours || 0);
          const baseHours = Math.min(hours, 8);
          const overtimeHours = Math.max(0, hours - 8);
          const earned = (baseHours / 8) * rate + overtimeHours * overtimeRate;
          return { ...row, baseHours, overtimeHours, earned };
        });
        const periodEarned = allowanceRows.reduce((sum, row) => sum + row.earned, 0);
        const totalEarned = Number(data.allowance?.earned || 0);
        const totalPaid = Number(data.allowance?.paid || 0);
        const balance = Number(data.allowance?.balance ?? (totalEarned - totalPaid));
        allowanceSummary.replaceChildren(
          statCard({ label: 'Daily rate (8 hrs)', value: formatCurrency(rate) }),
          statCard({ label: 'Earned in selected period', value: formatCurrency(periodEarned) }),
          statCard({ label: 'Paid to date', value: formatCurrency(totalPaid), tone: 'good' }),
          statCard({ label: 'Balance owed', value: formatCurrency(balance), tone: balance > 0 ? 'warning' : 'good' }),
        );
        renderTable(allowanceLedger, { columns: [
          { key: 'date', label: 'Date', render: row => formatDate(row.date) },
          { key: 'hours', label: 'Hours', render: row => number(row.hours) },
          { key: 'baseHours', label: 'Regular hrs', render: row => number(row.baseHours) },
          { key: 'overtimeHours', label: 'Extra hrs', render: row => number(row.overtimeHours) },
          { key: 'earned', label: 'Allowance earned', render: row => formatCurrency(row.earned) },
        ], rows: allowanceRows, emptyText: 'No allowance has accrued in this period.' });
        summary.replaceChildren(statCard({ label: 'My reported hours', value: `${number(period.hours)} hrs` }),
          statCard({ label: 'Days reported', value: String(period.days) }),
          ...period.stages.map(stage => statCard({ label: stage.name, value: `${number(stage.quantity)} ${stage.unit}` })));
        renderTable(reports, { columns: [
          { key: 'date', label: 'Date', render: row => formatDate(row.date) },
          { key: 'milestone', label: 'Milestone' },
          { key: 'hours', label: 'My hours', render: row => number(row.hours) },
          { key: 'quantity', label: 'Output', render: row => `${number(row.quantity)} ${unitForOperationType(row.milestone)}` },
          { key: 'started', label: 'Resumed', render: row => formatClock(row.started) },
          { key: 'stopped', label: 'Stopped', render: row => formatClock(row.stopped) },
          { key: 'supervisor', label: 'Supervisor' },
        ], rows: period.rows, emptyText: 'No work has been reported for you in this period.' });
      }
      from.addEventListener('change', refreshPeriod); to.addEventListener('change', refreshPeriod);
      all.addEventListener('click', () => { from.value = ''; to.value = today; refreshPeriod(); });
      refreshPeriod();
      const serviceHours = data.dozer.hoursSinceService;
      const interval = Number(data.dozer.serviceIntervalHours) || 250;
      body.appendChild(el('div', { class: 'card' }, [el('h3', {}, 'Dozer servicing'),
        el('p', {}, data.dozer.lastServiceDate ? `Last service: ${formatDate(data.dozer.lastServiceDate)}` : 'No confirmed service date recorded.'),
        el('p', {}, serviceHours == null ? 'Hours since service cannot be calculated until a service date is confirmed.'
          : `Recorded machine hours since service: ${number(serviceHours)} of ${number(interval)} hrs · ${serviceHours >= interval ? 'Overdue' : `${number(interval - serviceHours)} hrs remaining`}`),
      ]));
      const maintenance = el('div');
      body.appendChild(el('h3', {}, 'Dozer maintenance status'));
      body.appendChild(maintenance);
      renderTable(maintenance, { columns: [
        { key: 'date', label: 'Date', render: row => formatDate(row.date) },
        { key: 'type', label: 'Work' }, { key: 'status', label: 'Status', render: row => statusPill(row.status) },
      ], rows: data.maintenance || [], emptyText: 'No maintenance records for your dozer.' });
    }
    body.appendChild(el('h3', {}, 'Issues on my dozer'));
    const issues = data.issues || [];
    if (!issues.length) body.appendChild(el('p', {}, 'No issues have been reported for this dozer.'));
    for (const issue of issues) body.appendChild(el('div', { class: 'card' }, [
      el('strong', {}, `${issue.priority} · ${issue.status}`), el('p', {}, formatDateTime(issue.createdAt)),
      el('p', {}, issue.description), issue.response ? el('p', {}, `Response: ${issue.response}`) : null,
    ]));
    const form = el('form', { class: 'card' });
    const description = el('textarea', { required: true, minlength: 10, maxlength: 2000, rows: 3, 'aria-label': 'Dozer concern' });
    const priority = el('select', { 'aria-label': 'Issue priority' }, ['Normal','Urgent'].map(value => el('option', { value }, value)));
    const severity = el('select', { 'aria-label': 'Issue severity' }, ['Low','Medium','High','Critical'].map(value => el('option', { value }, value)));
    severity.value = 'Medium';
    const safety = el('input', { type: 'checkbox', 'aria-label': 'Safety risk' });
    const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Report issue');
    const message = el('p', { role: 'status' });
    form.append(el('h3', {}, 'Report a concern'), el('p', {}, `${data.dozer.name} · ${data.project}`),
      el('label', { class: 'field' }, [el('span', {}, 'Concern or fault'), description]),
      el('label', { class: 'field' }, [el('span', {}, 'Priority'), priority]),
      el('label', { class: 'field' }, [el('span', {}, 'Severity'), severity]),
      el('label', { class: 'checkbox-field' }, [safety, el('span', {}, 'Safety risk')]), submit, message);
    form.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true; message.textContent = 'Saving…';
      const { error: saveError } = await supabase.from('dozer_issues').insert({
        project: data.project, equipment: data.dozer.name, reported_by: data.employee.id,
        description: description.value.trim(), priority: priority.value, severity: severity.value, safety_risk: safety.checked,
      });
      if (saveError) { message.textContent = 'The issue was not saved. Check your connection and assignment, then try again.'; submit.disabled = false; }
      else await renderOperatorDashboard(container, { issuesOnly });
    });
    body.appendChild(form);
  } catch (error) {
    body.replaceChildren(el('p', { role: 'alert', class: 'backup-warning' }, error.message));
  }
}
