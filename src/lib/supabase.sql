-- ============================================================
-- CoachPro — Schéma base de données Supabase
-- Colle ce SQL dans : Supabase > SQL Editor > New query
-- ============================================================

-- Profils utilisateurs (coach ou athlète)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null check (role in ('coach', 'athlete')),
  full_name text not null,
  email text not null,
  coach_id uuid references profiles(id),  -- null si coach, pointe vers le coach si athlète
  created_at timestamptz default now()
);

-- Blocs de programme (ex: "Bloc 1", "Bloc 2")
create table blocs (
  id uuid default gen_random_uuid() primary key,
  athlete_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  poids_depart numeric,
  created_at timestamptz default now()
);

-- Semaines dans un bloc
create table semaines (
  id uuid default gen_random_uuid() primary key,
  bloc_id uuid references blocs(id) on delete cascade not null,
  numero integer not null,
  created_at timestamptz default now()
);

-- Séances dans une semaine (ex: "Jour 1 : Lower Body 1")
create table seances (
  id uuid default gen_random_uuid() primary key,
  semaine_id uuid references semaines(id) on delete cascade not null,
  nom text not null,
  ordre integer not null default 0
);

-- Exercices prescrits dans une séance
create table exercices (
  id uuid default gen_random_uuid() primary key,
  seance_id uuid references seances(id) on delete cascade not null,
  muscle text,
  nom text not null,
  sets integer not null default 3,
  rep_range text,         -- ex: "8-10"
  repos text,             -- ex: "3'"
  indications text,       -- notes du coach
  ordre integer not null default 0
);

-- Séries réalisées par l'athlète (une ligne par série)
create table series_realisees (
  id uuid default gen_random_uuid() primary key,
  exercice_id uuid references exercices(id) on delete cascade not null,
  semaine_id uuid references semaines(id) on delete cascade not null,
  athlete_id uuid references profiles(id) on delete cascade not null,
  numero_set integer not null,   -- 1, 2, 3, 4...
  charge numeric,                -- en kg
  reps integer,
  notes text,
  created_at timestamptz default now(),
  unique(exercice_id, semaine_id, athlete_id, numero_set)
);

-- Activités bonus (abdos, cardio, pilates…)
create table activites_bonus (
  id uuid default gen_random_uuid() primary key,
  seance_id uuid references seances(id) on delete cascade not null,
  nom text not null,
  description text,
  ordre integer not null default 0
);

create table activites_realisees (
  id uuid default gen_random_uuid() primary key,
  activite_id uuid references activites_bonus(id) on delete cascade not null,
  semaine_id uuid references semaines(id) on delete cascade not null,
  athlete_id uuid references profiles(id) on delete cascade not null,
  realisee boolean default false,
  unique(activite_id, semaine_id, athlete_id)
);

-- Data tracking quotidien
create table data_tracking (
  id uuid default gen_random_uuid() primary key,
  athlete_id uuid references profiles(id) on delete cascade not null,
  bloc_id uuid references blocs(id) on delete cascade not null,
  date date not null,
  sport_fait boolean default false,
  kcal integer,
  proteines numeric,
  glucides numeric,
  lipides numeric,
  sommeil numeric,          -- heures
  pas_journaliers integer,
  stress integer,           -- /10
  poids numeric,            -- optionnel
  unique(athlete_id, date)
);

-- Objectifs nutritionnels par bloc
create table objectifs_bloc (
  id uuid default gen_random_uuid() primary key,
  bloc_id uuid references blocs(id) on delete cascade not null unique,
  poids_cible numeric,
  kcal integer,
  proteines numeric,
  glucides numeric,
  lipides numeric,
  sommeil numeric,
  pas_journaliers integer,
  stress_cible integer
);

-- ============================================================
-- Row Level Security (RLS) — sécurité des données
-- ============================================================

alter table profiles enable row level security;
alter table blocs enable row level security;
alter table semaines enable row level security;
alter table seances enable row level security;
alter table exercices enable row level security;
alter table series_realisees enable row level security;
alter table activites_bonus enable row level security;
alter table activites_realisees enable row level security;
alter table data_tracking enable row level security;
alter table objectifs_bloc enable row level security;

-- Profiles : chacun voit son profil + le coach voit ses athlètes
create policy "Voir son propre profil" on profiles for select using (
  auth.uid() = id or coach_id = auth.uid()
);
create policy "Créer son profil" on profiles for insert with check (auth.uid() = id);
create policy "Modifier son profil" on profiles for update using (auth.uid() = id);

-- Blocs : coach voit tout, athlète voit les siens
create policy "Accès blocs" on blocs for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = blocs.athlete_id and coach_id = auth.uid())
);

-- Semaines
create policy "Accès semaines" on semaines for all using (
  exists (
    select 1 from blocs b
    where b.id = semaines.bloc_id
    and (b.athlete_id = auth.uid() or
         exists (select 1 from profiles p where p.id = b.athlete_id and p.coach_id = auth.uid()))
  )
);

-- Séances
create policy "Accès séances" on seances for all using (
  exists (
    select 1 from semaines s
    join blocs b on b.id = s.bloc_id
    where s.id = seances.semaine_id
    and (b.athlete_id = auth.uid() or
         exists (select 1 from profiles p where p.id = b.athlete_id and p.coach_id = auth.uid()))
  )
);

-- Exercices
create policy "Accès exercices" on exercices for all using (
  exists (
    select 1 from seances sc
    join semaines s on s.id = sc.semaine_id
    join blocs b on b.id = s.bloc_id
    where sc.id = exercices.seance_id
    and (b.athlete_id = auth.uid() or
         exists (select 1 from profiles p where p.id = b.athlete_id and p.coach_id = auth.uid()))
  )
);

-- Séries réalisées
create policy "Accès séries" on series_realisees for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = series_realisees.athlete_id and coach_id = auth.uid())
);

-- Activités bonus
create policy "Accès activités bonus" on activites_bonus for all using (
  exists (
    select 1 from seances sc
    join semaines s on s.id = sc.semaine_id
    join blocs b on b.id = s.bloc_id
    where sc.id = activites_bonus.seance_id
    and (b.athlete_id = auth.uid() or
         exists (select 1 from profiles p where p.id = b.athlete_id and p.coach_id = auth.uid()))
  )
);

create policy "Accès activités réalisées" on activites_realisees for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = activites_realisees.athlete_id and coach_id = auth.uid())
);

-- Data tracking
create policy "Accès data tracking" on data_tracking for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = data_tracking.athlete_id and coach_id = auth.uid())
);

-- Objectifs
create policy "Accès objectifs" on objectifs_bloc for all using (
  exists (
    select 1 from blocs b
    where b.id = objectifs_bloc.bloc_id
    and (b.athlete_id = auth.uid() or
         exists (select 1 from profiles p where p.id = b.athlete_id and p.coach_id = auth.uid()))
  )
);
