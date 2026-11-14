import { selectableProjects, selectableMachines } from '../selectionOptions.js';
import { store } from '../store.js';
import { supabase } from '../supabaseClient.js';
import { el, formatCurrency, formatDate } from '../utils.js';
import { openModal, openCustomModal, statusPill, renderTable } from '../ui.js';
import { getCurrentUser, getCurrentTier, filterByProject } from '../session.js';
import { todayISOString, addDays } from '../dateUtils.js';
import { FUEL_PURPOSES, lineBalance, workflowOutstanding, stationRelease } from '../fuelWorkflow.js';

const uuid = () => crypto.randomUUID();
export async function fuelCommand(id, action, payload, token = uuid()) {
  const { data, error } = await supabase.rpc('fuel_workflow_command',{p_id:id,p_action:action,p_payload:payload,p_token:token});
  if (error) throw new Error(error.code === 'PGRST202' ? 'Fuel workflow setup has not been enabled by the administrator yet.' : error.message);
  await Promise.all(['fuelWorkflows','fuelCreditCollections','fuelCreditPayments','dieselSiteDistributions','expenses'].map(k=>store.refreshCollection(k)));
  return data;
}
export function submitFuelPlan(data, onSaved) {
  const id='FP-'+uuid(); const token=uuid();
  openModal({title:'Submit fuel plan for approval',initial:{...data,expiresOn:data.supplyDate,supplyMethod:'Station credit'},
    fields:[
      {name:'station',label:'Station / stock custodian',required:true},
      {name:'collector',label:'Authorised collector / site custodian',required:true},
      {name:'supplyDate',label:'Supply date',type:'date',required:true},
      {name:'expiresOn',label:'Release valid until',type:'date',required:true},
      {name:'supplyMethod',label:'Supply method',type:'select',options:['Station credit','Immediate payment','Site stock'].map(x=>({value:x,label:x}))},
      {name:'note',label:'Manager explanation / adjustments',type:'textarea',required:true},
      {name:'duplicateReason',label:'If another request exists for this station and day, explain why another is needed',type:'textarea'},
    ],submitLabel:'Submit for COO approval',
    onSubmit:async values=>{await fuelCommand(id,'submit',{...data,...values,kind:'Fuel'},token);onSaved?.();}
  });
}
export function openEarlierCostForm(onSaved, record = null) {
  const id=record?.id||'COST-'+uuid();const token=uuid();
  const d=record?.data||{};
  openModal({title:record?'Edit Earlier Cost / Reimbursement Request':'Earlier Cost / Reimbursement Request',initial:{
    project:record?.project||d.project||'',incurredDate:d.incurredDate||todayISOString(),incurredTo:d.incurredTo||d.incurredDate||todayISOString(),category:d.category||'Other',equipment:d.equipment||'',
    description:d.description||'',amount:d.amount||'',payee:d.payee||'',evidence:d.evidence||'',lateReason:d.lateReason||'',linkedFundRequestId:d.linkedFundRequestId||''
  },fields:[
    {name:'project',label:'Project',type:'select',required:true,options:filterByProject(selectableProjects(store.get('projects')),'name').map(p=>({value:p.name,label:p.name}))},
    {name:'incurredDate',label:'Cost period start',type:'date',required:true},
    {name:'incurredTo',label:'Cost period end',type:'date',required:true},
    {name:'category',label:'Cost type',type:'select',options:['Diesel transport','Worker transport','Maintenance','Other'].map(x=>({value:x,label:x}))},
    {name:'equipment',label:'Dozer code (required for maintenance)',type:'select',options:[{value:'',label:'— Not a dozer maintenance cost —'},...selectableMachines(store.get('inventory')).filter(i=>i.category==='Heavy Equipment').map(i=>({value:i.name,label:[i.assetCode||i.sku,i.name].filter(Boolean).join(' — ')}))]},
    {name:'description',label:'Service / reason',required:true},
    {name:'amount',label:'Accumulated amount owed (₦)',type:'number',min:0,required:true},
    {name:'payee',label:'Person or vendor owed',required:true},
    {name:'evidence',label:'Receipt / service reference',required:true},
    {name:'lateReason',label:'Reason for later submission',type:'textarea'},
    {name:'linkedFundRequestId',label:'Existing fund request for this same cost (leave blank if none)'},
  ],submitLabel:record?'Update reimbursement request':'Submit reimbursement request',onSubmit:async data=>{
    if(data.incurredTo<data.incurredDate) throw new Error('The cost period end cannot be before the start date.');
    if(data.category==='Maintenance'&&!data.equipment) throw new Error('Select the dozer code for a maintenance reimbursement.');
    if(record){
      const {error}=await supabase.rpc('update_earlier_cost_request',{p_id:id,p_payload:{...data,kind:'Cost'},p_token:token});
      if(error) throw new Error(error.code==='PGRST202'?'Reimbursement editing has not been enabled by the administrator yet.':error.message);
      await store.refreshCollection('fuelWorkflows');
    } else await fuelCommand(id,'submit',{...data,kind:'Cost'},token);
    onSaved?.();
  }});
}

function lineOptions(r) {return r.data.lines.map(l=>({value:l.id,label:l.product+(l.oilType?' · '+l.oilType:'')+' · '+l.purpose+' · '+(l.equipment||'Site') }));}
export function renderFuelWorkflow(container,{approvalsOnly=false,costsOnly=false,allowCreate=true}={}) {
  container.innerHTML='';
  const heading=el('h3',{},approvalsOnly?'Fuel plans and earlier costs awaiting review':costsOnly?'Earlier Cost / Reimbursement Requests':'Fuel requests, station releases and earlier costs');
  const controls=el('div',{class:'filter-bar'});
  const project=el('select',{'aria-label':'Workflow project'},[el('option',{value:''},'All permitted projects'),
    ...filterByProject(store.get('projects'),'name').map(p=>el('option',{value:p.name},p.name))]);
  const state=el('select',{'aria-label':'Workflow status'},['All statuses','Submitted','Reviewed','Approved','Partially Collected','Collected','Partially Paid','Paid','Rejected'].map(x=>el('option',{value:x},x)));
  const message=el('p',{role:'status',class:'section-subtitle'});
  const list=el('div',{class:'approval-card-list'});
  const reload=el('button',{class:'btn btn-ghost',type:'button',onClick:()=>load()},'Refresh workflow');
  controls.append(project,state,reload);
  if(!approvalsOnly&&allowCreate) controls.append(el('button',{class:'btn btn-primary',type:'button',onClick:()=>openEarlierCostForm(draw)},'+ Earlier Cost / Reimbursement Request'));
  container.append(heading,controls,message,list);
  async function load(){try{await store.refreshCollection('fuelWorkflows');draw();}catch(e){message.textContent=e.message;}}
  function button(label,fn){const b=el('button',{class:'btn btn-ghost btn-sm',type:'button',onClick:async()=>{b.disabled=true;try{await fn();}catch(e){message.textContent=e.message;}finally{b.disabled=false;}}},label);return b;}
  function approval(r){
    if(r.kind==='Cost') openModal({title:'Approve reported cost',initial:{amount:r.data.amount},fields:[
      {name:'amount',label:'Approved amount (₦)',type:'number',required:true,min:0},
      {name:'note',label:'COO comment',type:'textarea'}],submitLabel:'Approve',onSubmit:async p=>{await fuelCommand(r.id,'approve',p);draw();}});
    else openModal({title:'Approve fuel quantities',initial:Object.fromEntries(r.data.lines.map(l=>[l.id,l.quantity])),
      fields:[...r.data.lines.map(l=>({name:l.id,label:l.product+' · '+l.purpose+' (litres)',type:'number',min:0,required:true})),{name:'note',label:'COO comment',type:'textarea'}],
      submitLabel:'Approve fuel release',onSubmit:async p=>{const {note,...quantities}=p;await fuelCommand(r.id,'approve',{quantities,note});draw();}});
  }
  function collection(r){
    const token=uuid();
    openModal({title:'Confirm station collection and site receipt',initial:{date:todayISOString()},fields:[
      {name:'lineId',label:'Approved product / purpose',type:'select',options:lineOptions(r)},
      {name:'date',label:'Actual collection / delivery date',type:'date',required:true},
      {name:'quantity',label:'Litres actually collected / allocated',type:'number',min:0,required:true},
      {name:'delivered',label:'Litres received on site',type:'number',min:0,required:true},
      {name:'unitPrice',label:'Actual price (₦ per litre)',type:'number',min:0,required:true},
      {name:'reference',label:'Station receipt / waybill reference',required:true},
      {name:'note',label:'Receipt details / explanation of any quantity or price variance',type:'textarea'},
    ],submitLabel:'Confirm actual collection',onSubmit:async p=>{await fuelCommand(r.id,'collection',p,token);draw();}});
  }
  function issue(r){
    const token=uuid();
    openModal({title:'Record fuel / oil issued',initial:{date:todayISOString()},fields:[
      {name:'lineId',label:'Approved product / purpose',type:'select',options:lineOptions(r)},
      {name:'date',label:'Actual usage date',type:'date',required:true},
      {name:'quantity',label:'Quantity issued (litres)',type:'number',min:0,required:true},
      {name:'equipment',label:'Dozer code / vehicle / bike / use',required:true},
      {name:'note',label:'Usage / job details',type:'textarea',required:true},
    ],submitLabel:'Record issue',onSubmit:async p=>{const line=r.data.lines.find(l=>l.id===p.lineId);await fuelCommand(r.id,'issue',{...p,purpose:line.purpose},token);draw();}});
  }
  function payment(r){
    const token=uuid();
    openModal({title:'Record payment actually made',initial:{date:todayISOString()},fields:[
      {name:'amount',label:'Amount paid (₦) — outstanding '+formatCurrency(workflowOutstanding(r)),type:'number',min:0,required:true},
      {name:'date',label:'Actual payment date',type:'date',required:true},
      {name:'reference',label:'Bank / payment reference',required:true},
      {name:'note',label:'Payment note',type:'textarea'},
    ],submitLabel:'Record payment',onSubmit:async p=>{await fuelCommand(r.id,'payment',p,token);draw();}});
  }
  function view(r){
    openCustomModal({title:r.id+' · '+r.project,wide:true,build:body=>{
      body.append(el('p',{},r.status+' · Submitted '+new Date(r.createdAt).toLocaleString()));
      if(r.kind==='Fuel') {
        const table=el('div');body.append(table);
        renderTable(table,{columns:[{key:'product',label:'Product'},{key:'equipment',label:'Equipment'},{key:'purpose',label:'Purpose'},
          {key:'quantity',label:'Requested litres'},{key:'approvedQuantity',label:'Approved litres'},
          {key:'collected',label:'Collected'},{key:'delivered',label:'Delivered'},{key:'issued',label:'Issued'},{key:'stock',label:'Stock remaining'}],
          rows:r.data.lines.map(l=>{const b=lineBalance(r,l.id);return {...l,...b,stock:b.delivered-b.issued,approvedQuantity:l.approvedQuantity??'Awaiting approval'};})});
      } else body.append(el('p',{},r.data.description+' · Incurred '+formatDate(r.data.incurredDate)+(r.data.incurredTo&&r.data.incurredTo!==r.data.incurredDate?' to '+formatDate(r.data.incurredTo):'')+(r.data.equipment?' · '+r.data.equipment:'')+' · '+formatCurrency(r.data.approvedAmount??r.data.amount)),
          el('p',{},'Evidence: '+r.data.evidence+' · Late submission: '+(r.data.lateReason||'Same day')));
      body.append(el('p',{},'Outstanding payable: '+formatCurrency(workflowOutstanding(r))));
      for(const e of r.events) body.append(el('p',{},new Date(e.at).toLocaleString()+' · '+e.type+' · '+(store.find('employees',e.actor)?.name||e.actor)
        +' · '+(e.date?formatDate(e.date)+' · ':'')+(e.amount?formatCurrency(e.amount):e.quantity?e.quantity+' L':'')+' '+(e.reference||'')+' '+(e.note||'')));
    }});
  }
  function draw(){
    const user=getCurrentUser()||{};
    let rows=filterByProject(store.get('fuelWorkflows'),'project');
    if(approvalsOnly) rows=rows.filter(r=>['Submitted','Reviewed'].includes(r.status));
    if(costsOnly) rows=rows.filter(r=>r.kind==='Cost');
    if(project.value) rows=rows.filter(r=>r.project===project.value);
    if(state.value!=='All statuses') rows=rows.filter(r=>r.status===state.value);
    rows=rows.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    list.replaceChildren();
    message.textContent=costsOnly?'You can update your reimbursement request while it awaits approval. Once approved or paid, submit a new request for any additional cost.':'Reported costs affect the date incurred. Unapproved costs are provisional; later payments reduce the payable without adding the cost again.';
    for(const r of rows){
      const actions=el('div',{class:'row-actions'},[button('View details',()=>view(r))]);
      const hasPayment=(r.events||[]).some(e=>e.type==='payment');
      if(r.kind==='Cost'&&r.requestedBy===user.id&&['Submitted','Reviewed'].includes(r.status)&&!hasPayment){
        actions.append(button('Edit request',()=>openEarlierCostForm(draw,r)));
      }
      if(user.id==='EMP-26' && ['Submitted','Reviewed'].includes(r.status)){
        actions.append(button('Approve',()=>approval(r)));
        actions.append(button('Reject',()=>{openModal({title:'Reject request',fields:[{name:'note',label:'Reason',required:true,type:'textarea'}],onSubmit:async p=>{await fuelCommand(r.id,'reject',p);draw();}});}));
      }
      if(r.kind==='Fuel' && ['Approved','Partially Collected','Collected'].includes(r.status)){
        if(r.data.supplyMethod!=='Site stock') actions.append(button('Copy station instruction',async()=>{await navigator.clipboard.writeText(stationRelease(r));message.textContent='Instruction copied. Send it to the station, then record who received it.';}));
        actions.append(button('Record instruction sent',()=>{openModal({title:'Record instruction sent',fields:[{name:'recipient',label:'Station contact / recipient',required:true},{name:'note',label:'Channel / note'}],onSubmit:async p=>{await fuelCommand(r.id,'message',p);draw();}});}));
        actions.append(button('Confirm collection / site receipt',()=>collection(r)),button('Record issue / usage',()=>issue(r)));
      }
      if(!r.data.linkedFundRequestId&&['Admin','Accounts'].includes(getCurrentTier())&&!['Submitted','Reviewed','Rejected'].includes(r.status)&&workflowOutstanding(r)>0&&r.data.supplyMethod!=='Site stock') actions.append(button('Record payment',()=>payment(r)));
      if(r.data.linkedFundRequestId) actions.append(el('a',{href:'#/fundRequests'},'Payment handled in '+r.data.linkedFundRequestId));
      list.append(el('article',{class:'approval-request-card'},[
        el('strong',{},r.id+' · '+r.kind),statusPill(r.status),
        r.kind==='Fuel'&&(r.events||[]).some(e=>e.type==='collection')?statusPill(workflowOutstanding(r)===0?'Fully Paid':(r.events||[]).some(e=>e.type==='payment')?'Partially Paid':'Awaiting Payment'):null,
        el('p',{},r.project),
        el('p',{},r.kind==='Fuel'?r.data.station+' · '+formatDate(r.data.supplyDate)+' · '+r.data.supplyMethod:r.data.description+' · Incurred '+formatDate(r.data.incurredDate)+(r.data.incurredTo&&r.data.incurredTo!==r.data.incurredDate?' to '+formatDate(r.data.incurredTo):'')+(r.data.equipment?' · '+r.data.equipment:'')),
        el('p',{},'Outstanding: '+formatCurrency(r.data.supplyMethod==='Site stock'?0:workflowOutstanding(r))),actions]));
    }
    if(!rows.length)list.append(el('p',{},'No matching workflow records.'));
  }
  project.addEventListener('change',draw);state.addEventListener('change',draw);load();
}
