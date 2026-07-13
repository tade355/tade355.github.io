import { store } from '../store.js';
import { formatCurrency, formatDate, invoiceTotal, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { renderBarChart, CATEGORICAL_COLORS } from '../charts.js';
import { PROJECTS } from '../constants.js';

const FIELDS = [
  { name: 'date', label: 'Date', type: 'date', required: true },
  { name: 'category', label: 'Category', type: 'select', required: true, options: [
    { value: 'Fuel', label: 'Fuel' },
    { value: 'Maintenance', label: 'Maintenance' },
    { value: 'Payroll', label: 'Payroll' },
    { value: 'Logistics', label: 'Logistics' },
    { value: 'Administration', label: 'Administration' },
    { value: 'Other', label: 'Other' },
  ] },
  { name: 'description', label: 'Description', required: true },
  { name: 'amount', label: 'Amount (₦)', type: 'number', required: true, min: 0 },
  { name: 'paidBy', label: 'Paid By', required: true },
  { name: 'project', label: 'Project (for profitability tracking)', type: 'select', options: [
    { value: '', label: '— Not linked to a project —' },
    ...PROJECTS.map((p) => ({ value: p, label: p })),
  ] },
];

export function renderAccounting(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Expense');
  container.appendChild(sectionHeader('Accounting & Expenses', 'Company spending and revenue summary', addBtn));

  const summaryGrid = el('div', { class: 'stats-grid' });
  container.appendChild(summaryGrid);

  const chartContainer = el('div', { class: 'charts-grid charts-grid-1' });
  container.appendChild(chartContainer);

  let searchQuery = '';
  const searchInput = el('input', { type: 'search', placeholder: 'Search by description, category, or paid by…' });
  container.appendChild(el('div', { class: 'search-bar' }, [searchInput]));
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    refresh();
  });

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const invoices = store.get('invoices');
    const expenses = store.get('expenses');
    const totalRevenue = invoices.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + invoiceTotal(i), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netPosition = totalRevenue - totalExpenses;

    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard({ label: 'Total Revenue (Paid)', value: formatCurrency(totalRevenue), tone: 'good' }));
    summaryGrid.appendChild(statCard({ label: 'Total Expenses', value: formatCurrency(totalExpenses), tone: 'critical' }));
    summaryGrid.appendChild(statCard({ label: 'Net Position', value: formatCurrency(netPosition), tone: netPosition >= 0 ? 'good' : 'critical' }));

    const categories = [...new Set(expenses.map((e) => e.category))];
    const bars = categories.map((cat, i) => ({
      label: cat,
      value: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
      colorVar: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
    }));
    renderBarChart(chartContainer, { title: 'Expenses by Category', bars, formatValue: formatCurrency });

    let rows = expenses.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (searchQuery) {
      rows = rows.filter((r) => [r.description, r.category, r.paidBy, r.project].join(' ').toLowerCase().includes(searchQuery));
    }
    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
        { key: 'paidBy', label: 'Paid By' },
        { key: 'project', label: 'Project', render: (r) => r.project || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
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
      fields: FIELDS,
      initial: record || { date: new Date().toISOString().slice(0, 10) },
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
