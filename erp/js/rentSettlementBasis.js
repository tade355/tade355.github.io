// Opening balances replace prior accruals without inventing a payment.
export function currentOwnerSettlements(rows) {
  const opening = rows.filter((r) => r.isOpeningBalance).sort((a, b) =>
    String(b.periodEnd || '').localeCompare(String(a.periodEnd || '')) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  if (!opening) return rows;
  return rows.filter((r) => r.id === opening.id ||
    (!r.isOpeningBalance && r.periodStart > opening.periodEnd));
}
