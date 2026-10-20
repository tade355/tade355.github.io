"""Build the AGO planner workbook straight from the live ERP data.

    ERP_PW=... python tools/build_ago_planner.py --date 2026-10-18 --active "EMG-006,EMG-008,D8K Collins" \
        --out AGO_Planner_19Oct.xlsx [--target 250] [--from 2026-10-10] [--extra-sold 2026-10-12=1122]

--date    the day whose end-of-day figures the plan starts from (the planner is for the next day)
--active  dozers working tomorrow; only they get a "needed" figure
--target  opening diesel wanted per active dozer (8 hrs x 25 L + 50 L reserve = 250 L)
--from    first day of the missing-diesel sheet (the chain starts at nil on site that morning)
--extra-sold  sold-to-CEO litres that are known but not split by day, as DATE=LITRES (repeatable)

Sheet 1  planner: closing per dozer (Oki's reported closing wins over the calculated chain), litres
         needed, on ground, additional diesel to collect, kegs.
Sheet 2  missing diesel, day by day: opening + collected - sold - distributed = should be on site,
         against Oki's count; the difference is missing.
Sheet 3  dozer closing variance: reported closing against the calculated chain.
Collections whose notes say "sold" count as sold to the CEO. Remarks are generated; edit the
workbook afterwards if a day needs a human explanation.
"""
import argparse, datetime, re, sys
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.properties import PageSetupProperties

sys.path.insert(0, str(Path(__file__).resolve().parent))
from erp_rest import get, get_all

ap = argparse.ArgumentParser()
ap.add_argument('--date', required=True)
ap.add_argument('--active', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--target', type=float, default=250)
ap.add_argument('--from', dest='start', default='2026-10-10')
ap.add_argument('--extra-sold', action='append', default=[])
ap.add_argument('--price', type=float, default=1900)
a = ap.parse_args()
active = [x.strip() for x in a.active.split(',')]
extra_sold = {k: float(v) for k, v in (s.split('=') for s in a.extra_sold)}
day = datetime.date.fromisoformat
dates = [(day(a.start) + datetime.timedelta(days=i)).isoformat() for i in range((day(a.date) - day(a.start)).days + 1)]
nxt = (day(a.date) + datetime.timedelta(days=1)).strftime('%d %b').lstrip('0')

ops = get_all(f'/rest/v1/operations?date=gte.{a.start}&date=lte.{a.date}&select=date,equipment,fuel_used,closing_diesel&order=id')
dist = get_all(f'/rest/v1/diesel_site_distributions?date=gte.{a.start}&date=lte.{a.date}&select=date,equipment,litres,notes&order=id')
coll = get_all(f'/rest/v1/fuel_credit_collections?date=gte.{a.start}&date=lte.{a.date}&fuel_type=eq.Diesel&select=date,litres,notes&order=id')
counts = {c['date']: c['counted_litres'] for c in get_all(f'/rest/v1/diesel_stock_counts?date=gte.{a.start}&select=date,counted_litres&order=id')}
tank = [d for d in dist if not re.search('not tank fuel|maintenance diesel', d['notes'] or '', re.I)]

# ---- per-dozer chain (opening = previous closing + supplied; used = fuel_used on the reports)
chain, reported = {}, {}
for name in sorted({o['equipment'] for o in ops} | {d['equipment'] for d in tank}):
    c = 0
    for d in dates:
        c += sum(x['litres'] for x in tank if x['equipment'] == name and x['date'] == d)
        c -= sum(x['fuel_used'] or 0 for x in ops if x['equipment'] == name and x['date'] == d)
        chain[(d, name)] = round(c, 1)
        for o in ops:
            if o['equipment'] == name and o['date'] == d and o['closing_diesel'] is not None:
                reported[(d, name)] = o['closing_diesel']

# ---- station diesel, day by day
rows, carry = [], 0.0
for d in dates:
    col = sum(x['litres'] for x in coll if x['date'] == d)
    sold = sum(x['litres'] for x in coll if x['date'] == d and re.search('sold', x['notes'] or '', re.I)) + extra_sold.get(d, 0)
    out = sum(x['litres'] for x in dist if x['date'] == d)
    should = carry + col - sold - out
    cnt = counts.get(d)
    rows.append((d, carry, col, sold, out, cnt))
    carry = cnt if cnt is not None else should
on_ground = carry

# ---- workbook
thin = Side(style='hair'); bd = Border(left=thin, right=thin, top=thin, bottom=thin)
F = lambda b=False, i=False, c=None: Font(name='Arial', size=12, bold=b, italic=i, color=c)
BLUE = F(c='0000FF'); HF = PatternFill('solid', start_color='E8EFE9')
NF = '#,##0.0;-#,##0.0;"-"'; N0 = '#,##0;-#,##0;"-"'
wb = openpyxl.Workbook(); ws = wb.active; ws.title = f'{nxt}'
ws['A2'] = f'Diesel @ site for {nxt}'; ws['A2'].font = F(True)
for c, t in zip('ABCD', ['Dozer', f'Distributed on {day(a.date).day}', f'Closing on {day(a.date).day}', f'Bal. Needed for {nxt.split()[0]}']):
    ws[f'{c}3'] = t; ws[f'{c}3'].font = F(True); ws[f'{c}3'].border = bd
    ws[f'{c}3'].alignment = Alignment(horizontal='left' if c == 'A' else 'right')
dozers = sorted({n for (d, n) in chain if d == a.date and (chain[(d, n)] or n in active)} | set(active))
total = 4 + len(dozers); g = total + 2
for r, n in enumerate(dozers, 4):
    closing = reported.get((a.date, n), chain.get((a.date, n), 0))
    ws[f'A{r}'] = n; ws[f'B{r}'] = sum(x['litres'] for x in tank if x['equipment'] == n and x['date'] == a.date); ws[f'C{r}'] = closing
    if n in active: ws[f'D{r}'] = f'=$D${g}-C{r}'
    for c in 'ABCD':
        ws[f'{c}{r}'].font = F(); ws[f'{c}{r}'].border = bd
        if c != 'A': ws[f'{c}{r}'].number_format = NF
ws[f'A{total}'] = 'Total'
for c in 'BCD': ws[f'{c}{total}'] = f'=SUM({c}4:{c}{total - 1})'
for c in 'ABCD':
    ws[f'{c}{total}'].font = F(True); ws[f'{c}{total}'].border = bd
    if c != 'A': ws[f'{c}{total}'].number_format = NF
labels = ['Target opening diesel per active dozer (L)', 'On ground (ERP roll-forward, not a count)', f'Additional needed for {nxt}', 'Total kegs (30 L)']
vals = [a.target, on_ground, f'=MAX(0,D{total}-D{g + 1})', f'=D{g + 2}/30']
for k, (lab, v) in enumerate(zip(labels, vals)):
    r = g + k; ws[f'A{r}'] = lab; ws[f'D{r}'] = v; ws.merge_cells(f'A{r}:C{r}')
    for c in 'ABCD':
        ws[f'{c}{r}'].font = F(k > 1); ws[f'{c}{r}'].border = bd
    ws[f'D{r}'].number_format = NF
ws[f'D{g}'].font = BLUE; ws[f'D{g + 1}'].font = BLUE
ws[f'A{g + 5}'] = f'Active: {", ".join(active)}. Closings are Oki\'s reported figures where he sent one, otherwise the ERP chain. Enter his on-site count in D{g + 1} to recalculate.'
ws[f'A{g + 5}'].font = F(False, True); ws.merge_cells(f'A{g + 5}:D{g + 5}')
ws[f'A{g + 5}'].alignment = Alignment(wrap_text=True, vertical='top'); ws.row_dimensions[g + 5].height = 52
for c, w in zip('ABCD', [38, 20, 16, 22]): ws.column_dimensions[c].width = w

ms = wb.create_sheet('Missing diesel')
ms['A1'] = f'Station diesel (AGO) unaccounted for, day by day from {day(a.start).strftime("%d %b %Y")}'; ms['A1'].font = F(True)
heads = ['Date', 'Opening on site (b/f)', 'Collected from station', 'Sold to CEO', 'Distributed to dozers', 'Should be on site', 'Oki count (closing)', 'Missing (L)', f'Value @ {a.price:,.0f}', 'Running missing (L)']
for i, h in enumerate(heads, 1):
    c = ms.cell(4, i, h); c.font = F(True); c.border = bd; c.fill = HF
    c.alignment = Alignment(horizontal='left' if i == 1 else 'right', wrap_text=True, vertical='center')
r0 = 5
for k, (d, op, col, sold, out, cnt) in enumerate(rows):
    r = r0 + k
    ms[f'A{r}'] = day(d).strftime('%a %d %b')
    ms[f'B{r}'] = 0 if k == 0 else f'=IF(ISNUMBER(G{r - 1}),G{r - 1},F{r - 1})'
    ms[f'C{r}'], ms[f'D{r}'], ms[f'E{r}'] = col, sold, out
    ms[f'F{r}'] = f'=B{r}+C{r}-D{r}-E{r}'
    if cnt is not None: ms[f'G{r}'] = cnt
    ms[f'H{r}'] = f'=IF(ISNUMBER(G{r}),F{r}-G{r},"")'
    ms[f'I{r}'] = f'=IF(ISNUMBER(H{r}),H{r}*{a.price},"")'
    ms[f'J{r}'] = f'=SUM($H${r0}:H{r})'
    for c in 'ABCDEFGHIJ':
        cell = ms[f'{c}{r}']; cell.font = BLUE if c in 'CDEG' else F(); cell.border = bd
        cell.alignment = Alignment(horizontal='left' if c == 'A' else 'right')
        if c != 'A': cell.number_format = N0
last = r0 + len(rows) - 1; t2 = last + 1
ms[f'A{t2}'] = 'Total'
for c in 'CDEHI': ms[f'{c}{t2}'] = f'=SUM({c}{r0}:{c}{last})'
for c in 'ABCDEFGHIJ':
    ms[f'{c}{t2}'].font = F(True); ms[f'{c}{t2}'].border = bd; ms[f'{c}{t2}'].fill = HF
    if c != 'A': ms[f'{c}{t2}'].number_format = N0
ms[f'A{t2 + 2}'] = 'Missing = should be on site less what Oki counted. Days without a count show no figure. A sale left unrecorded shows as missing.'
ms[f'A{t2 + 2}'].font = F(False, True)
for c, w in zip('ABCDEFGHIJ', [14, 14, 14, 12, 14, 13, 13, 13, 16, 14]): ms.column_dimensions[c].width = w
ms.row_dimensions[4].height = 48

vs = wb.create_sheet('Dozer closing variance')
for i, h in enumerate(['Date', 'Dozer', 'Reported closing (L)', 'Calculated closing (L)', 'Difference (L)'], 1):
    c = vs.cell(3, i, h); c.font = F(True); c.border = bd; c.fill = HF
    c.alignment = Alignment(horizontal='left' if i < 3 else 'right', wrap_text=True)
for k, ((d, n), rep) in enumerate(sorted(reported.items())):
    r = 4 + k
    vs[f'A{r}'] = day(d).strftime('%a %d %b'); vs[f'B{r}'] = n; vs[f'C{r}'] = rep; vs[f'D{r}'] = chain[(d, n)]; vs[f'E{r}'] = f'=C{r}-D{r}'
    for c in 'ABCDE':
        vs[f'{c}{r}'].font = F(); vs[f'{c}{r}'].border = bd
        if c in 'CDE': vs[f'{c}{r}'].number_format = NF
for c, w in zip('ABCDE', [14, 16, 18, 20, 16]): vs.column_dimensions[c].width = w
for sh in (ws, ms, vs):
    sh.page_setup.orientation = 'landscape'; sh.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    sh.page_setup.fitToWidth = 1; sh.page_setup.fitToHeight = 1
wb.save(a.out)
print('saved', a.out, '| on ground', on_ground)
