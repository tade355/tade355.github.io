import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard, showToast } from '../ui.js';
import { openPaymentLedgerModal } from '../paymentLedger.js';
import { LOAN_CATEGORIES } from '../constants.js';
import { computeLoanInterest, totalOwed } from '../loanInterest.js';
import { paymentsForLoan, amountRepaid, amountOutstanding, agingDays } from '../loanPayments.js';
import { printLoanStatement } from '../print.js';

const LOAN_STATUSES = ['Active', 'Partially Repaid', 'Repaid', 'Restructured', 'Defaulted', 'Written Off'];

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
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
  const input = el('input', { type: type || 'text', name, required: required ? 'required' : undefined });
  input.value = value ?? '';
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label + (required ? ' *' : '')), input]);
}

function hasOverride(loan) {
  return loan.manualInterestOverride !== null && loan.manualInterestOverride !== undefined;
}

function openLoanForm(record, onSaved) {
  openCustomModal({
    title: record ? 'Edit Loan' : 'Add Loan',
    wide: true,
    build: (container) => {
      const today = todayISOString();
      const categoryField = selectField('category', 'Category', LOAN_CATEGORIES.map((c) => ({ value: c, label: c })), record?.category);
      const lenderField = textField('lender', 'Lender / Source', 'text', record?.lender, true);
      const dateTakenField = textField('dateTaken', 'Date Taken', 'date', record?.dateTaken || today, true);
      const principalField = textField('principal', 'Principal (₦)', 'number', record?.principal, true);
      const interestTypeField = selectField('interestType', 'Interest Type', [
        { value: 'Fixed', label: 'Fixed' },
        { value: 'Turnover-Based', label: 'Turnover-Based (% of revenue)' },
        { value: 'Profit-Based', label: 'Profit-Based (% of profit)' },
      ], record?.interestType || 'Fixed');
      const topGrid = el('div', { class: 'form-grid-2' }, [categoryField, lenderField, dateTakenField, principalField, interestTypeField]);

      // Fixed only — a tracker, not a calculator: capture the terms as
      // agreed with the lender rather than deriving compounding math.
      const interestRateField = textField('interestRate', 'Interest Rate (%) — informational', 'number', record?.interestRate);
      const interestRateBasisField = selectField('interestRateBasis', 'Interest Basis', [
        { value: 'Flat', label: 'Flat' },
        { value: 'Per Annum', label: 'Per Annum' },
        { value: 'Per Month', label: 'Per Month' },
      ], record?.interestRateBasis || 'Flat');
      const totalRepayableField = textField('totalRepayable', 'Total Repayable (₦)', 'number', record?.totalRepayable);
      const fixedGrid = el('div', { class: 'form-grid-2' }, [interestRateField, interestRateBasisField, totalRepayableField]);

      // Turnover-Based / Profit-Based only — interest is computed from the
      // linked project's (or company-wide, if blank) revenue/profit over
      // the evaluation period, the same figures Profitability produces.
      const linkedProjectField = selectField('linkedProject', 'Linked Project', [
        { value: '', label: '— Company-wide —' },
        ...projectOptions(),
      ], record?.linkedProject);
      const interestPercentageField = textField('interestPercentage', 'Interest Percentage (%)', 'number', record?.interestPercentage);
      const evalStartField = textField('evaluationPeriodStart', 'Evaluation Period Start', 'date', record?.evaluationPeriodStart);
      const evalEndField = textField('evaluationPeriodEnd', 'Evaluation Period End', 'date', record?.evaluationPeriodEnd);
      const overrideField = textField('manualInterestOverride', 'Manual Interest Override (₦) — optional, replaces the computed figure below', 'number', record?.manualInterestOverride);
      const variableGrid = el('div', { class: 'form-grid-2' }, [linkedProjectField, interestPercentageField, evalStartField, evalEndField, overrideField]);

      const interestPreview = el('p', { class: 'section-subtitle' });

      const dueDateField = textField('dueDate', 'Due Date (next repayment / review)', 'date', record?.dueDate);
      const statusField = selectField('status', 'Status', LOAN_STATUSES.map((s) => ({ value: s, label: s })), record?.status || 'Active');
      const bottomGrid = el('div', { class: 'form-grid-2' }, [dueDateField, statusField]);

      const notesInput = el('textarea', { name: 'notes', rows: 3 });
      notesInput.value = record?.notes || '';
      const notesField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Notes'), notesInput]);

      function currentDraft() {
        return {
          interestType: interestTypeField.querySelector('select').value,
          principal: Number(principalField.querySelector('input').value) || 0,
          totalRepayable: Number(totalRepayableField.querySelector('input').value) || 0,
          linkedProject: linkedProjectField.querySelector('select').value,
          interestPercentage: Number(interestPercentageField.querySelector('input').value) || 0,
          evaluationPeriodStart: evalStartField.querySelector('input').value,
          evaluationPeriodEnd: evalEndField.querySelector('input').value,
          manualInterestOverride: overrideField.querySelector('input').value === '' ? null : Number(overrideField.querySelector('input').value),
        };
      }

      function recomputePreview() {
        const draft = currentDraft();
        const interest = computeLoanInterest(draft);
        interestPreview.textContent = `Computed Interest: ${formatCurrency(interest)} — Total Owed: ${formatCurrency(draft.principal + interest)}`;
      }

      function updateVisibility() {
        const isFixed = interestTypeField.querySelector('select').value === 'Fixed';
        fixedGrid.style.display = isFixed ? '' : 'none';
        variableGrid.style.display = isFixed ? 'none' : '';
        recomputePreview();
      }

      interestTypeField.querySelector('select').addEventListener('change', updateVisibility);
      [principalField, totalRepayableField, interestPercentageField, evalStartField, evalEndField, overrideField].forEach((f) => {
        f.querySelector('input').addEventListener('input', recomputePreview);
      });
      linkedProjectField.querySelector('select').addEventListener('change', recomputePreview);
      updateVisibility();

      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, record ? 'Save Changes' : 'Add Loan'),
      ]);
      const submitBtn = actions.lastChild;

      submitBtn.addEventListener('click', async () => {
        const lender = lenderField.querySelector('input').value;
        const dateTaken = dateTakenField.querySelector('input').value;
        if (!lender || !dateTaken) { window.alert('Lender / Source and Date Taken are required.'); return; }

        const overrideVal = overrideField.querySelector('input').value;
        const payload = {
          category: categoryField.querySelector('select').value,
          lender,
          dateTaken,
          principal: Number(principalField.querySelector('input').value) || 0,
          interestType: interestTypeField.querySelector('select').value,
          interestRate: interestRateField.querySelector('input').value || undefined,
          interestRateBasis: interestRateBasisField.querySelector('select').value,
          totalRepayable: totalRepayableField.querySelector('input').value || undefined,
          linkedProject: linkedProjectField.querySelector('select').value || undefined,
          interestPercentage: interestPercentageField.querySelector('input').value || undefined,
          evaluationPeriodStart: evalStartField.querySelector('input').value || undefined,
          evaluationPeriodEnd: evalEndField.querySelector('input').value || undefined,
          manualInterestOverride: overrideVal === '' ? undefined : Number(overrideVal),
          dueDate: dueDateField.querySelector('input').value || undefined,
          status: statusField.querySelector('select').value,
          notes: notesInput.value,
        };

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';
          if (record) await store.update('loans', record.id, payload);
          else await store.add('loans', payload);
          closeModal();
          onSaved();
          showToast(record ? 'Loan updated.' : 'Loan added.');
        } catch (err) {
          window.alert(err.message || 'Could not save this loan. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = record ? 'Save Changes' : 'Add Loan';
        }
      });

      container.appendChild(topGrid);
      container.appendChild(fixedGrid);
      container.appendChild(variableGrid);
      container.appendChild(interestPreview);
      container.appendChild(bottomGrid);
      container.appendChild(notesField);
      container.appendChild(actions);
    },
  });
}

function openRepaymentsModal(loan, onSaved) {
  function currentLoan() {
    return store.get('loans').find((l) => l.id === loan.id) || loan;
  }
  openPaymentLedgerModal({
    title: `Repayments — ${loan.lender}`,
    entryNoun: 'Repayment',
    collection: 'loanRepayments',
    parentIdField: 'loanId',
    parentId: loan.id,
    rowsFor: () => paymentsForLoan(loan.id),
    summaryText: () => {
      const l = currentLoan();
      const total = totalOwed(l);
      const repaid = amountRepaid(l);
      return `Total Owed ${formatCurrency(total)} · Repaid ${formatCurrency(repaid)} · Outstanding ${formatCurrency(total - repaid)}`;
    },
    onSaved,
  });
}

export function renderLoans(container) {
  container.innerHTML = '';

  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Loan Portfolio',
    'Borrowing from banks, directors, investors, and cooperatives — terms, interest, and repayment status in one place',
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openLoanForm(undefined, refresh) }, '+ Add Loan'));

  const summaryGrid = el('div', { class: 'stats-grid' });
  container.appendChild(summaryGrid);
  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const rows = store.get('loans').slice().sort((a, b) => (a.dateTaken < b.dateTaken ? 1 : -1)).map((l) => ({
      ...l,
      interest: computeLoanInterest(l),
      total: totalOwed(l),
      repaid: amountRepaid(l),
      outstanding: amountOutstanding(l),
      aging: agingDays(l),
    }));

    const totalOutstanding = rows.reduce((sum, r) => sum + Math.max(0, r.outstanding), 0);
    const totalInterestAccrued = rows.reduce((sum, r) => sum + r.interest, 0);
    const overdueCount = rows.filter((r) => r.aging !== null).length;

    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard({ label: 'Total Outstanding', value: formatCurrency(totalOutstanding), tone: totalOutstanding ? 'critical' : 'good' }));
    summaryGrid.appendChild(statCard({ label: 'Total Interest Accrued', value: formatCurrency(totalInterestAccrued) }));
    summaryGrid.appendChild(statCard({ label: 'Loans Overdue', value: String(overdueCount), tone: overdueCount ? 'critical' : 'good' }));

    renderTable(tableContainer, {
      columns: [
        { key: 'lender', label: 'Lender' },
        { key: 'category', label: 'Category' },
        { key: 'interestType', label: 'Interest Type' },
        { key: 'principal', label: 'Principal', render: (r) => formatCurrency(r.principal) },
        { key: 'interest', label: 'Interest', render: (r) => `${formatCurrency(r.interest)}${hasOverride(r) ? ' (override)' : ''}` },
        { key: 'total', label: 'Total Owed', render: (r) => formatCurrency(r.total) },
        { key: 'repaid', label: 'Repaid', render: (r) => formatCurrency(r.repaid) },
        { key: 'outstanding', label: 'Outstanding', render: (r) => formatCurrency(r.outstanding) },
        { key: 'dueDate', label: 'Due Date', render: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onPrint: () => printLoanStatement(r, paymentsForLoan(r.id)),
            onPayment: () => openRepaymentsModal(r, refresh),
            onEdit: () => openLoanForm(r, refresh),
            onDelete: async () => {
              if (!confirmDelete(`the ${r.category} loan from ${r.lender}`)) return;
              try {
                await store.remove('loans', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this loan.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No loans logged yet.',
      rowClass: (r) => (r.aging !== null ? 'row-critical' : undefined),
    });
  }

  refresh();
}
