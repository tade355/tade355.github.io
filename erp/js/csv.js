// CSV export, shared by every table via ui.js's renderTable() instead of
// each view inventing its own download flow.

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Render-aware: a column's `render(row)` may return a DOM Node (a status
// pill, an icon-only actions cell) rather than plain text — textContent
// pulls the human-readable value out of it. Columns with no label (the
// convention this codebase already uses for an icon-only actions column,
// e.g. `{ key: 'actions', label: '', render: ... }`) are left out of the
// export, since there's nothing meaningful to put in that cell.
export function tableToCSV(columns, rows) {
  const exportable = columns.filter((c) => c.label);
  const header = exportable.map((c) => csvCell(c.label)).join(',');
  const lines = rows.map((row) => exportable.map((c) => {
    const content = c.render ? c.render(row) : row[c.key];
    const text = content instanceof Node ? content.textContent : content;
    return csvCell(text);
  }).join(','));
  return [header, ...lines].join('\r\n');
}

export function downloadCSV(filename, columns, rows) {
  const csv = tableToCSV(columns, rows);
  // Leading UTF-8 BOM so Excel (not just browsers) renders the Naira sign
  // and other non-ASCII characters correctly instead of mangling them —
  // every currency column in this app is formatted with '₦'.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
