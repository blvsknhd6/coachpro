-- Préférences widgets et graphes par utilisateur
create table if not exists user_preferences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null unique,
  home_widgets jsonb default '[]'::jsonb,
  progression_config jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_preferences enable row level security;
create policy "Accès préférences" on user_preferences for all using (user_id = auth.uid());

-- Objectifs custom par bloc
create table if not exists objectifs_custom (
  id uuid default gen_random_uuid() primary key,
  bloc_id uuid references blocs(id) on delete cascade not null,
  label text not null,
  valeur text,
  created_at timestamptz default now()
);

alter table objectifs_custom enable row level security;
create policy "Accès objectifs custom" on objectifs_custom for all using (
  exists (
    select 1 from blocs b
    where b.id = objectifs_custom.bloc_id
    and (b.athlete_id = auth.uid() or
         exists (select 1 from profiles p where p.id = b.athlete_id and p.coach_id = auth.uid()))
  )
);

-- Nb séances par semaine dans objectifs
alter table objectifs_bloc add column if not exists seances_par_semaine integer;
