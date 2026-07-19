-- The only commercial-data write exposed by the dashboard.
-- Row update and immutable audit entry are committed atomically.

create or replace function public.manual_fulfill_order_item(
  p_order_id uuid,
  p_item_id uuid,
  p_item_source text,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous_status text;
  v_country_code text;
  v_fulfilled_at timestamptz := now();
begin
  if p_item_source not in ('order_items', 'order_bridge_toll_items') then
    raise exception 'Invalid item source' using errcode = '22023';
  end if;
  if nullif(trim(p_actor_email), '') is null then
    raise exception 'Missing actor' using errcode = '22023';
  end if;

  if p_item_source = 'order_items' then
    select status, country_code into v_previous_status, v_country_code
      from public.order_items where id = p_item_id and order_id = p_order_id for update;
    if not found then raise exception 'Item not found' using errcode = 'P0002'; end if;
    update public.order_items set status = 'fulfilled', fulfilled_at = v_fulfilled_at
      where id = p_item_id and order_id = p_order_id;
  else
    select status, country_code into v_previous_status, v_country_code
      from public.order_bridge_toll_items where id = p_item_id and order_id = p_order_id for update;
    if not found then raise exception 'Item not found' using errcode = 'P0002'; end if;
    update public.order_bridge_toll_items set status = 'fulfilled', fulfilled_at = v_fulfilled_at
      where id = p_item_id and order_id = p_order_id;
  end if;

  insert into public.manual_fulfillment_audit
    (order_id, item_id, item_source, country_code, actor_email, previous_status, fulfilled_at)
  values
    (p_order_id, p_item_id, p_item_source, v_country_code, lower(trim(p_actor_email)), v_previous_status, v_fulfilled_at);

  return jsonb_build_object('fulfilled_at', v_fulfilled_at);
end;
$$;

revoke all on function public.manual_fulfill_order_item(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.manual_fulfill_order_item(uuid, uuid, text, text) to service_role;

comment on function public.manual_fulfill_order_item(uuid, uuid, text, text) is
  'Atomically marks one existing order item fulfilled and writes its dashboard audit record.';
