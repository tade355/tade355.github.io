// Recorded cash and unpaid commitments are separate reporting bases.
export function financialActivity(ctx, basis = 'cash') {
  const requests = ctx.fundRequests || [];
  const requestTotal = (r) => (r.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const requestRow = (r) => ({ id: r.id, date: basis === 'commitments' ? r.date : (r.paidAt || r.date),
    project: r.project || '', type: 'Expenditure', costHead: r.costHead || 'Uncategorized',
    description: r.description || `Fund request ${r.id}`, amount: basis === 'commitments' ? (Number(r.approvedAmount) || requestTotal(r)) : (Number(r.paidAmount) || requestTotal(r)),
    source: basis === 'commitments' ? 'Approved Commitment' : 'Paid Fund Request' });
  if (basis === 'commitments') return requests.filter((r) => ['Approved', 'Partially Approved'].includes(r.status)).map(requestRow);
  const invoices = new Map((ctx.invoices || []).map((i) => [i.id, i]));
  const rows = (ctx.invoicePayments || []).map((p) => {
    const invoice = invoices.get(p.invoiceId);
    return { id: p.id, date: p.date, project: invoice?.project || '', type: 'Income', costHead: 'Invoicing / Sales',
      description: `Payment for ${p.invoiceId}`, amount: p.amount || 0, source: 'Invoice Payment' };
  });
  const linkedRequests = new Set(requests.filter((r) => {
    const expenses = (ctx.expenses || []).filter((e) => e.fundRequestId === r.id);
    const total = Number(r.paidAmount) || requestTotal(r);
    return expenses.length && Math.abs(expenses.reduce((s, e) => s + (e.amount || 0), 0) - total) < 0.005;
  }).map((r) => r.id));
  (ctx.expenses || []).forEach((e) => rows.push({ id: e.id, date: e.date, project: e.project || '', type: 'Expenditure',
    costHead: e.category || 'Other', description: e.description, amount: e.amount || 0, source: 'Expense' }));
  requests.filter((r) => r.status === 'Paid' && !linkedRequests.has(r.id)).forEach((r) => rows.push(requestRow(r)));
  (ctx.financialEntries || []).forEach((f) => rows.push({ ...f, project: f.project || '', source: 'Manual', record: f }));
  return rows;
}


/** Cash expense register, sharing reconciliation rules with financial reports. */
export function expenseLedgerRows(ctx) {
  const expenses = new Map((ctx.expenses || []).map(row => [row.id, row]));
  const requests = new Map((ctx.fundRequests || []).map(row => [row.id, row]));
  return financialActivity(ctx)
    .filter(row => row.type === 'Expenditure' && ['Expense', 'Paid Fund Request'].includes(row.source))
    .map(row => {
      if (row.source === 'Expense') return { ...expenses.get(row.id), source: 'Expense', sourceId: row.id };
      const request = requests.get(row.id);
      const payees = [...new Set((request.items || []).map(item => item.accountName).filter(Boolean))];
      return {
        id: row.id, sourceId: row.id, source: 'Paid Fund Request', date: row.date,
        category: row.costHead, description: row.description, amount: row.amount,
        payee: payees.join(' / '), paidBy: request.paidBy || '',
        project: row.project, equipment: request.equipment || '',
        paymentReference: request.paymentReference || '', fundRequestId: row.id,
      };
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
}
