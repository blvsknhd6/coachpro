-- Table repas journaliers
create table if not exists repas (
  id uuid default gen_random_uuid() primary key,
  athlete_id uuid references profiles(id) on delete cascade not null,
  date date not null,
  description text not null,
  kcal integer,
  proteines numeric,
  glucides numeric,
  lipides numeric,
  created_at timestamptz default now()
);

alter table repas enable row level security;
create policy "Accès repas" on repas for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = repas.athlete_id and coach_id = auth.uid())
);

-- Table repas favoris / mes repas
create table if not exists repas_favoris (
  id uuid default gen_random_uuid() primary key,
  athlete_id uuid references profiles(id) on delete cascade not null,
  nom text not null,
  description text not null,
  kcal integer,
  proteines numeric,
  glucides numeric,
  lipides numeric,
  created_at timestamptz default now()
);

alter table repas_favoris enable row level security;
create policy "Accès repas favoris" on repas_favoris for all using (athlete_id = auth.uid());

-- Charge indicative et RPE sur exercices (si pas encore fait)
alter table exercices add column if not exists charge_indicative numeric;
alter table exercices add column if not exists rpe_cible text;
alter table exercices add column if not exists unilateral boolean default false;
alter table blocs add column if not exists show_charge_indicative boolean default false;
alter table blocs add column if not exists show_rpe boolean default false;

-- Activités bonus éditables
alter table activites_bonus add column if not exists description text;
