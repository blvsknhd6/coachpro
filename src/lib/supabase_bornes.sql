-- ============================================================
-- CoachPro — Bornes personnalisées pour le data tracking
-- Colle ce SQL dans : Supabase > SQL Editor > New query
-- ============================================================

-- Colonne bornes : stocke les seuils min/max par métrique
-- Structure JSON : { "kcal": {"min": 1800, "max": 2200}, "proteines": {"min": 150, "max": 200}, ... }
-- Clés supportées : kcal, proteines, glucides, lipides, sommeil, pas, stress, seances
alter table objectifs_bloc add column if not exists bornes jsonb default '{}'::jsonb;
