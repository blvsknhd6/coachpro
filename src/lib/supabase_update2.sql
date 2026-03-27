-- Permettre au coach d'avoir son propre profil athlète lié à lui-même
-- On ajoute un champ self_athlete_id sur profiles pour les coachs
alter table profiles add column if not exists self_athlete_id uuid references profiles(id);

-- Politique pour que le coach puisse modifier les séries de ses athlètes
drop policy if exists "Accès séries" on series_realisees;
create policy "Accès séries" on series_realisees for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = series_realisees.athlete_id and coach_id = auth.uid())
);

-- Politique pour que le coach puisse modifier les activités réalisées de ses athlètes  
drop policy if exists "Accès activités réalisées" on activites_realisees;
create policy "Accès activités réalisées" on activites_realisees for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = activites_realisees.athlete_id and coach_id = auth.uid())
);

-- Politique pour les blocs : le coach peut aussi créer des blocs pour lui-même
drop policy if exists "Accès blocs" on blocs;
create policy "Accès blocs" on blocs for all using (
  athlete_id = auth.uid() or
  exists (select 1 from profiles where id = blocs.athlete_id and coach_id = auth.uid()) or
  exists (select 1 from profiles where self_athlete_id = blocs.athlete_id and id = auth.uid())
);
