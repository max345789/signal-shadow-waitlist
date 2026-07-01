create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_id text unique not null,
  referral_code text unique not null,
  referred_by text references public.users(referral_code),
  platform_joined text default 'web_waitlist',
  verified_email boolean default false,
  matches_played integer default 0,
  created_at timestamptz default now(),
  last_active timestamptz default now()
);

create index if not exists idx_users_referral_code on public.users(referral_code);
create index if not exists idx_users_display_id on public.users(display_id);

alter table public.users enable row level security;

grant select, insert, update, delete on public.users to service_role;

revoke insert on public.users from anon;
revoke insert on public.users from authenticated;
