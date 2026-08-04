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

function timeStringToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
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
      const blockNumberField = textField('blockNumber', 'Block / Plot No. (if available for this site)', 'text', record?.blockNumber);
      const customerField = selectField('customerId', 'Client', customerOptions(), record?.customerId);
      const equipmentField = selectField('equipment', 'Equipment Used', equipmentOptions(), record?.equipment);
      const operatorField = selectField('operatorId', 'Operator', employeeOptions(), record?.operatorId);
      const supervisorField = selectField('supervisorId', 'Supervisor', employeeOptions(), record?.supervisorId);
      const timeResumedField = textField('timeResumed', 'Time In (Resumed) — used to auto-calculate Hours Worked', 'time', record?.timeResumed);
      const timeClosedField = textField('timeClosed', 'Time Out (Closed) — used to auto-calculate Hours Worked', 'time', record?.timeClosed);
      const downtimeReasonField = selectField('downtimeReason', 'Downtime Reason (if any)', [
        { value: '', label: '— None —' },
        { value: 'Dozer Breakdown', label: 'Dozer Breakdown' },
        { value: 'Community Disturbance', label: 'Community Disturbance' },
        { value: 'Operator Delay / Infringement', label: 'Operator Delay / Infringement — deducted hours count against the operator' },
        { value: 'Other', label: 'Other' },
      ], record?.downtimeReason);
      const downtimeHoursField = textField('downtimeHours', 'Downtime (hrs)', 'number', record?.downtimeHours);
      const downtimeMinutesField = textField('downtimeMinutes', 'Downtime (mins)', 'number', record?.downtimeMinutes);
      const hoursField = textField('hoursWorked', 'Hours Worked (auto-calculated from Time In/Out minus Downtime — editable if entering by hand)', 'number', record?.hoursWorked, true);
      const operationTypeField = selectField('operationType', 'Operation Type', OPERATION_TYPES.map((t) => ({ value: t.value, label: `${t.value} (${t.unit})` })), record?.operationType);
      const quantityField = textField('quantity', 'Quantity (unit shown next to the selected Operation Type, above)', 'number', record?.quantity, true);
      const dieselSuppliedField = textField('dieselSupplied', 'Diesel Supplied (litres) — added to the tank today', 'number', record?.dieselSupplied);
      const openingDieselField = textField('openingDiesel', "Opening Diesel (litres) — auto-fills from this dozer's last logged Closing Diesel plus today's Diesel Supplied", 'number', record?.openingDiesel);
      const fuelField = textField('fuelUsed', "Fuel/Diesel Used (litres) — auto-calculated from the dozer's Consumption Rate (Fleet Roster) × Hours Worked", 'number', record?.fuelUsed, true);
      const closingDieselField = textField('closingDiesel', 'Closing Diesel (litres) — auto-calculated as Opening Diesel minus Fuel Used; overwrite with an actual tank dip if you have one', 'number', record?.closingDiesel);
      const statusField = selectField('status', 'Status', [
        { value: 'Completed', label: 'Completed' },
        { value: 'Ongoing', label: 'Ongoing' },
        { value: 'Halted', label: 'Halted' },
      ], record?.status || 'Completed');

      // The diesel tank ledger for this dozer, in the same order the real
      // end-of-day report follows: Opening = this dozer's last logged
      // Closing Diesel (most recent prior report, any date before this
      // one) + today's Diesel Supplied. Diesel Used = the dozer's
      // configured consumption rate (Fleet Management → Fleet Roster) x
      // Hours Worked, tiered around the first 8 hrs/day since most dozers
      // burn less once past that — Trekking uses its own flat rate
      // instead of the tiered one. Closing = Opening − Used. Every field
      // stays plain and editable so a real tank dip always wins over the
      // computed estimate; it just won't be recomputed again unless one
      // of its own driving inputs changes.
      function latestClosingDieselBefore(equipment, date) {
        if (!equipment || !date) return null;
        const rows = store.get('operations')
          .filter((o) => o.equipment === equipment && o.date < date && o.closingDiesel !== null && o.closingDiesel !== undefined)
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        return rows.length ? rows[0].closingDiesel : null;
      }

      function recomputeOpeningDiesel() {
        const equipment = equipmentField.querySelector('select').value;
        const date = dateField.querySelector('input').value;
        const prevClosing = latestClosingDieselBefore(equipment, date);
        const supplied = Number(dieselSuppliedField.querySelector('input').value) || 0;
        if (prevClosing === null && !supplied) return;
        openingDieselField.querySelector('input').value = ((prevClosing || 0) + supplied).toFixed(1);
      }

      function recomputeDieselUsed() {
        const asset = store.get('inventory').find((i) => i.name === equipmentField.querySelector('select').value);
        if (!asset) return;
        const opType = operationTypeField.querySelector('select').value;
        const hours = Number(hoursField.querySelector('input').value) || 0;
        let used = null;
        if (opType === 'Trekking') {
          if (asset.dieselRateTrekking) used = hours * asset.dieselRateTrekking;
        } else if (asset.dieselRateFirst8h || asset.dieselRateAfter8h) {
          const first8 = Math.min(hours, 8);
          const rest = Math.max(0, hours - 8);
          used = first8 * (asset.dieselRateFirst8h || 0) + rest * (asset.dieselRateAfter8h || asset.dieselRateFirst8h || 0);
        }
        if (used !== null) fuelField.querySelector('input').value = used.toFixed(1);
      }

      function recomputeClosingDiesel() {
        const opening = openingDieselField.querySelector('input').value;
        if (opening === '') return;
        const used = Number(fuelField.querySelector('input').value) || 0;
        closingDieselField.querySelector('input').value = Math.max(0, Number(opening) - used).toFixed(1);
      }

      openingDieselField.querySelector('input').addEventListener('input', recomputeClosingDiesel);
      fuelField.querySelector('input').addEventListener('input', recomputeClosingDiesel);
      dieselSuppliedField.querySelector('input').addEventListener('input', () => { recomputeOpeningDiesel(); recomputeClosingDiesel(); });
      dateField.querySelector('input').addEventListener('input', () => { recomputeOpeningDiesel(); recomputeClosingDiesel(); });
      equipmentField.querySelector('select').addEventListener('change', () => { recomputeOpeningDiesel(); recomputeDieselUsed(); recomputeClosingDiesel(); });
      operationTypeField.querySelector('select').addEventListener('change', () => { recomputeDieselUsed(); recomputeClosingDiesel(); });
      hoursField.querySelector('input').addEventListener('input', () => { recomputeDieselUsed(); recomputeClosingDiesel(); });

      // Hours Worked auto-fills the moment both Time In and Time Out are set
      // — the raw shift span, minus any logged Downtime (breakdown, community
      // disturbance, or an operator's own delay/infringement). Deducting
      // downtime here is what actually "punishes" an at-fault operator: this
      // same hoursWorked figure is what Operator Allowance pays against and
      // what Profitability charges as dozer cost, so fewer credited hours
      // means less day-rate pay, automatically, with no separate penalty
      // step needed. Still a plain editable input when times aren't tracked.
      function recomputeHoursWorked() {
        const resumedMin = timeStringToMinutes(timeResumedField.querySelector('input').value);
        const closedMin = timeStringToMinutes(timeClosedField.querySelector('input').value);
        if (resumedMin === null || closedMin === null) return;
        let span = closedMin - resumedMin;
        if (span < 0) span += 24 * 60; // shift crossing midnight
        const downHrs = Number(downtimeHoursField.querySelector('input').value) || 0;
        const downMins = Number(downtimeMinutesField.querySelector('input').value) || 0;
        const netMinutes = Math.max(0, span - (downHrs * 60 + downMins));
        hoursField.querySelector('input').value = (netMinutes / 60).toFixed(2);
        // Setting .value directly doesn't fire hoursField's own 'input'
        // listener, so Diesel Used (which depends on Hours Worked) needs
        // an explicit nudge here too.
        recomputeDieselUsed();
        recomputeClosingDiesel();
      }
      [timeResumedField, timeClosedField, downtimeHoursField, downtimeMinutesField].forEach((field) => {
        field.querySelector('input').addEventListener('input', recomputeHoursWorked);
      });

      const topGrid = el('div', { class: 'form-grid-2' }, [
        dateField, siteField, blockNumberField, customerField, equipmentField, operatorField, supervisorField,
        timeResumedField, timeClosedField, downtimeReasonField, downtimeHoursField, downtimeMinutesField, hoursField,
        operationTypeField, quantityField,
        dieselSuppliedField, openingDieselField, fuelField, closingDieselField, statusField,
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
          blockNumber: blockNumberField.querySelector('input').value || null,
          customerId: customerField.querySelector('select').value,
          equipment,
          operatorId: operatorField.querySelector('select').value,
          supervisorId: supervisorField.querySelector('select').value,
          hoursWorked: Number(hoursField.querySelector('input').value) || 0,
          timeResumed: timeResumedField.querySelector('input').value || null,
          timeClosed: timeClosedField.querySelector('input').value || null,
          downtimeReason: downtimeReasonField.querySelector('select').value || null,
          downtimeHours: downtimeHoursField.querySelector('input').value === '' ? null : Number(downtimeHoursField.querySelector('input').value),
          downtimeMinutes: downtimeMinutesField.querySelector('input').value === '' ? null : Number(downtimeMinutesField.querySelector('input').value),
          operationType: operationTypeField.querySelector('select').value,
          quantity: Number(quantityField.querySelector('input').value) || 0,
          openingDiesel: openingDieselField.querySelector('input').value === '' ? null : Number(openingDieselField.querySelector('input').value),
          dieselSupplied: dieselSuppliedField.querySelector('input').value === '' ? null : Number(dieselSuppliedField.querySelector('input').value),
          closingDiesel: closingDieselField.querySelector('input').value === '' ? null : Number(closingDieselField.querySelector('input').value),
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
        const haystack = [r.siteName, r.blockNumber, r.equipment, r.operationType, operatorName, r.notes].join(' ').toLowerCase();
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
    const totalDowntimeMinutes = rows.reduce((sum, r) => sum + ((Number(r.downtimeHours) || 0) * 60 + (Number(r.downtimeMinutes) || 0)), 0);

    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard({ label: 'Total Area Cleared', value: `${totalArea.toFixed(1)} Ha` }));
    summaryGrid.appendChild(statCard({ label: 'Total Road', value: `${totalRoad.toFixed(1)} KM` }));
    summaryGrid.appendChild(statCard({ label: 'Total Trekking', value: `${totalTrekking.toFixed(1)} hrs` }));
    summaryGrid.appendChild(statCard({ label: 'Total Fuel Used', value: `${totalFuel.toLocaleString()} L` }));
    summaryGrid.appendChild(statCard({ label: 'Total Downtime', value: `${Math.floor(totalDowntimeMinutes / 60)}h ${totalDowntimeMinutes % 60}m` }));
    summaryGrid.appendChild(statCard({ label: 'Ongoing Sites', value: String(ongoing) }));
    summaryGrid.appendChild(statCard({ label: 'Reports Logged', value: String(rows.length) }));

    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'siteName', label: 'Site' },
        { key: 'blockNumber', label: 'Block/Plot', render: (r) => r.blockNumber || '—' },
        { key: 'customer', label: 'Client', render: (r) => customers.find((c) => c.id === r.customerId)?.name || '—' },
        { key: 'equipment', label: 'Equipment' },
        { key: 'operator', label: 'Operator', render: (r) => employees.find((e) => e.id === r.operatorId)?.name || 'Unknown' },
        { key: 'hoursWorked', label: 'Hours', render: (r) => `${r.hoursWorked} h` },
        { key: 'timeResumed', label: 'Resumed', render: (r) => r.timeResumed || '—' },
        { key: 'timeClosed', label: 'Closed', render: (r) => r.timeClosed || '—' },
        { key: 'downtime', label: 'Downtime', render: (r) => {
          const hrs = Number(r.downtimeHours) || 0;
          const mins = Number(r.downtimeMinutes) || 0;
          if (!hrs && !mins) return '—';
          const parts = [];
          if (hrs) parts.push(`${hrs}h`);
          if (mins) parts.push(`${mins}m`);
          return `${parts.join(' ')}${r.downtimeReason ? ` — ${r.downtimeReason}` : ''}`;
        } },
        { key: 'operationType', label: 'Operation Type' },
        { key: 'quantity', label: 'Quantity', render: (r) => `${r.quantity} ${unitForOperationType(r.operationType)}` },
        { key: 'fuelUsed', label: 'Fuel', render: (r) => `${r.fuelUsed} L` },
        { key: 'closingDiesel', label: 'C. Diesel', render: (r) => (r.closingDiesel === null || r.closingDiesel === undefined ? '—' : `${r.closingDiesel} L`) },
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
