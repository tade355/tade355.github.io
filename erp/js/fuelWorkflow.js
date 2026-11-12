// Pure calculations shared by the planner, workflow and profitability.
export const FUEL_PURPOSES = ['Production', 'Trekking', 'Repairs', 'Maintenance', 'Burning debris', 'Vehicles / bikes', 'Generator'];
export function fuelRequirement({ hours = 8, litresPerHour = 25, afterHoursRate = 20, reserve = 50, closing = 0 }) {
  const n = [hours, litresPerHour, reserve, closing, afterHoursRate].map(Number);
  if (n.some(x => !Number.isFinite(x) || x < 0) || n[0] > 24) throw new Error('Enter valid hours, consumption, reserve and closing fuel.');
  return Math.max(0, Math.round((Math.min(n[0],8) * n[1] + Math.max(0,n[0]-8)*n[4] + n[2] - n[3]) * 10) / 10);
}
export function lineBalance(record, lineId) {
  const events = record.events || [];
  const line = (record.data.lines || []).find(l => l.id === lineId);
  const total = type => events.filter(e => e.type === type && e.lineId === lineId).reduce((s,e) => s + Number(e.quantity || 0),0);
  return { approved: Number(line?.approvedQuantity ?? line?.quantity ?? 0), collected: total('collection'),
    delivered: events.filter(e=>e.type==='collection' && e.lineId===lineId).reduce((s,e)=>s+Number(e.delivered||0),0), issued: total('issue') };
}
export function workflowOutstanding(record) {
  const value = record.kind === 'Cost' ? Number(record.data.approvedAmount ?? record.data.amount ?? 0)
    : (record.events || []).filter(e=>e.type==='collection').reduce((s,e)=>s+Number(e.quantity)*Number(e.unitPrice),0);
  return Math.max(0,value-(record.events||[]).filter(e=>e.type==='payment').reduce((s,e)=>s+Number(e.amount),0));
}
export function workflowCosts(records, project, from, to) {
  const result = { dieselTransport:0, workerTransport:0, other:0, maintenance:0, pms:0, provisional:0, dieselDates:[], workerDates:[] };
  const inRange = date => (!from || date >= from) && (!to || date <= to);
  for (const r of records || []) {
    if (r.project !== project || r.status === 'Rejected') continue;
    if (r.kind === 'Cost' && inRange(r.data.incurredDate)) {
      const amount = Number(r.data.approvedAmount ?? r.data.amount ?? 0);
      if (r.status === 'Submitted' || r.status === 'Reviewed') result.provisional += amount;
      if (r.data.category === 'Diesel transport') { result.dieselTransport += amount; result.dieselDates.push(r.data.incurredDate); }
      else if (r.data.category === 'Worker transport') { result.workerTransport += amount; result.workerDates.push(r.data.incurredDate); }
      else if (r.data.category === 'Maintenance') result.maintenance += amount;
      else result.other += amount;
    }
    if (r.kind === 'Fuel') for (const e of r.events || []) {
      if (e.type !== 'issue' || !inRange(e.date)) continue;
      const line = r.data.lines.find(l=>l.id===e.lineId);
      const cost = Number(e.quantity)*Number(e.unitPrice);
      if (['Repairs','Maintenance'].includes(e.purpose)) result.maintenance += cost;
      else if (line?.product === 'PMS') result.pms += cost;
      else if (line?.product === 'Oil' || !['Production','Trekking'].includes(e.purpose)) result.other += cost;
      // Production and trekking diesel are already costed from operation reports.
    }
  }
  return result;
}
export function stationRelease(record) {
  if (record.kind !== 'Fuel' || !['Approved','Partially Collected','Collected'].includes(record.status)) throw new Error('Approve this request before issuing a station instruction.');
  const lines = record.data.lines.map(l=>l.product + (l.oilType ? ' ('+l.oilType+')' : '') + ': ' + (l.approvedQuantity ?? l.quantity) + ' L — ' + l.purpose).join('\n');
  return ['FUEL RELEASE ORDER · '+record.id,'Project: '+record.project,'Station: '+record.data.station,
    'Supply date: '+record.data.supplyDate,'Valid until: '+record.data.expiresOn,'Supply to: '+record.data.collector,
    'Supply method: '+record.data.supplyMethod,lines,'Approval: '+(record.events||[]).find(e=>e.type==='approve')?.at,
    'Please quote this reference on the receipt. Confirm the actual quantity released.'].join('\n');
}
