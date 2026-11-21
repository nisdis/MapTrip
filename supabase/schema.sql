-- Run once in the Supabase SQL editor.
create table if not exists public.trips (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.trips enable row level security;

-- Each user can only see and change their own trips.
create policy "trips_select_own" on public.trips
  for select using (auth.uid() = user_id);
create policy "trips_insert_own" on public.trips
  for insert with check (auth.uid() = user_id);
create policy "trips_update_own" on public.trips
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trips_delete_own" on public.trips
  for delete using (auth.uid() = user_id);
