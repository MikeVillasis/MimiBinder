-- MimiBinder initial schema.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- entries / binders: owner-only synced collection (full object in `data`).
--   `updated_at` is the client's updatedAt (last-write-wins key).
--   `synced_at` is the server clock at the time of the last accepted write; clients pull on it so that
--   device clock skew can never hide a change.
-- price_snapshots / fx_rates: public, non-personal daily price history written by the cron (service role).

-- ---------------------------------------------------------------------------
-- Synced collection tables
-- ---------------------------------------------------------------------------

create table if not exists public.entries (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.binders (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- Incremental pull: "my rows changed since <cursor>".
create index if not exists entries_user_synced_idx on public.entries (user_id, synced_at);
create index if not exists binders_user_synced_idx on public.binders (user_id, synced_at);
-- Cron: distinct (cardId, variant) over live entries.
create index if not exists entries_card_variant_live_idx
  on public.entries ((data ->> 'cardId'), (data ->> 'variant'))
  where deleted_at is null;

-- Server-side write clock.
create or replace function public.touch_synced_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists entries_touch_synced_at on public.entries;
create trigger entries_touch_synced_at
  before insert or update on public.entries
  for each row execute function public.touch_synced_at();

drop trigger if exists binders_touch_synced_at on public.binders;
create trigger binders_touch_synced_at
  before insert or update on public.binders
  for each row execute function public.touch_synced_at();

alter table public.entries enable row level security;
alter table public.binders enable row level security;

-- Owner rows only. No delete policy: deletions are tombstones (deleted_at).
drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "binders_select_own" on public.binders;
create policy "binders_select_own" on public.binders
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "binders_insert_own" on public.binders;
create policy "binders_insert_own" on public.binders
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "binders_update_own" on public.binders;
create policy "binders_update_own" on public.binders
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.entries, public.binders from anon;
grant select, insert, update on public.entries, public.binders to authenticated;
grant all on public.entries, public.binders to service_role;

-- Conditional (last-write-wins) bulk upsert used by the client sync engine.
-- `rows` is a JSON array of { id, data, updated_at, deleted_at }. A row only overwrites the stored one
-- when its updated_at is strictly newer, so pushes are idempotent and safe to run concurrently from
-- several tabs/devices. SECURITY INVOKER: RLS applies and user_id is always the caller.
-- Returns the number of rows inserted or updated.
create or replace function public.push_entries(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.entries as t (user_id, id, data, updated_at, deleted_at)
  select auth.uid(), r.id, r.data, r.updated_at, r.deleted_at
  from jsonb_to_recordset(rows) as r (id text, data jsonb, updated_at timestamptz, deleted_at timestamptz)
  where r.id is not null and r.data is not null and r.updated_at is not null
  on conflict (user_id, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    where t.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.push_binders(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.binders as t (user_id, id, data, updated_at, deleted_at)
  select auth.uid(), r.id, r.data, r.updated_at, r.deleted_at
  from jsonb_to_recordset(rows) as r (id text, data jsonb, updated_at timestamptz, deleted_at timestamptz)
  where r.id is not null and r.data is not null and r.updated_at is not null
  on conflict (user_id, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    where t.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.push_entries(jsonb), public.push_binders(jsonb) from public, anon;
grant execute on function public.push_entries(jsonb), public.push_binders(jsonb) to authenticated;

-- Distinct (card_id, variant) across every user's live entries. Cron only (service role).
create or replace function public.snapshot_targets()
returns table (card_id text, variant text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.data ->> 'cardId', e.data ->> 'variant'
  from public.entries e
  where e.deleted_at is null
    and e.data ->> 'cardId' is not null
    and e.data ->> 'variant' is not null
  order by 1, 2;
$$;

revoke execute on function public.snapshot_targets() from public, anon, authenticated;
grant execute on function public.snapshot_targets() to service_role;

-- ---------------------------------------------------------------------------
-- Public price history
-- ---------------------------------------------------------------------------

create table if not exists public.price_snapshots (
  card_id              text    not null,
  variant              text    not null check (variant in ('normal', 'holo', 'reverse', 'firstEdition')),
  date                 date    not null,
  tcgplayer_market_usd numeric(12, 2),
  cardmarket_trend_eur numeric(12, 2),
  primary key (card_id, variant, date)
);

-- History lookups are by card_id ordered by date (all variants).
create index if not exists price_snapshots_card_date_idx on public.price_snapshots (card_id, date);

create table if not exists public.fx_rates (
  date    date primary key,
  usd_cad numeric(12, 6) not null,
  eur_cad numeric(12, 6)
);

alter table public.price_snapshots enable row level security;
alter table public.fx_rates enable row level security;

drop policy if exists "price_snapshots_public_read" on public.price_snapshots;
create policy "price_snapshots_public_read" on public.price_snapshots
  for select to anon, authenticated using (true);
drop policy if exists "fx_rates_public_read" on public.fx_rates;
create policy "fx_rates_public_read" on public.fx_rates
  for select to anon, authenticated using (true);

-- Writes only by the service role (which bypasses RLS).
revoke insert, update, delete, truncate on public.price_snapshots, public.fx_rates from anon, authenticated;
grant select on public.price_snapshots, public.fx_rates to anon, authenticated;
grant all on public.price_snapshots, public.fx_rates to service_role;
