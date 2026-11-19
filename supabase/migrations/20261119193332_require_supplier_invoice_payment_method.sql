drop function if exists public.import_anaf_supplier_invoice_to_rjip(text,text,text,text,text,date,text,text,numeric,text,date,date);
create function public.import_anaf_supplier_invoice_to_rjip(
 p_secret text,p_cif text,p_message_id text,p_invoice_number text,p_invoice_series text,p_invoice_date date,
 p_supplier text,p_supplier_cif text,p_total numeric,p_courier_receipt text,p_courier_date date,p_payment_date date,p_payment_method text
)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','contabilitate'
as $function$
declare existing_id bigint; new_id bigint; detail_note text; normalized_method text;
begin
 if not exists(select 1 from contabilitate.anaf_oauth_credentials where id=true and shared_secret=p_secret) then raise exception 'unauthorized'; end if;
 if p_total is null or p_total<=0 then raise exception 'invalid_invoice_total'; end if;
 if p_payment_date is null then raise exception 'payment_date_required'; end if;
 if p_payment_method not in ('numerar','card','banca','ordin de plata','alta') then raise exception 'payment_method_required'; end if;
 normalized_method:=case p_payment_method when 'alta' then 'alta metoda' else p_payment_method end;
 select id into existing_id from public.operatiuni_financiare where sursa='anaf_spv' and cheie_sursa=p_cif||':'||p_message_id limit 1;
 if existing_id is not null then return jsonb_build_object('id',existing_id,'duplicate',true); end if;
 detail_note:='Import ANAF SPV. ID mesaj: '||p_message_id||'. Metoda de plată: '||p_payment_method||'. Bon curier: '||coalesce(p_courier_receipt,'necompletat')||'. Data bon curier: '||coalesce(p_courier_date::text,'necompletată')||'. Data plății efective: '||p_payment_date::text||'. Factură importată pentru verificare.';
 insert into public.operatiuni_financiare(data_operatiunii,tip,categorie,descriere,contraparte,suma,metoda_plata,document_tip,document_serie,document_numar,document_data,factura_serie,factura_numar,sursa,cheie_sursa,deductibilitate_pct,note,stare_verificare)
 values(p_payment_date::timestamptz,'plata','Furnizori / facturi','Factura furnizor '||coalesce(p_invoice_series||' ','')||coalesce(p_invoice_number,'')||' · ANAF SPV',p_supplier,p_total,normalized_method,'Factură furnizor',p_invoice_series,p_invoice_number,p_invoice_date,p_invoice_series,p_invoice_number,'anaf_spv',p_cif||':'||p_message_id,100,detail_note,'in_asteptare')
 on conflict(sursa,cheie_sursa) where cheie_sursa is not null do nothing returning id into new_id;
 if new_id is null then select id into new_id from public.operatiuni_financiare where sursa='anaf_spv' and cheie_sursa=p_cif||':'||p_message_id limit 1; end if;
 return jsonb_build_object('id',new_id,'duplicate',false);
end;
$function$;
revoke all on function public.import_anaf_supplier_invoice_to_rjip(text,text,text,text,text,date,text,text,numeric,text,date,date,text) from public,anon;
grant execute on function public.import_anaf_supplier_invoice_to_rjip(text,text,text,text,text,date,text,text,numeric,text,date,date,text) to authenticated;
