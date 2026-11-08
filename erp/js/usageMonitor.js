import { supabase } from './supabaseClient.js';
import { activeSeconds,deviceInfo,moduleInfo } from './usageMath.js';
let running=false;
export function startUsageMonitor(user) {
 if(running||!user?.id)return; running=true;
 const key='erp-usage-'+user.id, visit=crypto.randomUUID(), info=deviceInfo(navigator.userAgent);
 let queue=[],busy=false,lastInput=Date.now(),previous=Date.now(),seconds=0,context=moduleInfo(location.hash);
 let geo={location_status:'not_shared',latitude:null,longitude:null};
 try {queue=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(queue))queue=[];queue=queue.slice(-300);} catch {queue=[];}
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(queue.slice(-300)));}catch{}};
 function push(type,action='',active=0) {
  queue.push({id:crypto.randomUUID(),visit_id:visit,occurred_at:new Date().toISOString(),event_type:type,
   ...context,action,active_seconds:Math.min(30,Math.max(0,Math.floor(active))),...info,...geo});
  queue=queue.slice(-300);persist();
 }
 async function flush(){
  if(busy||!queue.length||!navigator.onLine)return;
  busy=true;
  try { const batch=queue.slice(0,50);const {error}=await supabase.rpc('record_erp_usage',{p_events:batch});
   if(!error){const sent=new Set(batch.map(e=>e.id));queue=queue.filter(e=>!sent.has(e.id));persist();}
  } catch{} finally{busy=false;}
 }
 function tick(){const now=Date.now();seconds+=activeSeconds(previous,now,lastInput,!document.hidden,document.hasFocus());previous=now;}
 function checkpoint(type='active'){
  tick();const whole=Math.floor(seconds);seconds-=whole;
  if(whole||type!=='active')push(type,'',whole);
  void flush();
 }
 push('visit');void flush();
 ['pointerdown','keydown','touchstart','wheel'].forEach(name=>document.addEventListener(name,()=>{lastInput=Date.now();},{passive:true}));
 setInterval(tick,5000);setInterval(()=>checkpoint(),30000);
 window.addEventListener('hashchange',()=>{checkpoint();context=moduleInfo(location.hash);push('module');void flush();});
 document.addEventListener('visibilitychange',()=>{checkpoint(document.hidden?'leave':'module');previous=Date.now();if(!document.hidden)lastInput=Date.now();});
 window.addEventListener('pagehide',()=>checkpoint('leave'));
 window.addEventListener('online',flush);
 window.addEventListener('erp-record-action',event=>{
  const d=event.detail||{};
  if(!['created','updated','deleted'].includes(d.action)||!/^[a-zA-Z]+$/.test(d.collection||''))return;
  push('action',d.action+' '+d.collection);void flush();
 });
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  const label=(button.textContent||button.getAttribute('title')||'').trim();
  // Intent only, no form values, names, bank details, searches or free text.
  const action=/^Approve$|^Reject$|^Ask for clarification$|^Record payment made$|^Submit Request$|^Log Out$|^Export CSV$|^Download HTML$/i.test(label)?label:null;
  if(action){push('action','Clicked '+action);checkpoint();}
 });
 const notice=document.createElement('div');notice.className='usage-notice';
 const text=document.createElement('small');text.textContent='ERP visits and activity are logged. ';
 const button=document.createElement('button');button.type='button';button.className='btn btn-ghost btn-sm';button.textContent='Share approximate location';
 button.addEventListener('click',()=>{
  if(!navigator.geolocation){geo.location_status='unavailable';push('location');void flush();return;}
  button.disabled=true;
  navigator.geolocation.getCurrentPosition(position=>{
   geo={location_status:'shared',latitude:Math.round(position.coords.latitude*10)/10,longitude:Math.round(position.coords.longitude*10)/10};
   push('location');void flush();button.textContent='Approximate location shared';
  },error=>{
   geo={location_status:error.code===1?'denied':'unavailable',latitude:null,longitude:null};
   push('location');void flush();button.textContent='Location not shared';
  },{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
 });
 notice.append(text,button);document.getElementById('userBadge')?.appendChild(notice);
}
