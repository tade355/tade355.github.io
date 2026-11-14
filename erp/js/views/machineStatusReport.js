import { selectableProjects, selectableEmployees } from '../selectionOptions.js';
// Daily "General Machine Status Report" — the site manager's day-to-day
// Active / Not Active / Breakdown call on every dozer, exactly like the
// WhatsApp pattern this was built to replace ("GENERAL MACHINE REPORT ...").
// This is the direct, site-manager-reported signal the Dashboard prefers
// for its fleet-health KPIs (see reportedStatusAsOf() in fleet.js) ahead of
// inferring status from Operations/Maintenance Logs. A Breakdown line here
// also opens a Maintenance Log entry automatically (if one isn't already
// open for that machine); marking a machine Active again closes one out —
// this is what was reported by the mechanic/site team, so it should be
// what starts and ends a repair record, not a separate manual step.
import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, confirmDelete } from '../ui.js';
import { fleetItems } from './fleet.js';
import { getCurrentUser, getCurrentTier } from '../session.js';

function projectOptions() {
  const user = getCurrentUser();
  const assigned = getCurrentTier() === 'Supervisor' && !user?.canManageAllProjects ? user?.assignedProject : '';
  return selectableProjects(store.get('projects')).filter((p) => !assigned || p.name === assigned).map((p) => ({ value: p.name, label: p.name }));
}

function employeeOptions() {
  return selectableEmployees(store.get('employees')).map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || '—';
}

function selectEl(options, selectedValue) {
  return el('select', {}, options.map(({ value, label }) => {
    const opt = el('option', { value }, label);
    if (value === selectedValue) opt.setAttribute('selected', 'selected');
    return opt;
  }));
}

// Opens (or leaves open) a Breakdown Maintenance Log entry for `equipment`,
// or closes out any open one — called from the report's own submit, so a
// reported fault/fix is what actually drives the Maintenance Log instead of
// requiring someone to separately remember to log it there too.
async function syncMaintenanceLogFor(equipment, status, date, notes) {
  const openLog = store.get('maintenanceLogs')
    .filter((m) => m.equipment === equipment && m.status !== 'Completed')
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  if ((status === 'Breakdown' || status === 'Under Maintenance') && !openLog) {
    await store.add('maintenanceLogs', {
      date,
      equipment,
      type: status === 'Under Maintenance' ? 'Repair' : 'Breakdown',
      description: notes || `Reported as ${status} on the daily machine status report.`,
      cost: 0,
      status: 'In Progress',
    });
  } else if (status === 'Active' && openLog) {
    await store.update('maintenanceLogs', openLog.id, { status: 'Completed' });
  }
}

export function renderMachineStatusReport(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Daily Machine Status Report', "Report the status of every dozer assigned to the selected project. Breakdown or Under Maintenance opens a Maintenance Log entry; marking it Active closes one out."));

  const formContainer = el('div');
  container.appendChild(formContainer);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Report History'));
  const historyContainer = el('div');
  container.appendChild(historyContainer);

  let editingId = null;

  function reports() {
    return store.get('machineStatusReports').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function renderForm() {
    formContainer.innerHTML = '';
    const record = editingId ? store.get('machineStatusReports').find((r) => r.id === editingId) : null;

    const dateInput = el('input', { type: 'date' });
    dateInput.value = record?.date || todayISOString();
    const projectSelect = selectEl(projectOptions(), record?.project);
    const supervisor = getCurrentTier() === 'Supervisor';
    const submittedBySelect = selectEl(supervisor ? employeeOptions().filter((e) => e.value === getCurrentUser()?.id) : [{ value: '', label: '— Select —' }, ...employeeOptions()], supervisor ? getCurrentUser()?.id : (record?.submittedBy || ''));
    submittedBySelect.disabled = supervisor;

    const headerGrid = el('div', { class: 'form-grid-2' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Date *'), dateInput]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Project / Site *'), projectSelect]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Submitted By (Site Manager) *'), submittedBySelect]),
    ]);
    formContainer.appendChild(el('h3', { class: 'subsection-title' }, editingId ? 'Edit Report' : 'Submit Today\'s Report'));
    formContainer.appendChild(headerGrid);

    const linesByEquipment = {};
    (record?.lines || []).forEach((l) => { linesByEquipment[l.equipment] = l; });

    const statusOptions = [
      { value: '', label: '— Select status —' },
      { value: 'Active', label: 'Active' },
      { value: 'Under Maintenance', label: 'Under Maintenance' },
      { value: 'Not Active', label: 'Not Active' },
      { value: 'Breakdown', label: 'Breakdown' },
    ];

    let rowEls = [];
    const linesHeader = el('div', { class: 'form-grid-2', style: 'grid-template-columns: 1fr 1fr 2fr; font-weight: 600;' }, [
      el('span', {}, 'Dozer'), el('span', {}, 'Status'), el('span', {}, 'Notes'),
    ]);
    const rowsContainer = el('div');
    formContainer.appendChild(linesHeader);
    formContainer.appendChild(rowsContainer);
    function renderProjectMachines() {
      rowsContainer.replaceChildren();
      rowEls = fleetItems().filter((item) => item.currentProject === projectSelect.value).map((item) => {
        const existing = linesByEquipment[item.name];
        const statusSelect = selectEl(statusOptions, existing?.status || '');
        const notesInput = el('input', { type: 'text', placeholder: 'Notes (fault details, etc.)' });
        notesInput.value = existing?.notes || '';
        const row = el('div', { class: 'form-grid-2', style: 'grid-template-columns: 1fr 1fr 2fr; align-items: center;' }, [
          el('span', {}, item.name),
          el('span', { class: 'field' }, statusSelect),
          el('span', { class: 'field' }, notesInput),
        ]);
        rowsContainer.appendChild(row);
        return { equipment: item.name, statusSelect, notesInput };
      });
      if (!rowEls.length) rowsContainer.appendChild(el('p', { class: 'section-subtitle' }, 'No dozers are assigned to this project in the Fleet Roster.'));
    }
    projectSelect.addEventListener('change', renderProjectMachines);
    renderProjectMachines();

    const notesTextarea = el('textarea', { placeholder: 'General notes for this report (optional)' });
    notesTextarea.value = record?.notes || '';
    formContainer.appendChild(el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'General Notes'), notesTextarea]));

    const submitBtn = el('button', { type: 'button', class: 'btn btn-primary' }, editingId ? 'Save Changes' : 'Submit Report');
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Cancel Edit');
    const actionsRow = el('div', { class: 'modal-actions' }, editingId ? [cancelBtn, submitBtn] : [submitBtn]);
    formContainer.appendChild(actionsRow);

    cancelBtn.addEventListener('click', () => { editingId = null; renderForm(); });

    submitBtn.addEventListener('click', async () => {
      if (!projectSelect.value || !submittedBySelect.value || !dateInput.value) {
        window.alert('Date, Project, and Submitted By are required.');
        return;
      }
      if (!rowEls.length || rowEls.some((r) => !r.statusSelect.value)) {
        window.alert('Select a status for every dozer assigned to this project.');
        return;
      }
      const lines = rowEls.map((r) => ({
        equipment: r.equipment,
        status: r.statusSelect.value,
        notes: r.notesInput.value || null,
      }));
      const payload = {
        date: dateInput.value,
        project: projectSelect.value,
        submittedBy: submittedBySelect.value,
        notes: notesTextarea.value || null,
        lines,
      };
      try {
        if (editingId) await store.update('machineStatusReports', editingId, payload);
        else await store.add('machineStatusReports', payload);
        await Promise.all(lines.map((l) => syncMaintenanceLogFor(l.equipment, l.status, dateInput.value, l.notes)));
        editingId = null;
        renderForm();
        refreshHistory();
      } catch (err) {
        window.alert(err.message || 'Could not save this report.');
      }
    });
  }

  function refreshHistory() {
    const rows = reports();
    renderTable(historyContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'project', label: 'Project' },
        { key: 'submittedBy', label: 'Submitted By', render: (r) => employeeName(r.submittedBy) },
        { key: 'breakdowns', label: 'Breakdowns', render: (r) => {
          const count = (r.lines || []).filter((l) => l.status === 'Breakdown').length;
          return count ? statusPill('Down') : '—';
        } },
        { key: 'notActive', label: 'Not Active', render: (r) => String((r.lines || []).filter((l) => l.status === 'Not Active').length) },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => { editingId = r.id; renderForm(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
            onDelete: async () => {
              if (!confirmDelete(`the ${formatDate(r.date)} report`)) return;
              try {
                await store.remove('machineStatusReports', r.id);
                refreshHistory();
              } catch (err) {
                window.alert(err.message || 'Could not delete this report.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No machine status reports submitted yet.',
    });
  }

  renderForm();
  refreshHistory();
}
