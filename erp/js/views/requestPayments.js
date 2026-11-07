import { store } from '../store.js';
import { el, formatCurrency, formatDate } from '../utils.js';
import { openModal } from '../ui.js';
import { getCurrentTier, filterFundRequests } from '../session.js';
import { paymentCard } from './approvals.js';
import { todayISOString } from '../dateUtils.js';
import { notifyFundRequestDecision } from '../notifications.js';

export function renderRequestPayments(container) {
  container.replaceChildren();
  if (!['Admin','Accounts'].includes(getCurrentTier())) { container.appendChild(el('p', {}, 'Accounts access is required.')); return; }
  const search = el('input', {type:'search',placeholder:'Search approved requests…','aria-label':'Search payments'});
  const cards = el('div',{class:'approval-card-list'});
  container.append(search,cards);
  function refresh() {
    const q=search.value.trim().toLowerCase();
    const rows=filterFundRequests(store.get('fundRequests')).filter(r=>['Approved','Partially Approved'].includes(r.status))
      .filter(r=>[r.id,r.description,r.project].join(' ').toLowerCase().includes(q))
      .sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    cards.replaceChildren(...rows.map(r=>{
      const total=(r.items||[]).reduce((s,i)=>s+Number(i.amount||0),0);
      const approved=Number(r.approvedAmount??total);
      const paid=Number(r.paidAmount||0);
      const due=Math.max(0,approved-paid);
      const recipient=r.items?.[0]||{};
      return el('article',{class:'approval-request-card'},[
        el('strong',{},r.id+' · '+(r.project||'No project')),
        el('h3',{},formatCurrency(due)+' to pay'),
        el('p',{},r.description||'Fund request'),
        el('p',{},'Requested '+formatCurrency(total)+' · Approved '+formatCurrency(approved)+' · Paid '+formatCurrency(paid)),
        el('p',{},(recipient.accountName||'Missing account name')+' · '+(recipient.bankName||'Missing bank')+' · '+(recipient.accountNumber||'Missing account number')),
        r.approvalNote?el('p',{},'Approval note: '+r.approvalNote):null,
        paymentCard({...r,approvedAmount:due}),
        el('details',{},[el('summary',{},'Items'),...(r.items||[]).map(i=>el('p',{},i.description+' — '+formatCurrency(i.amount)))]),
        el('button',{type:'button',class:'btn btn-primary',onClick:()=>{
          if(!recipient.accountNumber||!recipient.bankName){window.alert('Recipient bank details are incomplete. Resolve these before payment.');return;}
          openModal({title:'Record completed payment · '+r.id,fields:[
            {name:'paidAt',label:'Payment date',type:'date',required:true},
            {name:'paymentReference',label:'Bank transfer reference / receipt reference',required:true},
          ],initial:{paidAt:todayISOString()},submitLabel:'Confirm payment recorded',
          onSubmit:async(data)=>{
            const current=store.find('fundRequests',r.id);
            if(!current||!['Approved','Partially Approved'].includes(current.status)) throw new Error('This request has already changed. Refresh before recording payment.');
            const saved=await store.update('fundRequests',r.id,{status:'Paid',paidAt:data.paidAt,paidAmount:approved,paymentReference:data.paymentReference});
            notifyFundRequestDecision(saved,'Accounts').catch(()=>{});
            refresh();
          }});
        }},'Record payment made'),
      ]);
    }));
    if(!rows.length)cards.appendChild(el('p',{},'No approved requests awaiting payment.'));
  }
  search.addEventListener('input',refresh);refresh();
}
