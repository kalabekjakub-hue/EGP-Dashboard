-- Trusted Markdown guidance used only by the editorial AI workflow.

create table if not exists public.blog_editorial_guides (
  id uuid primary key default gen_random_uuid(),
  filename text not null unique,
  content text not null default '',
  enabled boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(filename) between 4 and 120),
  check (lower(filename) like '%.md'),
  check (char_length(content) <= 20000)
);

create index if not exists blog_editorial_guides_enabled_idx
  on public.blog_editorial_guides (enabled, filename);

alter table public.blog_editorial_guides enable row level security;

comment on table public.blog_editorial_guides is
  'Admin-managed Markdown context for editorial AI prompts; never used by commercial or fulfillment workflows.';
