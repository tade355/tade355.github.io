begin;
do $tests$
declare r jsonb; data jsonb;
begin
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 data:=jsonb_build_object('kind','Fuel','project','Test Site A','station','Test station','collector','Test collector','supplyMethod','Station credit',
   'supplyDate',current_date,'expiresOn',current_date,'lines',jsonb_build_array(jsonb_build_object('id','one','product','Diesel','purpose','Production','quantity',100,'unitPrice',10)));
 r:=fuel_workflow_command('TEST-FUEL','submit',data,'submit-test');
 if r->>'status'<>'Submitted' then raise exception 'Submission failed'; end if;
 -- Retry the same request without duplicating it.
 perform fuel_workflow_command('TEST-FUEL','submit',data,'submit-test');
 if (select count(*) from fuel_workflows where id='TEST-FUEL')<>1 then raise exception 'Duplicate request on retry'; end if;
 begin
  perform fuel_workflow_command('TEST-FUEL','approve','{}','bad-approval');
  raise exception 'Manager unexpectedly approved fuel';
 exception when others then if sqlerrm not like 'Only the COO%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
 begin
  perform fuel_workflow_command('TEST-FUEL','collection','{}','wrong-project');
  raise exception 'Unrelated project accessed fuel';
 exception when others then if sqlerrm not like 'Request is outside%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000028',true);
 begin
  perform fuel_workflow_command('TEST-FUEL','approve','{}','ceo-not-approver');
  raise exception 'CEO unexpectedly approved fuel';
 exception when others then if sqlerrm not like 'Only the COO%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000026',true);
 perform fuel_workflow_command('TEST-FUEL','approve','{}','approve-test');
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 data:=jsonb_build_object('lineId','one','date',current_date,'quantity',40,'delivered',40,'unitPrice',10,'reference','test receipt');
 r:=fuel_workflow_command('TEST-FUEL','collection',data,'collect-test');
 perform fuel_workflow_command('TEST-FUEL','collection',data,'collect-test');
 if (select count(*) from fuel_credit_collections)<>1 then raise exception 'Collection duplicated on retry'; end if;
 if r->>'status'<>'Partially Collected' then raise exception 'Partial collection status missing'; end if;
 if (select payment_basis from fuel_credit_collections limit 1)<>'Credit' then raise exception 'Credit pickup was classified as cash'; end if;
 begin
  perform fuel_workflow_command('TEST-FUEL','collection',data||'{"quantity":61,"delivered":61}','collect-too-much');
  raise exception 'Overcollection allowed';
 exception when others then if sqlerrm not like 'Collection exceeds%' then raise; end if; end;
 begin
  perform fuel_workflow_command('TEST-FUEL','issue',jsonb_build_object('lineId','one','date',current_date,'quantity',41,'purpose','Production','equipment','Test dozer'),'issue-too-much');
  raise exception 'Stock overissue allowed';
 exception when others then if sqlerrm not like 'Issue exceeds%' then raise; end if; end;
 perform fuel_workflow_command('TEST-FUEL','issue',jsonb_build_object('lineId','one','date',current_date,'quantity',20,'purpose','Production','equipment','Test dozer'),'issue-test');
 if (select sum(litres) from diesel_site_distributions)<>20 then raise exception 'Diesel distribution not linked'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 data:=jsonb_build_object('amount',200,'date',current_date,'reference','test transfer');
 perform fuel_workflow_command('TEST-FUEL','payment',data,'pay-test');
 perform fuel_workflow_command('TEST-FUEL','payment',data,'pay-test');
 if (select count(*) from fuel_credit_payments)<>1 then raise exception 'Payment duplicated on retry'; end if;
 begin
  perform fuel_workflow_command('TEST-FUEL','payment',data||'{"amount":201}','pay-too-much');
  raise exception 'Overpayment allowed';
 exception when others then if sqlerrm not like 'Payment exceeds%' then raise; end if; end;
 if (select count(*) from expenses)<>0 then raise exception 'Fuel settlement created duplicate expense'; end if;
end $tests$;
-- Check actual RLS in addition to command permissions.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $tests$ begin
 if exists(select 1 from public.fuel_workflows) then raise exception 'RLS leaked another project'; end if;
 begin
  update public.fuel_workflows set status='Approved';
  raise exception 'Direct write unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $tests$;
reset role;
rollback;
select 'Fuel database tests passed' as result;
