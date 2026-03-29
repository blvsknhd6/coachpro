-- Notes générales de séance
create table if not exists notes_seances (
  id uuid default gen_random_uuid() primary key,
  athlete_id uuid references profiles(id) on delete cascade not null,
  seance_id uuid references seances(id) on delete cascade not null,
  semaine_id uuid references semaines(id) on delete cascade not null,
  contenu text,
  created_at timestamptz default now(),
  unique(athlete_id, seance_id, semaine_id)
);

alter table notes_seances enable row level security;

create policy "Accès notes séances" on notes_seances for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = notes_seances.athlete_id and coach_id = auth.uid())
);
