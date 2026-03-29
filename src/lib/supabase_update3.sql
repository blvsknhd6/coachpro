-- Fix: permettre au coach de modifier les profils de ses athlètes
drop policy if exists "Modifier son profil" on profiles;
create policy "Modifier son profil" on profiles for update using (
  auth.uid() = id or
  coach_id = auth.uid()
);

-- Ajouter flag is_self pour le profil coach-athlète
alter table profiles add column if not exists is_self boolean default false;

-- S'assurer que les coaches peuvent voir leurs propres blocs athlète
drop policy if exists "Accès blocs" on blocs;
create policy "Accès blocs" on blocs for all using (
  athlete_id = auth.uid() or
  exists (
    select 1 from profiles
    where id = blocs.athlete_id
    and (coach_id = auth.uid())
  )
);
