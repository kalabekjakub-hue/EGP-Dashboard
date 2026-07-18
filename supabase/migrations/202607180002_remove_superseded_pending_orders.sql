-- Remove an older abandoned checkout only after its exact replacement is paid.
-- Running this on paid_at (rather than order creation) keeps two abandoned
-- checkout attempts from deleting one another.

create or replace function public.remove_superseded_pending_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paid_at is null then
    return new;
  end if;

  delete from public.orders as pending
  where pending.id <> new.id
    and pending.created_at < new.created_at
    and pending.paid_at is null
    and lower(coalesce(pending.status, '')) in ('pending', 'awaiting_payment')
    and regexp_replace(upper(coalesce(pending.plate, '')), '[^A-Z0-9]', '', 'g')
      = regexp_replace(upper(coalesce(new.plate, '')), '[^A-Z0-9]', '', 'g')
    and upper(coalesce(pending.registration_country, ''))
      = upper(coalesce(new.registration_country, ''))
    and (
      select coalesce(jsonb_agg(item.signature order by item.signature::text), '[]'::jsonb)
      from (
        select jsonb_build_array(
          upper(coalesce(country_code, '')),
          coalesce(validity, ''),
          coalesce(start_date::text, ''),
          coalesce(end_date::text, '')
        ) as signature
        from public.order_items
        where order_id = pending.id
      ) as item
    ) = (
      select coalesce(jsonb_agg(item.signature order by item.signature::text), '[]'::jsonb)
      from (
        select jsonb_build_array(
          upper(coalesce(country_code, '')),
          coalesce(validity, ''),
          coalesce(start_date::text, ''),
          coalesce(end_date::text, '')
        ) as signature
        from public.order_items
        where order_id = new.id
      ) as item
    )
    and (
      select coalesce(jsonb_agg(item.signature order by item.signature::text), '[]'::jsonb)
      from (
        select jsonb_build_array(
          coalesce(toll_id, ''),
          upper(coalesce(country_code, '')),
          coalesce(pass_count, 1),
          coalesce(pass_date::text, '')
        ) as signature
        from public.order_bridge_toll_items
        where order_id = pending.id
      ) as item
    ) = (
      select coalesce(jsonb_agg(item.signature order by item.signature::text), '[]'::jsonb)
      from (
        select jsonb_build_array(
          coalesce(toll_id, ''),
          upper(coalesce(country_code, '')),
          coalesce(pass_count, 1),
          coalesce(pass_date::text, '')
        ) as signature
        from public.order_bridge_toll_items
        where order_id = new.id
      ) as item
    );

  return new;
end;
$$;

drop trigger if exists remove_superseded_pending_orders_on_payment on public.orders;
create trigger remove_superseded_pending_orders_on_payment
after update of paid_at on public.orders
for each row
when (old.paid_at is null and new.paid_at is not null)
execute function public.remove_superseded_pending_orders();
