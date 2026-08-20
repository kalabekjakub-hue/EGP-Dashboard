-- Operator ACK for plate_country_conflict (worker precheck hold).
-- Sets orders + mirrored line items to false atomically and writes dashboard audit.
-- Does not change status, plate, registration_country, or any other commercial field.

create table if not exists public.dashboard_plate_country_conflict_acks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_email text not null,
  previous_value boolean,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_plate_country_conflict_acks_order_idx
  on public.dashboard_plate_country_conflict_acks (order_id, created_at desc);

alter table public.dashboard_plate_country_conflict_acks enable row level security;

comment on table public.dashboard_plate_country_conflict_acks is
  'Append-only audit of operator plate-country conflict acknowledgements from the admin dashboard.';

create or replace function public.ack_plate_country_conflict(
  p_order_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous boolean;
  v_acked_at timestamptz := now();
begin
  if nullif(trim(p_actor_email), '') is null then
    raise exception 'Missing actor' using errcode = '22023';
  end if;

  select plate_country_conflict into v_previous
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_previous is not distinct from false then
    return jsonb_build_object(
      'ok', true,
      'already_acked', true,
      'acked_at', v_acked_at,
      'previous_value', v_previous
    );
  end if;

  update public.orders
     set plate_country_conflict = false
   where id = p_order_id;

  update public.order_items
     set plate_country_conflict = false
   where order_id = p_order_id;

  update public.order_bridge_toll_items
     set plate_country_conflict = false
   where order_id = p_order_id;

  insert into public.dashboard_plate_country_conflict_acks
    (order_id, actor_email, previous_value, created_at)
  values
    (p_order_id, lower(trim(p_actor_email)), v_previous, v_acked_at);

  return jsonb_build_object(
    'ok', true,
    'already_acked', false,
    'acked_at', v_acked_at,
    'previous_value', v_previous
  );
end;
$$;

revoke all on function public.ack_plate_country_conflict(uuid, text) from public, anon, authenticated;
grant execute on function public.ack_plate_country_conflict(uuid, text) to service_role;

comment on function public.ack_plate_country_conflict(uuid, text) is
  'Atomically clears plate_country_conflict on an order and mirrored items, then writes dashboard audit.';
