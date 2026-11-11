import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, formatMonthLong, el, ico } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard } from '../ui.js';
import { printPayslip, printPayrollRegister, printSalaryStatement } from '../print.js';
import { getCurrentUser } from '../session.js';

function employeeLabel(id) {
  const e = store.get('employees').find((x) => x.id === id);
  return e ? `${e.name} (${e.role})` : 'Unknown';
}

function employeeNameOnly(id) {
  return store.get('employees').find((x) => x.id === id)?.name || 'Unknown';
}

function isMonthlySalaryStaff(employee) {
  return Number(employee.salary || 0) > 0;
}

function isCEO() {
  const user = getCurrentUser() || {};
  return /gideon|chief executive|ceo/i.test(`${user.name || ''} ${user.role || ''}`);
}

function isAccounts() {
  const user = getCurrentUser() || {};
  return /gladness|atabo|account|finance/i.test(`${user.name || ''} ${user.role || ''}`);
}

export function netPay(line) {
  return (line.baseSalary || 0) + (line.bonus || 0) - (line.deductions || 0);
}

function runTotal(run) {
  return run.lines.reduce((sum, l) => sum + netPay(l), 0);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function payrollStatusLabel(status) {
  return {
    Draft: 'Draft',
    Submitted: 'Awaiting CEO Approval',
    Approved: 'Approved — Awaiting Payment',
    Returned: 'Returned for Correction',
    PartiallyPaid: 'Partially Paid',
    Paid: 'Fully Paid',
  }[status] || status || 'Draft';
}

const PAYABLE_PAYROLL_STATUSES = new Set(['Approved','PartiallyPaid','Paid']);

export function salaryStatementRows(employeeId) {
  const rows = [];
  store.get('payrollRuns').filter((run) => PAYABLE_PAYROLL_STATUSES.has(run.status))
    .slice().sort((a,b) => a.month.localeCompare(b.month)).forEach((run) => {
      run.lines.filter((line) => line.employeeId === employeeId).forEach((line) => {
        rows.push({ runId: run.id, status: run.status, month: run.month,
          baseSalary: line.baseSalary || 0, bonus: line.bonus || 0,
          deductions: line.deductions || 0, netPay: netPay(line),
          amountPaid: line.amountPaid || 0,
          payments: store.get('payrollPayments').filter((payment) =>
            payment.payrollRunId === run.id && payment.employeeId === employeeId) });
      });
    });
  let running = 0;
  rows.forEach((row) => { running += row.netPay - row.amountPaid; row.runningBalance = running; });
  return rows;
}

export function balanceOwed(employeeId) {
  return store.get('payrollRuns').filter((run) => PAYABLE_PAYROLL_STATUSES.has(run.status))
    .flatMap((run) => run.lines).filter((line) => line.employeeId === employeeId)
    .reduce((balance, line) => balance + netPay(line) - Number(line.amountPaid || 0), 0);
}

function payrollPaymentRows(runId, employeeId) {
  return store.get('payrollPayments').filter((payment) =>
    payment.payrollRunId === runId && payment.employeeId === employeeId)
    .slice().sort((a,b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));
}

function paymentHistoryView(runId, employeeId) {
  const history = payrollPaymentRows(runId, employeeId);
  if (!history.length) return el('span', { class: 'muted' }, 'No instalments recorded yet');
  return el('details', { class: 'payroll-payment-history' }, [
    el('summary', {}, `${history.length} payment${history.length === 1 ? '' : 's'}`),
    el('div', { class: 'stack-sm' }, history.map((payment) => el('div', { class: 'payroll-payment-entry' }, [
      el('strong', {}, formatCurrency(payment.amount)),
      el('span', {}, formatDate(payment.paymentDate)),
      payment.reference ? el('span', {}, `Ref: ${payment.reference}`) : null,
      payment.note ? el('span', {}, payment.note) : null,
    ]))),
  ]);
}

function makePayrollLine(line, onChange, canEdit, onRemove) {
  const employee = store.get('employees').find((entry) => entry.id === line.employeeId);
  const name = line.employeeName || (employee ? `${employee.name} (${employee.role})` : 'One-off staff');
  const row = el('div', { class: 'payroll-line-row', 'data-employee-id': line.employeeId }, [
    el('span', {}, name),
  ]);
  const fields = [
    ['baseSalary', 'Base salary', 'li-base'],
    ['bonus', 'Bonus', 'li-bonus'],
    ['deductions', 'Deductions', 'li-deductions'],
  ];
  fields.forEach(([key,label,className]) => {
    if (canEdit) {
      const input = el('input', { type: 'number', class: className, min: 0, step: '1', 'aria-label': label });
      input.value = line[key] ?? 0;
      input.addEventListener('input', onChange);
      row.appendChild(input);
    } else {
      row.appendChild(el('span', { class: 'payroll-readonly-value' }, formatCurrency(Number(line[key] || 0))));
    }
  });
  const total = el('strong', { class: 'payroll-line-net' }, formatCurrency(netPay(line)));
  row.appendChild(total);
  if (canEdit) {
    const remove = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove employee', onClick: () => { row.remove(); onRemove?.(); onChange(); } }, '✕');
    row.appendChild(remove);
  }
  row._payrollLine = { ...line };
  row._recompute = () => {
    const get = (selector, key) => canEdit ? Number(row.querySelector(selector)?.value || 0) : Number(line[key] || 0);
    const current = { ...line, baseSalary: get('.li-base','baseSalary'), bonus: get('.li-bonus','bonus'), deductions: get('.li-deductions','deductions') };
    total.textContent = formatCurrency(netPay(current));
    row._payrollLine = current;
  };
  row._recompute();
  return row;
}

function runOutstanding(run, line) {
  return Math.max(0, netPay(line) - Number(line.amountPaid || 0));
}

function openReadOnlyRun(record, onSaved) {
  openCustomModal({
    title: `Payroll — ${formatMonthLong(record.month)}`,
    wide: true,
    build: (container) => {
      container.appendChild(el('div', { class: 'notice notice-info' }, `Status: ${payrollStatusLabel(record.status)}`));
      if (record.comments) container.appendChild(el('p', { class: 'section-subtitle' }, `Comments: ${record.comments}`));
      const rows = el('div', { class: 'payroll-lines-readonly' });
      record.lines.forEach((line) => {
        const empName = employeeLabel(line.employeeId);
        rows.appendChild(el('div', { class: 'payroll-line-row payroll-line-view' }, [
          el('strong', {}, empName),
          el('span', {}, `Base ${formatCurrency(line.baseSalary || 0)}`),
          el('span', {}, `Bonus ${formatCurrency(line.bonus || 0)}`),
          el('span', {}, `Deductions ${formatCurrency(line.deductions || 0)}`),
          el('strong', {}, `Approved ${formatCurrency(netPay(line))}`),
          el('span', {}, `Paid ${formatCurrency(line.amountPaid || 0)}`),
          el('strong', {}, `Balance ${formatCurrency(runOutstanding(record,line))}`),
          paymentHistoryView(record.id, line.employeeId),
        ]));
      });
      container.appendChild(rows);
      container.appendChild(el('div', { class: 'line-items-total' }, [
        el('span', {}, `Total approved: ${formatCurrency(runTotal(record))}`),
        el('strong', {}, `Outstanding: ${formatCurrency(record.lines.reduce((sum,line) => sum + runOutstanding(record,line),0))}`),
      ]));
      container.appendChild(el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary', onClick: closeModal }, 'Close'),
      ]));
    },
  });
}

function openRunForm(record, onSaved, { review = false } = {}) {
  const tier = getCurrentUser()?.accessTier || 'Staff';
  const canPrepare = tier === 'Admin' && !isCEO();
  const canEdit = review ? isCEO() && record?.status === 'Submitted'
    : canPrepare && (!record || ['Draft','Returned'].includes(record.status));
  if (record && !canEdit) { openReadOnlyRun(record, onSaved); return; }

  openCustomModal({
    title: record ? `${review ? 'Review' : (record.status === 'Returned' ? 'Correct' : 'View')} Payroll — ${formatMonthLong(record.month)}` : 'New Payroll Run',
    wide: true,
    build: (container) => {
      const monthInput = el('input', { type: 'month', name: 'month', disabled: !!record });
      monthInput.value = record?.month || currentMonthKey();
      const monthField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Pay period'), monthInput]);
      const statusField = el('div', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'Status'),
        el('strong', { class: 'status-summary' }, payrollStatusLabel(record?.status || 'Draft')),
      ]);
      container.appendChild(el('div', { class: 'form-grid-2' }, [monthField, statusField]));
      const comments = el('textarea', { name: 'comments', placeholder: review ? 'CEO comments or approval note' : 'Optional note' });
      comments.value = record?.comments || '';
      container.appendChild(el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Comments'), comments]));
      const heading = el('div', { class: 'payroll-line-header' }, [
        el('span', {}, 'Staff member'), el('span', {}, 'Base salary'), el('span', {}, 'Bonus'),
        el('span', {}, 'Deduction'), el('span', {}, 'Net pay'), el('span', {}, ''),
      ]);
      const items = el('div', { class: 'line-items-container' });
      const total = el('strong', {}, formatCurrency(0));
      const sourceLines = record?.lines?.length ? record.lines : store.get('employees')
        .filter((employee) => employee.status === 'Active' && isMonthlySalaryStaff(employee))
        .map((employee) => ({ employeeId: employee.id, baseSalary: employee.salary || 0, bonus: 0, deductions: 0, amountPaid: 0 }));
      const refreshTotal = () => {
        let sum = 0;
        items.querySelectorAll('.payroll-line-row').forEach((row) => {
          row._recompute();
          sum += netPay(row._payrollLine);
        });
        total.textContent = formatCurrency(sum);
      };
      const addSelect = el('select', {}, [
        el('option', { value: '' }, '+ Add monthly staff'),
        ...store.get('employees').filter((employee) => employee.status === 'Active' && isMonthlySalaryStaff(employee)
          && !sourceLines.some((line) => line.employeeId === employee.id))
          .map((employee) => el('option', { value: employee.id }, `${employee.name} (${employee.role})`)),
      ]);
      const oneOffName = el('input', { type: 'text', placeholder: 'One-off / part-time staff name' });
      const oneOffAmount = el('input', { type: 'number', min: 1, placeholder: 'Amount (₦)' });
      const addOneOff = el('button', { type: 'button', class: 'btn btn-ghost' }, '+ Add one-off staff');
      const updateEmployeeChoices = () => {
        const used = new Set([...items.querySelectorAll('.payroll-line-row')].map((row) => row.dataset.employeeId));
        addSelect.replaceChildren(el('option', { value: '' }, '+ Add monthly staff'));
        store.get('employees').filter((employee) => employee.status === 'Active' && isMonthlySalaryStaff(employee)
          && !used.has(employee.id)).forEach((employee) => addSelect.appendChild(el('option', { value: employee.id }, `${employee.name} (${employee.role})`)));
      };
      const addLine = (line) => items.appendChild(makePayrollLine(line, refreshTotal, canEdit, updateEmployeeChoices));
      sourceLines.forEach(addLine);
      container.appendChild(heading);
      container.appendChild(items);
      if (canEdit) {
        addSelect.addEventListener('change', () => {
          const employee = store.get('employees').find((entry) => entry.id === addSelect.value);
          if (!employee) return;
          addLine({ employeeId: employee.id, baseSalary: employee.salary || 0, bonus: 0, deductions: 0, amountPaid: 0 });
          updateEmployeeChoices(); addSelect.value = ''; refreshTotal();
        });
        addOneOff.addEventListener('click', () => {
          const name = oneOffName.value.trim(), amount = Number(oneOffAmount.value || 0);
          if (!name || amount <= 0) { window.alert('Enter the staff name and amount.'); return; }
          addLine({ employeeId: `adhoc-${Date.now()}`, employeeName: name, baseSalary: amount, bonus: 0, deductions: 0, amountPaid: 0 });
          oneOffName.value = ''; oneOffAmount.value = ''; refreshTotal();
        });
        container.appendChild(el('div', { class: 'form-grid-2' }, [addSelect, oneOffName, oneOffAmount, addOneOff]));
      }
      refreshTotal();
      container.appendChild(el('div', { class: 'line-items-total' }, [el('span', {}, 'Total net pay'), total]));
      const actions = el('div', { class: 'modal-actions' });
      actions.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Close'));

      const save = async (nextStatus) => {
        const lines = [];
        for (const row of [...items.querySelectorAll('.payroll-line-row')]) {
          row._recompute();
          const line = row._payrollLine;
          let employeeId = row.dataset.employeeId;
          if (employeeId?.startsWith('adhoc-')) {
            const name = row.querySelector('span')?.textContent?.trim() || line.employeeName || 'One-off staff';
            const added = await store.add('employees', { name, role: 'Adhoc / Part-time', department: 'Operations', status: 'Active', accessTier: 'Staff', salary: 0, dayRate: 0 });
            employeeId = added.id;
          }
          const baseSalary = Number(line.baseSalary || 0), bonus = Number(line.bonus || 0), deductions = Number(line.deductions || 0);
          if (baseSalary + bonus - deductions < 0) throw new Error('Deductions cannot exceed salary plus bonus.');
          lines.push({ employeeId, baseSalary, bonus, deductions, amountPaid: Number(line.amountPaid || 0) });
        }
        if (!monthInput.value) throw new Error('Select the pay period.');
        if (!record && store.get('payrollRuns').some((run) => run.month === monthInput.value && run.status !== 'Returned')) throw new Error('A payroll run already exists for this month. Open the existing run instead.');
        if (!lines.length) throw new Error('Add at least one employee.');
        if (new Set(lines.map((line) => line.employeeId)).size !== lines.length) throw new Error('Each staff member can appear only once.');
        const payload = { month: monthInput.value, status: nextStatus, lines, comments: comments.value.trim() || null };
        if (record) {
          await store.update('payrollRuns', record.id, payload);
        } else {
          const draft = await store.add('payrollRuns', { ...payload, status: 'Draft', expenseId: '' });
          if (nextStatus === 'Submitted') await store.update('payrollRuns', draft.id, { status: 'Submitted', comments: payload.comments });
        }
        await store.refreshCollection('payrollRuns');
        closeModal(); onSaved();
      };
      const runAction = async (label, nextStatus, kind = 'primary') => {
        const button = el('button', { type: 'button', class: `btn btn-${kind}` }, label);
        button.addEventListener('click', async () => {
          try { button.disabled = true; button.textContent = 'Saving…'; await save(nextStatus); }
          catch (error) { window.alert(error.message || 'Could not save this payroll run.'); button.disabled = false; button.textContent = label; }
        });
        actions.appendChild(button);
      };
      if (canEdit && review) {
        const returnBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Return for Correction');
        returnBtn.addEventListener('click', async () => {
          if (!comments.value.trim()) { window.alert('Add a short comment so HR knows what to correct.'); return; }
          try { returnBtn.disabled = true; await store.update('payrollRuns', record.id, { status: 'Returned', comments: comments.value.trim() }); await store.refreshCollection('payrollRuns'); closeModal(); onSaved(); }
          catch (error) { window.alert(error.message || 'Could not return this payroll.'); returnBtn.disabled = false; }
        });
        actions.appendChild(returnBtn);
        runAction('Approve payroll', 'Approved');
      } else if (canEdit) {
        if (!record || record.status === 'Draft') runAction('Save draft', 'Draft', 'ghost');
        runAction(record?.status === 'Returned' ? 'Resubmit for CEO approval' : 'Submit for CEO approval', 'Submitted');
      }
      container.appendChild(actions);
    },
  });
}

function openPaymentForm(run, employeeId, onSaved) {
  const lines = run.lines.filter((line) => runOutstanding(run,line) > 0);
  if (!lines.length) { window.alert('This payroll has no outstanding staff balance.'); return; }
  const select = el('select', {}, [
    ...lines.map((line) => el('option', { value: line.employeeId }, `${employeeLabel(line.employeeId)} — Outstanding ${formatCurrency(runOutstanding(run,line))}`)),
  ]);
  if (employeeId) select.value = employeeId;
  const amount = el('input', { type: 'number', min: 1, step: '1', placeholder: 'Amount to pay (₦)' });
  const date = el('input', { type: 'date' }); date.value = todayISOString();
  const reference = el('input', { type: 'text', placeholder: 'Bank transfer reference (optional)' });
  const note = el('textarea', { placeholder: 'Payment note (optional)' });
  const setSuggestedAmount = () => { const line = lines.find((item) => item.employeeId === select.value); amount.max = String(runOutstanding(run,line)); amount.value = String(runOutstanding(run,line)); };
  select.addEventListener('change', setSuggestedAmount); setSuggestedAmount();
  openCustomModal({ title: `Record payroll payment — ${formatMonthLong(run.month)}`, wide: true, build: (container) => {
    const field = (label,node) => el('label',{class:'field'},[el('span',{class:'field-label'},label),node]);
    container.appendChild(el('div',{class:'notice notice-info'},'Enter the amount actually transferred. You can record another instalment later.'));
    container.appendChild(field('Staff member',select));
    container.appendChild(field('Amount paid (₦)',amount));
    container.appendChild(field('Payment date',date));
    container.appendChild(field('Bank reference',reference));
    container.appendChild(field('Payment note',note));
    const actions=el('div',{class:'modal-actions'},[el('button',{type:'button',class:'btn btn-ghost',onClick:closeModal},'Cancel')]);
    const saveBtn=el('button',{type:'button',class:'btn btn-primary'},'Record payment');
    saveBtn.addEventListener('click',async()=>{
      const line=lines.find((item)=>item.employeeId===select.value), value=Number(amount.value||0);
      if(!line||value<=0||value>runOutstanding(run,line)){window.alert('Enter an amount within the outstanding balance.');return;}
      if(!date.value){window.alert('Select the payment date.');return;}
      try{
        saveBtn.disabled=true;saveBtn.textContent='Recording…';
        await store.recordPayrollPayment({payrollRunId:run.id,employeeId:line.employeeId,amount:value,paymentDate:date.value,reference:reference.value.trim()||null,note:note.value.trim()||null});
        await Promise.all([store.refreshCollection('payrollRuns'),store.refreshCollection('expenses')]);
        closeModal();onSaved();
      }catch(error){window.alert(error.message||'Could not record this payment.');saveBtn.disabled=false;saveBtn.textContent='Record payment';}
    });
    actions.appendChild(saveBtn);container.appendChild(actions);
  }});
}

export function renderPayroll(container, { mode = 'preparation' } = {}) {
  container.innerHTML = '';
  const current = getCurrentUser() || {};
  const tier = current.accessTier || 'Staff';
  const isAccountsQueue = mode === 'accounts';
  const canPrepare = !isAccountsQueue && tier === 'Admin' && !isCEO();
  const canReview = !isAccountsQueue && isCEO();
  const canPay = isAccountsQueue && tier === 'Accounts' && isAccounts();
  const addBtn = canPrepare ? el('button', { class:'btn btn-primary', onClick:()=>openRunForm(null,refresh) }, '+ Prepare payroll') : null;
  container.appendChild(sectionHeader(isAccountsQueue ? 'Payroll Payments' : 'Payroll Preparation',
    isAccountsQueue ? 'Approved payroll appears here. Record the amount actually paid to each staff member; the ERP tracks instalments and outstanding balances.' :
      'HR prepares the monthly payroll and submits it. After submission it is view-only for HR until the CEO returns or approves it.', addBtn));

  const summary = el('div'); container.appendChild(summary);
  if (isAccountsQueue) {
    const table = el('div'); container.appendChild(table);
    function refresh() {
      const runs=store.get('payrollRuns').filter((run)=>['Approved','PartiallyPaid'].includes(run.status)).slice().sort((a,b)=>b.month.localeCompare(a.month));
      const paid=runs.reduce((sum,run)=>sum+run.lines.reduce((lineSum,line)=>lineSum+Number(line.amountPaid||0),0),0);
      const outstanding=runs.reduce((sum,run)=>sum+run.lines.reduce((lineSum,line)=>lineSum+runOutstanding(run,line),0),0);
      summary.innerHTML='';
      summary.appendChild(el('div',{class:'stats-grid'},[
        statCard({label:'Approved payrolls',value:String(runs.length)}),
        statCard({label:'Total paid',value:formatCurrency(paid),tone:'good'}),
        statCard({label:'Outstanding',value:formatCurrency(outstanding),tone:outstanding?'warning':'good'}),
      ]));
      const rows=runs.flatMap((run)=>run.lines.map((line)=>({run,line})));
      renderTable(table,{columns:[
        {key:'month',label:'Pay period',render:(row)=>formatMonthLong(row.run.month)},
        {key:'employee',label:'Staff',render:(row)=>employeeLabel(row.line.employeeId)},
        {key:'approved',label:'Approved',render:(row)=>formatCurrency(netPay(row.line))},
        {key:'paid',label:'Paid',render:(row)=>formatCurrency(row.line.amountPaid||0)},
        {key:'percent',label:'Paid',render:(row)=>`${netPay(row.line)?Math.min(100,Math.round((Number(row.line.amountPaid||0)/netPay(row.line))*100)):0}%`},
        {key:'balance',label:'Outstanding',render:(row)=>formatCurrency(runOutstanding(row.run,row.line))},
        {key:'history',label:'Payment history',render:(row)=>paymentHistoryView(row.run.id,row.line.employeeId)},
        {key:'action',label:'',render:(row)=>canPay&&runOutstanding(row.run,row.line)>0?el('button',{type:'button',class:'btn btn-primary btn-sm',onClick:()=>openPaymentForm(row.run,row.line.employeeId,refresh)},'Record payment'):el('span',{class:'muted'},'View')},
      ],rows,emptyText:'No approved payrolls are waiting for payment.'});
    }
    refresh();return;
  }

  const table=el('div');container.appendChild(table);
  const balanceHeading=el('h3',{class:'subsection-title'},'Staff salary balances');
  container.appendChild(balanceHeading);
  const balances=el('div');container.appendChild(balances);
  function refresh(){
    const rows=store.get('payrollRuns').slice().sort((a,b)=>b.month.localeCompare(a.month));
    const pending=rows.filter((run)=>run.status==='Submitted').length;
    const drafts=rows.filter((run)=>run.status==='Draft').length;
    const awaiting=rows.filter((run)=>['Approved','PartiallyPaid'].includes(run.status)).length;
    const paid=rows.filter((run)=>PAYABLE_PAYROLL_STATUSES.has(run.status)).reduce((sum,run)=>sum+run.lines.reduce((lineSum,line)=>lineSum+Number(line.amountPaid||0),0),0);
    summary.innerHTML='';
    summary.appendChild(el('div',{class:'stats-grid'},[
      statCard({label:'Drafts',value:String(drafts)}),
      statCard({label:'Awaiting CEO approval',value:String(pending),tone:pending?'warning':'good'}),
      statCard({label:'Awaiting / in payment',value:String(awaiting)}),
      statCard({label:'Paid to date',value:formatCurrency(paid),tone:'good'}),
    ]));
    renderTable(table,{columns:[
      {key:'month',label:'Pay period',render:(run)=>formatMonthLong(run.month)},
      {key:'employees',label:'Staff',render:(run)=>String(run.lines.length)},
      {key:'total',label:'Net payroll',render:(run)=>formatCurrency(runTotal(run))},
      {key:'status',label:'Status',render:(run)=>statusPill(payrollStatusLabel(run.status))},
      {key:'actions',label:'',render:(run)=>{
        const buttons=[];
        if(run.status==='Submitted'&&canReview)buttons.push(el('button',{type:'button',class:'btn btn-primary btn-sm',onClick:()=>openRunForm(run,refresh,{review:true})},'Review & approve'));
        else if(['Draft','Returned'].includes(run.status)&&canPrepare)buttons.push(el('button',{type:'button',class:'btn btn-primary btn-sm',onClick:()=>openRunForm(run,refresh)},run.status==='Returned'?'Correct & resubmit':'Edit draft'));
        else buttons.push(el('button',{type:'button',class:'btn btn-ghost btn-sm',onClick:()=>openReadOnlyRun(run,refresh)},'View'));
        if(run.status==='Draft'&&canPrepare)buttons.push(el('button',{type:'button',class:'btn btn-ghost btn-sm',onClick:async()=>{if(!confirmDelete(`Draft payroll for ${formatMonthLong(run.month)}`))return;try{await store.remove('payrollRuns',run.id);await store.refreshCollection('payrollRuns');refresh();}catch(error){window.alert(error.message||'Could not delete this draft.');}}},'Delete draft'));
        return el('div',{class:'action-buttons'},buttons);
      }},
    ],rows,emptyText:'No payroll runs yet. Prepare the monthly salaries from active staff records.'});
    const approvedRuns=rows.filter((run)=>PAYABLE_PAYROLL_STATUSES.has(run.status));
    const employeeIds=[...new Set(approvedRuns.flatMap((run)=>run.lines.map((line)=>line.employeeId)))];
    const balanceRows=employeeIds.map((employeeId)=>{
      const earned=approvedRuns.flatMap((run)=>run.lines).filter((line)=>line.employeeId===employeeId).reduce((sum,line)=>sum+netPay(line),0);
      const paidAmount=approvedRuns.flatMap((run)=>run.lines).filter((line)=>line.employeeId===employeeId).reduce((sum,line)=>sum+Number(line.amountPaid||0),0);
      return{id:employeeId,earned,paid:paidAmount,balance:earned-paidAmount,percent:earned?Math.min(100,Math.round(paidAmount/earned*100)):0};
    }).filter((row)=>row.earned>0);
    renderTable(balances,{columns:[
      {key:'staff',label:'Staff',render:(row)=>employeeLabel(row.id)},
      {key:'earned',label:'Approved',render:(row)=>formatCurrency(row.earned)},
      {key:'paid',label:'Paid',render:(row)=>formatCurrency(row.paid)},
      {key:'percent',label:'Paid',render:(row)=>`${row.percent}%`},
      {key:'balance',label:'Outstanding',render:(row)=>el('strong',{class:row.balance?'text-critical':'text-good'},formatCurrency(row.balance))},
      {key:'action',label:'',render:(row)=>el('button',{type:'button',class:'icon-btn',title:'Print salary statement',onClick:()=>printSalaryStatement(employeeNameOnly(row.id),salaryStatementRows(row.id))},[ico('printer')])},
    ],rows:balanceRows,emptyText:'No approved salary balances yet.'});
  }
  refresh();
}
