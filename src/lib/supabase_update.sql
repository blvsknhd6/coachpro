-- Ajouter le champ genre sur les profils athlètes
alter table profiles add column if not exists genre text default 'homme' check (genre in ('homme', 'femme'));

-- Ajouter une table bibliothèque d'exercices personnalisée
create table if not exists exercices_custom (
  id uuid default gen_random_uuid() primary key,
  coach_id uuid references profiles(id) on delete cascade not null,
  muscle text not null,
  nom text not null,
  created_at timestamptz default now(),
  unique(coach_id, muscle, nom)
);

alter table exercices_custom enable row level security;

create policy "Coach gère ses exercices custom"
on exercices_custom for all
using (coach_id = auth.uid());
