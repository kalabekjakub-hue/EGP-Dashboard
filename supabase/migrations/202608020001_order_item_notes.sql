-- Dashboard-only operator notes for order items, plus optional note on manual FULFILLED audit.
-- Does not mutate commercial fields on order_items / order_bridge_toll_items beyond existing fulfill RPC.
-- Applied 2026-08-02; UI for notes was reverted pending redesign.

alter table public.manual_fulfillment_audit
  add column if not exists note text;

comment on column public.manual_fulfillment_audit.note is
  'Optional operator note explaining why the item was manually marked FULFILLED.';

create table if not exists public.dashboard_order_item_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null,
  item_source text not null check (item_source in ('order_items', 'order_bridge_toll_items')),
  country_code text,
  actor_email text not null,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists dashboard_order_item_notes_order_idx
  on public.dashboard_order_item_notes (order_id, created_at desc);

create index if not exists dashboard_order_item_notes_item_idx
  on public.dashboard_order_item_notes (item_id, created_at desc);

alter table public.dashboard_order_item_notes enable row level security;

comment on table public.dashboard_order_item_notes is
  'Append-only operator notes attached to order items from the admin dashboard.';

drop function if exists public.manual_fulfill_order_item(uuid, uuid, text, text);

create or replace function public.manual_fulfill_order_item(
  p_order_id uuid,
  p_item_id uuid,
  p_item_source text,
  p_actor_email text,
  p_note text default null
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
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if p_item_source not in ('order_items', 'order_bridge_toll_items') then
    raise exception 'Invalid item source' using errcode = '22023';
  end if;
  if nullif(trim(p_actor_email), '') is null then
    raise exception 'Missing actor' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Note too long' using errcode = '22023';
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
    (order_id, item_id, item_source, country_code, actor_email, previous_status, fulfilled_at, note)
  values
    (p_order_id, p_item_id, p_item_source, v_country_code, lower(trim(p_actor_email)), v_previous_status, v_fulfilled_at, v_note);

  return jsonb_build_object('fulfilled_at', v_fulfilled_at);
end;
$$;

revoke all on function public.manual_fulfill_order_item(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.manual_fulfill_order_item(uuid, uuid, text, text, text) to service_role;

comment on function public.manual_fulfill_order_item(uuid, uuid, text, text, text) is
  'Atomically marks one existing order item fulfilled, writes its dashboard audit record, and optionally stores an operator note.';
