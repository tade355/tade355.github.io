import { store } from '../store.js';
import { el, formatCurrency, formatDate } from '../utils.js';
import { openModal } from '../ui.js';
import { getCurrentTier, filterFundRequests } from '../session.js';
import { paymentCard } from './approvals.js';
import { todayISOString, requestSubmissionDate } from '../dateUtils.js';
import { supabase } from '../supabaseClient.js';
import { fetchAllPages } from '../storeHelpers.js';
import { approvalTimesByRequest, groupApprovedPayments } from '../approvalQueue.js';
import { notifyFundRequestDecision } from '../notifications.js';

export function renderRequestPayments(container) {
  container.replaceChildren();
  if (!['Admin','Accounts'].includes(getCurrentTier())) { container.appendChild(el('p', {}, 'Accounts access is required.')); return; }
  const search = el('input', {type:'search',placeholder:'Search approved requests…','aria-label':'Search payments'});
  const cards = el('div',{class:'approval-card-list'});
  const historyStatus = el('p', { role: 'status' }, 'Loading approval dates…');
  container.append(el('p', {}, 'Newest approvals first · grouped using Nigeria time.'), search, historyStatus, cards);
  let approvalTimes = new Map();
  const expanded = new Map();
  const approvalDateText = value => new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  async function loadApprovalHistory() {
    try {
      const audit = await fetchAllPages(async (from, to) => {
        const { data, error } = await supabase.from('fund_request_approval_audit')
          .select('id,request_id,to_status,acted_at').in('to_status', ['Approved', 'Partially Approved'])
          .order('acted_at', { ascending: false }).order('id').range(from, to);
        if (error) throw error;
        return data || [];
      });
      approvalTimes = approvalTimesByRequest(audit);
      historyStatus.textContent = '';
    } catch {
      historyStatus.replaceChildren(el('span', {}, 'Approval dates could not be loaded. Undated approvals are listed under Older. '),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: loadApprovalHistory }, 'Retry'));
    }
    refresh();
  }
  function refresh() {
    const q=search.value.trim().toLowerCase();
    const rows=filterFundRequests(store.get('fundRequests')).filter(r=>['Approved','Partially Approved'].includes(r.status))
      .filter(r=>[r.id,r.description,r.project].join(' ').toLowerCase().includes(q));
    const renderCard = r => {
      const total=(r.items||[]).reduce((s,i)=>s+Number(i.amount||0),0);
      const approved=Number(r.approvedAmount??total);
      const paid=Number(r.paidAmount||0);
      const due=Math.max(0,approved-paid);
      const recipient=r.items?.[0]||{};
      return el('article',{class:'approval-request-card'},[
        el('strong',{},r.id+' · '+(r.project||'No project')),
        el('h3',{},formatCurrency(due)+' to pay'),
        el('p', {}, r.queueApprovedAt ? 'Approved ' + approvalDateText(r.queueApprovedAt) + ' WAT' : 'Approval date unavailable'),
        el('p', {}, 'Submitted ' + formatDate(requestSubmissionDate(r))),
        el('p', {}, 'Category: ' + (r.costHead || 'Not categorized') + (r.equipment ? ' · Dozer: ' + r.equipment : '')),
        el('p',{},r.description||'Fund request'),
        el('p',{},'Requested '+formatCurrency(total)+' · Approved '+formatCurrency(approved)+' · Paid '+formatCurrency(paid)),
        el('p',{},(recipient.accountName||'Missing account name')+' · '+(recipient.bankName||'Missing bank')+' · '+(recipient.accountNumber||'Missing account number')),
        r.approvalNote?el('p',{},'Approval note: '+r.approvalNote):null,
        paymentCard({...r,approvedAmount:due}),
        el('details',{},[el('summary',{},'Items'),...(r.items||[]).map(i=>el('p',{},i.description+' — '+formatCurrency(i.amount)))]),
        el('button',{type:'button',class:'btn btn-primary',onClick:()=>{
          if(!recipient.accountNumber||!recipient.bankName){window.alert('Recipient bank details are incomplete. Resolve these before payment.');return;}
          openModal({title:'Record completed payment · '+r.id,fields:[
            {name:'amount',label:'Amount actually transferred (₦)',type:'number',min:0,required:true},
            {name:'paidAt',label:'Payment date',type:'date',required:true},
            {name:'paymentReference',label:'Bank transfer reference / receipt reference',required:true},
          ],initial:{amount:due,paidAt:todayISOString()},submitLabel:'Confirm payment recorded',
          onSubmit:async(data)=>{
            const current=store.find('fundRequests',r.id);
            if(!current||!['Approved','Partially Approved'].includes(current.status)) throw new Error('This request has already changed. Refresh before recording payment.');
            const totalApproved=Number(current.approvedAmount??(current.items||[]).reduce((sum,item)=>sum+Number(item.amount||0),0));
            const previousPaid=Number(current.paidAmount||0);
            const amount=Number(data.amount);
            if(!Number.isFinite(amount)||amount<=0||amount>totalApproved-previousPaid+0.005) throw new Error('Enter a positive amount no greater than the remaining approved balance.');
            await store.add('fundRequestPayments',{requestId:r.id,date:data.paidAt,amount,reference:data.paymentReference,notes:'Payment recorded in Finance & Accounts'});
            const totalPaid=previousPaid+amount;
            const saved=await store.update('fundRequests',r.id,{
              status:totalPaid+0.005>=totalApproved?'Paid':'Approved',
              paidAt:data.paidAt,paidAmount:totalPaid,paymentReference:data.paymentReference,
            });
            notifyFundRequestDecision(saved,'Accounts').catch(()=>{});
            refresh();
          }});
        }},'Record payment made'),
      ]);
    };
    cards.replaceChildren();
    const groups = groupApprovedPayments(rows, approvalTimes).filter(group => group.rows.length);
    for (const group of groups) {
      const due = group.rows.reduce((sum, r) => {
        const total = (r.items || []).reduce((s, item) => s + Number(item.amount || 0), 0);
        return sum + Math.max(0, Number(r.approvedAmount ?? total) - Number(r.paidAmount || 0));
      }, 0);
      const open = q || (expanded.has(group.label) ? expanded.get(group.label) : group.label !== 'Older' || groups.length === 1);
      const section = el('details', { class: 'payment-age-group', ...(open ? { open: true } : {}) }, [
        el('summary', { style: 'cursor:pointer;padding:0.85rem;font-weight:600;' }, group.label + ' · ' + group.rows.length + ' request(s) · ' + formatCurrency(due) + ' to pay'),
        el('div', { class: 'approval-card-list' }, group.rows.map(renderCard)),
      ]);
      section.addEventListener('toggle', () => { if (!search.value.trim()) expanded.set(group.label, section.open); });
      cards.appendChild(section);
    }
    if(!rows.length)cards.appendChild(el('p',{},'No approved requests awaiting payment.'));
  }
  search.addEventListener('input',refresh);
  loadApprovalHistory();
}
