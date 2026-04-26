-- ============================================================
-- CoachPro — Travail physique sur les profils
-- Colle ce SQL dans : Supabase > SQL Editor > New query
-- ============================================================

-- Booléen indiquant si l'athlète/coach a un travail physique
-- (maçon, infirmière, serveur, déménageur…)
-- Active un multiplicateur d'activité plus élevé dans le calcul TDEE
alter table profiles add column if not exists travail_physique boolean default false;
