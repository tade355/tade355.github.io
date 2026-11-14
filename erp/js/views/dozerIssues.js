import { renderOperatorDashboard } from './operatorDashboard.js';
import { isOperatorAccount } from '../operatorPortalData.js';
import { supabase } from '../supabaseClient.js';
import { store } from '../store.js';
import { getCurrentUserId, getCurrentTier, getAssignedProject, getCurrentUser, filterByProject } from '../session.js';
import { el } from '../utils.js';
import { formatDateTime } from '../clockFormat.js';
import { showToast, sectionHeader, statusPill } from '../ui.js';

export function renderDozerIssues(container) {
  if (isOperatorAccount(getCurrentUser())) return renderOperatorDashboard(container, { issuesOnly: true });
  container.replaceChildren(sectionHeader('Dozer Issues & Maintenance', 'Report a fault and follow the repair response.'));
  container.appendChild(el('style', {}, `
    .issue-form{max-width:840px;padding:20px;display:grid;gap:18px}
    .issue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .issue-form .field{display:flex;flex-direction:column;gap:7px;min-width:0;margin:0}
    .issue-form input,.issue-form select,.issue-form textarea{box-sizing:border-box;width:100%;min-height:46px;font:inherit}
    .issue-form textarea{min-height:150px;resize:vertical}
    .issue-form .issue-safety{display:flex;align-items:center;gap:10px;min-height:44px}
    .issue-form .issue-safety input{width:20px;min-height:20px;margin:0}
    .issue-card{padding:18px;margin-top:14px;overflow-wrap:anywhere}
    .issue-card p{white-space:pre-wrap}.issue-card-head{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .issue-response{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
    .issue-response input{flex:1;min-width:180px;min-height:44px}.issue-response select{min-height:44px}
    @media(max-width:600px){.issue-grid{grid-template-columns:1fr}.issue-form{padding:16px}.issue-form button[type=submit]{width:100%;min-height:48px}.issue-response>*{width:100%}}
  `));
  const tier = getCurrentTier();
  const employeeId = getCurrentUserId();
  const employees = store.get('employees');
  const projects = filterByProject(store.get('projects'), 'name').slice().sort((a,b) => a.name.localeCompare(b.name));
  const fleet = filterByProject(store.get('inventory').filter(row => row.category === 'Heavy Equipment'), 'currentProject');
  const field = (label, control) => el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label), control]);
  const project = el('select', { required: true, 'aria-label': 'Project' }, [el('option', { value: '' }, 'Select project'),
    ...projects.map(row => el('option', { value: row.name }, row.name))]);
  const equipment = el('select', { required: true, 'aria-label': 'Dozer' });
  const hint = el('p', { class: 'section-subtitle', role: 'status' });
  const priority = el('select', { 'aria-label': 'Priority' }, ['Normal','Urgent'].map(value => el('option', { value }, value)));
  const severity = el('select', { 'aria-label': 'Severity' }, ['Low','Medium','High','Critical'].map(value => el('option', { value }, value)));
  severity.value = 'Medium';
  const safety = el('input', { type: 'checkbox', 'aria-label': 'Safety risk' });
  const location = el('input', { maxlength: 120, placeholder: 'Block or camp (optional)', 'aria-label': 'Location' });
  const description = el('textarea', { required: true, minlength: 10, maxlength: 1800, rows: 6,
    placeholder: 'What is wrong? List parts, quantities and any urgent work.', 'aria-label': 'Concern or fault' });
  const reporter = el('select', { 'aria-label': 'Reported by' }, employees.filter(row => !row.archivedAt && (row.status === 'Active' || row.id === employeeId))
    .sort((a,b) => a.name.localeCompare(b.name)).map(row => el('option', { value: row.id }, row.name)));
  reporter.value = employeeId;
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Submit issue');
  const message = el('p', { role: 'status', 'aria-live': 'polite' });
  const form = el('form', { class: 'card issue-form' }, [el('h3', {}, 'Report a dozer issue'),
    el('div', { class: 'issue-grid' }, [field('Project *', project), field('Dozer *', equipment)]), hint,
    field('Concern or fault *', description),
    el('div', { class: 'issue-grid' }, [field('Priority', priority), field('Severity', severity)]),
    el('label', { class: 'issue-safety' }, [safety, el('span', {}, 'Safety risk — this fault could cause injury or damage')]),
    field('Location', location), ...(tier === 'Admin' ? [field('Reported by', reporter)] : []), submit, message]);
  container.appendChild(form);
  const list = el('div');
  container.appendChild(list);
  function updateDozers() {
    const previous = equipment.value;
    const rows = fleet.filter(row => row.currentProject === project.value).sort((a,b) => a.name.localeCompare(b.name));
    equipment.replaceChildren(el('option', { value: '' }, project.value ? 'Select dozer' : 'Select project first'),
      ...rows.map(row => el('option', { value: row.name }, row.name)));
    equipment.disabled = !project.value || !rows.length;
    if (rows.some(row => row.name === previous)) equipment.value = previous;
    else if (rows.length === 1) equipment.value = rows[0].name;
    hint.textContent = !projects.length ? 'Ask your administrator to assign your project before reporting.'
      : project.value && !rows.length ? 'No dozer is assigned to this project. Ask your administrator to update Fleet & Assets.' : '';
    submit.disabled = equipment.disabled;
  }
  if (projects.some(row => row.name === getAssignedProject())) project.value = getAssignedProject();
  else if (projects.length === 1) project.value = projects[0].name;
  project.addEventListener('change', updateDozers);
  updateDozers();
  async function load() {
    const { data, error } = await supabase.from('dozer_issues').select('*').order('created_at', { ascending: false }).limit(100);
    list.replaceChildren(el('h3', {}, 'Reported issues'));
    if (error) { list.appendChild(el('p', { role: 'alert' }, 'Issues could not be loaded. Refresh to try again.')); return; }
    if (!data?.length) { list.appendChild(el('p', {}, 'No issues reported yet.')); return; }
    data.forEach(issue => {
      const enteredBy = employees.find(row => row.id === issue.reported_by)?.name;
      const card = el('article', { class: 'card issue-card' }, [
        el('div', { class: 'issue-card-head' }, [el('strong', {}, issue.equipment), statusPill(issue.status), el('span', {}, `${issue.priority} · ${issue.severity || 'Medium'}`)]),
        el('p', { class: 'section-subtitle' }, `${issue.project} · ${formatDateTime(issue.created_at)}${enteredBy ? ` · Entered by ${enteredBy}` : ''}`),
        el('p', {}, issue.description),
        ...(issue.location ? [el('p', {}, `Location: ${issue.location}`)] : []),
        ...(issue.safety_risk ? [el('p', { class: 'backup-warning' }, 'Safety risk reported')] : []),
      ]);
      if (issue.response) card.appendChild(el('p', {}, `Response: ${issue.response}`));
      if (tier === 'Admin' || tier === 'Supervisor') {
        const status = el('select', { 'aria-label': `Status for ${issue.equipment}` }, ['Open','Acknowledged','In Progress','Resolved'].map(value => el('option', { value }, value)));
        status.value = issue.status;
        const response = el('input', { value: issue.response || '', maxlength: 1000, placeholder: 'Repair update or response', 'aria-label': `Response for ${issue.equipment}` });
        const save = el('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
          save.disabled = true;
          const { error: updateError } = await supabase.from('dozer_issues').update({ status: status.value, response: response.value.trim() || null }).eq('id', issue.id);
          if (updateError) { showToast('Update not saved. Please try again.', 'critical'); save.disabled = false; }
          else { showToast('Issue updated.'); await load(); }
        } }, 'Save response');
        card.appendChild(el('div', { class: 'issue-response' }, [status, response, save]));
      }
      list.appendChild(card);
    });
  }
  let pendingId = null;
  let pendingPayload = null;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !form.reportValidity()) return;
    if (!fleet.some(row => row.name === equipment.value && row.currentProject === project.value)) {
      message.textContent = 'Select a dozer assigned to this project.'; return;
    }
    const source = tier === 'Admin' && reporter.value !== employeeId ? employees.find(row => row.id === reporter.value) : null;
    const payload = { project: project.value, equipment: equipment.value, priority: priority.value,
      severity: severity.value, safety_risk: safety.checked, location: location.value.trim() || null,
      description: `${source ? `Reported by: ${source.name}\n\n` : ''}${description.value.trim()}`, reported_by: employeeId };
    if (JSON.stringify(payload) !== pendingPayload) { pendingId = crypto.randomUUID(); pendingPayload = JSON.stringify(payload); }
    submit.disabled = true; message.textContent = 'Saving issue…';
    try {
      const { error } = await supabase.from('dozer_issues').insert({ id: pendingId, ...payload });
      // A retry after an interrupted response uses the same ID.
      if (error && error.code !== '23505') throw error;
      message.textContent = 'Issue submitted successfully.'; showToast('Issue submitted.');
      description.value = ''; pendingId = null; pendingPayload = null; await load();
    } catch {
      message.textContent = 'Issue not confirmed as saved. Your text is still here. Check your connection and try again.';
    } finally { submit.disabled = false; }
  });
  load();
}

