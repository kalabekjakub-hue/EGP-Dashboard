-- One-time cleanup for exact replacements paid before the live trigger existed.
-- Orders with a matching plate but different products remain untouched.

with order_signatures as (
  select
    orders.id,
    orders.created_at,
    orders.paid_at,
    orders.status,
    regexp_replace(upper(coalesce(orders.plate, '')), '[^A-Z0-9]', '', 'g') as plate_key,
    upper(coalesce(orders.registration_country, '')) as country_key,
    (
      select count(*)
      from public.order_items
      where order_id = orders.id
    ) + (
      select count(*)
      from public.order_bridge_toll_items
      where order_id = orders.id
    ) as item_count,
    (
      select coalesce(jsonb_agg(item.signature order by item.signature::text), '[]'::jsonb)
      from (
        select jsonb_build_array(
          upper(coalesce(country_code, '')),
          coalesce(validity, ''),
          coalesce(start_date::text, ''),
          coalesce(end_date::text, '')
        ) as signature
        from public.order_items
        where order_id = orders.id
      ) as item
    ) as vignette_signature,
    (
      select coalesce(jsonb_agg(item.signature order by item.signature::text), '[]'::jsonb)
      from (
        select jsonb_build_array(
          coalesce(toll_id, ''),
          upper(coalesce(country_code, '')),
          coalesce(pass_count, 1),
          coalesce(pass_date::text, '')
        ) as signature
        from public.order_bridge_toll_items
        where order_id = orders.id
      ) as item
    ) as toll_signature
  from public.orders
), superseded as (
  select distinct pending.id
  from order_signatures as pending
  join order_signatures as paid
    on paid.plate_key = pending.plate_key
    and paid.country_key = pending.country_key
    and paid.created_at > pending.created_at
    and paid.paid_at is not null
    and paid.item_count > 0
    and paid.vignette_signature = pending.vignette_signature
    and paid.toll_signature = pending.toll_signature
  where pending.paid_at is null
    and lower(coalesce(pending.status, '')) in ('pending', 'awaiting_payment')
    and pending.item_count > 0
)
delete from public.orders
where id in (select id from superseded);

