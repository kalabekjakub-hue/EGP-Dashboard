-- Multilingual Search Console keyword pool for editorial topic and article generation.
-- Editorial-only and additive; no commercial tables are touched.

begin;

create table if not exists public.blog_seo_keywords (
  id uuid primary key default gen_random_uuid(),
  query text not null check (length(query) between 1 and 500),
  normalized_query text not null unique check (length(normalized_query) between 1 and 500),
  source text not null default 'manual' check (source in ('manual', 'search_console')),
  clicks bigint check (clicks is null or clicks >= 0),
  impressions bigint check (impressions is null or impressions >= 0),
  ctr numeric(10, 8) check (ctr is null or (ctr >= 0 and ctr <= 1)),
  position numeric(10, 4) check (position is null or position >= 0),
  source_filename text,
  suggested_count integer not null default 0 check (suggested_count >= 0),
  generated_count integer not null default 0 check (generated_count >= 0),
  published_count integer not null default 0 check (published_count >= 0),
  last_imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_seo_keywords_selection_idx
  on public.blog_seo_keywords (last_imported_at desc, impressions desc nulls last);

create table if not exists public.blog_topic_keywords (
  topic_id uuid not null references public.blog_topic_queue(id) on delete cascade,
  keyword_id uuid not null references public.blog_seo_keywords(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (topic_id, keyword_id)
);

create table if not exists public.blog_post_keywords (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  keyword_id uuid not null references public.blog_seo_keywords(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (post_id, keyword_id)
);

create table if not exists public.blog_seo_audits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  model text,
  checked_at timestamptz not null default now(),
  unique (post_id, locale)
);

alter table public.blog_generation_runs drop constraint if exists blog_generation_runs_run_type_check;
alter table public.blog_generation_runs
  add constraint blog_generation_runs_run_type_check
  check (run_type in ('article', 'translation', 'rewrite', 'topic_suggestion', 'seo_geo_audit'));

alter table public.blog_seo_keywords enable row level security;
alter table public.blog_topic_keywords enable row level security;
alter table public.blog_post_keywords enable row level security;
alter table public.blog_seo_audits enable row level security;

comment on table public.blog_seo_keywords is
  'Editorial-only multilingual keyword pool imported manually or from Google Search Console exports.';

comment on table public.blog_seo_audits is
  'Non-blocking per-locale SEO/GEO editorial warnings; never a publication gate.';

commit;
