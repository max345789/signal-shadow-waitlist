drop policy if exists "Public waitlist signup inserts" on public.users;

revoke insert on public.users from anon;
revoke insert on public.users from authenticated;
