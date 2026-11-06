import { supabase } from '../supabaseClient.js';
import { el, formatDate } from '../utils.js';
import { sectionHeader, statCard, renderTable, statusPill } from '../ui.js';
import { todayISOString, rexFortnightStart } from '../dateUtils.js';
import { formatClock, formatDateTime } from '../clockFormat.js';
import { unitForOperationType } from '../constants.js';
import { operatorPeriod } from '../operatorPortalData.js';

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
      const reports = el('div');
      body.append(summary, reports);
      function refreshPeriod() {
        if (from.value && to.value && from.value > to.value) {
          summary.replaceChildren(el('p', { role: 'alert' }, 'The From date must be on or before the To date.'));
          reports.replaceChildren(); return;
        }
        const period = operatorPeriod(data.reports || [], from.value, to.value);
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
