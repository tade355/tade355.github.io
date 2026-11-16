-- Applied to production on 16 Nov 2026. Keep the generic save allowlist in sync
-- with the payment tables used by the ERP. Existing RLS still controls writers.
begin;
do $fix$
declare original text; revised text;
begin
  original := pg_get_functiondef('public.erp_save_mapping(text)'::regprocedure);
  if position('when ''fund_request_payments''' in original) = 0 then
    revised := replace(
      original,
      'select case p_table',
      'select case p_table when ''fund_request_payments'' then ''[]''::jsonb when ''payroll_payments'' then ''[]''::jsonb'
    );
    if revised = original then raise exception 'Save mapping format changed; no changes applied'; end if;
    execute revised;
  end if;
end $fix$;
-- The finance-only policy remains. This older permissive policy would
-- otherwise let non-finance roles use the newly permitted save target.
drop policy if exists operator_private_rows on public.fund_request_payments;
commit;