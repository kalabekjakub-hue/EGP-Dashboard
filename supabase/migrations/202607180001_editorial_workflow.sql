-- Editorial workflow for AI-assisted multilingual blog production.
-- Additive only: existing blog posts and translations remain untouched.

alter table public.blog_post_translations
  add column if not exists slug text,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists hero_image_alt text,
  add column if not exists common_revision integer not null default 1,
  add column if not exists local_revision integer not null default 0,
  add column if not exists source_locale text,
  add column if not exists editorial_status text not null default 'ready',
  add column if not exists manually_edited boolean not null default false,
  add column if not exists content_hash text,
  add column if not exists last_translated_at timestamptz,
  add column if not exists last_published_at timestamptz;

create unique index if not exists blog_post_translations_locale_slug_unique
  on public.blog_post_translations (locale, slug)
  where slug is not null;

create table if not exists public.blog_topic_queue (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  target_characters integer not null default 2200 check (target_characters between 500 and 12000),
  priority integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'scheduled', 'generating', 'review', 'completed', 'failed', 'paused')),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  scheduled_for timestamptz,
  post_id uuid references public.blog_posts(id) on delete set null,
  last_error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_topic_queue_status_idx
  on public.blog_topic_queue (status, priority desc, created_at asc);

create table if not exists public.blog_translation_drafts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  locale text not null,
  title text not null default '',
  excerpt text not null default '',
  body_md text not null default '',
  slug text,
  seo_title text,
  seo_description text,
  hero_image_alt text,
  common_revision integer not null default 1,
  local_revision integer not null default 0,
  source_locale text,
  manually_edited boolean not null default false,
  content_hash text,
  save_state text not null default 'autosave' check (save_state in ('autosave', 'version')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, locale)
);

create index if not exists blog_translation_drafts_post_idx
  on public.blog_translation_drafts (post_id, locale);

create table if not exists public.blog_generation_runs (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.blog_topic_queue(id) on delete set null,
  post_id uuid references public.blog_posts(id) on delete cascade,
  run_type text not null check (run_type in ('article', 'translation', 'rewrite', 'topic_suggestion')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  source_locale text,
  target_locales text[] not null default '{}',
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12, 6),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.blog_automation_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  drafts_per_day integer not null default 2 check (drafts_per_day between 0 and 50),
  max_pending_reviews integer not null default 10 check (max_pending_reviews between 0 and 500),
  generation_hour smallint not null default 7 check (generation_hour between 0 and 23),
  weekdays smallint[] not null default '{1,2,3,4,5}',
  autosave_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.blog_automation_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.blog_research_sources (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  url text not null,
  title text not null default '',
  source_type text not null default 'web',
  trust_level text not null default 'secondary' check (trust_level in ('official', 'secondary', 'unknown')),
  supporting_excerpt text,
  fetched_at timestamptz not null default now(),
  unique (post_id, url)
);

create table if not exists public.blog_article_claims (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  locale text not null default 'cs',
  claim_text text not null,
  status text not null default 'unverified' check (status in ('verified', 'conflict', 'unverified')),
  created_at timestamptz not null default now()
);

create table if not exists public.blog_claim_sources (
  claim_id uuid not null references public.blog_article_claims(id) on delete cascade,
  source_id uuid not null references public.blog_research_sources(id) on delete cascade,
  primary key (claim_id, source_id)
);

alter table public.blog_topic_queue enable row level security;
alter table public.blog_translation_drafts enable row level security;
alter table public.blog_generation_runs enable row level security;
alter table public.blog_automation_settings enable row level security;
alter table public.blog_research_sources enable row level security;
alter table public.blog_article_claims enable row level security;
alter table public.blog_claim_sources enable row level security;

comment on table public.blog_translation_drafts is
  'Only the current unpublished editor state per post and locale; intentionally no historical text archive.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-hero-images', 'blog-hero-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
