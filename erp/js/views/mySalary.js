import { formatCurrency, formatDate, el, ico } from '../utils.js';
import { sectionHeader, statCard, renderTable } from '../ui.js';
import { getCurrentUser } from '../session.js';
import { supabase } from '../supabaseClient.js';
import { todayISOString } from '../dateUtils.js';
import { ALLOWANCE_EQUIPMENT, operatorAllowanceForRows } from '../ownedOperatorAllowance.js';
import { buildPayStatement, payStatementPeriod } from '../payStatement.js';
import { printPersonalPay } from '../payStatementPrint.js';

export async function renderMySalary(container) {
  container.innerHTML='';
  container.appendChild(sectionHeader('My Pay & Allowances','Your earnings, allowance payments and outstanding balance'));
  const employee=getCurrentUser();
  if (!employee) {container.appendChild(el('p',{},'No employee record is linked to this login.'));return;}
  // No employee picker or URL-supplied identity on the personal portal.
  const loading=el('p',{role:'status'},'Loading your pay records…');container.appendChild(loading);
  const {data:ctx,error}=await supabase.rpc('erp_personal_pay');
  loading.remove();
  if (error || !ctx || ctx.employeeId!==employee.id) {
    container.appendChild(el('p',{role:'alert',class:'backup-warning'},'Your pay records could not be loaded. Please refresh or contact your administrator.'));
    return;
  }
  ctx.expenses=(ctx.expenses || []).map(e=>({...e,payee:'personal-payment'}));
  const entries=buildPayStatement(ctx,employee.id,
    rows=>operatorAllowanceForRows(rows.filter(o=>ALLOWANCE_EQUIPMENT.has(o.equipment))),(_id,payee,category)=>payee==='personal-payment'&&category==='Salary and Allowance');
  const month=el('input',{type:'month','aria-label':'Pay month'});month.value=todayISOString().slice(0,7);
  const payslip=el('button',{type:'button',class:'btn btn-primary'},[ico('printer'),'Print Monthly Payslip']);
  const statement=el('button',{type:'button',class:'btn btn-ghost'},[ico('printer'),'Print Pay Statement']);
  const all=el('button',{type:'button',class:'btn btn-ghost'},'All periods');
  container.appendChild(el('div',{class:'filter-bar'},[el('label',{},['Pay month ',month]),all,payslip,statement]));
  const body=el('div');container.appendChild(body);
  let selected;
  function refresh() {
    selected=payStatementPeriod(entries,month.value);body.innerHTML='';
    payslip.disabled=!month.value||!selected.recorded.length;
    body.appendChild(el('div',{class:'stats-grid'},[
      statCard({label:'Opening Balance (Approved)',value:formatCurrency(selected.openingRecorded)}),
      statCard({label:'Approved Earnings',value:formatCurrency(selected.earned)}),
      statCard({label:'Payments / Credits',value:formatCurrency(selected.paid)}),
      statCard({label:'Outstanding (Approved)',value:formatCurrency(selected.closingRecorded),tone:selected.closingRecorded>0?'critical':'good'}),
      statCard({label:'Additional Estimated Allowance',value:formatCurrency(selected.estimated)}),
      statCard({label:'Balance Including Estimates',value:formatCurrency(selected.closing)})]));
    body.appendChild(el('p',{class:'section-subtitle'},'Payslips include approved records only. Allowance runs appear in their period-ending month. Payroll payments are credits against that pay period. Negative balances are credits or advances.'));
    const table=el('div');body.appendChild(table);
    renderTable(table,{columns:[
      {key:'date',label:'Date',render:r=>formatDate(r.date)},
      {key:'type',label:'Type',wrap:true},{key:'period',label:'Pay Period',wrap:true},{key:'id',label:'Reference'},
      {key:'status',label:'Status'},{key:'earned',label:'Earned',render:r=>formatCurrency(r.earned)},
      {key:'paid',label:'Paid / Credited',render:r=>formatCurrency(r.paid)},
      {key:'balance',label:'Running Balance',render:r=>formatCurrency(r.balance)},
      {key:'equipment',label:'Dozer',wrap:true},{key:'days',label:'Days',render:r=>r.days??'—'},
      {key:'dayRate',label:'Daily Rate',render:r=>r.dayRate?formatCurrency(r.dayRate):'—'},
      {key:'hours',label:'Hours / Overtime',render:r=>r.hours!=null?r.hours+' hrs':r.overtimeHours!=null?r.overtimeHours+' overtime hrs':'—'}
    ],rows:selected.rows,emptyText:'No pay or allowance records for this period. Choose another month or All periods.'});
  }
  month.addEventListener('change',refresh);
  all.addEventListener('click',()=>{month.value='';refresh();});
  payslip.addEventListener('click',()=>{if(month.value&&selected.recorded.length)printPersonalPay(employee,selected,true);});
  statement.addEventListener('click',()=>printPersonalPay(employee,selected));
  refresh();
}
