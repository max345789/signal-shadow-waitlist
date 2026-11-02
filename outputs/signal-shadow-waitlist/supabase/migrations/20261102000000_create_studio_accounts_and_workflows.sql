create table if not exists public.studio_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled movie workflow',
  task_code text not null default '565349' check (task_code ~ '^[0-9]{6}$'),
  graph jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_code)
);

alter table public.studio_profiles enable row level security;
alter table public.studio_workflows enable row level security;

revoke all on public.studio_profiles from anon, authenticated;
revoke all on public.studio_workflows from anon, authenticated;
grant select, insert, update, delete on public.studio_profiles to authenticated;
grant select, insert, update, delete on public.studio_workflows to authenticated;

create policy "Users can read their own studio profile"
  on public.studio_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own studio profile"
  on public.studio_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own studio profile"
  on public.studio_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own studio profile"
  on public.studio_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own workflows"
  on public.studio_workflows for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own workflows"
  on public.studio_workflows for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own workflows"
  on public.studio_workflows for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own workflows"
  on public.studio_workflows for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists studio_workflows_user_id_idx on public.studio_workflows(user_id);

create or replace function public.create_studio_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.studio_profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_studio_profile on auth.users;
create trigger on_auth_user_created_studio_profile
  after insert on auth.users
  for each row execute procedure public.create_studio_profile();
