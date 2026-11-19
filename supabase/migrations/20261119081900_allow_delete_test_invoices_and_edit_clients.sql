create or replace function public.app_save_client(p_client jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','contabilitate'
as $function$
declare r contabilitate.clienti; v_id uuid;
begin
 if auth.uid() is distinct from '18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid then raise exception 'Acces neautorizat'; end if;
 if nullif(trim(p_client->>'denumire'),'') is null then raise exception 'Completează denumirea clientului.'; end if;
 v_id := nullif(p_client->>'id','')::uuid;
 if v_id is not null then
  update contabilitate.clienti set tip_client=coalesce(nullif(p_client->>'tip_client',''),'firma'),denumire=trim(p_client->>'denumire'),cui=nullif(trim(p_client->>'cui'),''),nr_reg_com=nullif(trim(p_client->>'nr_reg_com'),''),adresa=nullif(trim(p_client->>'adresa'),''),email=nullif(trim(p_client->>'email'),''),telefon=nullif(trim(p_client->>'telefon'),''),updated_at=now()
  where id=v_id returning * into r;
  if not found then raise exception 'Clientul nu a fost găsit.'; end if;
 else
  insert into contabilitate.clienti(tip_client,denumire,cui,nr_reg_com,adresa,email,telefon,tara)
  values(coalesce(nullif(p_client->>'tip_client',''),'firma'),trim(p_client->>'denumire'),nullif(trim(p_client->>'cui'),''),nullif(trim(p_client->>'nr_reg_com'),''),nullif(trim(p_client->>'adresa'),''),nullif(trim(p_client->>'email'),''),nullif(trim(p_client->>'telefon'),''),coalesce(nullif(trim(p_client->>'tara'),''),'România')) returning * into r;
 end if;
 return to_jsonb(r);
end;
$function$;

create or replace function public.app_delete_test_invoice(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','contabilitate'
as $function$
declare v_invoice contabilitate.facturi%rowtype; v_source record;
begin
 if auth.uid() is distinct from '18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid then raise exception 'Acces neautorizat'; end if;
 select * into v_invoice from contabilitate.facturi where id=p_id for update;
 if not found then raise exception 'Factura nu a fost găsită.'; end if;
 if v_invoice.status not in ('ciorna','emisa') then raise exception 'Se pot șterge doar facturi de test neemise în SPV.'; end if;
 if nullif(trim(coalesce(v_invoice.xml_e_factura,'')),'') is not null or nullif(trim(coalesce(v_invoice.id_descarcare_anaf,'')),'') is not null or v_invoice.trimisa_anaf_la is not null or nullif(trim(coalesce(v_invoice.status_anaf,'')),'') is not null then
  raise exception 'Factura are date ANAF/SPV și nu poate fi ștearsă din aplicație.';
 end if;
 if exists(select 1 from contabilitate.incasari i where i.factura_id=p_id) then raise exception 'Factura are încasări asociate și nu poate fi ștearsă.'; end if;
 for v_source in select fisa_interventie_id from contabilitate.facturi_surse where factura_id=p_id and fisa_interventie_id is not null loop
  update public.fise_interventie f set facturat=false,factura_serie=null,factura_numar=null,factura_link=null,factura_data=null,factura_spv_status=null,factura_spv_sent_at=null,updated_at=now()
  where f.id=v_source.fisa_interventie_id and f.factura_serie=v_invoice.serie and f.factura_numar=v_invoice.numar::text
  and not exists(select 1 from contabilitate.facturi_surse s join contabilitate.facturi other_invoice on other_invoice.id=s.factura_id where s.fisa_interventie_id=f.id and s.factura_id<>p_id and other_invoice.status<>'anulata');
 end loop;
 delete from contabilitate.facturi where id=p_id;
 return jsonb_build_object('deleted',true,'id',p_id,'serie',v_invoice.serie,'numar',v_invoice.numar,'sequence_reused',false);
end;
$function$;

revoke all on function public.app_save_client(jsonb) from public, anon;
grant execute on function public.app_save_client(jsonb) to authenticated;
revoke all on function public.app_delete_test_invoice(uuid) from public, anon;
grant execute on function public.app_delete_test_invoice(uuid) to authenticated;
