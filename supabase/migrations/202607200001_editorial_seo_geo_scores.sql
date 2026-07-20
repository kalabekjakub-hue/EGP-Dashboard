-- Structured SEO/GEO quality scores for the editorial-only audit panel.

begin;

alter table public.blog_seo_audits
  add column if not exists seo_score integer check (seo_score is null or seo_score between 0 and 100),
  add column if not exists geo_score integer check (geo_score is null or geo_score between 0 and 100),
  add column if not exists summary text,
  add column if not exists details jsonb not null default '{"seo_checks":[],"geo_checks":[]}'::jsonb
    check (jsonb_typeof(details) = 'object');

comment on column public.blog_seo_audits.seo_score is
  'Advisory AI-assisted SEO quality score from 0 to 100; never a publication gate.';

comment on column public.blog_seo_audits.geo_score is
  'Advisory AI-assisted GEO/citability quality score from 0 to 100; never a publication gate.';

comment on column public.blog_seo_audits.details is
  'Structured per-dimension SEO and GEO checks for collapsed editorial UI details.';

commit;
