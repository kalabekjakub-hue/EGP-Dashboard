-- Order deduplication belongs to the read-only dashboard presentation layer.
-- Supabase order data must not be changed by this feature.

drop trigger if exists remove_superseded_pending_orders_on_payment on public.orders;
drop function if exists public.remove_superseded_pending_orders();

alter table public.orders
  drop column if exists original_pending_created_at;

