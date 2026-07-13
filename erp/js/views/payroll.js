import { store } from '../store.js';
import { formatCurrency, formatMonthLong, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard } from '../ui.js';
import { printPayslip, printPayrollRegister } from '../print.js';

function employeeLabel(id) {
  const e = store.get('employees').find((x) => x.id === id);
  return e ? `${e.name} (${e.role})` : 'Unknown';
}

function employeeNameOnly(id) {
  return store.get('employees').find((x) => x.id === id)?.name || 'Unknown';
}

function netPay(line) {
  return (line.baseSalary || 0) + (line.bonus || 0) - (line.deductions || 0);
}

function runTotal(run) {
  return run.lines.reduce((sum, l) => sum + netPay(l), 0);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function buildLineRow(line, onChange, getRunContext) {
  const employee = store.get('employees').find((e) => e.id === line.employeeId);
  const base = el('input', { type: 'number', class: 'li-base', min: 0 });
  base.value = line.baseSalary ?? 0;
  const bonus = el('input', { type: 'number', class: 'li-bonus', min: 0 });
  bonus.value = line.bonus ?? 0;
  const deductions = el('input', { type: 'number', class: 'li-deductions', min: 0 });
  deductions.value = line.deductions ?? 0;
  const netSpan = el('strong', {}, formatCurrency(netPay(line)));
  const printBtn = el('button', { type: 'button', class: 'icon-btn', title: 'Print payslip' }, '🖨');
  const removeBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove' }, '✕');

  const row = el('div', { class: 'payroll-line-row', 'data-employee-id': line.employeeId }, [
    el('span', {}, employee ? `${employee.name} (${employee.role})` : 'Unknown'),
    base, bonus, deductions, netSpan, printBtn, removeBtn,
  ]);

  function recompute() {
    netSpan.textContent = formatCurrency(
      (Number(base.value) || 0) + (Number(bonus.value) || 0) - (Number(deductions.value) || 0),
    );
    onChange();
  }
  base.addEventListener('input', recompute);
  bonus.addEventListener('input', recompute);
  deductions.addEventListener('input', recompute);
  removeBtn.addEventListener('click', () => { row.remove(); onChange(); });
  printBtn.addEventListener('click', () => {
    printPayslip(getRunContext(), {
      baseSalary: Number(base.value) || 0,
      bonus: Number(bonus.value) || 0,
      deductions: Number(deductions.value) || 0,
    }, employeeNameOnly(line.employeeId));
  });

  return row;
}

function openRunForm(record, onSaved) {
  if (!store.get('employees').some((e) => e.status === 'Active')) {
    window.alert('No Active employees found. Payroll runs are generated from Active staff in HR.');
    return;
  }

  openCustomModal({
    title: record ? `Edit Payroll Run — ${formatMonthLong(record.month)}` : 'New Payroll Run',
    wide: true,
    build: (container) => {
      const monthInput = el('input', { type: 'month', name: 'month' });
      monthInput.value = record?.month || currentMonthKey();
      const monthField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Pay Period *'), monthInput]);

      const statusSelect = el('select', { name: 'status' }, ['Draft', 'Approved', 'Paid'].map((s) => {
        const opt = el('option', { value: s }, s);
        if ((record?.status || 'Draft') === s) opt.setAttribute('selected', 'selected');
        return opt;
      }));
      const statusField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Status'), statusSelect]);

      const topGrid = el('div', { class: 'form-grid-2' }, [monthField, statusField]);

      const itemsHeader = el('div', { class: 'payroll-line-header' }, [
        el('span', {}, 'Employee'), el('span', {}, 'Base Salary'), el('span', {}, 'Bonus'), el('span', {}, 'Deductions'), el('span', {}, 'Net Pay'), el('span', {}, ''), el('span', {}, ''),
      ]);
      const itemsContainer = el('div', { class: 'line-items-container' });
      const totalDisplay = el('strong', {}, formatCurrency(0));

      function recomputeTotal() {
        let total = 0;
        itemsContainer.querySelectorAll('.payroll-line-row').forEach((row) => {
          total += (Number(row.querySelector('.li-base').value) || 0)
            + (Number(row.querySelector('.li-bonus').value) || 0)
            - (Number(row.querySelector('.li-deductions').value) || 0);
        });
        totalDisplay.textContent = formatCurrency(total);
      }

      const runContext = () => ({ id: record?.id || 'DRAFT', month: monthInput.value, status: statusSelect.value });

      const initialLines = record?.lines?.length
        ? record.lines
        : store.get('employees').filter((e) => e.status === 'Active').map((e) => ({ employeeId: e.id, baseSalary: e.salary || 0, bonus: 0, deductions: 0 }));
      initialLines.forEach((line) => itemsContainer.appendChild(buildLineRow(line, recomputeTotal, runContext)));
      recomputeTotal();

      const addSelect = el('select', {}, [
        el('option', { value: '' }, '+ Add an employee to this run —'),
        ...store.get('employees')
          .filter((e) => !initialLines.some((l) => l.employeeId === e.id))
          .map((e) => el('option', { value: e.id }, `${e.name} (${e.role})`)),
      ]);
      addSelect.addEventListener('change', () => {
        if (!addSelect.value) return;
        const emp = store.get('employees').find((e) => e.id === addSelect.value);
        itemsContainer.appendChild(buildLineRow({ employeeId: emp.id, baseSalary: emp.salary || 0, bonus: 0, deductions: 0 }, recomputeTotal, runContext));
        recomputeTotal();
        addSelect.querySelectorAll(`option[value="${emp.id}"]`).forEach((o) => o.remove());
        addSelect.value = '';
      });

      const totalRow = el('div', { class: 'line-items-total' }, [el('span', {}, 'Total Net Pay:'), totalDisplay]);

      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, record ? 'Save Changes' : 'Create Run'),
      ]);
      const submitBtn = actions.lastChild;

      submitBtn.addEventListener('click', () => {
        const lines = [...itemsContainer.querySelectorAll('.payroll-line-row')].map((row) => ({
          employeeId: row.getAttribute('data-employee-id'),
          baseSalary: Number(row.querySelector('.li-base').value) || 0,
          bonus: Number(row.querySelector('.li-bonus').value) || 0,
          deductions: Number(row.querySelector('.li-deductions').value) || 0,
        }));
        if (!monthInput.value) { window.alert('Pay period is required.'); return; }
        if (!lines.length) { window.alert('Add at least one employee.'); return; }

        const newStatus = statusSelect.value;
        const payload = { month: monthInput.value, status: newStatus, lines };

        let savedRun;
        if (record) {
          store.update('payrollRuns', record.id, payload);
          savedRun = { ...record, ...payload };
        } else {
          savedRun = store.add('payrollRuns', { ...payload, expenseId: '' });
        }

        if (newStatus === 'Paid' && !savedRun.expenseId) {
          const total = lines.reduce((sum, l) => sum + l.baseSalary + l.bonus - l.deductions, 0);
          const expense = store.add('expenses', {
            date: new Date().toISOString().slice(0, 10),
            category: 'Payroll',
            description: `Payroll — ${formatMonthLong(savedRun.month)}`,
            amount: total,
            paidBy: 'Payroll',
            project: '',
          });
          store.update('payrollRuns', savedRun.id, { expenseId: expense.id });
        }

        closeModal();
        onSaved();
      });

      container.appendChild(topGrid);
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Employees'));
      container.appendChild(itemsHeader);
      container.appendChild(itemsContainer);
      container.appendChild(addSelect);
      container.appendChild(totalRow);
      container.appendChild(actions);
    },
  });
}

export function renderPayroll(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openRunForm(null, refresh) }, '+ New Payroll Run');
  container.appendChild(sectionHeader('Payroll', "Monthly payroll runs from each employee's HR salary, with editable bonus/deductions and printable payslips", addBtn));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const rows = store.get('payrollRuns').slice().sort((a, b) => (a.month < b.month ? 1 : -1));
    const totalPaidAllTime = rows.filter((r) => r.status === 'Paid').reduce((sum, r) => sum + runTotal(r), 0);
    const draftCount = rows.filter((r) => r.status === 'Draft').length;

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Payroll Runs', value: String(rows.length) }),
      statCard({ label: 'Draft Runs', value: String(draftCount), tone: draftCount ? 'warning' : 'good' }),
      statCard({ label: 'Total Paid (All Time)', value: formatCurrency(totalPaidAllTime) }),
    ]));

    renderTable(tableContainer, {
      columns: [
        { key: 'month', label: 'Pay Period', render: (r) => formatMonthLong(r.month) },
        { key: 'employees', label: 'Employees', render: (r) => String(r.lines.length) },
        { key: 'total', label: 'Total Net Pay', render: (r) => formatCurrency(runTotal(r)) },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onPrint: () => printPayrollRegister(r, r.lines.map((l) => ({ ...l, employeeName: employeeLabel(l.employeeId) }))),
            onEdit: () => openRunForm(r, refresh),
            onDelete: () => {
              if (confirmDelete(`Payroll run for ${formatMonthLong(r.month)}`)) {
                store.remove('payrollRuns', r.id);
                refresh();
              }
            },
          }),
        },
      ],
      rows,
      emptyText: "No payroll runs yet. Salaries come from each employee's record in HR — set those first if they're blank.",
    });
  }

  refresh();
}
