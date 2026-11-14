// A manager's earlier-cost requests form a ledger. Each approved request is a
// locked batch; payments are credits against that batch, never new costs.
export function managerImprestLedger(records = []) {
  const wallets = new Map();
  for (const record of records) {
    // Linked fund requests have their own payment ledger; including them here
    // would overstate the manager balance.
    if (record.kind !== 'Cost' || record.status === 'Rejected' || record.data?.linkedFundRequestId) continue;
    const manager = String(record.data?.payee || '').trim();
    if (!manager) continue;
    const key = manager.toLocaleLowerCase();
    if (!wallets.has(key)) wallets.set(key, { manager, reported: 0, awaitingApproval: 0, approved: 0, paid: 0, outstanding: 0, batches: [] });
    const wallet = wallets.get(key);
    const requested = Number(record.data.amount) || 0;
    const pending = ['Submitted','Reviewed'].includes(record.status);
    const approved = pending ? 0 : Number(record.data.approvedAmount ?? requested) || 0;
    const paid = (record.events || []).filter(event => event.type === 'payment').reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
    const batch = { id: record.id, project: record.project, status: record.status, incurredDate: record.data.incurredDate, description: record.data.description, providers: record.data.serviceProviders || '', requested, approved, paid, outstanding: Math.max(0, approved - paid), payments: (record.events || []).filter(event => event.type === 'payment'), record };
    wallet.reported += requested;
    wallet.awaitingApproval += pending ? requested : 0;
    wallet.approved += approved;
    wallet.paid += paid;
    wallet.outstanding += batch.outstanding;
    wallet.batches.push(batch);
  }
  return [...wallets.values()].map(wallet => ({ ...wallet, batches: wallet.batches.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })) })).sort((a, b) => b.outstanding - a.outstanding || a.manager.localeCompare(b.manager));
}

