// Stable names keep the same tank ledger when the fleet roster is renamed.
export function dieselEquipmentName(name) {
  return ({ 'Ogbomo Dozer (Pastor)': 'Pastor (Osaro)', 'Ogbomo (Saheed)': 'Saheed (Osaro)', 'BIG-001': 'EMG-005' })[name] || name;
}
const reading = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const clock = value => String(value || '').slice(0, 5);
export function compareDieselReports(a, b) {
  return String(a.date || '').localeCompare(String(b.date || ''))
    || (clock(a.timeResumed) || clock(a.timeClosed) || '23:59').localeCompare(clock(b.timeResumed) || clock(b.timeClosed) || '23:59')
    || (clock(a.timeClosed) || '23:59').localeCompare(clock(b.timeClosed) || '23:59')
    || String(a.createdAt || a.id || '').localeCompare(String(b.createdAt || b.id || ''));
}
export function precedingDieselReports(reports, draft) {
  return reports.filter(row => (!draft.id || row.id !== draft.id) && dieselEquipmentName(row.equipment) === dieselEquipmentName(draft.equipment)
    && (row.date < draft.date || (row.date === draft.date && (!draft.timeResumed || compareDieselReports(row, draft) < 0))))
    .slice().sort(compareDieselReports);
}
export function previousDieselClosing(reports, draft) {
  let balance = null;
  for (const row of precedingDieselReports(reports, draft)) {
    if (reading(row.closingDiesel)) balance = Number(row.closingDiesel);
    else if (reading(row.openingDiesel)) balance = Number(row.openingDiesel) - Number(row.fuelUsed || 0);
    else if (balance !== null) balance += Number(row.dieselSupplied || 0) - Number(row.fuelUsed || 0);
  }
  return balance;
}
export function unallocatedDieselSupply(reports, draft, distributions) {
  const matches = distributions.filter(row => row.date === draft.date && row.project === draft.siteName
    && dieselEquipmentName(row.equipment) === dieselEquipmentName(draft.equipment));
  if (!matches.length) return null;
  const total = matches.reduce((sum,row) => sum + Number(row.litres || 0),0);
  const allocated = precedingDieselReports(reports,draft).filter(row => row.date === draft.date)
    .reduce((sum,row) => sum + Number(row.dieselSupplied || 0),0);
  return Math.max(0,total - allocated);
}
export function lastDieselReading(reports) {
  return reports.filter(row => reading(row.closingDiesel)).slice().sort(compareDieselReports).at(-1) || null;
}

