import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard } from '../ui.js';
import { DOZER_OVERTIME_RATE_DEFAULT } from '../constants.js';
import { printDozerPayslip, printDozerPayrollRegister } from '../print.js';

function employeeLabel(id) {
  const e = store.get('employees').find((x) => x.id === id);
  return e ? `${e.name} (${e.role})` : 'Unknown';
}

function employeeNameOnly(id) {
  return store.get('employees').find((x) => x.id === id)?.name || 'Unknown';
}

// Operators paid per day only make sense for Company/Partnership dozers —
// Rented dozer operators are paid directly by the owner, not the company.
function payableEquipmentNames() {
  return new Set(store.get('inventory').filter((i) => i.ownership === 'Company' || i.ownership === 'Partnership' || !i.ownership).map((i) => i.name));
}

function operatorStatsFor(employeeId, from, to) {
  const equipmentNames = payableEquipmentNames();
  const allRows = store.get('operations').filter((o) => o.operatorId === employeeId && dateInRange(o.date, from, to));
  // Normal day-rate pay (days + overtime) only comes from Company/Partnership
  // dozers — a Rented dozer's normal days are paid by its owner, not the
  // company. Business-day earnings are tracked regardless of dozer category,
  // since that's the operator's side arrangement, not the normal wage.
  const payRows = allRows.filter((o) => equipmentNames.has(o.equipment));

  // Field logs report a fractional "Comb Work Day" (e.g. a half day), not a
  // flat 1.0 for any date with a report — so days worked is hours-based.
  // Hours are summed per calendar date first (an operator can have more
  // than one report on the same date) before splitting each date into a
  // fractional day (capped at 1.0, i.e. 8h/day) and overtime beyond 8h.
  const hoursByDate = {};
  payRows.forEach((o) => {
    hoursByDate[o.date] = (hoursByDate[o.date] || 0) + (o.hoursWorked || 0);
  });
  let daysWorked = 0;
  let overtimeHours = 0;
  Object.values(hoursByDate).forEach((hours) => {
    daysWorked += Math.min(hours, 8) / 8;
    overtimeHours += Math.max(0, hours - 8);
  });
  daysWorked = Math.round(daysWorked * 100) / 100;

  const businessEarnings = allRows.filter((o) => o.workType === 'Business').reduce((sum, o) => sum + (o.businessAmount || 0), 0);
  const equipment = [...new Set(allRows.map((o) => o.equipment))].join(', ');
  return { daysWorked, overtimeHours, businessEarnings, equipment };
}

function netPay(line) {
  return (line.daysWorked || 0) * (line.dayRate || 0)
    + (line.overtimeHours || 0) * (line.overtimeRate || 0)
    + (line.businessEarnings || 0)
    - (line.deductions || 0);
}

function runTotal(run) {
  return run.lines.reduce((sum, l) => sum + netPay(l), 0);
}

// Running balance across every non-Draft run: what's been earned vs. what's
// actually been paid out — this is what lets the accountant see, at a
// glance, how much an operator is still owed (or overpaid).
function balanceOwed(employeeId) {
  let earned = 0;
  let paid = 0;
  store.get('dozerPayrollRuns').filter((r) => r.status !== 'Draft').forEach((run) => {
    run.lines.filter((l) => l.employeeId === employeeId).forEach((l) => {
      earned += netPay(l);
      paid += l.amountPaid || 0;
    });
  });
  return earned - paid;
}

function buildLineRow(line, onChange, getPeriod, getOvertimeRate, getRunContext) {
  const employee = store.get('employees').find((e) => e.id === line.employeeId);
  const days = el('input', { type: 'number', class: 'dl-days', min: 0, step: '0.01' });
  days.value = line.daysWorked ?? 0;
  const rate = el('input', { type: 'number', class: 'dl-rate', min: 0 });
  rate.value = line.dayRate ?? employee?.dayRate ?? 0;
  const otHours = el('input', { type: 'number', class: 'dl-otHours', min: 0, step: '0.5' });
  otHours.value = line.overtimeHours ?? 0;
  const bizSpan = el('span', { class: 'dl-biz' }, formatCurrency(line.businessEarnings || 0));
  const deductions = el('input', { type: 'number', class: 'dl-deductions', min: 0 });
  deductions.value = line.deductions ?? 0;
  const paid = el('input', { type: 'number', class: 'dl-paid', min: 0 });
  paid.value = line.amountPaid ?? 0;
  const netSpan = el('strong', { class: 'dl-net' }, formatCurrency(0));
  const printBtn = el('button', { type: 'button', class: 'icon-btn', title: 'Print payslip' }, '🖨');
  const removeBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove' }, '✕');

  let businessEarnings = line.businessEarnings || 0;
  let equipment = line.equipment || '';

  const row = el('div', { class: 'dozer-line-row', 'data-employee-id': line.employeeId }, [
    el('span', {}, employee ? `${employee.name} (${employee.role})` : 'Unknown'),
    days, rate, otHours, bizSpan, deductions, paid, netSpan, printBtn, removeBtn,
  ]);

  printBtn.addEventListener('click', () => {
    printDozerPayslip(getRunContext(), {
      daysWorked: Number(days.value) || 0,
      dayRate: Number(rate.value) || 0,
      overtimeHours: Number(otHours.value) || 0,
      overtimeRate: getOvertimeRate(),
      businessEarnings,
      deductions: Number(deductions.value) || 0,
      amountPaid: Number(paid.value) || 0,
      equipment,
    }, employeeNameOnly(line.employeeId));
  });

  function recompute() {
    netSpan.textContent = formatCurrency(
      (Number(days.value) || 0) * (Number(rate.value) || 0)
      + (Number(otHours.value) || 0) * getOvertimeRate()
      + businessEarnings
      - (Number(deductions.value) || 0),
    );
    onChange();
  }
  [days, rate, otHours, deductions, paid].forEach((inp) => inp.addEventListener('input', recompute));
  removeBtn.addEventListener('click', () => { row.remove(); onChange(); });
  recompute();

  row.recomputeFromRecords = () => {
    const { from, to } = getPeriod();
    if (!from || !to || !line.employeeId) return;
    const stats = operatorStatsFor(line.employeeId, from, to);
    days.value = stats.daysWorked;
    otHours.value = stats.overtimeHours;
    businessEarnings = stats.businessEarnings;
    equipment = stats.equipment;
    bizSpan.textContent = formatCurrency(businessEarnings);
    recompute();
  };
  row.getEquipment = () => equipment;
  row.getBusinessEarnings = () => businessEarnings;
  row.recompute = recompute;

  return row;
}

function openRunForm(record, onSaved) {
  if (!store.get('employees').some((e) => e.status === 'Active' && e.dayRate)) {
    window.alert('No Active employees have a Day Rate set. Set a Day Rate on at least one operator in HR first.');
    return;
  }

  openCustomModal({
    title: record ? `Edit Day-Rate Run — ${formatDate(record.periodStart)} to ${formatDate(record.periodEnd)}` : 'New Day-Rate Payroll Run',
    wide: true,
    build: (container) => {
      const startInput = el('input', { type: 'date', name: 'periodStart' });
      startInput.value = record?.periodStart || new Date().toISOString().slice(0, 10);
      const startField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Period Start *'), startInput]);

      const endInput = el('input', { type: 'date', name: 'periodEnd' });
      endInput.value = record?.periodEnd || new Date().toISOString().slice(0, 10);
      const endField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Period End *'), endInput]);

      const overtimeRateInput = el('input', { type: 'number', min: 0 });
      overtimeRateInput.value = record?.lines?.[0]?.overtimeRate ?? DOZER_OVERTIME_RATE_DEFAULT;
      const overtimeRateField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Overtime Rate (₦/hr, after 8h/day)'), overtimeRateInput]);

      const statusSelect = el('select', { name: 'status' }, ['Draft', 'Approved', 'Paid'].map((s) => {
        const opt = el('option', { value: s }, s);
        if ((record?.status || 'Draft') === s) opt.setAttribute('selected', 'selected');
        return opt;
      }));
      const statusField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Status'), statusSelect]);

      const topGrid = el('div', { class: 'form-grid-2' }, [startField, endField, overtimeRateField, statusField]);

      const getPeriod = () => ({ from: startInput.value, to: endInput.value });
      const getOvertimeRate = () => Number(overtimeRateInput.value) || DOZER_OVERTIME_RATE_DEFAULT;
      const getRunContext = () => ({ id: record?.id || 'DRAFT', periodStart: startInput.value, periodEnd: endInput.value, status: statusSelect.value });

      const itemsHeader = el('div', { class: 'dozer-line-header' }, [
        el('span', {}, 'Operator'), el('span', {}, 'Days'), el('span', {}, 'Day Rate'), el('span', {}, 'OT Hours'),
        el('span', {}, 'Business'), el('span', {}, 'Deductions'), el('span', {}, 'Paid'), el('span', {}, 'Net Pay'), el('span', {}, ''), el('span', {}, ''),
      ]);
      const itemsContainer = el('div', { class: 'line-items-container' });
      const totalDisplay = el('strong', {}, formatCurrency(0));

      function recomputeTotal() {
        let total = 0;
        itemsContainer.querySelectorAll('.dozer-line-row').forEach((row) => {
          total += (Number(row.querySelector('.dl-days').value) || 0) * (Number(row.querySelector('.dl-rate').value) || 0)
            + (Number(row.querySelector('.dl-otHours').value) || 0) * (Number(overtimeRateInput.value) || 0)
            + row.getBusinessEarnings()
            - (Number(row.querySelector('.dl-deductions').value) || 0);
        });
        totalDisplay.textContent = formatCurrency(total);
      }

      const initialLines = record?.lines?.length
        ? record.lines
        : [];
      initialLines.forEach((line) => itemsContainer.appendChild(buildLineRow(line, recomputeTotal, getPeriod, getOvertimeRate, getRunContext)));
      recomputeTotal();

      const addSelect = el('select', {}, [
        el('option', { value: '' }, '+ Add an operator to this run —'),
        ...store.get('employees')
          .filter((e) => e.status === 'Active' && !initialLines.some((l) => l.employeeId === e.id))
          .map((e) => el('option', { value: e.id }, `${e.name} (${e.role})`)),
      ]);
      addSelect.addEventListener('change', () => {
        if (!addSelect.value) return;
        const stats = operatorStatsFor(addSelect.value, startInput.value, endInput.value);
        const employee = store.get('employees').find((e) => e.id === addSelect.value);
        const row = buildLineRow({
          employeeId: addSelect.value,
          daysWorked: stats.daysWorked,
          dayRate: employee?.dayRate || 0,
          overtimeHours: stats.overtimeHours,
          businessEarnings: stats.businessEarnings,
          equipment: stats.equipment,
          deductions: 0,
          amountPaid: 0,
        }, recomputeTotal, getPeriod, getOvertimeRate, getRunContext);
        itemsContainer.appendChild(row);
        recomputeTotal();
        addSelect.querySelectorAll(`option[value="${addSelect.value}"]`).forEach((o) => o.remove());
        addSelect.value = '';
      });

      const recomputeAllBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '↻ Recompute All from Records');
      recomputeAllBtn.addEventListener('click', () => {
        itemsContainer.querySelectorAll('.dozer-line-row').forEach((row) => row.recomputeFromRecords());
        recomputeTotal();
      });

      overtimeRateInput.addEventListener('input', () => {
        itemsContainer.querySelectorAll('.dozer-line-row').forEach((row) => row.recompute());
        recomputeTotal();
      });

      const totalRow = el('div', { class: 'line-items-total' }, [el('span', {}, 'Total Net Pay:'), totalDisplay]);

      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, record ? 'Save Changes' : 'Create Run'),
      ]);
      const submitBtn = actions.lastChild;

      submitBtn.addEventListener('click', async () => {
        const overtimeRate = Number(overtimeRateInput.value) || DOZER_OVERTIME_RATE_DEFAULT;
        const lines = [...itemsContainer.querySelectorAll('.dozer-line-row')].map((row) => ({
          employeeId: row.getAttribute('data-employee-id'),
          equipment: row.getEquipment(),
          daysWorked: Number(row.querySelector('.dl-days').value) || 0,
          dayRate: Number(row.querySelector('.dl-rate').value) || 0,
          overtimeHours: Number(row.querySelector('.dl-otHours').value) || 0,
          overtimeRate,
          businessEarnings: row.getBusinessEarnings(),
          deductions: Number(row.querySelector('.dl-deductions').value) || 0,
          amountPaid: Number(row.querySelector('.dl-paid').value) || 0,
        }));
        if (!startInput.value || !endInput.value) { window.alert('Both period dates are required.'); return; }
        if (!lines.length) { window.alert('Add at least one operator.'); return; }

        const newStatus = statusSelect.value;
        const payload = { periodStart: startInput.value, periodEnd: endInput.value, status: newStatus, lines };

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';

          let savedRun;
          if (record) {
            savedRun = await store.update('dozerPayrollRuns', record.id, payload);
          } else {
            savedRun = await store.add('dozerPayrollRuns', { ...payload, expenseId: '' });
          }

          if (newStatus === 'Paid' && !savedRun.expenseId) {
            const total = lines.reduce((sum, l) => sum + netPay(l), 0);
            const expense = await store.add('expenses', {
              date: new Date().toISOString().slice(0, 10),
              category: 'Payroll',
              description: `Dozer Operator Day-Rate Payroll — ${formatDate(savedRun.periodStart)} to ${formatDate(savedRun.periodEnd)}`,
              amount: total,
              paidBy: 'Payroll',
              project: '',
            });
            await store.update('dozerPayrollRuns', savedRun.id, { expenseId: expense.id });
          }

          closeModal();
          onSaved();
        } catch (err) {
          window.alert(err.message || 'Could not save this payroll run. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = record ? 'Save Changes' : 'Create Run';
        }
      });

      container.appendChild(topGrid);
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Operators'));
      container.appendChild(recomputeAllBtn);
      container.appendChild(itemsHeader);
      container.appendChild(itemsContainer);
      container.appendChild(addSelect);
      container.appendChild(totalRow);
      container.appendChild(actions);
    },
  });
}

export function renderDozerPayroll(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openRunForm(null, refresh) }, '+ New Day-Rate Run');
  container.appendChild(sectionHeader('Operator Allowance (Day-Rate Payroll)', 'Field operators paid per day worked (8h = 1 day) plus overtime, separate from monthly office payroll', addBtn));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Operator Balances'));
  const balancesContainer = el('div');
  container.appendChild(balancesContainer);

  function refresh() {
    const rows = store.get('dozerPayrollRuns').slice().sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
    const totalPaidAllTime = rows.filter((r) => r.status === 'Paid').reduce((sum, r) => sum + runTotal(r), 0);
    const draftCount = rows.filter((r) => r.status === 'Draft').length;

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Day-Rate Runs', value: String(rows.length) }),
      statCard({ label: 'Draft Runs', value: String(draftCount), tone: draftCount ? 'warning' : 'good' }),
      statCard({ label: 'Total Paid (All Time)', value: formatCurrency(totalPaidAllTime) }),
    ]));

    renderTable(tableContainer, {
      columns: [
        { key: 'period', label: 'Period', render: (r) => `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` },
        { key: 'operators', label: 'Operators', render: (r) => String(r.lines.length) },
        { key: 'total', label: 'Total Net Pay', render: (r) => formatCurrency(runTotal(r)) },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onPrint: () => printDozerPayrollRegister(r, r.lines.map((l) => ({ ...l, employeeName: employeeLabel(l.employeeId) }))),
            onEdit: () => openRunForm(r, refresh),
            onDelete: async () => {
              if (!confirmDelete(`Day-rate run for ${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}`)) return;
              try {
                await store.remove('dozerPayrollRuns', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this run.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No day-rate runs yet.',
    });

    const operatorIds = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.employeeId)))];
    const balances = operatorIds.map((id) => ({ id, balance: balanceOwed(id) })).filter((b) => b.balance !== 0);
    renderTable(balancesContainer, {
      columns: [
        { key: 'employee', label: 'Operator', render: (r) => employeeLabel(r.id) },
        { key: 'balance', label: 'Balance Owed', render: (r) => el('strong', { class: r.balance >= 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.balance)) },
      ],
      rows: balances,
      emptyText: 'No outstanding balances — every Approved/Paid run has been fully paid out.',
    });
  }

  refresh();
}
