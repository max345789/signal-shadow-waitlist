create table if not exists public.studio_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_code text not null check (task_code ~ '^[0-9]{6}$'),
  version_name text not null default 'Saved version',
  graph jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_runs (
  run_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_code text not null check (task_code ~ '^[0-9]{6}$'),
  provider text not null check (provider in ('Cloud', 'Kaggle', 'Local')),
  status text not null check (status in ('running', 'completed', 'queued', 'accepted', 'failed')),
  message text not null default '',
  output_summary jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studio_workflow_versions enable row level security;
alter table public.studio_runs enable row level security;

revoke all on public.studio_workflow_versions from anon, authenticated;
revoke all on public.studio_runs from anon, authenticated;
grant select, insert, delete on public.studio_workflow_versions to authenticated;
grant select, insert, update, delete on public.studio_runs to authenticated;

create policy "Users can manage their own workflow versions"
  on public.studio_workflow_versions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can manage their own workflow runs"
  on public.studio_runs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists studio_workflow_versions_lookup_idx
  on public.studio_workflow_versions(user_id, task_code, created_at desc);
create index if not exists studio_runs_lookup_idx
  on public.studio_runs(user_id, task_code, started_at desc);
