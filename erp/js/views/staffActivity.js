import { supabase } from '../supabaseClient.js';
import { store } from '../store.js';
import { canViewStaffActivity } from '../session.js';
import { el,formatDate } from '../utils.js';
import { sectionHeader,renderTable,statCard } from '../ui.js';
const when=value=>new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Lagos',day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
export function renderUsageMonitor(container) {
 container.replaceChildren();
 if(!canViewStaffActivity()){container.appendChild(el('p',{},'You do not have access to this monitor.'));return;}
 container.appendChild(sectionHeader('Staff Activity Monitor','Visits, modules and estimated active time · Nigeria time (WAT)'));
 const from=el('input',{type:'date','aria-label':'From date'});from.value=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
 const to=el('input',{type:'date','aria-label':'To date'});to.value=new Date().toISOString().slice(0,10);
 const staff=el('select',{'aria-label':'Staff'},[el('option',{value:''},'All staff'),...store.get('employees').map(e=>el('option',{value:e.id},e.name))]);
 const load=el('button',{type:'button',class:'btn btn-primary'},'Refresh activity');
 container.appendChild(el('div',{class:'filter-bar'},[from,to,staff,load]));
 container.appendChild(el('p',{class:'section-subtitle'},'Active time excludes hidden tabs and inactivity after 60 seconds. Location is approximate and voluntary. Clicks are intentions; created/updated/deleted events follow successful saves. This is browser telemetry, not proof of attendance or a replacement for database audit records.'));
 const message=el('p', {role:'status'}),summary=el('div'),visits=el('div'),modules=el('div'),actions=el('div');
 container.append(message,summary,el('h3',{},'Visits'),visits,el('h3',{},'Modules used'),modules,el('h3',{},'Recent actions'),actions);
 async function refresh(){
  if(!from.value||!to.value||from.value>to.value){message.textContent='Choose a valid date range.';return;}
  load.disabled=true;message.textContent='Loading activity…';
  try{
   const lower=from.value+'T00:00:00+01:00',upper=to.value+'T23:59:59.999+01:00';
   let query=supabase.from('erp_usage_events').select('*').gte('occurred_at',lower).lte('occurred_at',upper).order('occurred_at',{ascending:false}).limit(5000);
   if(staff.value)query=query.eq('actor_id',staff.value);
   const {data,error}=await query;if(error)throw error;
   const rows=data||[],byVisit=new Map(),byModule=new Map();
   const name=id=>store.find('employees',id)?.name||id;
   rows.forEach(r=>{
    const v=byVisit.get(r.visit_id)||{id:r.visit_id,actor_id:r.actor_id,first:r.occurred_at,last:r.occurred_at,seconds:0,device:r.device,browser:r.browser,location:'Not shared',modules:new Set(),actions:0};
    if(r.occurred_at<v.first)v.first=r.occurred_at;if(r.occurred_at>v.last)v.last=r.occurred_at;
    v.seconds+=Number(r.active_seconds)||0;if(r.module)v.modules.add(r.module);if(r.event_type==='action')v.actions++;
    if(r.location_status==='shared'&&r.latitude!==null&&r.longitude!==null)v.location=r.latitude+', '+r.longitude+' (approx.)';
    else if(v.location==='Not shared'&&r.location_status==='denied')v.location='Permission declined';
    else if(v.location==='Not shared'&&r.location_status==='unavailable')v.location='Unavailable';
    byVisit.set(r.visit_id,v);
    const key=r.actor_id+':'+r.module+':'+r.section;
    const m=byModule.get(key)||{person:name(r.actor_id),module:r.module,section:r.section,seconds:0,actions:0};
    m.seconds+=Number(r.active_seconds)||0;if(r.event_type==='action')m.actions++;byModule.set(key,m);
   });
   const minutes=s=>Math.round(s/60*10)/10+' min';
   summary.replaceChildren(el('div',{class:'stats-grid'},[
    statCard({label:'Recorded visits',value:String(byVisit.size)}),statCard({label:'Staff using ERP',value:String(new Set(rows.map(r=>r.actor_id)).size)}),
    statCard({label:'Estimated active time',value:minutes(rows.reduce((s,r)=>s+Number(r.active_seconds||0),0))}),
   ]));
   renderTable(visits,{columns:[
    {key:'actor_id',label:'Staff',render:r=>name(r.actor_id)},{key:'first',label:'Visit started',render:r=>when(r.first)},
    {key:'last',label:'Last recorded activity',render:r=>when(r.last)},{key:'seconds',label:'Active time',render:r=>minutes(r.seconds)},
    {key:'device',label:'Device'},{key:'browser',label:'Browser'},{key:'location',label:'Approximate location'},
    {key:'modules',label:'Modules',render:r=>[...r.modules].join(', ')},{key:'actions',label:'Actions'},
   ],rows:[...byVisit.values()].sort((a,b)=>b.first.localeCompare(a.first)),emptyText:'No visits recorded in this period.'});
   renderTable(modules,{columns:[{key:'person',label:'Staff'},{key:'module',label:'Module'},{key:'section',label:'Section'},{key:'seconds',label:'Active time',render:r=>minutes(r.seconds)},{key:'actions',label:'Actions'}],rows:[...byModule.values()].sort((a,b)=>b.seconds-a.seconds)});
   renderTable(actions,{columns:[{key:'occurred_at',label:'Time',render:r=>when(r.occurred_at)},{key:'actor_id',label:'Staff',render:r=>name(r.actor_id)},{key:'module',label:'Module'},{key:'section',label:'Section'},{key:'action',label:'Action'}],rows:rows.filter(r=>r.event_type==='action').slice(0,200)});
   message.textContent=rows.length>=1000?'Results may be limited by the database row cap. Choose a shorter date range or one staff member. Visits spanning this range may be partial.':'Tracking starts with the new release; earlier visits cannot be reconstructed. Visits spanning the selected dates may be partial.';
  }catch(error){message.textContent='Could not load activity: '+error.message;}finally{load.disabled=false;}
 }
 load.addEventListener('click',refresh);staff.addEventListener('change',refresh);void refresh();
}
