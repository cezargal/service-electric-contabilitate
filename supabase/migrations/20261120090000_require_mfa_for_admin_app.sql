-- Require an MFA-verified (AAL2) session for invoice and administrator access.
-- The app still allows the user to enroll their first TOTP factor before reaching protected data.
create or replace function public.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
     and exists(
       select 1 from public.staff_users
       where user_id=auth.uid() and role='admin' and active=true
     );
$function$;

-- Require AAL2 in all existing owner-only invoice RPCs, including the invoice issuer.
do $mfa$
declare
  f record;
  definition text;
  updated_definition text;
  old_guard text := 'if auth.uid() is distinct from ''18bd609e-4ad7-4896-bb6a-b5a1358f7495''::uuid then';
  new_guard text := 'if auth.uid() is distinct from ''18bd609e-4ad7-4896-bb6a-b5a1358f7495''::uuid or coalesce(auth.jwt()->>''aal'',''aal1'') <> ''aal2'' then';
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','contabilitate')
      and p.prosecdef
      and position('18bd609e-4ad7-4896-bb6a-b5a1358f7495' in p.prosrc)>0
  loop
    definition := pg_get_functiondef(f.oid);
    updated_definition := replace(definition, old_guard, new_guard);
    if updated_definition = definition then
      raise exception 'Nu am putut adăuga verificarea MFA pentru funcția %', f.oid::regprocedure;
    end if;
    execute updated_definition;
  end loop;
end
$mfa$;

-- Also require AAL2 for direct RLS access to invoice data.
drop policy if exists owner_only on contabilitate.clienti;
create policy owner_only on contabilitate.clienti for all to authenticated
  using (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists documente_importate_owner on contabilitate.documente_importate;
create policy documente_importate_owner on contabilitate.documente_importate for all to authenticated
  using (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists owner_only on contabilitate.facturi;
create policy owner_only on contabilitate.facturi for all to authenticated
  using (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists owner_only on contabilitate.incasari;
create policy owner_only on contabilitate.incasari for all to authenticated
  using (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists incasari_importate_owner on contabilitate.incasari_importate;
create policy incasari_importate_owner on contabilitate.incasari_importate for all to authenticated
  using (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists owner_only on contabilitate.linii_factura;
create policy owner_only on contabilitate.linii_factura for all to authenticated
  using (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists owner_only on contabilitate.serii_documente;
create policy owner_only on contabilitate.serii_documente for all to authenticated
  using (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (auth.uid()='18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid and coalesce(auth.jwt()->>'aal','aal1')='aal2');

-- Payment records are accessed directly from the application, outside the invoice RPCs.
drop policy if exists anaf_supplier_payments_insert_own on public.anaf_supplier_payments;
create policy anaf_supplier_payments_insert_own on public.anaf_supplier_payments for insert to authenticated
  with check (created_by=auth.uid() and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists anaf_supplier_payments_select_own on public.anaf_supplier_payments;
create policy anaf_supplier_payments_select_own on public.anaf_supplier_payments for select to authenticated
  using (created_by=auth.uid() and coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists anaf_supplier_payments_update_own on public.anaf_supplier_payments;
create policy anaf_supplier_payments_update_own on public.anaf_supplier_payments for update to authenticated
  using (created_by=auth.uid() and coalesce(auth.jwt()->>'aal','aal1')='aal2')
  with check (created_by=auth.uid() and coalesce(auth.jwt()->>'aal','aal1')='aal2');
