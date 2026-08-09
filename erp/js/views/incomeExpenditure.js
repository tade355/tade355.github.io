import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, statCard, statusPill, renderTable, actionButtons, openModal, confirmDelete } from '../ui.js';
import { renderBarChart, CATEGORICAL_COLORS } from '../charts.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants.js';
import { amountReceived } from '../invoicePayments.js';

function projectNames() {
  return store.get('projects').map((p) => p.name);
}

function costHeadOptions() {
  return [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
}

function manualEntryFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'type', label: 'Type', type: 'select', required: true, options: [
      { value: 'Income', label: 'Income' },
      { value: 'Expenditure', label: 'Expenditure' },
    ] },
    { name: 'project', label: 'Project', type: 'select', options: [
      { value: '', label: '— Not linked to a project —' },
      ...projectNames().map((p) => ({ value: p, label: p })),
    ] },
    { name: 'costHead', label: 'Cost Head', type: 'select', required: true, options: costHeadOptions().map((c) => ({ value: c, label: c })) },
    { name: 'amount', label: 'Amount (₦)', type: 'number', required: true, min: 0 },
    { name: 'description', label: 'Description', required: true },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

// Merges the four sources of cash movement into one flat list: Paid and
// Partially Paid invoices (income — only the amount actually received, not
// the full invoice total, now that partial payments exist), Expenses
// (expenditure), Fund Requests that are Approved or Paid (expenditure —
// "approved/disbursed"), and manual entries the accountant records
// directly for anything else.
export function collectEntries() {
  const rows = [];

  store.get('invoices').filter((i) => i.status === 'Paid' || i.status === 'Partially Paid').forEach((i) => {
    rows.push({
      date: i.date, project: i.project || '', type: 'Income', costHead: 'Invoicing / Sales',
      description: i.items?.[0]?.description || `Invoice ${i.id}`, amount: amountReceived(i), source: 'Invoice',
    });
  });

  store.get('expenses').forEach((e) => {
    rows.push({
      date: e.date, project: e.project || '', type: 'Expenditure', costHead: e.category || 'Other',
      description: e.description, amount: e.amount, source: 'Expense',
    });
  });

  store.get('fundRequests').filter((r) => r.status === 'Approved' || r.status === 'Paid').forEach((r) => {
    rows.push({
      date: r.date, project: r.project || '', type: 'Expenditure', costHead: r.costHead || 'Uncategorized',
      description: r.description || `Fund request — ${r.items.length} item(s)`,
      amount: r.items.reduce((sum, it) => sum + it.amount, 0), source: 'Fund Request',
    });
  });

  store.get('financialEntries').forEach((f) => {
    rows.push({
      date: f.date, project: f.project || '', type: f.type, costHead: f.costHead,
      description: f.description, amount: f.amount, source: 'Manual', record: f,
    });
  });

  return rows;
}

export function renderIncomeExpenditure(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Manual Entry');
  container.appendChild(sectionHeader(
    'Income & Expenditure',
    'Company cash flow by project, period, and cost head — auto-populated from Paid invoices, Expenses, and Approved/Paid fund requests, plus manual entries',
    addBtn,
  ));

  const filterBar = el('div', { class: 'filter-bar' });
  const projectSelect = el('select', { name: 'project' }, [
    el('option', { value: '' }, 'All Projects'),
    ...projectNames().map((p) => el('option', { value: p }, p)),
  ]);
  const typeSelect = el('select', { name: 'type' }, [
    el('option', { value: '' }, 'Income & Expenditure'),
    el('option', { value: 'Income' }, 'Income Only'),
    el('option', { value: 'Expenditure' }, 'Expenditure Only'),
  ]);
  const costHeadSelect = el('select', { name: 'costHead' }, [
    el('option', { value: '' }, 'All Cost Heads'),
    ...costHeadOptions().map((c) => el('option', { value: c }, c)),
  ]);
  const fromInput = el('input', { type: 'date', name: 'from' });
  const toInput = el('input', { type: 'date', name: 'to' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Type'), typeSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Cost Head'), costHeadSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  const summaryGrid = el('div', { class: 'stats-grid' });
  container.appendChild(summaryGrid);

  const chartsGrid = el('div', { class: 'charts-grid' });
  container.appendChild(chartsGrid);
  const incomeChartContainer = el('div');
  const expenditureChartContainer = el('div');
  chartsGrid.appendChild(incomeChartContainer);
  chartsGrid.appendChild(expenditureChartContainer);

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const project = projectSelect.value;
    const type = typeSelect.value;
    const costHead = costHeadSelect.value;
    const from = fromInput.value;
    const to = toInput.value;

    let rows = collectEntries().filter((r) =>
      (!project || r.project === project)
      && (!type || r.type === type)
      && (!costHead || r.costHead === costHead)
      && dateInRange(r.date, from, to));
    rows = rows.sort((a, b) => (a.date < b.date ? 1 : -1));

    const totalIncome = rows.filter((r) => r.type === 'Income').reduce((sum, r) => sum + r.amount, 0);
    const totalExpenditure = rows.filter((r) => r.type === 'Expenditure').reduce((sum, r) => sum + r.amount, 0);
    const net = totalIncome - totalExpenditure;

    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard({ label: 'Total Income', value: formatCurrency(totalIncome), tone: 'good' }));
    summaryGrid.appendChild(statCard({ label: 'Total Expenditure', value: formatCurrency(totalExpenditure), tone: 'critical' }));
    summaryGrid.appendChild(statCard({ label: 'Net Position', value: formatCurrency(net), tone: net >= 0 ? 'good' : 'critical' }));

    const incomeByHead = [...new Set(rows.filter((r) => r.type === 'Income').map((r) => r.costHead))];
    renderBarChart(incomeChartContainer, {
      title: 'Income by Cost Head',
      bars: incomeByHead.map((h, i) => ({
        label: h,
        value: rows.filter((r) => r.type === 'Income' && r.costHead === h).reduce((sum, r) => sum + r.amount, 0),
        colorVar: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
      })),
      formatValue: formatCurrency,
    });

    const expenditureByHead = [...new Set(rows.filter((r) => r.type === 'Expenditure').map((r) => r.costHead))];
    renderBarChart(expenditureChartContainer, {
      title: 'Expenditure by Cost Head',
      bars: expenditureByHead.map((h, i) => ({
        label: h,
        value: rows.filter((r) => r.type === 'Expenditure' && r.costHead === h).reduce((sum, r) => sum + r.amount, 0),
        colorVar: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
      })),
      formatValue: formatCurrency,
    });

    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'project', label: 'Project', render: (r) => r.project || '—' },
        { key: 'type', label: 'Type', render: (r) => statusPill(r.type) },
        { key: 'costHead', label: 'Cost Head' },
        { key: 'description', label: 'Description', render: (r) => r.description || '—' },
        { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
        { key: 'source', label: 'Source' },
        {
          key: 'actions',
          label: '',
          render: (r) => (r.source === 'Manual' ? actionButtons({
            onEdit: () => openForm(r.record),
            onDelete: async () => {
              if (!confirmDelete(r.description)) return;
              try {
                await store.remove('financialEntries', r.record.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this entry.');
              }
            },
          }) : '—'),
        },
      ],
      rows,
      emptyText: 'No income or expenditure entries in this range yet.',
    });
  }

  function openForm(record) {
    openModal({
      title: record ? 'Edit Manual Entry' : 'Add Manual Entry',
      fields: manualEntryFields(),
      initial: record || { date: new Date().toISOString().slice(0, 10), type: 'Expenditure' },
      submitLabel: record ? 'Save Changes' : 'Add Entry',
      onSubmit: async (data) => {
        if (record) await store.update('financialEntries', record.id, data);
        else await store.add('financialEntries', data);
        refresh();
      },
    });
  }

  [projectSelect, typeSelect, costHeadSelect, fromInput, toInput].forEach((input) => input.addEventListener('change', refresh));

  refresh();
}
