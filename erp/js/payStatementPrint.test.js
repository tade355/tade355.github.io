import test from 'node:test';
import assert from 'node:assert/strict';
import {payStatementHtml,printPersonalPay} from './payStatementPrint.js';
import {payStatementPeriod} from './payStatement.js';
test('payslip excludes estimates and escapes names and references',()=>{
 const s=payStatementPeriod([{id:'<script>',date:'2026-11-01',period:'November',type:'Salary',earned:100000,paid:40000},
 {id:'estimate',date:'2026-11-02',period:'Work',type:'Allowance estimate',earned:30000,paid:0,estimated:true}],'2026-11');
 const html=payStatementHtml({id:'A',name:'<img onerror=bad>'},s,true);
 assert.match(html,/MONTHLY PAYSLIP/);assert.match(html,/60,000/);assert.doesNotMatch(html,/<script>|<img onerror=bad>|estimate<\/td>/);
 assert.match(html,/&lt;img onerror=bad&gt;/);assert.match(html,/&lt;script&gt;/);
 const full=payStatementHtml({id:'A',name:'Person'},s);
 assert.match(full,/not yet approved/);assert.match(full,/90,000/);
});
test('print action writes the statement and invokes browser printing',()=>{
 let printed=0; const area={innerHTML:''};
 globalThis.document={getElementById:id=>{assert.equal(id,'printArea');return area;}};
 globalThis.window={print:()=>printed++};
 printPersonalPay({id:'A',name:'Person'},payStatementPeriod([]));
 assert.equal(printed,1);assert.match(area.innerHTML,/PAY & ALLOWANCES STATEMENT/);
 delete globalThis.document; delete globalThis.window;
});

