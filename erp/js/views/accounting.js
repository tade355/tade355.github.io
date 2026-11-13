import { renderRequestPayments } from './requestPayments.js';
import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, invoiceTotal, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, openCustomModal, confirmDelete } from '../ui.js';
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
  const payrollTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('payroll') }, 'Payroll Payments');
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
  container.appendChild(sectionHeader('Finance & Accounts', 'Cash, commitments, receivables, payroll payments, operator allowances, loans, expenses, and profitability in one control centre', actionSlot));
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
    else if (tab === 'payroll') { actionSlot.innerHTML = ''; body.innerHTML = ''; body.appendChild(el('div', { class: 'notice notice-info' }, 'Accounts: open approved payrolls, make full or partial payments, and record each payment. Do not change the approved payroll amount.')); renderPayroll(body, { mode: 'accounts' }); }
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
    const overlinked = requests.filter(r => r.status === 'Paid' &&
      store.get('expenses').filter(e => e.fundRequestId === r.id).reduce((sum, e) => sum + Number(e.amount || 0), 0) >
      (Number(r.paidAmount) || (r.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)) + 0.005).length;
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
    store.get('payrollRuns').filter(run => ['Approved','PartiallyPaid','Paid'].includes(run.status)).forEach(run => {
      (run.lines || []).forEach(line => {
        salaryOutstanding += Math.max(0, Number(line.baseSalary || 0) + Number(line.bonus || 0)
          - Number(line.deductions || 0) - Number(line.amountPaid || 0));
      });
    });
    const draftPayroll = store.get('payrollRuns').filter(run => run.status === 'Draft').length
      + store.get('dozerPayrollRuns').filter(run => run.status === 'Draft').length;

    const metric = (label, value, hint, target, tone = '') => el('button', {
      type: 'button', class: 'finance-metric' + (tone ? ' finance-metric-' + tone : ''),
      onClick: () => setTab(target),
      title: 'Open ' + label + ' details',
    }, [
      el('span', { class: 'finance-metric-label' }, label),
      el('strong', { class: 'finance-metric-value' }, formatCurrency(value)),
      el('span', { class: 'finance-metric-hint' }, hint + ' · View details →'),
    ]);
    const block = (title, subtitle, cards) => {
      body.appendChild(el('div', { class: 'finance-group-heading' }, [
        el('h3', {}, title), el('p', {}, subtitle),
      ]));
      body.appendChild(el('div', { class: 'finance-metric-grid' }, cards));
    };

    body.appendChild(el('div', { class: 'finance-intro' }, [
      el('strong', {}, 'Finance position from ERP records'),
      el('span', {}, 'All amounts are to date. Recorded cash net is income minus recorded outflow; it is not a bank balance. Reconcile it with the bank statement.'),
    ]));
    block('Recorded cash', 'Money recorded as received or paid.', [
      metric('Received', income, 'Customer and other recorded receipts', 'incomeExpenditure', 'good'),
      metric('Paid out', outflow, 'Recorded payments and expenses', 'incomeExpenditure', 'critical'),
      metric('Recorded cash net', income - outflow, 'Received less paid out', 'incomeExpenditure', income >= outflow ? 'good' : 'critical'),
    ]);
    block('To pay', 'Approved amounts not yet fully settled. These are separate from cash already paid.', [
      metric('Approved fund requests', commitmentTotal, 'Awaiting payment', 'requestPayments', 'warning'),
      metric('Staff salaries', salaryOutstanding, 'Approved payroll still owed', 'payroll', 'warning'),
      metric('Operator allowances', operatorTotal, 'Allowances still owed', 'operatorAllowance', 'warning'),
      metric('Loan balances', loanTotal, 'Review loan details and direction', 'loans', 'warning'),
    ]);
    block('To collect', 'Amounts customers still owe the company.', [
      metric('Customer receivables', receivableTotal, 'Unpaid invoice balances', 'incomeExpenditure', 'warning'),
    ]);

    body.appendChild(el('div', { class: 'finance-section-head' }, [
      el('div', {}, [el('h3', {}, 'Attention needed'), el('p', {}, 'Follow up on approvals, collections and records that need checking.')]),
    ]));
    const checks = [
      { label: 'Fund requests awaiting approval', count: pending.length, action: 'Open requests', click: () => { window.location.hash = '#/fundRequests?tab=Approvals'; } },
      { label: 'Approved requests awaiting payment', count: approved.length, action: 'Open payments', click: () => setTab('requestPayments') },
      { label: 'Unpaid customer invoices', count: receivables.length, action: 'Open sales', click: () => { window.location.hash = '#/sales'; } },
      { label: 'Draft payroll runs', count: draftPayroll, action: 'Open payroll', click: () => setTab('payroll') },
      { label: 'Direct expenses without a project', count: store.get('expenses').filter(e => !e.project).length, action: 'Review expenses', click: () => setTab('expenses') },
      { label: 'Direct expenses without a payee', count: store.get('expenses').filter(e => !e.payee).length, action: 'Review expenses', click: () => setTab('expenses') },
      { label: 'Linked expenses exceeding the request payment', count: overlinked, action: 'Review expenses', click: () => setTab('expenses') },
    ];
    body.appendChild(el('div', { class: 'finance-check-list' }, (checks.some(check => check.count > 0) ? checks.filter(check => check.count > 0) : [{ label: 'No items need attention', count: 0, action: 'Review records', click: () => setTab('expenses') }]).map(check =>
      el('div', { class: 'finance-check-row' }, [
        el('span', {}, check.label),
        el('strong', {}, String(check.count)),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: check.click }, check.action),
      ])
    )));

    body.appendChild(el('div', { class: 'finance-section-head' }, [
      el('div', {}, [el('h3', {}, 'Recent cash activity'), el('p', {}, 'Latest recorded receipts and payments.')]),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => setTab('incomeExpenditure') }, 'See all activity'),
    ]));
    const recent = el('div');
    body.appendChild(recent);
    renderTable(recent, { columns: [
      { key: 'date', label: 'Date', render: row => formatDate(row.date) },
      { key: 'type', label: 'Flow' },
      { key: 'description', label: 'Description', wrap: true },
      { key: 'amount', label: 'Amount', render: row => formatCurrency(row.amount) },
      { key: 'project', label: 'Project', render: row => row.project || '—' },
    ], rows: cash.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 8),
       emptyText: 'No cash activity recorded.' });
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
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', type: 'button', onClick: () => openForm() }, '+ Add Expense'));
    body.innerHTML = '';

    body.appendChild(el('div', { class: 'finance-intro' }, [
      el('strong', {}, 'Expense register'),
      el('span', {}, 'Direct expenses and paid fund requests appear here once. Other cash payments, including fuel station settlements, are in Income & Expenditure.'),
    ]));

    const allRows = expenseLedgerRows(store.all());
    const filters = { search: '', from: '', to: '', project: '', category: '', source: '' };
    const filterBar = el('div', { class: 'finance-expense-filters' });
    const search = el('input', { type: 'search', placeholder: 'Search reference, description, payee or payment reference', 'aria-label': 'Search expenses' });
    const from = el('input', { type: 'date', 'aria-label': 'From date' });
    const to = el('input', { type: 'date', 'aria-label': 'To date' });
    const makeSelect = (label, values) => {
      const select = el('select', { 'aria-label': label });
      select.appendChild(el('option', { value: '' }, 'All ' + label.toLowerCase()));
      values.forEach(value => select.appendChild(el('option', { value }, value)));
      return select;
    };
    const project = makeSelect('Projects', [...new Set(allRows.map(row => row.project).filter(Boolean))].sort());
    const category = makeSelect('Categories', [...new Set(allRows.map(row => row.category).filter(Boolean))].sort());
    const source = makeSelect('Sources', ['Expense', 'Paid Fund Request']);
    const field = (label, control) => el('label', { class: 'finance-filter-field' }, [el('span', {}, label), control]);
    filterBar.append(
      field('Search', search), field('From', from), field('To', to),
      field('Project', project), field('Category', category), field('Source', source),
    );
    const reset = el('button', { type: 'button', class: 'btn btn-ghost', onClick: () => {
      [search, from, to, project, category, source].forEach(control => { control.value = ''; });
      Object.keys(filters).forEach(key => { filters[key] = ''; });
      refresh();
    } }, 'Clear filters');
    filterBar.appendChild(reset);
    body.appendChild(filterBar);
    [[search, 'search'], [from, 'from'], [to, 'to'], [project, 'project'], [category, 'category'], [source, 'source']]
      .forEach(([control, key]) => control.addEventListener(key === 'search' ? 'input' : 'change', () => {
        filters[key] = control.value.trim();
        refresh();
      }));

    const summary = el('div', { class: 'finance-expense-summary' });
    body.appendChild(summary);
    body.appendChild(el('div', { class: 'finance-section-head' }, [
      el('div', {}, [el('h3', {}, 'Expense records'), el('p', {}, 'Select Details for payment information or use the row actions to correct a direct expense.')]),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => setTab('incomeExpenditure') }, 'View full cash ledger'),
    ]));
    const tableContainer = el('div');
    body.appendChild(tableContainer);
    const analysis = el('details', { class: 'finance-expense-analysis' }, [
      el('summary', {}, 'Expense breakdown by category'),
    ]);
    const chartContainer = el('div', { class: 'charts-grid charts-grid-1' });
    analysis.appendChild(chartContainer);
    body.appendChild(analysis);

    function openDetails(row) {
      openCustomModal({ title: 'Expense details · ' + (row.sourceId || row.id), build(modalBody) {
        const details = [
          ['Source', row.source], ['Payment date', formatDate(row.date)],
          ['Category', row.category || '—'], ['Description', row.description || '—'],
          ['Amount', formatCurrency(row.amount)], ['Paid to', row.payee || '—'],
          ['Paid by', row.paidBy || '—'], ['Payment reference', row.paymentReference || '—'],
          ['Project', row.project || '—'], ['Equipment', row.equipment || '—'],
        ];
        modalBody.appendChild(el('dl', { class: 'finance-expense-detail-list' },
          details.flatMap(([label, value]) => [el('dt', {}, label), el('dd', {}, value)])));
        if (row.source === 'Paid Fund Request') {
          modalBody.appendChild(el('button', { type: 'button', class: 'btn btn-primary', onClick: () => {
            const request = store.find('fundRequests', row.fundRequestId);
            if (request) printFundRequest(request, {
              submittedByName: store.find('employees', request.submittedBy)?.name || '',
              approvedByName: store.find('employees', request.approvedBy)?.name || '',
            });
          } }, 'View / print fund request'));
        }
      } });
    }

    function refresh() {
      let rows = allRows.filter(row => {
        const date = String(row.date || '').slice(0, 10);
        if (filters.from && date < filters.from) return false;
        if (filters.to && date > filters.to) return false;
        if (filters.project && row.project !== filters.project) return false;
        if (filters.category && row.category !== filters.category) return false;
        if (filters.source && row.source !== filters.source) return false;
        if (filters.search && ![row.sourceId, row.source, row.paymentReference, row.description,
          row.category, row.payee, row.paidBy, row.project, row.equipment]
          .join(' ').toLowerCase().includes(filters.search.toLowerCase())) return false;
        return true;
      }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) ||
        String(b.sourceId || '').localeCompare(String(a.sourceId || ''), undefined, { numeric: true }));

      const sum = list => list.reduce((total, row) => total + Number(row.amount || 0), 0);
      summary.replaceChildren(
        el('div', {}, [el('span', {}, 'Amount in view'), el('strong', {}, formatCurrency(sum(rows)))]),
        el('div', {}, [el('span', {}, 'Records in view'), el('strong', {}, String(rows.length))]),
        el('div', {}, [el('span', {}, 'Direct expenses'), el('strong', {}, formatCurrency(sum(rows.filter(row => row.source === 'Expense'))))]),
        el('div', {}, [el('span', {}, 'Paid fund requests'), el('strong', {}, formatCurrency(sum(rows.filter(row => row.source === 'Paid Fund Request'))))]),
      );
      renderTable(tableContainer, {
        columns: [
          { key: 'date', label: 'Date', render: row => formatDate(row.date) },
          { key: 'sourceId', label: 'Record', render: row => el('span', { class: 'finance-expense-record' }, [
            el('strong', {}, row.sourceId || row.id), el('small', {}, row.source === 'Expense' ? 'Direct expense' : 'Paid request'),
          ]) },
          { key: 'category', label: 'Category', render: row => row.category || '—' },
          { key: 'description', label: 'Description', wrap: true },
          { key: 'payee', label: 'Paid to', render: row => row.payee || '—' },
          { key: 'project', label: 'Project', render: row => row.project || '—' },
          { key: 'amount', label: 'Amount', render: row => formatCurrency(row.amount) },
          { key: 'actions', label: 'Actions', render: row => el('div', { class: 'finance-expense-actions' }, [
            el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => openDetails(row) }, 'Details'),
            row.source === 'Expense' ? actionButtons({
              onEdit: () => openForm(row),
              onDelete: async () => {
                if (!confirmDelete(row.description)) return;
                try { await store.remove('expenses', row.id); renderExpensesTab(); }
                catch (error) { window.alert(error.message || 'Could not delete this expense.'); }
              },
            }) : null,
          ]) },
        ],
        rows,
        emptyText: 'No expense records match these filters.',
      });
      const categories = [...new Set(rows.map(row => row.category || 'Uncategorised'))]
        .map(name => ({ label: name, value: sum(rows.filter(row => (row.category || 'Uncategorised') === name)) }))
        .sort((a, b) => b.value - a.value);
      const bars = categories.slice(0, 7);
      if (categories.length > 7) bars.push({ label: 'Other categories', value: categories.slice(7).reduce((total, item) => total + item.value, 0) });
      renderBarChart(chartContainer, { title: 'Amount by category', bars: bars.map((item, index) => ({
        ...item, colorVar: CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length],
      })), formatValue: formatCurrency });
    }

    function openForm(record) {
      openModal({
        title: record ? 'Edit Expense' : 'Add Expense',
        fields: fields(),
        initial: record || { date: todayISOString() },
        submitLabel: record ? 'Save Changes' : 'Add Expense',
        onSubmit: async data => {
          if (record) await store.update('expenses', record.id, data);
          else await store.add('expenses', data);
          renderExpensesTab();
        },
      });
    }

    refresh();
  }

  setTab('overview');
}
