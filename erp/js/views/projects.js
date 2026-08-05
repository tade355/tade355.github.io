import { store } from '../store.js';
import { formatCurrency, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { renderOperationsMap } from './operationsMap.js';
import { renderOperationsGallery } from './operationsGallery.js';
import { getCurrentTier } from '../session.js';
import { formatDate } from '../utils.js';
import { renderWeeklyReport } from './weeklyReport.js';
import { renderProfitability } from './profitability.js';
import { renderRevenueReconciliation } from './revenueReconciliationView.js';
import { OPERATION_TYPES } from '../constants.js';

const FIELDS = [
  { name: 'name', label: 'Project Name', required: true },
  { name: 'status', label: 'Status', type: 'select', required: true, options: [
    { value: 'Active', label: 'Active' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Completed', label: 'Completed' },
  ] },
  { name: 'contractStatus', label: 'Contract / T&C Status', type: 'select', options: [
    { value: '', label: '— Not set —' },
    { value: 'Draft', label: 'Draft' },
    { value: 'Pending Signature', label: 'Pending Signature' },
    { value: 'Signed', label: 'Signed' },
    { value: 'Expired', label: 'Expired' },
  ] },
  { name: 'percentComplete', label: 'Percent Complete (%)', type: 'number', min: 0, step: '1' },
  { name: 'rate', label: 'Default Rate (₦) — used when no operation-type-specific rate is set in Rate History', type: 'number', min: 0 },
  { name: 'rateUnit', label: 'Default Rate Unit (e.g. per Ha, per KM)', },
  { name: 'expectedRatePerDay', label: 'Expected Rate/Day (Ha) — for weekly productivity tracking', type: 'number', min: 0, step: '0.1' },
  { name: 'startDate', label: 'Project Start Date — for Milestone Tracker', type: 'date' },
  { name: 'totalAreaHa', label: 'Total Contract Area (Ha) — for Milestone Tracker', type: 'number', min: 0, step: '0.1' },
  { name: 'scope', label: 'Scope of Work', type: 'textarea' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

export function renderProjects(container) {
  container.innerHTML = '';

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Projects', 'Every project the company is running — status, contract state, progress, and rate', actionSlot));

  // Managing the Projects entity itself (status, contract, rate) stays
  // Admin/Accounts-only, same as before — Supervisors get here only for the
  // Map View and Photo Gallery of the sites they report on.
  const canManageProjects = ['Admin', 'Accounts'].includes(getCurrentTier());

  let tab = canManageProjects ? 'projects' : 'map';
  const tabBar = el('div', { class: 'tab-bar' });
  const projectsTabBtn = canManageProjects
    ? el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('projects') }, 'Projects')
    : null;
  const mapTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('map') }, 'Map View');
  const galleryTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('gallery') }, 'Photo Gallery');
  const weeklyReportTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('weeklyReport') }, 'Weekly Report');
  const rateHistoryTabBtn = canManageProjects
    ? el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('rateHistory') }, 'Rate History')
    : null;
  const profitabilityTabBtn = canManageProjects
    ? el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('profitability') }, 'Profitability')
    : null;
  const reconciliationTabBtn = canManageProjects
    ? el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('reconciliation') }, 'Revenue Reconciliation')
    : null;
  if (projectsTabBtn) tabBar.appendChild(projectsTabBtn);
  tabBar.appendChild(mapTabBtn);
  tabBar.appendChild(galleryTabBtn);
  tabBar.appendChild(weeklyReportTabBtn);
  if (rateHistoryTabBtn) tabBar.appendChild(rateHistoryTabBtn);
  if (profitabilityTabBtn) tabBar.appendChild(profitabilityTabBtn);
  if (reconciliationTabBtn) tabBar.appendChild(reconciliationTabBtn);
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    if (projectsTabBtn) projectsTabBtn.classList.toggle('active', tab === 'projects');
    mapTabBtn.classList.toggle('active', tab === 'map');
    galleryTabBtn.classList.toggle('active', tab === 'gallery');
    weeklyReportTabBtn.classList.toggle('active', tab === 'weeklyReport');
    if (rateHistoryTabBtn) rateHistoryTabBtn.classList.toggle('active', tab === 'rateHistory');
    if (profitabilityTabBtn) profitabilityTabBtn.classList.toggle('active', tab === 'profitability');
    if (reconciliationTabBtn) reconciliationTabBtn.classList.toggle('active', tab === 'reconciliation');
    if (tab === 'projects') renderProjectsTab();
    else if (tab === 'map') renderMapTab();
    else if (tab === 'gallery') renderGalleryTab();
    else if (tab === 'weeklyReport') renderWeeklyReportTab();
    else if (tab === 'rateHistory') renderRateHistoryTab();
    else if (tab === 'profitability') renderProfitabilityTab();
    else renderReconciliationTab();
  }

  function renderMapTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderOperationsMap(body);
  }

  function renderGalleryTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderOperationsGallery(body);
  }

  function renderWeeklyReportTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderWeeklyReport(body);
  }

  function renderProfitabilityTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderProfitability(body);
  }

  function renderReconciliationTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderRevenueReconciliation(body);
  }

  function renderRateHistoryTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openRateHistoryForm() }, '+ Log Rate Change'));

    body.innerHTML = '';
    body.appendChild(el('p', { class: 'section-subtitle' }, "Every contract rate change, by project, operation type, and effective date. Most contracts price each operation type separately (a hectare's value isn't earned until every operation type contracted for it is done) — a rate logged with no Operation Type is a general/fallback rate for the whole project instead. Provisional revenue (Profitability, Revenue Reconciliation) uses the operation-type-specific rate in effect on each day's operations where one exists, falling back to the general rate otherwise." }));

    const projectSelect = el('select', {}, [
      el('option', { value: 'all' }, 'All Projects'),
      ...store.get('projects').map((p) => el('option', { value: p.name }, p.name)),
    ]);
    const operationTypeSelect = el('select', {}, [
      el('option', { value: 'all' }, 'All Operation Types'),
      el('option', { value: 'general' }, 'General (no operation type)'),
      ...OPERATION_TYPES.map((t) => el('option', { value: t.value }, t.value)),
    ]);
    body.appendChild(el('div', { class: 'filter-bar' }, [
      el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]),
      el('label', { class: 'filter-field' }, [el('span', {}, 'Operation Type'), operationTypeSelect]),
    ]));

    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      let rows = store.get('projectRateHistory').slice().sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
      if (projectSelect.value !== 'all') rows = rows.filter((r) => r.project === projectSelect.value);
      if (operationTypeSelect.value === 'general') rows = rows.filter((r) => !r.operationType);
      else if (operationTypeSelect.value !== 'all') rows = rows.filter((r) => r.operationType === operationTypeSelect.value);

      renderTable(tableContainer, {
        columns: [
          { key: 'project', label: 'Project' },
          { key: 'operationType', label: 'Operation Type', render: (r) => r.operationType || 'General (all operations)' },
          { key: 'effectiveDate', label: 'Effective From', render: (r) => formatDate(r.effectiveDate) },
          { key: 'rate', label: 'Rate', render: (r) => (r.rate ? `${formatCurrency(r.rate)} ${r.rateUnit || ''}`.trim() : '—') },
          { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openRateHistoryForm(r),
              onDelete: async () => {
                if (!confirmDelete(`${r.project} rate change on ${formatDate(r.effectiveDate)}`)) return;
                try {
                  await store.remove('projectRateHistory', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this rate history entry.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No rate changes logged yet.',
      });
    }

    [projectSelect, operationTypeSelect].forEach((input) => input.addEventListener('change', refresh));

    function openRateHistoryForm(record) {
      if (!store.get('projects').length) { window.alert('Add a project first.'); return; }
      openModal({
        title: record ? 'Edit Rate Change' : 'Log Rate Change',
        fields: [
          { name: 'project', label: 'Project', type: 'select', required: true, options: store.get('projects').map((p) => ({ value: p.name, label: p.name })) },
          { name: 'operationType', label: 'Operation Type', type: 'select', options: [
            { value: '', label: '— General (all operations) —' },
            ...OPERATION_TYPES.map((t) => ({ value: t.value, label: t.value })),
          ] },
          { name: 'effectiveDate', label: 'Effective From', type: 'date', required: true },
          { name: 'rate', label: 'Rate (₦)', type: 'number', min: 0 },
          { name: 'rateUnit', label: 'Rate Unit (e.g. per Ha, per KM)' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
        initial: record || { effectiveDate: new Date().toISOString().slice(0, 10) },
        submitLabel: record ? 'Save Changes' : 'Log Rate Change',
        onSubmit: async (data) => {
          if (record) await store.update('projectRateHistory', record.id, data);
          else await store.add('projectRateHistory', data);
          refresh();
        },
      });
    }

    refresh();
  }

  function renderProjectsTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Project'));

    body.innerHTML = '';
    const summaryGrid = el('div', { class: 'stats-grid' });
    body.appendChild(summaryGrid);

    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      const rows = store.get('projects').slice().sort((a, b) => a.name.localeCompare(b.name));
      const active = rows.filter((r) => r.status === 'Active').length;
      const unsigned = rows.filter((r) => r.contractStatus && r.contractStatus !== 'Signed').length;

      summaryGrid.innerHTML = '';
      summaryGrid.appendChild(statCard({ label: 'Total Projects', value: String(rows.length) }));
      summaryGrid.appendChild(statCard({ label: 'Active', value: String(active), tone: 'good' }));
      summaryGrid.appendChild(statCard({ label: 'Contract Not Signed', value: String(unsigned), tone: unsigned ? 'warning' : 'good' }));

      renderTable(tableContainer, {
        columns: [
          { key: 'name', label: 'Project' },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          { key: 'contractStatus', label: 'Contract Status', render: (r) => (r.contractStatus ? statusPill(r.contractStatus) : '—') },
          { key: 'percentComplete', label: 'Complete', render: (r) => (r.percentComplete === null || r.percentComplete === undefined ? '—' : `${r.percentComplete}%`) },
          { key: 'rate', label: 'Rate', render: (r) => (r.rate ? `${formatCurrency(r.rate)} ${r.rateUnit || ''}`.trim() : '—') },
          { key: 'scope', label: 'Scope', render: (r) => r.scope || '—' },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.name)) return;
                try {
                  await store.remove('projects', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this project.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No projects yet. Add your first one.',
      });
    }

    function openForm(record) {
      openModal({
        title: record ? 'Edit Project' : 'Add Project',
        fields: FIELDS,
        initial: record || { status: 'Active' },
        submitLabel: record ? 'Save Changes' : 'Add Project',
        onSubmit: async (data) => {
          // Mirrors the Fleet Asset rate-history auto-log: a new project always
          // gets an opening rate entry, an edit only logs one if the rate
          // actually moved, so untouched saves don't clutter Rate History.
          const rateChanged = !record || Number(data.rate || 0) !== Number(record.rate || 0) || (data.rateUnit || '') !== (record.rateUnit || '');
          if (record) await store.update('projects', record.id, data);
          else await store.add('projects', data);
          if (rateChanged && data.rate) {
            await store.add('projectRateHistory', {
              project: data.name,
              effectiveDate: new Date().toISOString().slice(0, 10),
              rate: data.rate || 0,
              rateUnit: data.rateUnit || '',
              notes: record ? 'Auto-logged from Project edit' : 'Initial rate on project creation',
            });
          }
          refresh();
        },
      });
    }

    refresh();
  }

  setTab(tab);
}
