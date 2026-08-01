-- RoleReady — enable Row Level Security (RLS) on the two user tables.
--
-- Why: the frontend talks to Supabase with the PUBLIC anon key. Without RLS,
-- anyone with that key could read/write EVERY user's rows. These policies lock
-- each row to the logged-in user, matched by the email in their auth token.
--
-- Safe by design: the app only ever reads/writes rows for the logged-in user's
-- own email (see frontend/src/lib/db.ts), so these policies mirror existing
-- behavior — nothing in the app should break.
--
-- Reversible: to roll back, run the two `disable row level security` lines at
-- the bottom (commented out).

-- ── profiles ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile"
  on public.profiles
  for all
  to authenticated
  using  ((auth.jwt() ->> 'email') = email)
  with check ((auth.jwt() ->> 'email') = email);

-- ── applications ────────────────────────────────────────────────────────────
alter table public.applications enable row level security;

drop policy if exists "Users manage their own applications" on public.applications;
create policy "Users manage their own applications"
  on public.applications
  for all
  to authenticated
  using  ((auth.jwt() ->> 'email') = email)
  with check ((auth.jwt() ->> 'email') = email);

-- ── ROLLBACK (only if the app breaks after enabling) ────────────────────────
-- alter table public.profiles      disable row level security;
-- alter table public.applications  disable row level security;
