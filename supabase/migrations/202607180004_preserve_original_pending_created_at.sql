alter table public.orders
  add column if not exists original_pending_created_at timestamptz;

create or replace function public.remove_superseded_pending_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  original_created_at timestamptz;
begin
  if new.paid_at is null then
    return new;
  end if;

  select min(pending.created_at)
  into original_created_at
  from public.orders as pending
  where pending.id <> new.id
    and pending.created_at < new.created_at
    and pending.paid_at is null
    and lower(coalesce(pending.status, '')) in ('pending', 'awaiting_payment')
    and regexp_replace(upper(coalesce(pending.plate, '')), '[^A-Z0-9]', '', 'g')
      = regexp_replace(upper(coalesce(new.plate, '')), '[^A-Z0-9]', '', 'g')
    and upper(coalesce(pending.registration_country, ''))
      = upper(coalesce(new.registration_country, ''))
    and exists (select 1 from public.order_items where order_id = pending.id union all select 1 from public.order_bridge_toll_items where order_id = pending.id)
    and exists (select 1 from public.order_items where order_id = new.id union all select 1 from public.order_bridge_toll_items where order_id = new.id)
    and (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(upper(coalesce(country_code, '')), coalesce(validity, ''), coalesce(start_date::text, ''), coalesce(end_date::text, '')) signature from public.order_items where order_id = pending.id) s)
      = (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(upper(coalesce(country_code, '')), coalesce(validity, ''), coalesce(start_date::text, ''), coalesce(end_date::text, '')) signature from public.order_items where order_id = new.id) s)
    and (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(coalesce(toll_id, ''), upper(coalesce(country_code, '')), coalesce(pass_count, 1), coalesce(pass_date::text, '')) signature from public.order_bridge_toll_items where order_id = pending.id) s)
      = (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(coalesce(toll_id, ''), upper(coalesce(country_code, '')), coalesce(pass_count, 1), coalesce(pass_date::text, '')) signature from public.order_bridge_toll_items where order_id = new.id) s);

  if original_created_at is not null then
    update public.orders
    set original_pending_created_at = original_created_at
    where id = new.id;
  end if;

  delete from public.orders as pending
  where pending.id <> new.id
    and pending.created_at < new.created_at
    and pending.paid_at is null
    and lower(coalesce(pending.status, '')) in ('pending', 'awaiting_payment')
    and regexp_replace(upper(coalesce(pending.plate, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(coalesce(new.plate, '')), '[^A-Z0-9]', '', 'g')
    and upper(coalesce(pending.registration_country, '')) = upper(coalesce(new.registration_country, ''))
    and pending.created_at >= original_created_at
    and exists (select 1 from public.order_items where order_id = pending.id union all select 1 from public.order_bridge_toll_items where order_id = pending.id)
    and (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(upper(coalesce(country_code, '')), coalesce(validity, ''), coalesce(start_date::text, ''), coalesce(end_date::text, '')) signature from public.order_items where order_id = pending.id) s)
      = (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(upper(coalesce(country_code, '')), coalesce(validity, ''), coalesce(start_date::text, ''), coalesce(end_date::text, '')) signature from public.order_items where order_id = new.id) s)
    and (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(coalesce(toll_id, ''), upper(coalesce(country_code, '')), coalesce(pass_count, 1), coalesce(pass_date::text, '')) signature from public.order_bridge_toll_items where order_id = pending.id) s)
      = (select coalesce(jsonb_agg(s.signature order by s.signature::text), '[]'::jsonb) from (select jsonb_build_array(coalesce(toll_id, ''), upper(coalesce(country_code, '')), coalesce(pass_count, 1), coalesce(pass_date::text, '')) signature from public.order_bridge_toll_items where order_id = new.id) s);

  return new;
end;
$$;
