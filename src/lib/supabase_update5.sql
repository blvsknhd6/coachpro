-- Plan nutritionnel sur objectifs_bloc
alter table objectifs_bloc add column if not exists plan_nutritionnel text check (plan_nutritionnel in ('prise_de_masse', 'maintien', 'seche'));

-- Charge indicative et RPE dans exercices
alter table exercices add column if not exists charge_indicative numeric;
alter table exercices add column if not exists rpe_cible text;
alter table exercices add column if not exists unilateral boolean default false;

-- Options d'affichage par bloc
alter table blocs add column if not exists show_charge_indicative boolean default false;
alter table blocs add column if not exists show_rpe boolean default false;

-- Notes de séances (si pas déjà créé)
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

create policy if not exists "Accès notes séances" on notes_seances for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = notes_seances.athlete_id and coach_id = auth.uid())
);

-- Activités bonus custom ajoutées par l'athlète
alter table activites_realisees add column if not exists nom_custom text;
