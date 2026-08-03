import { store } from '../store.js';
import { formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard } from '../ui.js';
import { OPERATION_TYPES, unitForOperationType, isHaOperationType } from '../constants.js';
import { filterByProject, getAssignedProject } from '../session.js';
import { createAttachmentPicker } from '../attachments.js';

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function customerOptions() {
  return [{ value: '', label: '— None —' }, ...store.get('customers').map((c) => ({ value: c.id, label: c.name }))];
}

function equipmentOptions() {
  const items = store.get('inventory').filter((i) => ['Heavy Equipment', 'Tools', 'Vehicles'].includes(i.category));
  return items.length
    ? items.map((i) => ({ value: i.name, label: i.name }))
    : [{ value: '', label: 'No equipment in inventory' }];
}

function equipmentOwnership(name) {
  return store.get('inventory').find((i) => i.name === name)?.ownership || 'Company';
}

function needsWorkType(name) {
  const ownership = equipmentOwnership(name);
  return ownership === 'Partnership' || ownership === 'Rented';
}

function selectField(name, label, options, value) {
  const select = el('select', { name }, options.map((o) => {
    const opt = el('option', { value: o.value }, o.label);
    if (String(o.value) === String(value ?? '')) opt.setAttribute('selected', 'selected');
    return opt;
  }));
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label), select]);
}

function textField(name, label, type, value, required) {
  const input = el('input', { type: type || 'text', name, required: required ? 'required' : undefined, step: type === 'number' ? '0.1' : undefined, min: type === 'number' ? 0 : undefined });
  input.value = value ?? '';
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label + (required ? ' *' : '')), input]);
}

function openForm(record, refresh) {
  if (!employeeOptions().length) {
    window.alert('Add employees first before logging an operations report.');
    return;
  }

  openCustomModal({
    title: record ? 'Edit Daily Report' : 'Log Daily Report',
    wide: true,
    build: (container) => {
      const today = new Date().toISOString().slice(0, 10);
      const dateField = textField('date', 'Date', 'date', record?.date || today, true);
      const siteField = selectField('siteName', 'Site / Project Name', projectOptions(), record?.siteName ?? getAssignedProject());
      const customerField = selectField('customerId', 'Client', customerOptions(), record?.customerId);
      const equipmentField = selectField('equipment', 'Equipment Used', equipmentOptions(), record?.equipment);
      const operatorField = selectField('operatorId', 'Operator', employeeOptions(), record?.operatorId);
      const supervisorField = selectField('supervisorId', 'Supervisor', employeeOptions(), record?.supervisorId);
      const hoursField = textField('hoursWorked', 'Hours Worked', 'number', record?.hoursWorked, true);
      const operationTypeField = selectField('operationType', 'Operation Type', OPERATION_TYPES.map((t) => ({ value: t.value, label: `${t.value} (${t.unit})` })), record?.operationType);
      const quantityField = textField('quantity', 'Quantity (unit shown next to the selected Operation Type, above)', 'number', record?.quantity, true);
      const fuelField = textField('fuelUsed', 'Fuel Used (litres)', 'number', record?.fuelUsed, true);
      const statusField = selectField('status', 'Status', [
        { value: 'Completed', label: 'Completed' },
        { value: 'Ongoing', label: 'Ongoing' },
        { value: 'Halted', label: 'Halted' },
      ], record?.status || 'Completed');

      const topGrid = el('div', { class: 'form-grid-2' }, [
        dateField, siteField, customerField, equipmentField, operatorField, supervisorField,
        hoursField, operationTypeField, quantityField, fuelField, statusField,
      ]);

      // Only Partnership/Rented dozers need the Office/Business question —
      // Company-owned dozers have no owner to keep a formal ledger for.
      const workTypeField = selectField('workType', 'Work Type', [
        { value: 'Office', label: 'Office — formal, goes on the ledger shared with the owner' },
        { value: 'Business', label: 'Business — private arrangement, never shown to the owner' },
      ], record?.workType || 'Office');
      const businessAmountField = textField('businessAmount', "Business Amount (₦) — operator's additional earning for this day", 'number', record?.businessAmount);
      const workTypeWrap = el('div', { class: 'form-grid-2' }, [workTypeField, businessAmountField]);

      function updateWorkTypeVisibility() {
        workTypeWrap.style.display = needsWorkType(equipmentField.querySelector('select').value) ? '' : 'none';
      }
      equipmentField.querySelector('select').addEventListener('change', updateWorkTypeVisibility);
      updateWorkTypeVisibility();

      const notesInput = el('textarea', { name: 'notes', rows: 2 });
      notesInput.value = record?.notes || '';
      const notesField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Notes'), notesInput]);

      const attachmentPicker = createAttachmentPicker(record?.attachments || []);
      const attachmentField = el('label', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'KML Boundary File / Photos (viewable under Projects → Map View / Photo Gallery)'),
        attachmentPicker.element,
      ]);

      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, record ? 'Save Changes' : 'Log Report'),
      ]);
      const submitBtn = actions.lastChild;

      submitBtn.addEventListener('click', async () => {
        const equipment = equipmentField.querySelector('select').value;
        const relevant = needsWorkType(equipment);
        const workType = relevant ? workTypeField.querySelector('select').value : null;

        const payload = {
          date: dateField.querySelector('input').value,
          siteName: siteField.querySelector('select').value,
          customerId: customerField.querySelector('select').value,
          equipment,
          operatorId: operatorField.querySelector('select').value,
          supervisorId: supervisorField.querySelector('select').value,
          hoursWorked: Number(hoursField.querySelector('input').value) || 0,
          operationType: operationTypeField.querySelector('select').value,
          quantity: Number(quantityField.querySelector('input').value) || 0,
          fuelUsed: Number(fuelField.querySelector('input').value) || 0,
          status: statusField.querySelector('select').value,
          notes: notesInput.value,
          workType,
          businessAmount: workType === 'Business' ? (Number(businessAmountField.querySelector('input').value) || 0) : null,
          attachments: attachmentPicker.getAttachments(),
        };

        if (!payload.date) { window.alert('Date is required.'); return; }
        if (!payload.siteName) { window.alert('Site / Project is required.'); return; }
        if (!payload.equipment) { window.alert('Equipment is required.'); return; }
        if (!payload.operatorId) { window.alert('Operator is required.'); return; }
        if (!payload.supervisorId) { window.alert('Supervisor is required.'); return; }
        if (!payload.operationType) { window.alert('Operation Type is required.'); return; }

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';
          if (record) await store.update('operations', record.id, payload);
          else await store.add('operations', payload);
          closeModal();
          refresh();
        } catch (err) {
          window.alert(err.message || 'Could not save this report.');
          submitBtn.disabled = false;
          submitBtn.textContent = record ? 'Save Changes' : 'Log Report';
        }
      });

      container.appendChild(topGrid);
      container.appendChild(workTypeWrap);
      container.appendChild(notesField);
      container.appendChild(attachmentField);
      container.appendChild(actions);
    },
  });
}

export function renderOperations(container) {
  container.innerHTML = '';

  const assignedProject = getAssignedProject();
  container.appendChild(sectionHeader(
    'Daily Land Clearing Operations',
    assignedProject ? `Showing ${assignedProject} only — site activity, equipment usage, and progress logs` : 'Site activity, equipment usage, and progress logs',
    el('button', { class: 'btn btn-primary', onClick: () => openForm(null, refresh) }, '+ Log Daily Report'),
  ));

  const summaryGrid = el('div', { class: 'stats-grid' });
  container.appendChild(summaryGrid);

  let searchQuery = '';
  const searchInput = el('input', { type: 'search', placeholder: 'Search by site, equipment, operator, or notes…' });
  const searchBar = el('div', { class: 'search-bar' }, [searchInput]);
  container.appendChild(searchBar);
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    refresh();
  });

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const employees = store.get('employees');
    const customers = store.get('customers');
    let rows = filterByProject(store.get('operations'), 'siteName').slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    if (searchQuery) {
      rows = rows.filter((r) => {
        const operatorName = employees.find((e) => e.id === r.operatorId)?.name || '';
        const haystack = [r.siteName, r.equipment, r.operationType, operatorName, r.notes].join(' ').toLowerCase();
        return haystack.includes(searchQuery);
      });
    }

    const haRows = rows.filter((r) => isHaOperationType(r.operationType));
    const roadRows = rows.filter((r) => r.operationType === 'Road');
    const trekkingRows = rows.filter((r) => r.operationType === 'Trekking');
    const totalArea = haRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalRoad = roadRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalTrekking = trekkingRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalFuel = rows.reduce((sum, r) => sum + r.fuelUsed, 0);
    const ongoing = rows.filter((r) => r.status === 'Ongoing').length;

    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard({ label: 'Total Area Cleared', value: `${totalArea.toFixed(1)} Ha` }));
    summaryGrid.appendChild(statCard({ label: 'Total Road', value: `${totalRoad.toFixed(1)} KM` }));
    summaryGrid.appendChild(statCard({ label: 'Total Trekking', value: `${totalTrekking.toFixed(1)} hrs` }));
    summaryGrid.appendChild(statCard({ label: 'Total Fuel Used', value: `${totalFuel.toLocaleString()} L` }));
    summaryGrid.appendChild(statCard({ label: 'Ongoing Sites', value: String(ongoing) }));
    summaryGrid.appendChild(statCard({ label: 'Reports Logged', value: String(rows.length) }));

    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'siteName', label: 'Site' },
        { key: 'customer', label: 'Client', render: (r) => customers.find((c) => c.id === r.customerId)?.name || '—' },
        { key: 'equipment', label: 'Equipment' },
        { key: 'operator', label: 'Operator', render: (r) => employees.find((e) => e.id === r.operatorId)?.name || 'Unknown' },
        { key: 'hoursWorked', label: 'Hours', render: (r) => `${r.hoursWorked} h` },
        { key: 'operationType', label: 'Operation Type' },
        { key: 'quantity', label: 'Quantity', render: (r) => `${r.quantity} ${unitForOperationType(r.operationType)}` },
        { key: 'fuelUsed', label: 'Fuel', render: (r) => `${r.fuelUsed} L` },
        { key: 'workType', label: 'Work Type', render: (r) => (r.workType ? statusPill(r.workType) : '—') },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'attachments', label: 'Files', render: (r) => (r.attachments?.length ? `📎 ${r.attachments.length}` : '—') },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openForm(r, refresh),
            onDelete: async () => {
              if (!confirmDelete(`${r.siteName} — ${formatDate(r.date)}`)) return;
              try {
                await store.remove('operations', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this report.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No operations logged yet.',
    });
  }

  refresh();
}
