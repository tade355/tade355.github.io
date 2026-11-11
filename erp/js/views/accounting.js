import { renderRequestPayments } from './requestPayments.js';
import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, invoiceTotal, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { renderBarChart, CATEGORICAL_COLORS } from '../charts.js';
import { EXPENSE_CATEGORIES } from '../constants.js';
import { renderLoans } from './loans.js';
import { renderProfitability } from './profitability.js';
import { renderIncomeExpenditure } from './incomeExpenditure.js';
import { financialActivity, expenseLedgerRows } from '../financialActivity.js';
import { printFundRequest } from '../print.js';
import { renderDozerPayroll, liveBalanceOwed } from './dozerPayroll.js';
import { renderPayroll } from './payroll.js';
import { amountOutstanding } from '../loanPayments.js';
import { renderBudgets } from './budgets.js';

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function equipmentOptions() {
  const items = store.get('inventory').filter((i) => ['Heavy Equipment', 'Tools', 'Vehicles'].includes(i.category));
  return [{ value: '', label: '— Not linked to equipment —' }, ...items.map((i) => ({ value: i.name, label: i.name }))];
}

function fields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'category', label: 'Category', type: 'select', required: true, options: EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { name: 'description', label: 'Description', required: true },
    { name: 'amount', label: 'Amount (₦)', type: 'number', required: true, min: 0 },
    { name: 'payee', label: 'Paid To / Recipient (vendor, contractor, or person)' },
    { name: 'paidBy', label: 'Paid By', required: true },
    { name: 'fundRequestId', label: 'Same payment as paid fund request (prevents counting it twice)', type: 'select', options: [{ value: '', label: '— Separate payment —' }, ...store.get('fundRequests').filter((r) => r.status === 'Paid').map((r) => ({ value: r.id, label: `${r.id} — ${r.description || r.date}` }))] },
    { name: 'project', label: 'Project (for profitability tracking)', type: 'select', options: [
      { value: '', label: '— Not linked to a project —' },
      ...projectOptions(),
    ] },
    { name: 'equipment', label: 'Equipment (optional — for per-dozer cost tracking)', type: 'select', options: equipmentOptions() },
  ];
}

export function renderAccounting(container) {
  container.innerHTML = '';

  let tab = 'overview';

  const tabBar = el('div', { class: 'tab-bar' });
  const overviewTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('overview') }, 'Finance Overview');
  const operatorAllowanceTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('operatorAllowance') }, 'Operator Allowances');
  const payrollTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('payroll') }, 'Staff Payroll');
  const expensesTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('expenses') }, 'Expenses');
  const incomeExpenditureTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('incomeExpenditure') }, 'Income & Expenditure');
  const profitabilityTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('profitability') }, 'Profitability');
  const loansTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('loans') }, 'Loans & Investments');
  const budgetsTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('budgets') }, 'Budgets & Plans');
  const paymentsTabBtn = el('button', { class:'tab-btn', type:'button', onClick:()=>setTab('requestPayments') }, 'Request Payments');
  tabBar.appendChild(overviewTabBtn);
  tabBar.appendChild(paymentsTabBtn);
  tabBar.appendChild(expensesTabBtn);
  tabBar.appendChild(operatorAllowanceTabBtn);
  tabBar.appendChild(payrollTabBtn);
  tabBar.appendChild(incomeExpenditureTabBtn);
  tabBar.appendChild(profitabilityTabBtn);
  tabBar.appendChild(loansTabBtn);
  tabBar.appendChild(budgetsTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Finance & Accounts', 'Cash, commitments, receivables, payroll, operator allowances, loans, expenses, and profitability in one control centre', actionSlot));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    paymentsTabBtn.classList.toggle('active', tab === 'requestPayments');
    overviewTabBtn.classList.toggle('active', tab === 'overview');
    expensesTabBtn.classList.toggle('active', tab === 'expenses');
    operatorAllowanceTabBtn.classList.toggle('active', tab === 'operatorAllowance');
    payrollTabBtn.classList.toggle('active', tab === 'payroll');
    incomeExpenditureTabBtn.classList.toggle('active', tab === 'incomeExpenditure');
    profitabilityTabBtn.classList.toggle('active', tab === 'profitability');
    loansTabBtn.classList.toggle('active', tab === 'loans');
    budgetsTabBtn.classList.toggle('active', tab === 'budgets');
    if (tab === 'requestPayments') { actionSlot.innerHTML=''; body.innerHTML=''; renderRequestPayments(body); }
    else if (tab === 'overview') renderOverviewTab();
    else if (tab === 'expenses') renderExpensesTab();
    else if (tab === 'operatorAllowance') { actionSlot.innerHTML = ''; body.innerHTML = ''; renderDozerPayroll(body); }
    else if (tab === 'payroll') { actionSlot.innerHTML = ''; body.innerHTML = ''; renderPayroll(body); }
    else if (tab === 'incomeExpenditure') renderIncomeExpenditureTab();
    else if (tab === 'profitability') renderProfitabilityTab();
    else if (tab === 'budgets') { actionSlot.innerHTML = ''; body.innerHTML = ''; renderBudgets(body); }
    else renderLoansTab();
  }

  function renderOverviewTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    const cash = financialActivity(store.all());
    const income = cash.filter(r => r.type === 'Income').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const outflow = cash.filter(r => r.type === 'Expenditure').reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const commitments = financialActivity(store.all(), 'commitments');
    const commitmentTotal = commitments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const requests = store.get('fundRequests');
    const pending = requests.filter(r => r.status === 'Pending');
    const approved = requests.filter(r => ['Approved', 'Partially Approved'].includes(r.status));
    const paidUnreconciled = requests.filter(r => r.status === 'Paid' && !store.get('expenses').some(e => e.fundRequestId === r.id));
    const payments = store.get('invoicePayments');
    const receivables = store.get('invoices').map(invoice => {
      const paid = payments.filter(p => p.invoiceId === invoice.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      return { ...invoice, outstanding: Math.max(0, invoiceTotal(invoice) - paid) };
    }).filter(invoice => invoice.outstanding > 0);
    const receivableTotal = receivables.reduce((sum, invoice) => sum + invoice.outstanding, 0);
    const loanRows = store.get('loans').map(loan => ({ ...loan, outstanding: amountOutstanding(loan) })).filter(loan => loan.outstanding > 0);
    const loanTotal = loanRows.reduce((sum, loan) => sum + loan.outstanding, 0);
    const operatorIds = [...new Set([
      ...store.get('dozerPayrollRuns').flatMap(run => (run.lines || []).map(line => line.employeeId)),
      ...store.get('operations').map(row => row.operatorId).filter(Boolean),
    ])];
    const operatorBalances = operatorIds.map(id => ({
      id, name: store.find('employees', id)?.name || id, balance: liveBalanceOwed(id),
    })).filter(row => row.balance > 0);
    const operatorTotal = operatorBalances.reduce((sum, row) => sum + row.balance, 0);
    let salaryOutstanding = 0;
    store.get('payrollRuns').filter(run => run.status !== 'Draft').forEach(run => {
      (run.lines || []).forEach(line => {
        salaryOutstanding += Math.max(0, Number(line.baseSalary || 0) + Number(line.bonus || 0)
          - Number(line.deductions || 0) - Number(line.amountPaid || 0));
      });
    });
    const draftPayroll = store.get('payrollRuns').filter(run => run.status === 'Draft').length
      + store.get('dozerPayrollRuns').filter(run => run.status === 'Draft').length;

    body.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Cash received', value: formatCurrency(income), tone: 'good' }),
      statCard({ label: 'Cash paid out', value: formatCurrency(outflow), tone: 'critical' }),
      statCard({ label: 'Recorded cash balance', value: formatCurrency(income - outflow), tone: income >= outflow ? 'good' : 'critical' }),
      statCard({ label: 'Approved unpaid requests', value: formatCurrency(commitmentTotal), tone: commitmentTotal ? 'warning' : 'good' }),
      statCard({ label: 'Customer receivables', value: formatCurrency(receivableTotal), tone: receivableTotal ? 'warning' : 'good' }),
      statCard({ label: 'Operator allowances owed', value: formatCurrency(operatorTotal), tone: operatorTotal ? 'warning' : 'good' }),
      statCard({ label: 'Staff salary owed', value: formatCurrency(salaryOutstanding), tone: salaryOutstanding ? 'warning' : 'good' }),
      statCard({ label: 'Loan balance outstanding', value: formatCurrency(loanTotal), tone: loanTotal ? 'warning' : 'good' }),
    ]));

    const quick = el('div', { class: 'filter-bar' }, [
      el('button', { class: 'btn btn-primary', type: 'button', onClick: () => setTab('expenses') }, 'Record expense'),
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => setTab('operatorAllowance') }, 'Manage operator allowances'),
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => setTab('payroll') }, 'Manage staff payroll'),
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => setTab('incomeExpenditure') }, 'Income & expenditure'),
    ]);
    body.appendChild(quick);
    body.appendChild(el('h3', { class: 'subsection-title' }, 'Approved requests awaiting payment'));
    const paymentQueue = el('div');
    body.appendChild(paymentQueue);
    renderRequestPayments(paymentQueue);
    body.appendChild(el('h3', { class: 'subsection-title' }, 'Other actions required'));

    const actionRows = [
      ...pending.map(r => ({ priority: 'Approval', item: (r.description || r.id).length > 140 ? `${(r.description || r.id).slice(0, 137)}…` : (r.description || r.id), amount: Number(r.approvedAmount || 0) || (r.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0), status: 'Pending' })),
      ...receivables.map(r => ({ priority: 'Collection', item: r.customer || r.id, amount: r.outstanding, status: 'Unpaid invoice' })),
      ...operatorBalances.map(r => ({ priority: 'Allowance', item: r.name, amount: r.balance, status: 'Owed' })),
      ...loanRows.map(r => ({ priority: 'Loan', item: r.lender || r.id, amount: r.outstanding, status: r.status || 'Active' })),
    ];
    const actionsTable = el('div');
    body.appendChild(actionsTable);
    renderTable(actionsTable, { columns: [
      { key: 'priority', label: 'Action' }, { key: 'item', label: 'Record' },
      { key: 'amount', label: 'Amount', render: row => formatCurrency(row.amount) },
      { key: 'status', label: 'Status' },
    ], rows: actionRows, emptyText: 'No finance action is currently outstanding.' });

    body.appendChild(el('h3', { class: 'subsection-title' }, 'Control checks'));
    const checks = el('div');
    body.appendChild(checks);
    renderTable(checks, { columns: [
      { key: 'check', label: 'Check' }, { key: 'result', label: 'Current result' },
    ], rows: [
      { check: 'Requests awaiting approval', result: String(pending.length) },
      { check: 'Approved requests awaiting payment', result: String(approved.length) },
      { check: 'Unpaid customer invoices', result: String(receivables.length) },
      { check: 'Draft payroll runs', result: String(draftPayroll) },
      { check: 'Expenses missing project', result: String(store.get('expenses').filter(e => !e.project).length) },
      { check: 'Expenses missing payee', result: String(store.get('expenses').filter(e => !e.payee).length) },
      { check: 'Paid requests without matched expense', result: String(paidUnreconciled.length) },
    ], emptyText: '' });

    body.appendChild(el('h3', { class: 'subsection-title' }, 'Recent financial activity'));
    const recent = el('div');
    body.appendChild(recent);
    renderTable(recent, { columns: [
      { key: 'date', label: 'Date', render: row => formatDate(row.date) },
      { key: 'type', label: 'Type' }, { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount', render: row => formatCurrency(row.amount) },
      { key: 'project', label: 'Project', render: row => row.project || '—' },
    ], rows: cash.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15), emptyText: 'No financial activity recorded.' });
  }

  function renderLoansTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderLoans(body);
  }

  function renderIncomeExpenditureTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderIncomeExpenditure(body);
  }

  function renderProfitabilityTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderProfitability(body);
  }

  function renderExpensesTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Expense'));

    body.innerHTML = '';
    const summaryGrid = el('div', { class: 'stats-grid' });
    body.appendChild(summaryGrid);
    body.appendChild(el('p', { class: 'section-subtitle' }, 'Includes recorded expenses and paid fund requests automatically. Linked records are reconciled using the same cash ledger as the financial reports.'));


    const chartContainer = el('div', { class: 'charts-grid charts-grid-1' });
    body.appendChild(chartContainer);

    let searchQuery = '';
    const searchInput = el('input', { type: 'search', placeholder: 'Search reference, description, payee, category or dozer…' });
    body.appendChild(el('div', { class: 'search-bar' }, [searchInput]));
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      refresh();
    });

    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      const expenses = expenseLedgerRows(store.all());
      const cash = financialActivity(store.all());
      const totalRevenue = cash.filter((r) => r.type === 'Income').reduce((sum, r) => sum + r.amount, 0);
      const totalExpenses = cash.filter((r) => r.type === 'Expenditure').reduce((sum, r) => sum + r.amount, 0);
      // Payments since the last bank-transfer upload are recorded as fund requests
      // (approved or paid), not as expenses; Income & Expenditure counts both.
      const requestTotal = financialActivity(store.all(), 'commitments').reduce((sum, r) => sum + r.amount, 0);
      const netPosition = totalRevenue - totalExpenses;

      summaryGrid.innerHTML = '';
      summaryGrid.appendChild(statCard({ label: 'Recorded Cash Income', value: formatCurrency(totalRevenue), tone: 'good' }));
      summaryGrid.appendChild(statCard({ label: 'Recorded Cash Outflow', value: formatCurrency(totalExpenses), tone: 'critical', hint: 'Legacy records require reconciliation; see Income & Expenditure' }));
      summaryGrid.appendChild(statCard({ label: 'Approved Unpaid Commitments', value: formatCurrency(requestTotal), tone: 'warning', hint: 'Excluded from recorded cash net' }));
      summaryGrid.appendChild(statCard({ label: 'Recorded Cash Net', value: formatCurrency(netPosition), tone: netPosition >= 0 ? 'good' : 'critical', hint: 'Recorded income less recorded outflow' }));

      const categories = [...new Set(expenses.map((e) => e.category))];
      const bars = categories.map((cat, i) => ({
        label: cat,
        value: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
        colorVar: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
      }));
      renderBarChart(chartContainer, { title: 'Expenses by Category', bars, formatValue: formatCurrency });

      let rows = expenses.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      if (searchQuery) {
        rows = rows.filter((r) => [r.id, r.source, r.paymentReference, r.description, r.category, r.payee, r.paidBy, r.project, r.equipment].join(' ').toLowerCase().includes(searchQuery));
      }
      renderTable(tableContainer, {
        columns: [
          { key: 'sourceId', label: 'Reference' },
          { key: 'source', label: 'Source' },
          { key: 'date', label: 'Payment Date', render: (r) => formatDate(r.date) },
          { key: 'category', label: 'Category' },
          { key: 'description', label: 'Description', wrap: true },
          { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
          { key: 'payee', label: 'Paid To', render: (r) => r.payee || '—' },
          { key: 'paidBy', label: 'Paid By', render: (r) => r.paidBy || '—' },
          { key: 'paymentReference', label: 'Payment Reference', render: (r) => r.paymentReference || '—' },
          { key: 'project', label: 'Project', render: (r) => r.project || '—' },
          { key: 'equipment', label: 'Equipment', render: (r) => r.equipment || '—' },
          {
            key: 'actions',
            label: '',
            render: (r) => r.source === 'Paid Fund Request' ? el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button',
              onClick: () => {
                const request = store.find('fundRequests', r.fundRequestId);
                if (request) printFundRequest(request, {
                  submittedByName: store.find('employees', request.submittedBy)?.name || '',
                  approvedByName: store.find('employees', request.approvedBy)?.name || '',
                });
              },
            }, 'View / print request') : actionButtons({
              onEdit: () => openForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.description)) return;
                try {
                  await store.remove('expenses', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this expense.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No expenses recorded yet.',
      });
    }

    function openForm(record) {
      openModal({
        title: record ? 'Edit Expense' : 'Add Expense',
        fields: fields(),
        initial: record || { date: todayISOString() },
        submitLabel: record ? 'Save Changes' : 'Add Expense',
        onSubmit: async (data) => {
          if (record) await store.update('expenses', record.id, data);
          else await store.add('expenses', data);
          refresh();
        },
      });
    }

    refresh();
  }

  setTab('overview');
}
