// Reads Rex Forestry "Order for Work" PDFs (the work orders Emagrims invoices
// against): WO number, period, plantation block, and the hectares per activity —
// Phase 1 (E121 Bush Clearing Dozer, ₦845,000/ha) and Phase 2 (E124, ₦455,000/ha).
//
// Pure (no DOM / pdf.js imports): the page extracts the text of each PDF page as
// positioned items, `itemsToLines` turns those into text lines, and
// `parseWorkOrder` reads the lines. A built-in check compares the hectares with
// the amounts printed on the work order, so a misread shows up before an invoice
// is printed.
const num = (s) => Number(String(s).replace(/[,\s]/g, ''));
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// pdf.js text items ({ str, transform: [a,b,c,d,x,y] }) -> one string per visual row.
export function itemsToLines(items) {
  const rows = [];
  items.filter((i) => i.str && i.str.trim()).forEach((i) => {
    const y = Math.round(i.transform[5]);
    let row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x: i.transform[4], str: i.str });
  });
  return rows.sort((a, b) => b.y - a.y).map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(' ').replace(/\s{2,}/g, ' ').trim());
}

const PHASE_BY_RATE = { 845000: 'Phase 1', 455000: 'Phase 2' };
function phaseOf({ code, title, rate }) {
  if (PHASE_BY_RATE[Math.round(rate)]) return PHASE_BY_RATE[Math.round(rate)];
  if (/phase\s*2/i.test(title) || code === 'E124') return 'Phase 2';
  return 'Phase 1';
}

export function parseWorkOrder(lines) {
  const text = lines.join('\n');
  const wo = (text.match(/WO\s*Number:?\s*(\d+)/i) || [])[1] || null;
  const period = (text.match(/Period:?\s*([A-Za-z]+\s+\d{4})/) || [])[1] || null;
  const blockM = text.match(/Plantation:?\s*(?:Block\s+)?([A-Z]{1,3}\d+)\s*(?:\((\d+)\))?/i);
  const block = blockM ? blockM[1].toUpperCase() : null;
  const supplier = (text.match(/Supplier:?\s*(.+?)(?:\s+Authorisation|\s{2,}|\n|$)/) || [])[1] || null;
  const date = (text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/) || null);
  const printedOn = date ? `${date[3]}-${date[2]}-${date[1]}` : null;

  const acts = [];
  let current = null;
  const compRe = /^([A-Z]\d{2,3})\s+([A-Za-z]+)\s+([A-Za-z]+)\s+([\d.,]+)\s+([\d.,]+)\s+(?:ha|HA|Ha)\s+([\d,]+\.\d{2})\s+([\d ,]+\.\d{2})/;
  lines.forEach((line) => {
    const head = line.match(/^(E\d{3})\s*-\s*(.+)$/);
    if (head && !/^Total/i.test(line)) { current = { code: head[1], title: head[2].trim(), compartments: [], totalAct: null }; acts.push(current); return; }
    const c = line.match(compRe);
    if (c && current) { current.compartments.push({ compt: c[1], species: c[2], effa: num(c[4]), ha: num(c[5]), rate: num(c[6]), amount: num(c[7]) }); return; }
    const t = line.match(/^Total Act:?\s*(E\d{3})\b.*?([\d,.]+)\s+([\d.,]+)\s+([\d ,]+\.\d{2})/);
    if (t) {
      const a = acts.find((x) => x.code === t[1]) || current;
      if (a) a.totalAct = { effa: num(t[2]), ha: num(t[3]), amount: num(t[4]) };
    }
  });
  const totalWo = (() => { const m = text.match(/Total WO:?\s*\d+\s+([\d,.]+)\s+([\d.,]+)\s+([\d ,]+\.\d{2})/); return m ? { effa: num(m[1]), ha: num(m[2]), amount: num(m[3]) } : null; })();

  const phases = { 'Phase 1': 0, 'Phase 2': 0 };
  const compartments = [];
  acts.forEach((a) => {
    const rate = a.compartments[0]?.rate || (a.totalAct && a.totalAct.ha ? a.totalAct.amount / a.totalAct.ha : 0);
    const phase = phaseOf({ code: a.code, title: a.title, rate });
    const ha = a.compartments.length ? r2(a.compartments.reduce((s, x) => s + x.ha, 0)) : (a.totalAct?.ha || 0);
    phases[phase] = r2(phases[phase] + ha);
    a.compartments.forEach((x) => compartments.push({ ...x, phase }));
  });

  const messages = [];
  if (!wo) messages.push('Could not find the WO number.');
  if (!acts.length) messages.push('Could not find any work lines (E121 / E124).');
  if (totalWo) {
    const haSum = r2(phases['Phase 1'] + phases['Phase 2']);
    if (Math.abs(haSum - totalWo.ha) > 0.011) messages.push(`Hectares read (${haSum}) differ from the Total WO printed (${totalWo.ha}).`);
    const amt = r2(phases['Phase 1'] * 845000 + phases['Phase 2'] * 455000);
    if (Math.abs(amt - totalWo.amount) > 1) messages.push(`Hectares at the standard rates give ₦${amt.toLocaleString()} but the work order totals ₦${totalWo.amount.toLocaleString()}.`);
  } else if (acts.length) messages.push('The Total WO line was not found, so the hectares could not be double-checked.');
  return { wo, period, block, supplier, printedOn, phase1: phases['Phase 1'], phase2: phases['Phase 2'], compartments, totalWo, ok: !messages.length && !!wo && acts.length > 0, messages };
}
