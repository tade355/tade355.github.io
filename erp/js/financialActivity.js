// Recorded cash and unpaid commitments are separate reporting bases.
export function financialActivity(ctx, basis = 'cash') {
  const requests = ctx.fundRequests || [];
  const requestTotal = (r) => (r.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const requestRow = (r) => ({ id: r.id, date: basis === 'commitments' ? r.date : (r.paidAt || r.date),
    project: r.project || '', type: 'Expenditure', costHead: r.costHead || 'Uncategorized',
    description: r.description || `Fund request ${r.id}`, amount: basis === 'commitments' ? (Number(r.approvedAmount) || requestTotal(r)) : (Number(r.paidAmount) || requestTotal(r)),
    source: basis === 'commitments' ? 'Approved Commitment' : 'Paid Fund Request' });
  if (basis === 'commitments') return requests.filter((r) => ['Approved', 'Partially Approved'].includes(r.status)).map(requestRow);
  const workflowRequests=ctx.fuelWorkflows||[];
  const invoices = new Map((ctx.invoices || []).map((i) => [i.id, i]));
  const rows = (ctx.invoicePayments || []).map((p) => {
    const invoice = invoices.get(p.invoiceId);
    return { id: p.id, date: p.date, project: invoice?.project || '', type: 'Income', costHead: 'Invoicing / Sales',
      description: `Payment for ${p.invoiceId}`, amount: p.amount || 0, source: 'Invoice Payment' };
  });
  const linkedExpenseTotals = new Map();
  (ctx.expenses || []).forEach((expense) => {
    if (!expense.fundRequestId) return;
    linkedExpenseTotals.set(expense.fundRequestId,
      (linkedExpenseTotals.get(expense.fundRequestId) || 0) + (Number(expense.amount) || 0));
  });
  (ctx.expenses || []).forEach((e) => rows.push({ id: e.id, date: e.date, project: e.project || '', type: 'Expenditure',
    costHead: e.category || 'Other', description: e.description, amount: Number(e.amount) || 0, source: 'Expense' }));
  requests.filter((r) => r.status === 'Paid').forEach((r) => {
    const paid = Number(r.paidAmount) || requestTotal(r);
    const remaining = Math.max(0, paid - (linkedExpenseTotals.get(r.id) || 0));
    if (remaining > 0.005) rows.push({ ...requestRow(r), amount: remaining });
  });
  (ctx.financialEntries || []).forEach((f) => rows.push({ ...f, project: f.project || '', source: 'Manual', record: f }));
  workflowRequests.filter(r=>r.kind==='Fuel').forEach(r=>(r.events||[]).filter(e=>e.type==='payment').forEach(e=>{
    rows.push({id:'FUEL-WF:'+r.id+':'+e.token,date:e.date,project:r.project,type:'Expenditure',costHead:'Fuel',description:'Station payment '+r.id,amount:Number(e.amount),source:'Fuel Station Payment'});
  }));
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
