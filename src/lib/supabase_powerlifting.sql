-- ============================================================
-- CoachPro — Mode Powerlifting
-- Colle ce SQL dans : Supabase > SQL Editor > New query
-- ============================================================

-- Mode powerlifting sur les blocs
alter table blocs add column if not exists powerlifting boolean default false;

-- Lift principal tagué sur les exercices (squat / bench / deadlift)
alter table exercices add column if not exists main_lift text
  check (main_lift in ('squat', 'bench', 'deadlift'));

-- Maxes de référence par athlète + bloc + lift
create table if not exists powerlifting_maxes (
  id uuid default gen_random_uuid() primary key,
  athlete_id uuid references profiles(id) on delete cascade not null,
  bloc_id uuid references blocs(id) on delete cascade not null,
  lift text not null check (lift in ('squat', 'bench', 'deadlift')),
  max_kg numeric not null,
  date_test date,
  notes text,
  created_at timestamptz default now(),
  unique(athlete_id, bloc_id, lift)
);

alter table powerlifting_maxes enable row level security;

create policy "Accès maxes powerlifting" on powerlifting_maxes for all using (
  athlete_id = auth.uid() or
  exists (
    select 1 from profiles
    where id = powerlifting_maxes.athlete_id
    and coach_id = auth.uid()
  )
);

-- Index perf
create index if not exists idx_pl_maxes_athlete_bloc
  on powerlifting_maxes(athlete_id, bloc_id);
