-- ============================================================
-- CoachPro — RPE réalisé par l'athlète sur chaque série
-- Colle ce SQL dans : Supabase > SQL Editor > New query
-- ============================================================

-- Le coach a déjà rpe_cible sur exercices (target)
-- On ajoute le RPE effectif renseigné par l'athlète sur chaque série
alter table series_realisees add column if not exists rpe numeric;
