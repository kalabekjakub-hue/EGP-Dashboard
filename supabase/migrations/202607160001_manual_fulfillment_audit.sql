create table if not exists public.manual_fulfillment_audit (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null,
  item_source text not null check (item_source in ('order_items', 'order_bridge_toll_items')),
  country_code text,
  actor_email text not null,
  previous_status text,
  fulfilled_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists manual_fulfillment_audit_order_idx
  on public.manual_fulfillment_audit (order_id, created_at desc);

alter table public.manual_fulfillment_audit enable row level security;

comment on table public.manual_fulfillment_audit is
  'Immutable audit history of manual FULFILLED actions performed in the admin dashboard.';
