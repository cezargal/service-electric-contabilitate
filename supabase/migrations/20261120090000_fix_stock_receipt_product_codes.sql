-- Recover real supplier item codes embedded in invoice descriptions and stop inventing SPV-prefixed codes.
update public.receptii_stoc r
set product_code = (regexp_match(r.product_name, '^[[:space:]]*([A-Za-z0-9][A-Za-z0-9._/-]{2,})[[:space:]]*[-–][[:space:]]*'))[1]
where r.product_code is null
  and r.product_name ~ '^[[:space:]]*[A-Za-z0-9][A-Za-z0-9._/-]{2,}[[:space:]]*[-–][[:space:]]*';

update public.produse_catalog p
set cod = c.real_code, updated_at = now()
from (
  select distinct on (r.product_id)
    r.product_id,
    (regexp_match(r.product_name, '^[[:space:]]*([A-Za-z0-9][A-Za-z0-9._/-]{2,})[[:space:]]*[-–][[:space:]]*'))[1] as real_code
  from public.receptii_stoc r
  where r.product_code is not null
  order by r.product_id, r.created_at desc
) c
where p.id = c.product_id
  and p.cod like 'SPV-%'
  and not exists (select 1 from public.produse_catalog other where other.cod=c.real_code and other.id<>p.id);

create or replace function public.app_register_supplier_stock_receipt(
  p_anaf_cif text,
  p_anaf_message_id text,
  p_line_index integer,
  p_invoice_series text,
  p_invoice_number text,
  p_invoice_date date,
  p_supplier_name text,
  p_supplier_cif text,
  p_product_name text,
  p_product_code text,
  p_measuring_unit text,
  p_category text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_purchase_date date,
  p_location text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id bigint;
  v_receipt_id bigint;
begin
  if auth.uid() is null or not public.is_staff_admin() then raise exception 'Acces neautorizat'; end if;
  if coalesce(trim(p_anaf_cif),'')='' or coalesce(trim(p_anaf_message_id),'')='' or p_line_index < 0 then raise exception 'Factura SPV sau poziția nu este validă'; end if;
  if coalesce(trim(p_product_name),'')='' or p_quantity is null or p_quantity<=0 or p_unit_cost is null or p_unit_cost<0 then raise exception 'Produsul, cantitatea sau costul nu sunt valide'; end if;
  if p_category not in ('material','consumabil') then raise exception 'Categoria nu este validă'; end if;

  perform pg_advisory_xact_lock(hashtext(p_anaf_cif||':'||p_anaf_message_id||':'||p_line_index));
  if exists(select 1 from public.receptii_stoc where anaf_cif=p_anaf_cif and anaf_message_id=p_anaf_message_id and line_index=p_line_index) then
    raise exception 'Poziția din factura SPV a fost deja recepționată';
  end if;

  if nullif(trim(p_product_code),'') is not null then
    select id into v_product_id from public.produse_catalog where cod=trim(p_product_code) for update;
  end if;
  if v_product_id is null then
    select id into v_product_id from public.produse_catalog where lower(trim(denumire))=lower(trim(p_product_name)) and activ=true order by id limit 1 for update;
  end if;
  if v_product_id is null then
    insert into public.produse_catalog(denumire,cod,pret_unitar,activ,stoc,stoc_minim)
    values(trim(p_product_name),nullif(trim(p_product_code),''),round(p_unit_cost,2),true,0,0)
    returning id into v_product_id;
  elsif nullif(trim(p_product_code),'') is not null then
    update public.produse_catalog set cod=trim(p_product_code),updated_at=now()
    where id=v_product_id and (cod is null or cod like 'SPV-%');
  end if;

  insert into public.receptii_stoc(cui_entitate,anaf_message_id,anaf_cif,invoice_series,invoice_number,invoice_date,supplier_name,supplier_cif,line_index,product_id,product_name,product_code,measuring_unit,categorie,quantity,unit_cost,purchase_date,location,notes,created_by)
  values('43594993',p_anaf_message_id,p_anaf_cif,p_invoice_series,p_invoice_number,p_invoice_date,p_supplier_name,p_supplier_cif,p_line_index,v_product_id,trim(p_product_name),nullif(trim(p_product_code),''),p_measuring_unit,p_category,p_quantity,p_unit_cost,coalesce(p_purchase_date,current_date),nullif(trim(p_location),''),nullif(trim(p_notes),''),auth.uid())
  returning id into v_receipt_id;

  insert into public.stoc_miscari(produs_id,tip,cantitate,motiv,created_by)
  values(v_product_id,'intrare',p_quantity,'Recepție factură SPV '||coalesce(p_invoice_series||' ','')||coalesce(p_invoice_number,p_anaf_message_id),auth.uid());

  update public.produse_catalog set stoc=coalesce(stoc,0)+p_quantity,pret_unitar=round(p_unit_cost,2),updated_at=now() where id=v_product_id;
  return jsonb_build_object('receipt_id',v_receipt_id,'product_id',v_product_id,'quantity',p_quantity,'product_code',nullif(trim(p_product_code),''));
end
$$;

revoke all on function public.app_register_supplier_stock_receipt(text,text,integer,text,text,date,text,text,text,text,text,text,numeric,numeric,date,text,text) from public;
grant execute on function public.app_register_supplier_stock_receipt(text,text,integer,text,text,date,text,text,text,text,text,text,numeric,numeric,date,text,text) to authenticated;
