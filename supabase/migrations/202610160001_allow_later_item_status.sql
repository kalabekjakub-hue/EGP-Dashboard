-- postpone_order_item sets status = later. The existing status checks
-- were created before that value existed, so the update aborts and the
-- dashboard button reports a failure.

do $$
declare
  constraint_row record;
  expression text;
begin
  for constraint_row in
    select c.oid, c.conrelid::regclass as relation_name, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.order_items'::regclass, 'public.order_bridge_toll_items'::regclass)
      and pg_get_constraintdef(c.oid) ~* 'status'
      and pg_get_constraintdef(c.oid) ~* 'pending'
      and pg_get_constraintdef(c.oid) !~* '''later'''
  loop
    expression := regexp_replace(pg_get_constraintdef(constraint_row.oid), '^CHECK\s*\((.*)\)\s*$', '\1');
    execute format('alter table %s drop constraint %I', constraint_row.relation_name, constraint_row.conname);
    execute 'alter table ' || constraint_row.relation_name::text
      || ' add constraint ' || quote_ident(constraint_row.conname)
      || ' check ((' || expression || ') or status = ''later'')';
  end loop;
end $$;
