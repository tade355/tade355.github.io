import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatMonthLong, el, ico } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard } from '../ui.js';
import { printPayslip, printPayrollRegister, printSalaryStatement } from '../print.js';
import { getCurrentUser } from '../session.js';

function employeeLabel(id) {
  const e = store.get('employees').find((x) => x.id === id);
  return e ? `${e.name} (${e.role})` : 'Unknown';
}

function employeeNameOnly(id) {
  return store.get('employees').find((x) => x.id === id)?.name || 'Unknown';
}

function isMonthlySalaryStaff(employee) {
  return Number(employee.salary || 0) > 0;
}

function isCEO() {
  const user = getCurrentUser() || {};
  return /gideon|chief executive|ceo/i.test(`${user.name || ''} ${user.role || ''}`);
}

function isAccounts() {
  const user = getCurrentUser() || {};
  return /gladness|atabo|account|finance/i.test(`${user.name || ''} ${user.role || ''}`);
}

export function netPay(line) {
  return (line.baseSalary || 0) + (line.bonus || 0) - (line.deductions || 0);
}

function runTotal(run) {
  return run.lines.reduce((sum, l) => sum + netPay(l), 0);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function payrollStatusLabel(status) {
  return {
    Draft: 'Draft',
    Submitted: 'Awaiting CEO Approval',
    Approved: 'Approved — Awaiting Payment',
    Returned: 'Returned for Correction',
    PartiallyPaid: 'Partially Paid',
    Paid: 'Fully Paid',
  }[status] || status || 'Draft';
}

// Every Approved/Paid period's line for one employee, oldest first, each
// carrying its own running balance — a salary increase mid-year (or a
// month only partly paid) just falls out of this naturally, since
// baseSalary/amountPaid are captured per period, not derived from a
// single current rate. Draft runs are excluded — those aren't confirmed
// pay yet, so they shouldn't count toward what's owed. Exported so the
// self-service "My Salary" view (mySalary.js) shows the exact same
// figures an Admin sees here, not a separately-derived copy.
export function salaryStatementRows(employeeId) {
  const rows = [];
  store.get('payrollRuns')
    .filter((r) => r.status !== 'Draft')
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .forEach((run) => {
      run.lines.filter((l) => l.employeeId === employeeId).forEach((l) => {
        rows.push({ runId: run.id, status: run.status, month: run.month, baseSalary: l.baseSalary || 0, bonus: l.bonus || 0, deductions: l.deductions || 0, netPay: netPay(l), amountPaid: l.amountPaid || 0 });
      });
    });
  let running = 0;
  rows.forEach((r) => {
    running += r.netPay - r.amountPaid;
    r.runningBalance = running;
  });
  return rows;
}

// Running balance across every non-Draft run: what's been earned vs. what's
// actually been paid out — same definition Operator Allowance (day-rate
// payroll) already uses for balanceOwed().
export function balanceOwed(employeeId) {
  let earned = 0;
  let paid = 0;
  store.get('payrollRuns').filter((r) => r.status !== 'Draft').forEach((run) => {
    run.lines.filter((l) => l.employeeId === employeeId).forEach((l) => {
      earned += netPay(l);
      paid += l.amountPaid || 0;
    });
  });
  return earned - paid;
}

function buildLineRow(line, onChange, getRunContext, showPaymentFields = false) {
  const employee = store.get('employees').find((e) => e.id === line.employeeId);
  const displayName = line.employeeName || (employee ? `${employee.name} (${employee.role})` : 'One-off staff');
  const base = el('input', { type: 'number', class: 'li-base', min: 0 });
  base.value = line.baseSalary ?? 0;
  const bonus = el('input', { type: 'number', class: 'li-bonus', min: 0 });
  bonus.value = line.bonus ?? 0;
  const deductions = el('input', { type: 'number', class: 'li-deductions', min: 0 });
  deductions.value = line.deductions ?? 0;
  const paid = el('input', { type: 'number', class: 'li-paid', min: 0 });
  paid.value = line.amountPaid ?? 0;
  const paymentDate = el('input', { type: 'date', class: 'li-payment-date' });
  paymentDate.value = line.paymentDate || '';
  const paymentReference = el('input', { type: 'text', class: 'li-payment-reference', placeholder: 'Bank reference' });
  paymentReference.value = line.paymentReference || '';
  paymentDate.hidden = !showPaymentFields;
  paymentReference.hidden = !showPaymentFields;
  const netSpan = el('strong', {}, formatCurrency(netPay(line)));
  const printBtn = el('button', { type: 'button', class: 'icon-btn', title: 'Print payslip' }, [ico('printer')]);
  const removeBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove' }, '✕');

  const row = el('div', { class: 'payroll-line-row', 'data-employee-id': line.employeeId }, [
    el('span', {}, displayName),
    base, bonus, deductions, paid, ...(showPaymentFields ? [paymentDate, paymentReference] : []), netSpan, printBtn, removeBtn,
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
  paid.addEventListener('input', onChange);
  removeBtn.addEventListener('click', () => { row.remove(); onChange(); });
  printBtn.addEventListener('click', () => {
    printPayslip(getRunContext(), {
      baseSalary: Number(base.value) || 0,
      bonus: Number(bonus.value) || 0,
      deductions: Number(deductions.value) || 0,
      amountPaid: Number(paid.value) || 0,
    }, employeeNameOnly(line.employeeId));
  });

  return row;
}

function openRunForm(record, onSaved) {
  if (record && record.status !== 'Draft' && !isCEO() && !isAccounts()) {
    window.alert('This payroll has been submitted and is locked. Only the CEO can approve or edit it.');
    return;
  }
  if (record && record.status === 'Submitted' && isAccounts()) {
    window.alert('This payroll is awaiting CEO approval. Accounts can act only after approval.');
    return;
  }
  if (!store.get('employees').some((e) => e.status === 'Active' && isMonthlySalaryStaff(e))) {
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

      const statusOptions = isCEO() ? ['Draft', 'Submitted', 'Approved', 'Returned', 'PartiallyPaid', 'Paid'] : (isAccounts() ? ['Approved', 'PartiallyPaid', 'Paid'] : ['Draft', 'Submitted']);
      const currentStatus = record?.status || 'Draft';
      const statusField = el('div', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'Status'),
        el('strong', { class: 'status-summary' }, payrollStatusLabel(currentStatus)),
      ]);

      const topGrid = el('div', { class: 'form-grid-2' }, [monthField, statusField]);
      const commentsInput = el('textarea', { name: 'comments', placeholder: 'CEO comments or payroll notes' });
      commentsInput.value = record?.comments || '';

      const showPaymentFields = !!record && isAccounts() && ['Approved', 'PartiallyPaid', 'Paid'].includes(record.status);
      const itemsHeader = el('div', { class: 'payroll-line-header' }, [
        el('span', {}, 'Employee'), el('span', {}, 'Base Salary'), el('span', {}, 'Bonus'), el('span', {}, 'Deductions'), el('span', {}, 'Paid'), ...(showPaymentFields ? [el('span', {}, 'Payment Date'), el('span', {}, 'Payment Reference')] : []), el('span', {}, 'Net Pay'), el('span', {}, ''), el('span', {}, ''),
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
        : store.get('employees').filter((e) => e.status === 'Active' && isMonthlySalaryStaff(e)).map((e) => ({ employeeId: e.id, baseSalary: e.salary || 0, bonus: 0, deductions: 0, amountPaid: 0 }));
      initialLines.forEach((line) => itemsContainer.appendChild(buildLineRow(line, recomputeTotal, runContext, showPaymentFields)));
      recomputeTotal();

      const addSelect = el('select', {}, [
        el('option', { value: '' }, '+ Add an employee to this run —'),
        ...store.get('employees')
          .filter((e) => !initialLines.some((l) => l.employeeId === e.id))
          .map((e) => el('option', { value: e.id }, `${e.name} (${e.role})`)),
      ]);
      const oneOffName = el('input', { type: 'text', placeholder: 'Adhoc / part-time staff name' });
      const oneOffAmount = el('input', { type: 'number', min: 0, placeholder: 'Amount (₦)' });
      const addOneOffBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '+ Add one-off staff');
      addOneOffBtn.addEventListener('click', () => {
        const name = oneOffName.value.trim();
        const amount = Number(oneOffAmount.value) || 0;
        if (!name || amount <= 0) { window.alert('Enter the one-off staff name and amount.'); return; }
        itemsContainer.appendChild(buildLineRow({ employeeId: `adhoc-${Date.now()}`, employeeName: name, baseSalary: amount, bonus: 0, deductions: 0, amountPaid: 0 }, recomputeTotal, runContext, false));
        oneOffName.value = '';
        oneOffAmount.value = '';
        recomputeTotal();
      });
      const oneOffRow = el('div', { class: 'form-grid-2' }, [oneOffName, oneOffAmount, addOneOffBtn]);

      addSelect.addEventListener('change', () => {
        if (!addSelect.value) return;
        const emp = store.get('employees').find((e) => e.id === addSelect.value);
        itemsContainer.appendChild(buildLineRow({ employeeId: emp.id, baseSalary: emp.salary || 0, bonus: 0, deductions: 0, amountPaid: 0 }, recomputeTotal, runContext, showPaymentFields));
        recomputeTotal();
        addSelect.querySelectorAll(`option[value="${emp.id}"]`).forEach((o) => o.remove());
        addSelect.value = '';
      });

      const totalRow = el('div', { class: 'line-items-total' }, [el('span', {}, 'Total Net Pay:'), totalDisplay]);

      const primaryLabel = !record ? 'Submit for CEO Approval' : (isCEO() && record.status === 'Submitted' ? 'Approve Payroll' : 'Save Changes');
      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, primaryLabel),
      ]);
      const submitBtn = actions.lastChild;
      if (record && isCEO() && record.status === 'Submitted') {
        const returnBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Return for Correction');
        returnBtn.addEventListener('click', async () => {
          await store.update('payrollRuns', record.id, { status: 'Draft' });
          closeModal();
          onSaved();
        });
        actions.insertBefore(returnBtn, submitBtn);
      }

      submitBtn.addEventListener('click', async () => {
        const lines = [];
        for (const row of [...itemsContainer.querySelectorAll('.payroll-line-row')]) {
          let employeeId = row.getAttribute('data-employee-id');
          if (employeeId?.startsWith('adhoc-')) {
            const employeeName = row.querySelector('span')?.textContent?.trim() || 'One-off staff';
            const adhoc = await store.add('employees', {
              name: employeeName,
              role: 'Adhoc / Part-time',
              department: 'Operations',
              status: 'Active',
              accessTier: 'Staff',
              salary: 0,
              dayRate: 0,
            });
            employeeId = adhoc.id;
          }
          lines.push({
            employeeId,
            baseSalary: Number(row.querySelector('.li-base').value) || 0,
            bonus: Number(row.querySelector('.li-bonus').value) || 0,
            deductions: Number(row.querySelector('.li-deductions').value) || 0,
            amountPaid: Number(row.querySelector('.li-paid').value) || 0,
          });
        }
        if (!monthInput.value) { window.alert('Pay period is required.'); return; }
        if (!lines.length) { window.alert('Add at least one employee.'); return; }
        if (lines.some((l) => l.amountPaid > (l.baseSalary + l.bonus - l.deductions))) { window.alert('A payment cannot be higher than the approved amount.'); return; }
        if (!record && store.get('payrollRuns').some((r) => r.month === monthInput.value)) { window.alert('A payroll run already exists for this month. Edit the existing run instead.'); return; }

        const requestedStatus = !record ? 'Submitted' : (isCEO() && record.status === 'Submitted' ? 'Approved' : record.status);
        const approvedTotal = lines.reduce((sum, l) => sum + l.baseSalary + l.bonus - l.deductions, 0);
        const paidTotal = lines.reduce((sum, l) => sum + (l.amountPaid || 0), 0);
        const newStatus = requestedStatus === 'Paid' && paidTotal < approvedTotal ? 'PartiallyPaid' : requestedStatus;
        const now = new Date().toISOString();
        const auditTrail = [...(record?.auditTrail || []), { at: now, action: record ? 'updated' : 'created', status: newStatus }];
        const databaseStatus = ['Submitted', 'Returned'].includes(newStatus) ? 'Draft' : (newStatus === 'PartiallyPaid' ? 'Paid' : newStatus);
        const payload = { month: monthInput.value, status: databaseStatus, lines };

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';

          let savedRun;
          if (record) {
            savedRun = await store.update('payrollRuns', record.id, payload);
          } else {
            savedRun = await store.add('payrollRuns', { ...payload, expenseId: '' });
          }

          if (newStatus === 'Paid' && !savedRun.expenseId) {
            const total = lines.reduce((sum, l) => sum + l.baseSalary + l.bonus - l.deductions, 0);
            const expense = await store.add('expenses', {
              date: todayISOString(),
              category: 'Payroll',
              description: `Payroll — ${formatMonthLong(savedRun.month)}`,
              amount: total,
              paidBy: 'Payroll',
              project: '',
            });
            await store.update('payrollRuns', savedRun.id, { expenseId: expense.id });
          }

          closeModal();
          onSaved();
        } catch (err) {
          window.alert(err.message || 'Could not save this payroll run. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = primaryLabel;
        }
      });

      container.appendChild(topGrid);
      container.appendChild(el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Comments / Notes'), commentsInput]));
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Employees'));
      container.appendChild(itemsHeader);
      container.appendChild(itemsContainer);
      container.appendChild(addSelect);
      container.appendChild(oneOffRow);
      container.appendChild(totalRow);
      container.appendChild(actions);
    },
  });
}

export function renderPayroll(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openRunForm(null, refresh) }, '+ New Payroll Run');
  container.appendChild(sectionHeader('Payroll Preparation', "HR prepares salaries, deductions and bonuses here. Submit for CEO approval; Accounts records full or partial payments separately.", addBtn));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Employee Balances'));
  const balancesContainer = el('div');
  container.appendChild(balancesContainer);

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
        { key: 'status', label: 'Status', render: (r) => statusPill(payrollStatusLabel(r.status)) },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onPrint: () => printPayrollRegister(r, r.lines.map((l) => ({ ...l, employeeName: employeeLabel(l.employeeId) }))),
            onEdit: () => openRunForm(r, refresh),
            onDelete: async () => {
              if (!confirmDelete(`Payroll run for ${formatMonthLong(r.month)}`)) return;
              try {
                await store.remove('payrollRuns', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this payroll run.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: "No payroll runs yet. Salaries come from each employee's record in HR — set those first if they're blank.",
    });

    const employeeIds = [...new Set(rows.filter((r) => r.status !== 'Draft').flatMap((r) => r.lines.map((l) => l.employeeId)))];
    const balances = employeeIds.map((id) => {
      const approved = rows.filter((r) => r.status !== 'Draft').flatMap((r) => r.lines).filter((l) => l.employeeId === id).reduce((sum, l) => sum + netPay(l), 0);
      const paid = rows.filter((r) => r.status !== 'Draft').flatMap((r) => r.lines).filter((l) => l.employeeId === id).reduce((sum, l) => sum + (l.amountPaid || 0), 0);
      return { id, approved, paid, percent: approved ? Math.min(100, Math.round((paid / approved) * 100)) : 0, balance: approved - paid };
    }).filter((b) => b.balance !== 0 || b.approved !== 0);
    renderTable(balancesContainer, {
      columns: [
        { key: 'employee', label: 'Employee', render: (r) => employeeLabel(r.id) },
        { key: 'approved', label: 'Approved', render: (r) => formatCurrency(r.approved) },
        { key: 'paid', label: 'Paid', render: (r) => formatCurrency(r.paid) },
        { key: 'percent', label: '% Paid', render: (r) => `${r.percent}%` },
        { key: 'balance', label: 'Outstanding Balance', render: (r) => el('strong', { class: r.balance >= 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.balance)) },
        {
          key: 'actions',
          label: '',
          render: (r) => el('button', {
            type: 'button', class: 'icon-btn', title: 'Print salary statement',
            onClick: () => printSalaryStatement(employeeNameOnly(r.id), salaryStatementRows(r.id)),
          }, [ico('printer')]),
        },
      ],
      rows: balances,
      emptyText: 'No outstanding balances — every Approved/Paid run has been fully paid out.',
    });
  }

  refresh();
}
