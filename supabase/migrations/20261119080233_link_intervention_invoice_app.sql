create or replace function public.app_get_intervention_invoice_source(p_ticket_id bigint, p_fisa_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, contabilitate
as $function$
declare
  v_ticket jsonb;
  v_fisa jsonb;
  v_client jsonb;
begin
  if auth.uid() is distinct from '18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid then
    raise exception 'Acces neautorizat';
  end if;

  select to_jsonb(t), to_jsonb(f), to_jsonb(c)
    into v_ticket, v_fisa, v_client
  from public.deranjamente t
  join public.fise_interventie f on f.deranjament_id = t.id
  left join public.clients c on c.id = t.client_id
  where t.id = p_ticket_id and f.id = p_fisa_id;

  if v_fisa is null then
    raise exception 'Fișa de intervenție nu aparține tichetului selectat.';
  end if;

  return jsonb_build_object('ticket', v_ticket, 'fisa', v_fisa, 'client', v_client);
end;
$function$;

create or replace function public.app_issue_intervention_invoice(
  p_client jsonb,
  p_linii jsonb,
  p_data date,
  p_scadenta date,
  p_observatii text,
  p_ticket_id bigint,
  p_fisa_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, contabilitate
as $function$
declare
  v_ticket_id bigint;
  v_facturat boolean;
  v_existing_numar text;
  v_invoice jsonb;
  v_invoice_id uuid;
begin
  if auth.uid() is distinct from '18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid then
    raise exception 'Acces neautorizat';
  end if;

  select f.deranjament_id, f.facturat, f.factura_numar
    into v_ticket_id, v_facturat, v_existing_numar
  from public.fise_interventie f
  where f.id = p_fisa_id
  for update;

  if v_ticket_id is null or v_ticket_id <> p_ticket_id then
    raise exception 'Fișa de intervenție nu aparține tichetului selectat.';
  end if;

  if coalesce(v_facturat, false) or nullif(trim(v_existing_numar), '') is not null then
    raise exception 'Fișa este deja marcată ca facturată. Verifică numărul facturii înainte de o nouă emitere.';
  end if;

  if exists (
    select 1 from contabilitate.facturi_surse s
    where s.fisa_interventie_id = p_fisa_id
  ) then
    raise exception 'Există deja o factură asociată acestei fișe.';
  end if;

  v_invoice := contabilitate.emite_factura(p_client, p_linii, p_data, p_scadenta, p_observatii);
  v_invoice_id := (v_invoice->>'id')::uuid;

  insert into contabilitate.facturi_surse(factura_id, tichet_id, fisa_interventie_id)
  values (v_invoice_id, p_ticket_id, p_fisa_id);

  update public.fise_interventie
  set facturat = true,
      factura_serie = v_invoice->>'serie',
      factura_numar = v_invoice->>'numar',
      factura_data = now(),
      factura_link = 'https://factura.service-electric.ro/?invoice_id=' || v_invoice_id::text,
      updated_at = now()
  where id = p_fisa_id;

  return v_invoice || jsonb_build_object(
    'ticket_id', p_ticket_id,
    'fisa_id', p_fisa_id,
    'factura_link', 'https://factura.service-electric.ro/?invoice_id=' || v_invoice_id::text
  );
end;
$function$;

revoke all on function public.app_get_intervention_invoice_source(bigint,bigint) from public, anon;
grant execute on function public.app_get_intervention_invoice_source(bigint,bigint) to authenticated;
revoke all on function public.app_issue_intervention_invoice(jsonb,jsonb,date,date,text,bigint,bigint) from public, anon;
grant execute on function public.app_issue_intervention_invoice(jsonb,jsonb,date,date,text,bigint,bigint) to authenticated;
