// Project logistics requested for a specific day are incurred costs even while
// the approval and payment workflow is still open. The request date is the
// service date until the form records a separate incurred date.
export function ordinaryProjectLogistics(requests, from, to, linkedWorkflowRequestIds = new Set()) {
  const out = { total: 0, operator: 0, diesel: 0, provisional: 0, datesWithDiesel: new Set() };
  for (const request of requests || []) {
    if (request.costHead !== 'Logistics' || !request.date || request.date < from || request.date > to) continue;
    if (!['Pending', 'Approved', 'Partially Approved', 'Paid'].includes(request.status)) continue;
    if (linkedWorkflowRequestIds.has(request.id)) continue;
    const description = `${request.description || ''} ${(request.items || []).map(item => item.description || '').join(' ')}`;
    if (!/transport|waybill|delivery|t-far|t\s*far|fare/i.test(description)) continue;
    // Rolling balance requests are itemised by service day elsewhere. Their
    // headline total includes old debt and must never be treated as a new cost.
    if ((request.items || []).some(item => /carried balance|outstanding carried/i.test(item.description || ''))
      && /(?:operator|bike).*(?:diesel|transport)|diesel.*transport/i.test(request.description || '')) continue;
    const amount = (request.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    if (!amount) continue;
    const diesel = /diesel|ago/i.test(description) && /transport|delivery|waybill/i.test(description);
    const operator = /operator|staff|worker|personnel/i.test(description) && /transport|t-far|t\s*far|fare/i.test(description);
    out.total += amount;
    if (diesel) { out.diesel += amount; out.datesWithDiesel.add(request.date); }
    else if (operator) out.operator += amount;
    if (request.status === 'Pending') out.provisional += amount;
  }
  return out;
}

