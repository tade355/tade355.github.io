import { submitFuelPlan, renderFuelWorkflow } from './fuelWorkflow.js';
import { fuelRequirement } from '../fuelWorkflow.js';
// AGO Planner (Resource Management → Diesel Management): works out how much
// diesel the site must be supplied for the next working day from the active
// dozers, their closing diesel, the target hours and the target opening diesel;
// downloads the planner as Excel, prints it, writes the supply message for the
// filling station and raises the fueling vouchers for it.
import { store } from '../store.js';
import { el, ico, formatCurrency, formatDate } from '../utils.js';
import { sectionHeader, statCard } from '../ui.js';
import { todayISOString, addDays } from '../dateUtils.js';
import { FUEL_STATIONS } from '../constants.js';
import { getCurrentUser, filterByProject } from '../session.js';
import { liveContext } from '../reportContext.js';
import { projectNames } from './profitability.js';
import { printAgoPlanner } from '../print.js';
import { DEFAULTS, targetOpeningFor, planDefaults, buildPlan, supplyMessage, voucherDrafts } from '../agoPlanData.js';
import { buildAgoWorkbook, agoFileName } from '../agoPlanXlsx.js';

const EXCELJS_URL = 'vendor/exceljs.min.js';
let excelPromise = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelPromise) {
    excelPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = EXCELJS_URL;
      s.onload = () => resolve(window.ExcelJS);
      s.onerror = () => { excelPromise = null; reject(new Error('Could not load the Excel writer. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return excelPromise;
}

const L = (n, dp = 1) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const numVal = (input) => { const n = Number(input.value); return Number.isFinite(n) ? n : 0; };

export function renderAgoPlanner(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Planner', 'Plan the diesel to supply for the next working day, download it, and raise the fueling vouchers at the station'));

  const today = todayISOString();
  const projects = filterByProject(store.get('projects'), 'name').map(p=>p.name);
  const station0 = [...store.get('fuelCreditCollections')].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.station || 'Midejab Ltd';

  // ----------------------------------------------------------------- inputs
  const field = (label, input) => el('label', { class: 'filter-field' }, [el('span', {}, label), input]);
  const siteSel = el('select', {}, projects.map((p) => el('option', { value: p }, p)));
  siteSel.value = projects.find((p) => /kangidi/i.test(p)) || projects[0] || '';
  const closingDate = el('input', { type: 'date', max: today, value: today });
  const planDate = el('input', { type: 'date', value: addDays(today, 1) });
  const hours = el('input', { type: 'number', min: '1', max: '16', step: '0.5', value: String(DEFAULTS.targetHours) });
  const lph = el('input', { type: 'number', min: '1', step: '1', value: String(DEFAULTS.litresPerHour) });
  const reserve = el('input', { type: 'number', min: '0', step: '5', value: String(DEFAULTS.reserve) });
  const target = el('input', { type: 'number', min: '0', step: '5' });
  const kegSize = el('input', { type: 'number', min: '1', step: '1', value: String(DEFAULTS.kegLitres) });
  const autoBtn = el('button', { type: 'button', class: 'btn btn-ghost ago-auto', title: 'Work the target out from target hours and reserve again' }, [ico('refresh'), 'Auto']);
  container.appendChild(el('div', { class: 'filter-bar' }, [
    field('Site', siteSel), field('Closing diesel as at', closingDate), field('Plan for', planDate),
    field('Target hours', hours), field('Diesel per hour (L)', lph), field('Reserve in tank (L)', reserve),
    field('Target opening diesel (L)', target), el('div', { class: 'filter-field' }, [el('span', {}, ' '), autoBtn]), field('Keg size (L)', kegSize),
  ]));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Target opening diesel = target hours × diesel per hour + the reserve left in the tank (8 × 25 + 50 = 250 L). Type over it to set a different target. Tick the dozers that will work, and correct any closing diesel that differs from what the site reports.'));

  // ----------------------------------------------------------------- dozers
  const tableBody = el('tbody');
  const totalRow = el('tfoot');
  container.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [
    el('thead', {}, [el('tr', {}, ['Active', 'Dozer', 'Distributed on closing day (L)', 'Closing diesel (L)', 'Target hours', 'Balance needed (L)'].map((h, i) => el('th', { class: i > 1 ? 'dd-num' : undefined }, h)))]),
    tableBody, totalRow,
  ])]));

  // ---------------------------------------------------------------- summary
  const onGround = el('input', { type: 'number', min: '0', step: '1', class: 'dd-small-input' });
  const onGroundNote = el('span', { class: 'dd-muted' }, '');
  const pmsLitres = el('input', { type: 'number', min: '0', step: '1', class: 'dd-small-input', value: '0' });
  const summary = el('div', { class: 'stats-grid' });
  container.appendChild(el('div', { class: 'dd-tool dd-static' }, [
    el('h3', { class: 'dd-static-title' }, 'Supply needed'),
    el('div', { class: 'dd-kv' }, [
      el('label', { class: 'dd-kv-row' }, [el('span', {}, 'On ground now (L)'), onGround]),
      el('div', { class: 'dd-kv-row' }, [onGroundNote]),
      el('label', { class: 'dd-kv-row' }, [el('span', {}, 'PMS to supply (L)'), pmsLitres]),
    ]),
    summary,
  ]));

  const extraLitres=el('input',{type:'number',min:0,step:0.1,value:0});
  const extraPurpose=el('select',{},['Repairs','Maintenance','Trekking','Burning debris','Generator'].map(x=>el('option',{value:x},x)));
  const extraReason=el('input',{placeholder:'Machine / job and reason'});
  const pmsReason=el('input',{placeholder:'Bikes / vehicles, trips or distance and manager estimate'});
  const oilLitres=el('input',{type:'number',min:0,step:0.1,value:0});
  const oilType=el('input',{placeholder:'Oil grade / type'});
  const oilPrice=el('input',{type:'number',min:0,step:0.01,value:0});
  const oilReason=el('input',{placeholder:'Dozer code and maintenance job'});
  container.appendChild(el('div',{class:'dd-tool dd-static'},[
    el('h3',{},'Other planned uses — recorded separately from production'),
    el('div',{class:'filter-bar'},[field('Extra AGO litres',extraLitres),field('Purpose',extraPurpose),field('Machine / reason',extraReason),
      field('PMS movement plan',pmsReason),field('Oil litres',oilLitres),field('Oil type',oilType),field('Oil price per litre',oilPrice),field('Oil job / machine',oilReason)])]));
  // ----------------------------------------------------- message and vouchers
  const stationSel = el('select', {}, FUEL_STATIONS.map((s) => el('option', { value: s }, s)));
  stationSel.value = FUEL_STATIONS.includes(station0) ? station0 : FUEL_STATIONS[0];
  const supplyDate = el('input', { type: 'date', value: addDays(today, 1) });
  const recipient = el('input', { type: 'text', placeholder: 'Who the station supplies' });
  const msgNo = el('input', { type: 'number', min: '1', step: '1', value: '1', class: 'dd-small-input' });
  const message = el('textarea', { rows: '6', class: 'dd-message' });
  const status = el('p', { class: 'section-subtitle' }, '');
  const copyBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Copy planning draft');
  const voucherBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [ico('upload'), 'Submit fuel plan']);
  container.appendChild(el('div', { class: 'dd-tool dd-static' }, [
    el('h3', { class: 'dd-static-title' }, 'Fuel plan for approval'),
    el('p', { class: 'section-subtitle' }, 'This is a planning draft. Submit the plan below; Operations checks it and the CEO approves quantities. The approved station instruction is available in the workflow list.'),
    el('div', { class: 'filter-bar' }, [field('Fuel station', stationSel), field('Supply date', supplyDate), field('Supply to', recipient), field('Message no.', msgNo)]),
    message,
    el('div', { class: 'dd-actions' }, [copyBtn, voucherBtn]),
    status,
  ]));

  const exportBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [ico('download'), 'Download Excel']);
  const printBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, [ico('printer'), 'Print / Save as PDF']);
  container.appendChild(el('div', { class: 'dd-actions' }, [exportBtn, printBtn]));

  // ------------------------------------------------------------------ state
  let defaults = null;
  let rowRefs = [];
  let targetTouched = false; let messageTouched = false; let recipientTouched = false;

  const autoTarget = () => targetOpeningFor({ targetHours: numVal(hours), litresPerHour: numVal(lph), reserve: numVal(reserve) });

  function loadDefaults() {
    const ctx = liveContext(siteSel.value);
    defaults = planDefaults(ctx, siteSel.value, closingDate.value || today);
    tableBody.innerHTML = '';
    rowRefs = defaults.dozers.map((d) => {
      const box = el('input', { type: 'checkbox' }); box.checked = d.active;
      const closing = el('input', { type: 'number', min: '0', step: '0.5', class: 'dd-small-input', value: String(d.closing) });
      const rowHours=el('input',{type:'number',min:0,max:24,step:0.5,value:hours.value,class:'dd-small-input'});
      rowHours.addEventListener('input',update);
      const need = el('td', { class: 'dd-num' }, '');
      const tr = el('tr', {}, [
        el('td', {}, [box]),
        el('td', {}, [el('strong', {}, d.name), d.operator ? el('span', { class: 'dd-muted' }, ` · ${d.operator}`) : null]),
        el('td', { class: 'dd-num' }, L(d.distributed)),
        el('td', { class: 'dd-num' }, [closing]),
        el('td', { class: 'dd-num' }, [rowHours]),
        need,
      ]);
      box.addEventListener('change', update); closing.addEventListener('input', update);
      tableBody.appendChild(tr);
      return { d, box, closing, rowHours, need, tr };
    });
    onGround.value = String(defaults.onGround);
    onGroundNote.textContent = defaults.onGroundNote;
    if (!recipientTouched) recipient.value = defaults.recipient || '';
    if (!targetTouched) target.value = String(autoTarget());
    update();
  }

  function current() {
    const dozers = rowRefs.map((r) => ({ ...r.d, active: r.box.checked, closing: numVal(r.closing), target: targetTouched ? numVal(target) : fuelRequirement({hours:numVal(r.rowHours),litresPerHour:numVal(lph),reserve:numVal(reserve),closing:0}) }));
    const plan=buildPlan({
      dozers, target: numVal(target), onGround: numVal(onGround), kegLitres: numVal(kegSize) || DEFAULTS.kegLitres,
      dieselPrice: defaults?.dieselPrice || 0, pmsLitres: numVal(pmsLitres), pmsPrice: defaults?.pmsPrice || 0,
    });
    plan.extraDiesel=numVal(extraLitres);
    plan.additional=Math.max(0,plan.totalNeed+plan.extraDiesel-plan.onGround);
    plan.agoCost=plan.additional*plan.dieselPrice;
    plan.grandCost=plan.agoCost+plan.pmsCost+numVal(oilLitres)*numVal(oilPrice);
    return plan;
  }

  function notes(plan) {
    const active = plan.rows.filter((r) => r.active).map((r) => r.name).join(', ') || 'none';
    return [
      `Need = ${L(plan.target)} L target opening less closing diesel, for the ${plan.activeCount} active dozer(s): ${active}.`,
      Math.abs(plan.target - autoTarget()) < 0.05
        ? `Target opening = ${hours.value} target hrs × ${lph.value} L per hour + ${reserve.value} L reserve left in the tank.`
        : `Target opening of ${L(plan.target)} L was set by hand (target hours and reserve would give ${L(autoTarget())} L).`,
      `Closing diesel follows the ERP diesel chain as at ${formatDate(closingDate.value)} (opening = previous closing + supplied; used = ${lph.value} L per hour, 20 L per hour after 8 hrs). Correct any figure that differs from the site's count.`,
      'Distributed counts diesel put in the tanks only; diesel given for fixing tracks is not tank fuel.',
      `On ground ${L(plan.onGround)} L: ${defaults?.onGroundNote || ''}.`,
    ];
  }

  function update() {
    if (!defaults) return;
    if (!targetTouched) target.value = String(autoTarget());
    const plan = current();
    rowRefs.forEach((r, i) => {
      const row = plan.rows[i];
      r.need.textContent = row.active ? L(row.need) : '—';
      r.tr.classList.toggle('dd-row-off', !row.active);
    });
    totalRow.innerHTML = '';
    totalRow.appendChild(el('tr', {}, [el('td'), el('td', {}, el('strong', {}, 'Total')), el('td', { class: 'dd-num' }, el('strong', {}, L(plan.totalDistributed))), el('td', { class: 'dd-num' }, el('strong', {}, L(plan.totalClosing))), el('td'), el('td', { class: 'dd-num' }, el('strong', {}, L(plan.totalNeed)))]));
    summary.innerHTML = '';
    [
      statCard({ icon: 'fuelCan', label: 'Total for active dozers', value: `${L(plan.totalNeed)} L`, hint: `${plan.activeCount} dozer(s) to ${L(plan.target)} L` }),
      statCard({ icon: 'bag', label: 'Additional AGO to supply', value: `${L(plan.additional)} L`, tone: plan.additional ? 'warning' : 'good', hint: `${L(plan.kegs)} kegs of ${plan.kegLitres} L · less ${L(plan.onGround)} L on ground` }),
      statCard({ icon: 'banknote', label: 'AGO cost', value: formatCurrency(plan.agoCost), hint: `at ${formatCurrency(plan.dieselPrice)} per litre` }),
      statCard({ icon: 'wallet', label: 'PMS cost', value: formatCurrency(plan.pmsCost), hint: `${L(plan.pmsLitres)} L at ${formatCurrency(plan.pmsPrice)}` }),
    ].forEach((c) => summary.appendChild(c));
    if (!messageTouched) message.value = 'PLANNING DRAFT — NOT AUTHORISED FOR RELEASE\n\n' + supplyMessage({ recipient: recipient.value.trim(), diesel: plan.additional, pms: plan.pmsLitres, date: supplyDate.value, today, number: numVal(msgNo) || 1 });
  }

  // ----------------------------------------------------------------- events
  siteSel.addEventListener('change', () => { recipientTouched = false; loadDefaults(); });
  closingDate.addEventListener('change', () => { planDate.value = addDays(closingDate.value || today, 1); supplyDate.value = planDate.value; messageTouched = false; loadDefaults(); });
  planDate.addEventListener('change', () => { supplyDate.value = planDate.value; messageTouched = false; update(); });
  [hours, lph, reserve].forEach((i) => i.addEventListener('input', () => { targetTouched = false; update(); }));
  target.addEventListener('input', () => { targetTouched = true; update(); });
  autoBtn.addEventListener('click', () => { targetTouched = false; update(); });
  [kegSize, onGround, pmsLitres].forEach((i) => i.addEventListener('input', () => { messageTouched = false; update(); }));
  [supplyDate, msgNo].forEach((i) => i.addEventListener('input', () => { messageTouched = false; update(); }));
  recipient.addEventListener('input', () => { recipientTouched = true; messageTouched = false; update(); });
  message.addEventListener('input', () => { messageTouched = true; });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(message.value); status.textContent = 'Message copied.'; } catch (e) { message.select(); document.execCommand('copy'); status.textContent = 'Message copied.'; }
  });

  const workflowPanel=el('div'); container.appendChild(workflowPanel); renderFuelWorkflow(workflowPanel);
  const meta = (plan) => ({
    siteLabel: siteSel.value.replace(/^REX Forestry Project - /, ''), planDate: planDate.value, closingDate: closingDate.value || today,
    targetHours: numVal(hours), litresPerHour: numVal(lph), reserve: numVal(reserve), targetOverridden: Math.abs(plan.target - autoTarget()) >= 0.05,
    generatedOn: today, notes: notes(plan),
  });

  exportBtn.addEventListener('click', async () => {
    const plan = current();
    if (!plan.activeCount) { status.textContent = 'Tick at least one active dozer first.'; return; }
    exportBtn.disabled = true;
    try {
      const ExcelJS = await loadExcelJs();
      const wb = buildAgoWorkbook(ExcelJS, plan, meta(plan));
      const buffer = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = el('a', { href: url, download: agoFileName(planDate.value) });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      status.textContent = `Downloaded ${agoFileName(planDate.value)}.`;
    } catch (e) { status.textContent = e.message; } finally { exportBtn.disabled = false; }
  });

  printBtn.addEventListener('click', () => {
    const plan = current();
    if (!plan.activeCount) { status.textContent = 'Tick at least one active dozer first.'; return; }
    const m = meta(plan);
    printAgoPlanner(plan, { siteLabel: m.siteLabel, planDate: m.planDate, closingDate: m.closingDate, notes: m.notes, message: message.value });
  });

  voucherBtn.addEventListener('click', () => {
    try {
      const plan=current();
      const lines=[];
      let ground=plan.onGround;
      for(const row of plan.rows.filter(r=>r.active&&r.need>0)){
        const used=Math.min(ground,row.need);ground-=used;
        if(row.need-used>0)lines.push({id:crypto.randomUUID(),product:'Diesel',purpose:'Production',equipment:row.name,
          quantity:row.need-used,unitPrice:plan.dieselPrice,targetHours:numVal(rowRefs.find(r=>r.d.name===row.name).rowHours),closing:row.closing,reason:'Dozer work plan'});
      }
      const other=Math.max(0,numVal(extraLitres)-ground);
      if(other>0){if(!extraReason.value.trim())throw Error('Explain the extra diesel use.');lines.push({id:crypto.randomUUID(),product:'Diesel',purpose:extraPurpose.value,equipment:extraReason.value,quantity:other,unitPrice:plan.dieselPrice,reason:extraReason.value});}
      if(plan.pmsLitres>0){if(!pmsReason.value.trim())throw Error('Enter the PMS movement plan.');lines.push({id:crypto.randomUUID(),product:'PMS',purpose:'Vehicles / bikes',quantity:plan.pmsLitres,unitPrice:plan.pmsPrice,reason:pmsReason.value});}
      if(numVal(oilLitres)>0){if(!oilType.value.trim()||!oilReason.value.trim()||numVal(oilPrice)<=0)throw Error('Enter oil type, price and maintenance reason.');lines.push({id:crypto.randomUUID(),product:'Oil',purpose:'Maintenance',oilType:oilType.value,quantity:numVal(oilLitres),unitPrice:numVal(oilPrice),reason:oilReason.value,equipment:oilReason.value});}
      if(!lines.length)throw Error('No additional supply is required.');
      submitFuelPlan({project:siteSel.value,station:stationSel.value,collector:recipient.value,supplyDate:supplyDate.value,lines,
        closingDate:closingDate.value,onGround:plan.onGround,planningRows:plan.rows,planningNote:notes(plan).join('\n')},
        ()=>{status.textContent='Fuel plan submitted for review and CEO approval.';renderFuelWorkflow(workflowPanel);});
    }catch(error){status.textContent=error.message;}
  });
  [extraLitres,oilLitres,oilPrice].forEach(input=>input.addEventListener('input',update));

  loadDefaults();
}
