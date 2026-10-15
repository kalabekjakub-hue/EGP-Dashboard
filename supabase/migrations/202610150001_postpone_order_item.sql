-- Operator postpones one classic line so the worker stops claiming it.
-- Worker claim is status = pending; status later is outside that filter.
-- Reminder row is dashboard-owned. The day before the earliest validity,
-- the dashboard server sends one ntfy for the whole order.

create table if not exists public.dashboard_item_postponements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  item_id uuid not null,
  item_source text not null check (item_source in ('order_items', 'order_bridge_toll_items')),
  country_code text,
  label text not null,
  actor_email text not null,
  previous_status text,
  note text,
  valid_on date,
  remind_on date not null,
  state text not null default 'open' check (state in ('open', 'sent', 'superseded')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dashboard_item_postponements_note_len check (note is null or char_length(note) <= 2000)
);

create index if not exists dashboard_item_postponements_open_idx
  on public.dashboard_item_postponements (state, remind_on);

alter table public.dashboard_item_postponements enable row level security;

comment on table public.dashboard_item_postponements is
  'Dashboard audit of items parked as later. Open rows drive the ntfy reminder the day before validity.';

create or replace function public.postpone_order_item(
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
set datestyle = iso
set timezone = 'Europe/Prague'
as $$
declare
  v_previous_status text;
  v_country_code text;
  v_raw_date text;
  v_label text;
  v_valid date;
  v_today date := (timezone('Europe/Prague', now()))::date;
  v_remind date;
  v_note text := nullif(trim(p_note), '');
begin
  if p_item_source not in ('order_items', 'order_bridge_toll_items') then
    raise exception 'Invalid item source' using errcode = '22023';
  end if;
  if nullif(trim(p_actor_email), '') is null then
    raise exception 'Missing actor' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;

  if p_item_source = 'order_items' then
    select status, country_code, start_date::text,
           country_code || ' ' || coalesce(nullif(trim(validity), ''), 'známka')
      into v_previous_status, v_country_code, v_raw_date, v_label
      from public.order_items
      where id = p_item_id and order_id = p_order_id
      for update;
  else
    select status, country_code, pass_date::text,
           country_code || ' ' || coalesce(nullif(trim(toll_id), ''), 'průjezd')
      into v_previous_status, v_country_code, v_raw_date, v_label
      from public.order_bridge_toll_items
      where id = p_item_id and order_id = p_order_id
      for update;
  end if;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if lower(coalesce(v_previous_status, '')) = 'fulfilled' then
    raise exception 'Fulfilled item cannot be postponed' using errcode = '22023';
  end if;

  v_valid := substring(coalesce(v_raw_date, '') from '^\d{4}-\d{2}-\d{2}')::date;
  if v_valid is null or v_valid - 1 < v_today then
    v_remind := v_today;
  else
    v_remind := v_valid - 1;
  end if;

  if p_item_source = 'order_items' then
    update public.order_items set status = 'later'
      where id = p_item_id and order_id = p_order_id;
  else
    update public.order_bridge_toll_items set status = 'later'
      where id = p_item_id and order_id = p_order_id;
  end if;

  update public.dashboard_item_postponements
    set state = 'superseded'
    where item_id = p_item_id and item_source = p_item_source and state = 'open';

  insert into public.dashboard_item_postponements
    (order_id, item_id, item_source, country_code, label, actor_email, previous_status, note, valid_on, remind_on)
  values
    (p_order_id, p_item_id, p_item_source, v_country_code, v_label, lower(trim(p_actor_email)), v_previous_status, v_note, v_valid, v_remind);

  return jsonb_build_object('status', 'later', 'valid_on', v_valid, 'remind_on', v_remind);
end;
$$;

revoke all on function public.postpone_order_item(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.postpone_order_item(uuid, uuid, text, text, text) to service_role;

comment on function public.postpone_order_item(uuid, uuid, text, text, text) is
  'Sets one existing classic item to later so the worker stops claiming it, and stores the ntfy reminder.';
