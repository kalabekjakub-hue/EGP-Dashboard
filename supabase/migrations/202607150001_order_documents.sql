-- Official purchase receipts and source e-mails from government/portal vendors.
-- EuroGoPass customer invoices remain in orders.invoice_pdf_path and invoices bucket.

create table if not exists public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid,
  item_source text check (item_source in ('order_items', 'order_bridge_toll_items')),
  country_code text,
  document_type text not null check (document_type in ('official_receipt', 'official_confirmation', 'original_email')),
  source text not null check (source in ('email', 'worker', 'manual')),
  filename text not null,
  content_type text not null,
  storage_bucket text not null default 'official-documents',
  storage_path text not null,
  source_message_id text,
  sender text,
  subject text,
  received_at timestamptz,
  sha256 text not null,
  match_method text,
  created_at timestamptz not null default now(),
  constraint order_documents_item_pair check (
    (order_item_id is null and item_source is null)
    or (order_item_id is not null and item_source is not null)
  ),
  constraint order_documents_storage_unique unique (storage_bucket, storage_path),
  constraint order_documents_content_unique unique (order_id, document_type, sha256)
);

create index if not exists order_documents_order_id_idx
  on public.order_documents (order_id, created_at desc);

create index if not exists order_documents_item_idx
  on public.order_documents (item_source, order_item_id)
  where order_item_id is not null;

create index if not exists order_documents_message_idx
  on public.order_documents (source_message_id)
  where source_message_id is not null;

alter table public.order_documents enable row level security;

-- No anon/authenticated policies are intentionally created. The dashboard server
-- reads through its authenticated API and the mail ingestor uses server credentials.

insert into storage.buckets (id, name, public)
values ('official-documents', 'official-documents', false)
on conflict (id) do update set public = false;

comment on table public.order_documents is
  'Official portal receipts/confirmations and archived source emails. Never EuroGoPass customer invoices.';

create table if not exists public.email_ingest_messages (
  gmail_message_id text primary key,
  gmail_thread_id text,
  status text not null check (status in ('ignored', 'matched', 'review', 'error')),
  sender text,
  subject text,
  received_at timestamptz,
  country_code text,
  extracted_plate text,
  matched_order_id uuid references public.orders(id) on delete set null,
  reason text,
  processed_at timestamptz not null default now()
);

create index if not exists email_ingest_messages_status_idx
  on public.email_ingest_messages (status, processed_at desc);

alter table public.email_ingest_messages enable row level security;

comment on table public.email_ingest_messages is
  'Idempotency and review queue for the read-only Gmail document ingestor.';
