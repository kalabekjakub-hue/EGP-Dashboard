-- Audit who last published an editorial article.
alter table public.blog_posts
  add column if not exists published_by text;
