-- Persist the selected editorial writing profile from topic generation through localization and later optimization.

begin;

alter table public.blog_topic_queue
  add column if not exists style_profile text not null default 'balanced'
    check (style_profile in ('balanced', 'factual', 'roadmate'));

alter table public.blog_posts
  add column if not exists style_profile text not null default 'balanced'
    check (style_profile in ('balanced', 'factual', 'roadmate'));

comment on column public.blog_topic_queue.style_profile is
  'Editorial writing profile selected before article generation.';

comment on column public.blog_posts.style_profile is
  'Editorial writing profile preserved for translations and later AI optimization.';

commit;
