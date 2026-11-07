import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';

const CATEGORIES = ['Operations target','Diesel / AGO','PMS','Operator allowances','Logistics / transport','Maintenance','Staff / admin','Other'];

function projectOptions() {
  return [{ value:'', label:'— Company-wide —' }, ...store.get('projects').map(p => ({value:p.name,label:p.name}))];
}
function amount(v){ return Number(v || 0); }
function budgetTotal(r){ return ['dieselBudget','pmsBudget','allowancesBudget','logisticsBudget','maintenanceBudget','staffBudget','otherBudget'].reduce((s,k)=>s+amount(r[k]),0); }
function actualTotal(r){
  const from=r.periodStart||'0000-00-00', to=r.periodEnd||'9999-99-99', project=r.project||'';
  const expenses=store.get('expenses').filter(e=>e.date>=from&&e.date<=to&&(!project||e.project===project));
  const requests=store.get('fundRequests').filter(q=>q.status==='Paid'&&q.date>=from&&q.date<=to&&(!project||q.project===project));
  const exp=expenses.reduce((s,e)=>s+amount(e.amount),0);
  const req=requests.reduce((s,q)=>s+(Number(q.paidAmount)||((q.items||[]).reduce((x,i)=>x+amount(i.amount),0))),0);
  return exp+req;
}

export function renderBudgets(container) {
  container.innerHTML = '';
  const actionSlot = el('div');
  container.appendChild(sectionHeader('Budgets & Weekly Plans','Set project targets, planned costs, machine availability and weekly controls in one place.',actionSlot));
  actionSlot.appendChild(el('button',{class:'btn btn-primary',type:'button',onClick:()=>openForm()},'+ Add Budget'));
  const summary = el('div',{class:'stats-grid'}); container.appendChild(summary);
  const table = el('div'); container.appendChild(table);

  function refresh(){
    const rows=store.get('budgets').slice().sort((a,b)=>(a.periodStart<b.periodStart?1:-1)).map(r=>({...r,total:budgetTotal(r),actual:actualTotal(r),variance:budgetTotal(r)-actualTotal(r)}));
    summary.innerHTML='';
    summary.appendChild(statCard({label:'Budget plans',value:String(rows.length)}));
    summary.appendChild(statCard({label:'Planned spend',value:formatCurrency(rows.reduce((s,r)=>s+r.total,0))}));
    summary.appendChild(statCard({label:'Active periods',value:String(rows.filter(r=>r.status!=='Closed').length),tone:'good'}));
    renderTable(table,{columns:[
      {key:'periodStart',label:'Period',render:r=>`${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}`},
      {key:'project',label:'Project',render:r=>r.project||'Company-wide'},
      {key:'targetHa',label:'Target (ha)',render:r=>r.targetHa||'—'},
      {key:'machinesOnSite',label:'Machines',render:r=>r.machinesOnSite||'—'},
      {key:'total',label:'Planned Cost',render:r=>formatCurrency(r.total)},
      {key:'actual',label:'Actual Spend',render:r=>formatCurrency(r.actual)},
      {key:'variance',label:'Variance',render:r=>formatCurrency(r.variance)},
      {key:'status',label:'Status'},
      {key:'actions',label:'',render:r=>actionButtons({onEdit:()=>openForm(r),onDelete:async()=>{if(!confirmDelete('this budget plan'))return;await store.remove('budgets',r.id);refresh();}})}
    ],rows,emptyText:'No budget plan has been created yet.'});
  }

  function openForm(record){
    openModal({title:record?'Edit Budget Plan':'New Budget Plan',wide:true,
      fields:[
        {name:'periodStart',label:'Period starts',type:'date',required:true},
        {name:'periodEnd',label:'Period ends',type:'date',required:true},
        {name:'project',label:'Project',type:'select',options:projectOptions()},
        {name:'targetHa',label:'Target area (hectares)',type:'number',min:0},
        {name:'machinesOnSite',label:'Machines on site',type:'number',min:0},
        {name:'machinesExtraHours',label:'Machines for extra hours',type:'number',min:0},
        {name:'machinesSunday',label:'Machines for Sunday work',type:'number',min:0},
        {name:'dieselBudget',label:'Diesel / AGO budget (₦)',type:'number',min:0},
        {name:'pmsBudget',label:'PMS budget (₦)',type:'number',min:0},
        {name:'allowancesBudget',label:'Operator allowances (₦)',type:'number',min:0},
        {name:'logisticsBudget',label:'Logistics / transport (₦)',type:'number',min:0},
        {name:'maintenanceBudget',label:'Maintenance (₦)',type:'number',min:0},
        {name:'staffBudget',label:'Staff / admin (₦)',type:'number',min:0},
        {name:'otherBudget',label:'Other planned cost (₦)',type:'number',min:0},
        {name:'status',label:'Status',type:'select',options:[{value:'Draft',label:'Draft'},{value:'Active',label:'Active'},{value:'Closed',label:'Closed'}]},
        {name:'notes',label:'Notes',type:'textarea'}
      ],
      initial:record||{periodStart:todayISOString(),periodEnd:todayISOString(),status:'Draft'},
      submitLabel:record?'Save Changes':'Create Budget',
      onSubmit:async data=>{if(record)await store.update('budgets',record.id,data);else await store.add('budgets',data);refresh();}
    });
  }
  refresh();
}