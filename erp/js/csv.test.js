import test from 'node:test';
import assert from 'node:assert/strict';

// tableToCSV() checks `content instanceof Node` to tell a DOM element
// apart from a plain value — there is no DOM in this plain-Node test
// environment, so a minimal stand-in is enough for that check to work.
global.Node = class {};
const { tableToCSV } = await import('./csv.js');

class FakeElement extends global.Node {
  constructor(text) {
    super();
    this.textContent = text;
  }
}

test('tableToCSV renders a header row from column labels and one row per record', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'amount', label: 'Amount' },
  ];
  const rows = [{ name: 'Tope', amount: 50000 }, { name: 'Wale', amount: 30000 }];
  const csv = tableToCSV(columns, rows);
  assert.equal(csv, 'Name,Amount\r\nTope,50000\r\nWale,30000');
});

test('tableToCSV uses a column\'s render(row) output when given, quoting it since it contains a comma', () => {
  const columns = [{ key: 'amount', label: 'Amount (₦)', render: (r) => `₦${r.amount.toLocaleString()}` }];
  const rows = [{ amount: 1900000 }];
  assert.equal(tableToCSV(columns, rows), 'Amount (₦)\r\n"₦1,900,000"');
});

test('tableToCSV extracts textContent when a render() returns a DOM Node', () => {
  const columns = [{ key: 'status', label: 'Status', render: (r) => new FakeElement(r.status) }];
  const rows = [{ status: 'Paid' }];
  assert.equal(tableToCSV(columns, rows), 'Status\r\nPaid');
});

test('tableToCSV drops columns with an empty label (the icon-only actions column convention)', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'actions', label: '', render: () => new FakeElement('buttons') },
  ];
  const rows = [{ name: 'Tope' }];
  assert.equal(tableToCSV(columns, rows), 'Name\r\nTope');
});

test('tableToCSV quotes and escapes a value containing a comma, a quote, or a newline', () => {
  const columns = [{ key: 'note', label: 'Note' }];
  assert.equal(
    tableToCSV(columns, [{ note: 'Tope, "The Great"' }]),
    'Note\r\n"Tope, ""The Great"""',
  );
  assert.equal(
    tableToCSV(columns, [{ note: 'Line\nBreak' }]),
    'Note\r\n"Line\nBreak"',
  );
});

test('tableToCSV treats a missing/null value as an empty cell, not the literal string "null"', () => {
  const columns = [{ key: 'notes', label: 'Notes' }];
  assert.equal(tableToCSV(columns, [{ notes: null }]), 'Notes\r\n');
  assert.equal(tableToCSV(columns, [{ notes: undefined }]), 'Notes\r\n');
});

test('tableToCSV with zero rows is just the header line', () => {
  const columns = [{ key: 'name', label: 'Name' }];
  assert.equal(tableToCSV(columns, []), 'Name');
});
