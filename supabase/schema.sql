-- Stan Book Editor :: Supabase schema
-- Run in Supabase SQL editor or via supabase migration.

create extension if not exists "pgcrypto";

-- =============================================================
-- Tables
-- =============================================================

create table if not exists public.spreads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  schema jsonb not null default '{}'::jsonb,
  current_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spreads_owner_idx on public.spreads (owner_id, updated_at desc);

create table if not exists public.spread_versions (
  id uuid primary key default gen_random_uuid(),
  spread_id uuid not null references public.spreads(id) on delete cascade,
  version int not null,
  schema jsonb not null,
  label text,
  created_at timestamptz not null default now(),
  unique (spread_id, version)
);

create index if not exists spread_versions_spread_idx on public.spread_versions (spread_id, version desc);

-- =============================================================
-- Triggers
-- =============================================================

create or replace function public.touch_spread_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_spreads on public.spreads;
create trigger trg_touch_spreads
before update on public.spreads
for each row execute function public.touch_spread_updated_at();

-- =============================================================
-- RPC: explicit version snapshot (used by Ctrl+S only)
-- =============================================================

create or replace function public.save_spread_version(
  p_spread_id uuid,
  p_schema jsonb,
  p_label text
) returns public.spread_versions
language plpgsql security definer
set search_path = public
as $$
declare
  v_next int;
  v_row public.spread_versions;
begin
  if not exists (
    select 1 from public.spreads s
    where s.id = p_spread_id and s.owner_id = auth.uid()
  ) then
    raise exception 'spread not found or not owned by caller';
  end if;

  update public.spreads
    set schema = p_schema, current_version = current_version + 1
    where id = p_spread_id
    returning current_version into v_next;

  insert into public.spread_versions (spread_id, version, schema, label)
    values (p_spread_id, v_next, p_schema, p_label)
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.restore_spread_version(
  p_spread_id uuid,
  p_version_id uuid
) returns public.spreads
language plpgsql security definer
set search_path = public
as $$
declare
  v_schema jsonb;
  v_row public.spreads;
begin
  if not exists (
    select 1 from public.spreads s
    where s.id = p_spread_id and s.owner_id = auth.uid()
  ) then
    raise exception 'spread not found or not owned by caller';
  end if;

  select schema into v_schema
    from public.spread_versions
    where id = p_version_id and spread_id = p_spread_id;

  if v_schema is null then
    raise exception 'version not found';
  end if;

  update public.spreads
    set schema = v_schema
    where id = p_spread_id
    returning * into v_row;

  -- snapshot the restoration as a new version for traceability
  perform public.save_spread_version(p_spread_id, v_schema, 'restored');

  return v_row;
end;
$$;

-- =============================================================
-- Row Level Security
-- =============================================================

alter table public.spreads enable row level security;
alter table public.spread_versions enable row level security;

drop policy if exists spreads_owner_select on public.spreads;
create policy spreads_owner_select on public.spreads
  for select using (owner_id = auth.uid());

drop policy if exists spreads_owner_insert on public.spreads;
create policy spreads_owner_insert on public.spreads
  for insert with check (owner_id = auth.uid());

drop policy if exists spreads_owner_update on public.spreads;
create policy spreads_owner_update on public.spreads
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists spreads_owner_delete on public.spreads;
create policy spreads_owner_delete on public.spreads
  for delete using (owner_id = auth.uid());

drop policy if exists versions_owner_select on public.spread_versions;
create policy versions_owner_select on public.spread_versions
  for select using (
    exists (select 1 from public.spreads s where s.id = spread_versions.spread_id and s.owner_id = auth.uid())
  );

drop policy if exists versions_owner_insert on public.spread_versions;
create policy versions_owner_insert on public.spread_versions
  for insert with check (
    exists (select 1 from public.spreads s where s.id = spread_versions.spread_id and s.owner_id = auth.uid())
  );

-- =============================================================
-- Storage policies (run AFTER creating bucket `spread-assets`)
-- Bucket should be PRIVATE; we use signed URLs.
-- =============================================================

-- Path convention: {owner_uid}/{spread_id}/{file_uuid}.jpg
-- Owner is encoded as the FIRST path segment.

drop policy if exists "spread-assets owner read" on storage.objects;
create policy "spread-assets owner read" on storage.objects
  for select using (
    bucket_id = 'spread-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "spread-assets owner insert" on storage.objects;
create policy "spread-assets owner insert" on storage.objects
  for insert with check (
    bucket_id = 'spread-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "spread-assets owner delete" on storage.objects;
create policy "spread-assets owner delete" on storage.objects
  for delete using (
    bucket_id = 'spread-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
