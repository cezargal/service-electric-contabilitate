-- Keep two-factor enforcement scoped to the invoicing app; derangements share this admin predicate.
create or replace function public.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from public.staff_users
    where user_id=auth.uid() and role='admin' and active=true
  );
$function$;
