// Recreate the captured public schema locally, without production business data.
const quote = value => '"' + String(value).replaceAll('"','""') + '"';
module.exports = async function schemaFixture(db, snapshot) {
  const tables = [...new Set(snapshot.columns.map(c => c.table_name))];
  for (const table of tables) {
    const columns = snapshot.columns.filter(c => c.table_name === table).sort((a,b)=>a.ordinal_position-b.ordinal_position).map(c => {
      let type = c.udt_schema === 'pg_catalog' ? c.udt_name : quote(c.udt_schema)+'.'+quote(c.udt_name);
      if (c.character_maximum_length && ['varchar','bpchar'].includes(c.udt_name)) type += '('+Number(c.character_maximum_length)+')';
      return quote(c.column_name)+' '+type+(c.column_default ? ' default '+c.column_default : '')+(c.is_nullable==='NO'?' not null':'');
    });
    await db.exec('create table public.'+quote(table)+' ('+columns.join(',')+');');
  }
  // Referenced unique keys must exist before foreign keys.
  const constraints=[...snapshot.constraints].sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')));
  for(const c of constraints) await db.exec('alter table public.'+quote(c.table)+' add constraint '+quote(c.name)+' '+c.definition+';');
  for(const f of snapshot.functions) await db.exec(f.definition);
  for(const trigger of snapshot.triggers) await db.exec(trigger.definition);
  for(const state of snapshot.rls) if(state.enabled) await db.exec('alter table public.'+quote(state.table)+' enable row level security;');
  for(const p of snapshot.policies) {
    const roles = p.roles.map(r=>r==='public'?'PUBLIC':quote(r)).join(',');
    await db.exec('create policy '+quote(p.policyname)+' on public.'+quote(p.tablename)+' as '+p.permissive+' for '+p.cmd+' to '+roles+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':'')+';');
  }
};
