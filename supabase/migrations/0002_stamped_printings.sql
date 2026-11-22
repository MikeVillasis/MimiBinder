-- MimiBinder 0002: stamped printings (Pokémon Center, prerelease, Staff, …).
-- Run once in the Supabase SQL editor after 0001 (or `supabase db push`). Idempotent: safe to re-run.
--
-- Deploy the app first, then run this: the cron detects whether this migration has been applied and,
-- until it has, snapshots regular printings only (stamp column / RPC missing). Once it has run, a
-- pre-0002 cron build can no longer upsert (its ON CONFLICT target no longer matches the primary key).
--
-- price_snapshots gains `stamp` (TCGdex stamp slugs joined with "+", '' for regular printings) and its
-- primary key becomes (card_id, variant, stamp, date). Existing rows get stamp ''.
-- snapshot_printing_targets() returns distinct (card_id, variant, stamp) over live entries;
-- snapshot_targets() from 0001 is left as it was.

alter table public.price_snapshots
  add column if not exists stamp text not null default '';

-- Swap the primary key only when it does not already include `stamp`.
do $$
declare
  pk_name text;
  has_stamp boolean;
begin
  select c.conname,
         exists (
           select 1
           from unnest(c.conkey) as k (attnum)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
           where a.attname = 'stamp'
         )
    into pk_name, has_stamp
  from pg_constraint c
  where c.conrelid = 'public.price_snapshots'::regclass
    and c.contype = 'p';

  if pk_name is null then
    alter table public.price_snapshots
      add constraint price_snapshots_pkey primary key (card_id, variant, stamp, date);
  elsif not has_stamp then
    execute format('alter table public.price_snapshots drop constraint %I', pk_name);
    alter table public.price_snapshots
      add constraint price_snapshots_pkey primary key (card_id, variant, stamp, date);
  end if;
end;
$$;

-- Cron: distinct (cardId, variant, stamp) over live entries.
create index if not exists entries_card_variant_stamp_live_idx
  on public.entries ((data ->> 'cardId'), (data ->> 'variant'), (coalesce(data ->> 'stamp', '')))
  where deleted_at is null;

-- Distinct (card_id, variant, stamp) across every user's live entries ('' = regular printing).
-- Cron only (service role).
create or replace function public.snapshot_printing_targets()
returns table (card_id text, variant text, stamp text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.data ->> 'cardId', e.data ->> 'variant', coalesce(e.data ->> 'stamp', '')
  from public.entries e
  where e.deleted_at is null
    and e.data ->> 'cardId' is not null
    and e.data ->> 'variant' is not null
  order by 1, 2, 3;
$$;

revoke execute on function public.snapshot_printing_targets() from public, anon, authenticated;
grant execute on function public.snapshot_printing_targets() to service_role;

-- RLS and grants on price_snapshots are unchanged from 0001 (re-stated so this file stands alone).
alter table public.price_snapshots enable row level security;
revoke insert, update, delete, truncate on public.price_snapshots from anon, authenticated;
grant select on public.price_snapshots to anon, authenticated;
grant all on public.price_snapshots to service_role;

-- Make PostgREST see the new column and function right away.
notify pgrst, 'reload schema';
