create or replace function public.app_list_oblio_imports()
returns jsonb language plpgsql security definer set search_path to 'public','contabilitate'
as $function$
begin
 if auth.uid() is distinct from '18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid then raise exception 'Acces neautorizat'; end if;
 return jsonb_build_object(
  'documents',(select coalesce(jsonb_agg(jsonb_build_object('id_extern',id_extern,'serie',serie,'numar',numar,'data_document',data_document,'client_denumire',client_denumire,'client_cui',client_cui,'total',total,'status',status) order by data_document desc),'[]'::jsonb) from (select * from contabilitate.documente_importate where sursa='oblio' order by data_document desc limit 500) d),
  'collectionsList',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'id_extern',i.id_extern,'document_id_extern',i.document_id_extern,
    'data_incasarii',i.data_incasarii,'suma',i.suma,'metoda',i.metoda,'referinta',i.referinta,
    'serie',d.serie,'numar',d.numar,'client_denumire',d.client_denumire,'client_cui',d.client_cui
  ) order by i.data_incasarii desc nulls last,i.importat_la desc),'[]'::jsonb)
   from (select * from contabilitate.incasari_importate where sursa='oblio' order by data_incasarii desc nulls last,importat_la desc limit 500) i
   left join contabilitate.documente_importate d on d.sursa=i.sursa and d.id_extern=i.document_id_extern),
  'clients',(select count(*) from contabilitate.clienti where oblio_client_id is not null),
  'collections',(select count(*) from contabilitate.incasari_importate where sursa='oblio')
 );
end
$function$;
revoke all on function public.app_list_oblio_imports() from public,anon;
grant execute on function public.app_list_oblio_imports() to authenticated;
