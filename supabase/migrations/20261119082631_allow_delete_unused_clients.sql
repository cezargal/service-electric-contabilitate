create or replace function public.app_delete_client(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','contabilitate'
as $function$
declare v_client contabilitate.clienti%rowtype;
begin
 if auth.uid() is distinct from '18bd609e-4ad7-4896-bb6a-b5a1358f7495'::uuid then raise exception 'Acces neautorizat'; end if;
 select * into v_client from contabilitate.clienti where id=p_id for update;
 if not found then raise exception 'Clientul nu a fost găsit.'; end if;
 if exists(select 1 from contabilitate.facturi where client_id=p_id) then
  raise exception 'Clientul este folosit de una sau mai multe facturi și nu poate fi șters.';
 end if;
 delete from contabilitate.clienti where id=p_id;
 return jsonb_build_object('deleted',true,'id',p_id);
end;
$function$;
revoke all on function public.app_delete_client(uuid) from public, anon;
grant execute on function public.app_delete_client(uuid) to authenticated;
