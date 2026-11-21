-- Migrate every historical text reference so weekly reports and linked records use current dozer names.
do $$
declare
  c record;
begin
  for c in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('text','character varying','character')
  loop
    begin
      execute format(
        'update %I.%I set %I = case
           when %I = %L then %L
           when %I = %L then %L
           else %I end
         where %I in (%L,%L)',
        c.table_schema, c.table_name, c.column_name,
        c.column_name, 'Ogbomo Dozer (Pastor)', 'Pastor (Osaro)',
        c.column_name, 'Ogbomo (Saheed)', 'Saheed (Osaro)',
        c.column_name, c.column_name,
        'Ogbomo Dozer (Pastor)', 'Ogbomo (Saheed)'
      );
    exception when undefined_table or insufficient_privilege then
      null;
    end;
  end loop;
end $$;
