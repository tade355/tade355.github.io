// The AGO planner as a formatted Excel workbook (same layout as the planners
// built by hand: dozer / distributed / closing / balance needed, then the totals
// block and notes). Needs are live formulas, so editing a closing figure or the
// target in Excel recalculates everything.
//
// `ExcelJS` is passed in (the page loads vendor/exceljs.min.js on demand), which
// keeps this module free of browser globals.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const dmy = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const agoFileName = (planDate) => `AGO_Planner_${dmy(planDate).replace(/\s+/g, '')}.xlsx`;

export function buildAgoWorkbook(ExcelJS, plan, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Emagrims ERP';
  const ws = wb.addWorksheet(`${dm(meta.planDate)}`, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  const hair = { style: 'hair' };
  const border = { left: hair, right: hair, top: hair, bottom: hair };
  const font = (o = {}) => ({ name: 'Arial', size: 12, ...o });
  const NF = '#,##0.0;-#,##0.0;"-"';
  const MONEY = '#,##0';
  const put = (ref, value, { bold = false, italic = false, fmt, align, blue = false, grey = false, border: b = true } = {}) => {
    const c = ws.getCell(ref);
    c.value = value;
    c.font = font({ bold, italic, color: blue ? { argb: 'FF0000FF' } : grey ? { argb: 'FF8A8A85' } : undefined });
    if (b) c.border = border;
    if (fmt) c.numFmt = fmt;
    if (align) c.alignment = align;
    return c;
  };

  put('A2', `Diesel @ ${meta.siteLabel} for ${dm(meta.planDate)}`, { bold: true, border: false });
  const heads = ['Dozer', `Distributed on ${dm(meta.closingDate)}`, `Closing on ${dm(meta.closingDate)}`, `Bal. Needed for ${dm(meta.planDate)}`];
  heads.forEach((h, i) => put(`${'ABCD'[i]}3`, h, { bold: true, align: { horizontal: i ? 'right' : 'left' } }));

  const n = plan.rows.length;
  const t = 4 + n; const g = t + 2;
  plan.rows.forEach((r, i) => {
    const row = 4 + i;
    const grey = !r.active;
    put(`A${row}`, `${r.name}${r.operator ? ` (${r.operator})` : ''}${grey ? ' - not active' : ''}`, { grey });
    put(`B${row}`, r.distributed || 0, { fmt: NF, grey });
    put(`C${row}`, r.closing || 0, { fmt: NF, grey, blue: !grey });
    if (r.active) {
      const cell = put(`D${row}`, { formula: `MAX(0,$D$${g}-C${row})`, result: r.need }, { fmt: NF });
      cell.value = { formula: `MAX(0,$D$${g}-C${row})`, result: r.need };
    } else put(`D${row}`, null, { fmt: NF });
  });
  put(`A${t}`, 'Total', { bold: true });
  put(`B${t}`, { formula: `SUM(B4:B${t - 1})`, result: plan.totalDistributed }, { bold: true, fmt: NF });
  put(`C${t}`, { formula: `SUM(C4:C${t - 1})`, result: plan.totalClosing }, { bold: true, fmt: NF });
  put(`D${t}`, { formula: `SUM(D4:D${t - 1})`, result: plan.totalNeed }, { bold: true, fmt: NF });

  const lines = [
    ['Target opening diesel per active dozer (L)', plan.target, null, { blue: true, fmt: NF }],
    ['On ground (L)', plan.onGround, null, { blue: true, fmt: NF }],
    [`Additional AGO needed for ${dm(meta.planDate)} (L)`, null, `MAX(0,D${t}-D${g + 1})`, { bold: true, fmt: NF, result: plan.additional }],
    [`Total kegs (${plan.kegLitres} L each)`, null, `D${g + 2}/${plan.kegLitres}`, { bold: true, fmt: NF, result: plan.kegs }],
    ['Diesel price (₦ per litre)', plan.dieselPrice, null, { blue: true, fmt: MONEY }],
    ['AGO cost (₦)', null, `D${g + 2}*D${g + 4}`, { fmt: MONEY, result: plan.agoCost }],
    ['PMS to be supplied (L)', plan.pmsLitres, null, { blue: true, fmt: NF }],
    ['PMS price (₦ per litre)', plan.pmsPrice, null, { blue: true, fmt: MONEY }],
    ['PMS cost (₦)', null, `D${g + 6}*D${g + 7}`, { fmt: MONEY, result: plan.pmsCost }],
    ['Total cost, AGO and PMS (₦)', null, `D${g + 5}+D${g + 8}`, { bold: true, fmt: MONEY, result: plan.grandCost }],
  ];
  lines.forEach(([label, value, formula, o], i) => {
    const r = g + i;
    ws.mergeCells(`A${r}:C${r}`);
    put(`A${r}`, label, { bold: o.bold });
    ['B', 'C'].forEach((c) => { ws.getCell(`${c}${r}`).border = border; });
    put(`D${r}`, formula ? { formula, result: o.result } : value, { bold: o.bold, blue: o.blue, fmt: o.fmt });
  });

  const n0 = g + lines.length + 1;
  const notes = ['Notes:', ...meta.notes];
  notes.forEach((text, i) => {
    const r = n0 + i;
    ws.mergeCells(`A${r}:D${r}`);
    const c = put(`A${r}`, text, { bold: i === 0, italic: i > 0, border: false, align: { wrapText: true, vertical: 'top' } });
    if (i > 0) ws.getRow(r).height = Math.max(20, 18 * Math.ceil(text.length / 78));
    c.alignment = { wrapText: true, vertical: 'top' };
  });
  [46, 26, 22, 28].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getRow(3).height = 22;
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  // ------------------------------------------------------------------ basis
  const bs = wb.addWorksheet('Basis');
  const basis = [
    ['Planner basis', ''],
    ['Site', meta.siteLabel],
    ['Closing diesel as at', dmy(meta.closingDate)],
    ['Planned for', dmy(meta.planDate)],
    ['Target hours per dozer', meta.targetHours],
    ['Diesel per hour (first 8 hrs)', `${meta.litresPerHour} L`],
    ['Reserve left in each tank', `${meta.reserve} L`],
    ['Target opening diesel', `${plan.target} L${meta.targetOverridden ? ' (set by hand)' : ' (target hours x diesel per hour + reserve)'}`],
    ['Active dozers', plan.rows.filter((r) => r.active).map((r) => r.name).join(', ')],
    ['Generated', `${dmy(meta.generatedOn)} from the Emagrims ERP`],
  ];
  basis.forEach(([a, b], i) => {
    const r = i + 1;
    bs.getCell(`A${r}`).value = a; bs.getCell(`B${r}`).value = b;
    bs.getCell(`A${r}`).font = font({ bold: true }); bs.getCell(`B${r}`).font = font({ bold: i === 0 });
    if (i > 0) { bs.getCell(`A${r}`).border = border; bs.getCell(`B${r}`).border = border; }
  });
  bs.getColumn(1).width = 34; bs.getColumn(2).width = 70;
  return wb;
}
