// Run with @electric-sql/pglite available on NODE_PATH. No production connection.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const root = path.resolve(__dirname, '../erp/supabase');
const db = new PGlite({ extensions: { pgcrypto } });
let checks = 0;
async function count(sql) { return Number((await db.query(sql)).rows[0].n); }
async function rejected(fn, pattern) { await assert.rejects(fn, pattern); checks += 1; }
async function actor(id) { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-${String(id).padStart(12,'0')}', false); set role authenticated;`); }
async function save(row, items, create = true, stamp = null) {
  return db.query('select save_record_checked($1,$2::jsonb,$3,$4,$5::jsonb,$6,$7::timestamptz)',
    ['fund_requests', JSON.stringify(row), 'fund_request_items', 'fund_request_id', JSON.stringify(items), create, stamp]);
}
(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon, authenticated;`);
  const snapshotPath = process.env.ERP_SCHEMA_SNAPSHOT;
  if (snapshotPath) await require('./schema_fixture.cjs')(db,JSON.parse(fs.readFileSync(snapshotPath,'utf8')));
  for (const file of [...(snapshotPath?[]:['schema.sql','0024_tier_based_rls.sql','0040_machine_status_reports.sql']),'0041_data_safety.sql','0042_integrity_controls.sql','0043_scoped_access.sql']) {
    if (file === '0041_data_safety.sql') await db.exec(fs.readFileSync(path.join(root,'integrity_release_checkpoint.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(root,file),'utf8'));
  }
  // Supabase grants these schema/table privileges separately from RLS.
  await db.exec(`grant usage on schema public to anon, authenticated;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    grant usage,select on all sequences in schema public to authenticated;
    insert into employees(id,name,status,access_tier,assigned_project,auth_user_id,salary) values
      ('EA','Test Admin','Active','Admin','A','00000000-0000-0000-0000-000000000001',100),
      ('ES','Test Staff','Active','Staff','A','00000000-0000-0000-0000-000000000002',200),
      ('EV','Test Supervisor','Active','Supervisor','A','00000000-0000-0000-0000-000000000003',300),
      ('EC','Test Accounts','Active','Accounts',null,'00000000-0000-0000-0000-000000000004',400);
    insert into operations(id,date,site_name,hours_worked) values ('OA','2026-11-01','A',8),('OB','2026-11-01','B',8);`);
  await actor(2);
  assert.equal(await count('select count(*) n from employees'),1); checks++;
  assert.equal(await count('select count(*) n from employee_directory'),4); checks++;
  await rejected(() => db.query('select salary from employee_directory'), /does not exist/);
  await rejected(() => save({id:'BAD',date:'2026-11-01',submitted_by:'EA',status:'Pending'},[]), /own request|row-level security/);
  const row = {id:'FR1', date:'2026-11-01', project:'A', submitted_by:'ES', status:'Pending', description:'Test'};
  const items = [{description:'Part',amount:100}];
  await save(row, items);
  await rejected(() => save(row, items), /duplicate key/);
  await rejected(() => db.exec("update fund_requests set status = 'Approved' where id='FR1'"), /Only Admin|row-level security/);
  await actor(1);
  let current = (await db.query("select updated_at from fund_requests where id='FR1'")).rows[0].updated_at;
  const stamp = current instanceof Date ? current.toISOString() : current;
  await rejected(() => save({...row,description:'Must Roll Back'},[{description:'Invalid',amount:'not-a-number'}],false,stamp), /invalid input syntax/);
  assert.equal((await db.query("select description from fund_requests where id='FR1'")).rows[0].description,'Test'); checks++;
  assert.equal(await count("select count(*) n from fund_request_items where fund_request_id='FR1'"),1); checks++;
  await rejected(() => save(row,items,false,'2000-01-01'), /Record changed/);
  await db.exec("update fund_requests set status='Approved' where id='FR1'");
  await db.exec("update fund_request_items set amount=999 where fund_request_id='FR1'");
  assert.equal(Number((await db.query("select amount from fund_request_items where fund_request_id='FR1'")).rows[0].amount),100); checks++;
  await db.exec('reset role');
  await rejected(() => db.exec("update fund_request_items set amount=999 where fund_request_id='FR1'"), /Only Pending/);
  await actor(1);
  await rejected(() => db.exec("update fund_requests set description='Altered' where id='FR1'"), /locked/);
  await actor(4);
  await db.exec("update fund_requests set status='Paid',paid_at='2026-11-03' where id='FR1'");
  await rejected(() => db.exec("update fund_requests set date='2026-11-03' where id='FR1'"), /immutable/);
  await db.exec("delete from fund_requests where id='FR1'");
  assert.equal(await count("select count(*) n from fund_requests where id='FR1'"),1); checks++;
  await actor(3);
  assert.equal(await count('select count(*) n from operations'),1); checks++;
  await rejected(() => db.exec("insert into operations(id,date,site_name) values ('BAD','2026-11-01','B')"), /row-level security/);
  await actor(1);
  assert.ok(await count("select count(*) n from audit_log where table_name='fund_request_items'") > 0); checks++;
  assert.ok(await count("select count(*) n from audit_log where table_name='fund_requests'") > 0); checks++;
  await db.exec("insert into payroll_runs(id,month,status) values ('PR1','2026-11','Approved'),('PR2','2026-12','Draft'); insert into payroll_lines(payroll_run_id,employee_id,base_salary) values ('PR1','ES',100),('PR1','EA',200),('PR2','ES',300)");
  await actor(2);
  assert.equal(await count('select count(*) n from payroll_lines'),1); checks++;
  assert.equal((await db.query('select employee_id from payroll_lines')).rows[0].employee_id,'ES'); checks++;
  await rejected(() => db.exec("insert into payroll_lines(payroll_run_id,employee_id,base_salary) values ('PR1','ES',999)"), /row-level security/);
  await actor(1);
  await db.query('select save_record_checked($1,$2::jsonb,$3,$4,$5::jsonb,true,null)', ['payroll_runs',JSON.stringify({id:'PR3',month:'2027-01',status:'Draft'}),'payroll_lines','payroll_run_id',JSON.stringify([{employee_id:'ES',base_salary:100,bonus:0,deductions:0,amount_paid:0}])]);
  assert.equal(await count("select count(*) n from payroll_lines where payroll_run_id='PR3'"),1); checks++;
  for (const [table,row,child,fk,items] of [
    ['invoices',{id:'IT1',date:'2026-11-01'},'invoice_items','invoice_id',[{description:'Test',qty:1,price:10}]],
    ['purchase_orders',{id:'PT1',date:'2026-11-01'},'purchase_order_items','purchase_order_id',[{description:'Test',qty:1,price:10}]],
    ['machine_status_reports',{id:'MT1',date:'2026-11-01',project:'A'},'machine_status_report_lines','report_id',[{equipment:'Test Machine',status:'Active'}]],
    ['dozer_payroll_runs',{id:'DT1',period_start:'2026-11-01',period_end:'2026-11-02'},'dozer_payroll_lines','dozer_payroll_run_id',[{employee_id:'ES',days_worked:0.625,day_rate:100}]],
  ]) {
    await db.query('select save_record_checked($1,$2::jsonb,$3,$4,$5::jsonb,true,null)',[table,JSON.stringify(row),child,fk,JSON.stringify(items)]);
    assert.equal(await count(`select count(*) n from ${child} where ${fk}='${row.id}'`),1); checks++;
  }
  await rejected(() => db.exec("select save_record_with_items('fund_requests','{}'::jsonb)"), /permission denied/);
  // Idempotent reapplication must also succeed.
  await db.exec('reset role');
  await db.exec("insert into employees(id,name,role,status,access_tier,auth_user_id) values ('EMP-1','Test Manager','General Manager/Site manager','Active','Supervisor','00000000-0000-0000-0000-000000000005'),('EU','Test Unassigned','Supervisor','Active','Supervisor','00000000-0000-0000-0000-000000000006')");
  for (const file of ['0042_integrity_controls.sql','0043_scoped_access.sql']) await db.exec(fs.readFileSync(path.join(root,file),'utf8'));
  checks++;
  await actor(5);
  assert.equal(await count('select count(*) n from operations'),2); checks++;
  await actor(6);
  assert.equal(await count('select count(*) n from operations'),0); checks++;
  await db.exec('reset role');
  await db.exec(fs.readFileSync(path.join(root,'integrity_release_rollback.sql'),'utf8'));
  assert.equal(await count("select count(*) n from fund_requests where id='FR1'"),1); checks++;
  assert.ok(await count("select count(*) n from audit_log") > 0); checks++;
  assert.equal(await count("select count(*) n from pg_policies where tablename='employees' and policyname='employees_select'"),1); checks++;
  assert.equal(await count("select count(*) n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_record_with_items'"),0); checks++;
  for (const file of ['0041_data_safety.sql','0042_integrity_controls.sql','0043_scoped_access.sql']) await db.exec(fs.readFileSync(path.join(root,file),'utf8'));
  checks++;
  console.log(`PASS: migrations apply and reapply; ${checks} database integrity and role checks passed. Synthetic data only.`);
  await db.close();
})().catch(async error => { console.error('FAIL:',error.stack); await db.close(); process.exitCode = 1; });

