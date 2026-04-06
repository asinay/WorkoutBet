-- ============================================================
-- Workout Bet App — Supabase SQL Migrations
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste and run PART 1 first, click Run
--   3. Then paste and run PART 2, click Run
-- ============================================================


-- ============================================================
-- PART 1: Tables + Trigger  (paste this block, click Run)
-- ============================================================

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- GROUPS
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default upper(substring(gen_random_uuid()::text from 1 for 6)),
  start_date date not null,
  goal_days int not null default 35,
  total_days int not null default 50,
  minimum_duration_minutes int not null default 20,
  allowed_workout_types text[] not null default array[
    'Running',
    'Cycling',
    'Strength Training',
    'Tonal',
    'Fascia',
    'Swimming',
    'Yoga',
    'HIIT',
    'Walking',
    'Sports',
    'Other'
  ]::text[],
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- GROUP MEMBERS
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique(group_id, user_id)
);

-- WORKOUT LOGS
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null,
  duration_minutes int not null check (duration_minutes > 0),
  workout_type text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique(group_id, user_id, logged_date)
);

create or replace function public.validate_workout_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_group public.groups;
begin
  select *
  into v_group
  from public.groups
  where id = new.group_id;

  if not found then
    raise exception 'Group not found';
  end if;

  if new.duration_minutes < v_group.minimum_duration_minutes then
    raise exception 'Workout must be at least % minutes for this group', v_group.minimum_duration_minutes;
  end if;

  if not (new.workout_type = any(v_group.allowed_workout_types)) then
    raise exception 'Workout type "%" is not allowed for this group', new.workout_type;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_workout_log_trigger on public.workout_logs;
create trigger validate_workout_log_trigger
  before insert or update on public.workout_logs
  for each row execute procedure public.validate_workout_log();

-- Align existing foreign keys with auth.users for user-owned records.
alter table public.groups
  drop constraint if exists groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.group_members
  drop constraint if exists group_members_user_id_fkey;
alter table public.group_members
  add constraint group_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.workout_logs
  drop constraint if exists workout_logs_user_id_fkey;
alter table public.workout_logs
  add constraint workout_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.groups
  add column if not exists minimum_duration_minutes int;
alter table public.groups
  add column if not exists allowed_workout_types text[];

update public.groups
set minimum_duration_minutes = coalesce(minimum_duration_minutes, 20),
    allowed_workout_types = coalesce(
      allowed_workout_types,
      array[
        'Running',
        'Cycling',
        'Strength Training',
        'Tonal',
        'Fascia',
        'Swimming',
        'Yoga',
        'HIIT',
        'Walking',
        'Sports',
        'Other'
      ]::text[]
    );

alter table public.groups
  alter column minimum_duration_minutes set default 20;
alter table public.groups
  alter column minimum_duration_minutes set not null;
alter table public.groups
  alter column allowed_workout_types set default array[
    'Running',
    'Cycling',
    'Strength Training',
    'Tonal',
    'Fascia',
    'Swimming',
    'Yoga',
    'HIIT',
    'Walking',
    'Sports',
    'Other'
  ]::text[];
alter table public.groups
  alter column allowed_workout_types set not null;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for existing users so foreign keys and joins are reliable.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), '')
from auth.users u
on conflict (id) do nothing;


-- ============================================================
-- PART 2: RLS + Indexes + View  (paste this block, click Run)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.workout_logs enable row level security;

-- Helper functions for RLS checks.
-- SECURITY DEFINER lets these membership checks avoid recursive policy evaluation.
create schema if not exists private;

create or replace function private.is_group_member(check_group_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = check_group_id
      and gm.user_id = check_user_id
  );
$$;

create or replace function private.is_group_admin(check_group_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = check_group_id
      and gm.user_id = check_user_id
      and gm.role = 'admin'
  );
$$;

revoke all on schema private from public;
grant usage on schema private to postgres, anon, authenticated, service_role;
grant execute on function private.is_group_member(uuid, uuid) to anon, authenticated, service_role;
grant execute on function private.is_group_admin(uuid, uuid) to anon, authenticated, service_role;

create or replace function public.ensure_profile(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  insert into public.profiles (id, display_name)
  select
    u.id,
    coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), '')
  from auth.users u
  where u.id = p_user_id
  on conflict (id) do nothing;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  return v_profile;
end;
$$;

grant execute on function public.ensure_profile(uuid) to authenticated, service_role;

create or replace function public.create_group_with_admin(
  p_name text,
  p_start_date date
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_profile(v_user_id);

  insert into public.groups (name, start_date, created_by)
  values (trim(p_name), p_start_date, v_user_id)
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user_id, 'admin')
  on conflict (group_id, user_id) do update
  set role = 'admin';

  return v_group;
end;
$$;

grant execute on function public.create_group_with_admin(text, date) to authenticated, service_role;

create or replace function public.join_group_by_code(p_join_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_profile(v_user_id);

  select *
  into v_group
  from public.groups
  where join_code = upper(trim(p_join_code));

  if not found then
    raise exception 'Group not found';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;

grant execute on function public.join_group_by_code(text) to authenticated, service_role;

-- PROFILES policies
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- GROUPS policies
drop policy if exists "groups_select" on public.groups;
create policy "groups_select" on public.groups
  for select using (
    created_by = auth.uid() or
    private.is_group_member(id, auth.uid())
  );

drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups
  for insert with check (auth.uid() = created_by);

drop policy if exists "groups_update" on public.groups;
create policy "groups_update" on public.groups
  for update using (private.is_group_admin(id, auth.uid()));

-- GROUP MEMBERS policies
drop policy if exists "members_select" on public.group_members;
create policy "members_select" on public.group_members
  for select using (private.is_group_member(group_id, auth.uid()));

drop policy if exists "members_insert" on public.group_members;
create policy "members_insert" on public.group_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "members_delete" on public.group_members;
create policy "members_delete" on public.group_members
  for delete using (
    user_id = auth.uid() or
    private.is_group_admin(group_id, auth.uid())
  );

drop policy if exists "members_update" on public.group_members;
create policy "members_update" on public.group_members
  for update using (private.is_group_admin(group_id, auth.uid()));

-- WORKOUT LOGS policies
drop policy if exists "logs_select" on public.workout_logs;
create policy "logs_select" on public.workout_logs
  for select using (private.is_group_member(group_id, auth.uid()));

drop policy if exists "logs_insert" on public.workout_logs;
create policy "logs_insert" on public.workout_logs
  for insert with check (
    auth.uid() = user_id and
    private.is_group_member(group_id, auth.uid())
  );

drop policy if exists "logs_update" on public.workout_logs;
create policy "logs_update" on public.workout_logs
  for update using (auth.uid() = user_id);

drop policy if exists "logs_delete" on public.workout_logs;
create policy "logs_delete" on public.workout_logs
  for delete using (auth.uid() = user_id);

-- Indexes
create index if not exists idx_group_members_user  on public.group_members(user_id);
create index if not exists idx_group_members_group on public.group_members(group_id);
create index if not exists idx_workout_logs_group  on public.workout_logs(group_id);
create index if not exists idx_workout_logs_user   on public.workout_logs(user_id);
create index if not exists idx_workout_logs_date   on public.workout_logs(logged_date desc);

-- Leaderboard view
create or replace view public.leaderboard as
select
  wl.group_id,
  wl.user_id,
  coalesce(nullif(p.display_name, ''), 'Member') as display_name,
  count(distinct wl.logged_date)::int as days_logged,
  sum(wl.duration_minutes)::int       as total_minutes,
  g.goal_days,
  g.total_days,
  g.start_date,
  (g.start_date + g.total_days - 1)  as end_date
from public.workout_logs wl
left join public.profiles p on p.id = wl.user_id
join public.groups   g on g.id = wl.group_id
group by wl.group_id, wl.user_id, p.display_name,
         g.goal_days, g.total_days, g.start_date;

grant select on public.leaderboard to authenticated;
