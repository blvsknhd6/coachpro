-- ============================================================
-- CoachPro — Suivi cycle menstruel
-- ============================================================

create table if not exists period_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  period_start_date date not null,
  period_duration_days integer check (period_duration_days between 1 and 15),
  created_at timestamptz default now(),
  unique(user_id, period_start_date)
);

alter table period_logs enable row level security;

create policy "Accès period_logs" on period_logs for all using (user_id = auth.uid());

create index if not exists idx_period_logs_user_date
  on period_logs(user_id, period_start_date desc);