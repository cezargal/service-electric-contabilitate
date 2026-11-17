create or replace function public.app_sync_oblio_collections_to_rjip(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'contabilitate'
as $function$
declare
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is distinct from '18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid then
    raise exception 'Acces neautorizat';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 370 then
    raise exception 'Interval de date invalid (maximum 371 zile).';
  end if;

  with source_rows as (
    select
      i.id_extern,
      i.data_incasarii,
      i.suma,
      coalesce(nullif(i.metoda,''),'Nespecificată') as metoda,
      i.payload,
      d.serie,
      d.numar,
      d.client_denumire,
      concat_ws('|',
        coalesce(d.serie,''),
        coalesce(d.numar,''),
        to_char(i.data_incasarii,'YYYY-MM-DD'),
        coalesce(nullif(i.metoda,''),'Nespecificată'),
        coalesce(i.payload->>'seriesName',''),
        coalesce(i.payload->>'documentNumber',''),
        to_char(i.suma,'FM999999999990.0000'),
        '0'
      ) as source_key
    from contabilitate.incasari_importate i
    join contabilitate.documente_importate d
      on d.sursa = i.sursa and d.id_extern = i.document_id_extern
    where i.sursa='oblio'
      and i.data_incasarii between p_from and p_to
      and coalesce(i.suma,0) > 0
      and coalesce(d.serie,'') <> ''
      and coalesce(d.numar,'') <> ''
  ),
  inserted as (
    insert into public.operatiuni_financiare (
      data_operatiunii, tip, categorie, descriere, contraparte, suma,
      metoda_plata, document_tip, document_serie, document_numar,
      document_data, factura_serie, factura_numar, sursa, cheie_sursa,
      deductibilitate_pct, note, stare_verificare
    )
    select
      (s.data_incasarii::timestamp at time zone 'UTC') + interval '12 hours',
      'incasare',
      'Servicii și intervenții',
      'Încasare factură ' || s.serie || ' ' || s.numar,
      s.client_denumire,
      s.suma,
      s.metoda,
      'Factură',
      s.serie,
      s.numar,
      s.data_incasarii,
      s.serie,
      s.numar,
      'oblio',
      s.source_key,
      0,
      'Import sincronizat din Oblio; necesită verificare în RJIP. ID încasare: ' || s.id_extern,
      'in_asteptare'
    from source_rows s
    where not exists (
      select 1
      from public.operatiuni_financiare o
      where o.tip = 'incasare'
        and coalesce(nullif(o.factura_serie,''), nullif(o.document_serie,'')) is not distinct from s.serie
        and coalesce(nullif(o.factura_numar,''), nullif(o.document_numar,'')) is not distinct from s.numar
        and o.data_operatiunii::date = s.data_incasarii
        and o.suma = s.suma
        and lower(translate(coalesce(o.metoda_plata,''),'ăâîșț','aaist')) = lower(translate(coalesce(s.metoda,''),'ăâîșț','aaist'))
        and (o.factura_serie is not null or lower(coalesce(o.document_tip,'')) in ('factura','factură'))
    )
    on conflict (sursa, cheie_sursa) where cheie_sursa is not null do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  select count(*) into v_skipped
  from contabilitate.incasari_importate i
  where i.sursa='oblio' and i.data_incasarii between p_from and p_to;

  return jsonb_build_object('inserted',v_inserted,'checked',v_skipped,'totalInserted',
    (select coalesce(sum(suma),0) from public.operatiuni_financiare
     where sursa='oblio' and stare_verificare='in_asteptare'
       and data_operatiunii::date between p_from and p_to));
end;
$function$;
