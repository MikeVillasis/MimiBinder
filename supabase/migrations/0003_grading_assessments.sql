-- MimiBinder 0003: synced grading assessments (saved checks from the centering tool).
-- Run once in the Supabase SQL editor after 0001 and 0002 (or `supabase db push`). Idempotent: safe to re-run.
--
-- Deploy the app first or after, either order works: until this has run, the app's sync skips grading checks
-- (with a console warning) and keeps syncing entries and binders as before. Once it has run, the next sync
-- pushes every saved check.
--
-- Same model as entries / binders (0001): the full record is in `data` (jsonb), `updated_at` is the client's
-- updatedAt (last-write-wins key), `deleted_at` is the tombstone, `synced_at` is the server write clock that
-- clients pull on. `card_id`, `entry_id` and `created_at` are copies of fields in `data`, set by the push RPC,
-- for querying in the dashboard. Rows may hold small JPEG thumbnails as data URLs inside `data`; the client
-- keeps each pushed row under ~180 KB (it re-encodes or drops images). No Storage bucket is used.

create table if not exists public.grading_assessments (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  card_id    text,
  entry_id   text,
  data       jsonb       not null,
  created_at timestamptz,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- Incremental pull: "my rows changed since <cursor>".
create index if not exists grading_assessments_user_synced_idx on public.grading_assessments (user_id, synced_at);
-- One card's checks.
create index if not exists grading_assessments_user_card_idx on public.grading_assessments (user_id, card_id);

-- Server-side write clock (public.touch_synced_at() is defined in 0001; re-stated so this file stands alone).
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

drop trigger if exists grading_assessments_touch_synced_at on public.grading_assessments;
create trigger grading_assessments_touch_synced_at
  before insert or update on public.grading_assessments
  for each row execute function public.touch_synced_at();

alter table public.grading_assessments enable row level security;

-- Owner rows only. No delete policy: deletions are tombstones (deleted_at).
drop policy if exists "grading_assessments_select_own" on public.grading_assessments;
create policy "grading_assessments_select_own" on public.grading_assessments
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "grading_assessments_insert_own" on public.grading_assessments;
create policy "grading_assessments_insert_own" on public.grading_assessments
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "grading_assessments_update_own" on public.grading_assessments;
create policy "grading_assessments_update_own" on public.grading_assessments
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.grading_assessments from anon;
grant select, insert, update on public.grading_assessments to authenticated;
grant all on public.grading_assessments to service_role;

-- Conditional (last-write-wins) bulk upsert, same contract as push_entries / push_binders in 0001.
-- `rows` is a JSON array of { id, data, updated_at, deleted_at }. A row only overwrites the stored one when its
-- updated_at is strictly newer. SECURITY INVOKER: RLS applies and user_id is always the caller.
-- Returns the number of rows inserted or updated.
create or replace function public.push_grading_assessments(rows jsonb)
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
  insert into public.grading_assessments as t (user_id, id, card_id, entry_id, data, created_at, updated_at, deleted_at)
  select auth.uid(), r.id, r.data ->> 'cardId', r.data ->> 'entryId', r.data,
         (r.data ->> 'createdAt')::timestamptz, r.updated_at, r.deleted_at
  from jsonb_to_recordset(rows) as r (id text, data jsonb, updated_at timestamptz, deleted_at timestamptz)
  where r.id is not null and r.data is not null and r.updated_at is not null
  on conflict (user_id, id) do update
    set card_id = excluded.card_id,
        entry_id = excluded.entry_id,
        data = excluded.data,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    where t.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.push_grading_assessments(jsonb) from public, anon;
grant execute on function public.push_grading_assessments(jsonb) to authenticated;

-- Make PostgREST see the new table and function right away.
notify pgrst, 'reload schema';
