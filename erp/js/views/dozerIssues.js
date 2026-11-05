import { supabase } from '../supabaseClient.js';
import { getCurrentUserId, getCurrentTier, getAssignedProject } from '../session.js';
import { el } from '../utils.js';
import { showToast } from '../ui.js';
import { queueFieldSubmission, pendingFieldSyncCount } from '../fieldSync.js';

export function renderDozerIssues(container) {
  container.replaceChildren(el('h2', {}, 'Dozer Issues'));
  const tier = getCurrentTier();
  const project = getAssignedProject();
  const form = el('form', { class: 'card' });
  const equipment = el('input', { required: true, maxLength: 100, placeholder: 'Dozer number or name' });
  const projectInput = el('input', { required: true, value: project, readOnly: tier !== 'Admin', placeholder: 'Project' });
  const priority = el('select', {}, ['Normal','Urgent'].map((value) => el('option', { value }, value)));
  const severity = el('select', {}, ['Low','Medium','High','Critical'].map((value) => el('option', { value }, value)));
  const safetyRisk = el('input', { type: 'checkbox' });
  const location = el('input', { required: true, maxLength: 120, placeholder: 'Site, block or camp' });
  const description = el('textarea', { required: true, minLength: 10, maxLength: 2000, placeholder: 'Describe the concern and when it started' });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Submit issue');
  form.append(
    el('label', { class: 'field' }, [el('span', {}, 'Project'), projectInput]),
    el('label', { class: 'field' }, [el('span', {}, 'Dozer'), equipment]),
    el('label', { class: 'field' }, [el('span', {}, 'Priority'), priority]),
    el('label', { class: 'field' }, [el('span', {}, 'Severity'), severity]),
    el('label', { class: 'field checkbox-field' }, [safetyRisk, el('span', {}, 'Safety risk')]),
    el('label', { class: 'field' }, [el('span', {}, 'Location'), location]),
    el('label', { class: 'field' }, [el('span', {}, 'Concern or fault'), description]), submit,
  );
  container.appendChild(form);
  const list = el('div');
  container.appendChild(list);

  async function load() {
    const { data, error } = await supabase.from('dozer_issues').select('*').order('created_at', { ascending: false }).limit(100);
    list.replaceChildren(el('h3', {}, 'Reported issues'));
    if (error) { list.appendChild(el('p', { role: 'alert' }, 'Issue tracking is unavailable. Ask the administrator to apply the database update.')); return; }
    if (!data?.length) { list.appendChild(el('p', {}, 'No issues reported yet.')); return; }
    data.forEach((issue) => {
      const card = el('div', { class: 'card' }, [
        el('strong', {}, `${issue.equipment} · ${issue.priority} · ${issue.status}`),
        el('p', {}, `${issue.project} · ${new Date(issue.created_at).toLocaleString('en-GB')}`),
        el('p', {}, issue.description),
      ]);
      if (issue.response) card.appendChild(el('p', {}, `Response: ${issue.response}`));
      if (tier === 'Admin' || tier === 'Supervisor') {
        const status = el('select', {}, ['Open','Acknowledged','In Progress','Resolved'].map((value) => el('option', { value }, value)));
        status.value = issue.status;
        const response = el('input', { value: issue.response || '', maxLength: 1000, placeholder: 'Response to operator' });
        const save = el('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
          const { error: updateError } = await supabase.from('dozer_issues').update({ status: status.value, response: response.value.trim() || null }).eq('id', issue.id);
          if (updateError) showToast(updateError.message, 'critical');
          else { showToast('Issue updated.'); load(); }
        } }, 'Save response');
        card.append(status, response, save);
      }
      list.appendChild(card);
    });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const { error } = await supabase.from('dozer_issues').insert({
      project: projectInput.value.trim(), equipment: equipment.value.trim(),
      priority: priority.value, description: description.value.trim(), reported_by: getCurrentUserId(),
    });
    submit.disabled = false;
    if (error) {
      queueFieldSubmission('dozerIssues', { project: projectInput.value.trim(), equipment: equipment.value.trim(), priority: priority.value, severity: severity.value, safetyRisk: safetyRisk.checked, location: location.value.trim(), description: description.value.trim(), reportedBy: getCurrentUserId() });
      showToast(`Saved on this device. It will sync when the connection returns (${pendingFieldSyncCount()} pending).`, 'warning');
    }
    else { showToast('Issue submitted.'); equipment.value = ''; description.value = ''; load(); }
  });
  load();
}

