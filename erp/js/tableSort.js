const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
function numeric(value) {
  if (typeof value === 'number') return value;
  const text = String(value).trim().replace('−','-');
  if (/^[₦$]?\s*[+-]?\d[\d,]*(?:\.\d+)?\s*(?:L|%|ha|hrs?|hours?)?$/i.test(text)) return Number(text.replace(/[₦$,\s]|(?:hours?|hrs?|ha|L|%)$/gi,''));
  return null;
}
export function compareValues(a, b, direction = 'asc') {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  const numberA = numeric(a), numberB = numeric(b);
  const result = numberA !== null && numberB !== null ? numberA - numberB : natural.compare(String(a), String(b));
  return direction === 'desc' ? -result : result;
}
export function sortRows(rows, valueOf, direction) {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => compareValues(valueOf(a.row), valueOf(b.row), direction) || a.index - b.index).map(({ row }) => row);
}
