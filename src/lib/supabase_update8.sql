-- ============================================================
-- CoachPro — Update 8
-- 1. Taille + âge sur profiles
-- 2. Historique des objectifs de bloc
-- ============================================================

-- Données morphologiques sur les profils
alter table profiles add column if not exists taille integer;  -- en cm
alter table profiles add column if not exists age integer;

-- Historique des objectifs : une ligne par modification
-- Permet de retrouver les objectifs en vigueur à une date donnée
create table if not exists objectifs_bloc_historique (
  id uuid default gen_random_uuid() primary key,
  bloc_id uuid references blocs(id) on delete cascade not null,
  date_debut date not null,
  kcal integer,
  proteines numeric,
  glucides numeric,
  lipides numeric,
  sommeil numeric,
  pas_journaliers integer,
  stress_cible integer,
  seances_par_semaine integer,
  plan_nutritionnel text check (plan_nutritionnel in ('prise_de_masse', 'maintien', 'seche')),
  bornes jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table objectifs_bloc_historique enable row level security;

create policy "Accès objectifs historique" on objectifs_bloc_historique for all using (
  exists (
    select 1 from blocs b
    where b.id = objectifs_bloc_historique.bloc_id
    and (
      b.athlete_id = auth.uid() or
      exists (
        select 1 from profiles p
        where p.id = b.athlete_id and p.coach_id = auth.uid()
      )
    )
  )
);

create index if not exists idx_obj_historique_bloc_date
  on objectifs_bloc_historique(bloc_id, date_debut desc);
