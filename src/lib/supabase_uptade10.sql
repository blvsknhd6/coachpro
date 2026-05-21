-- ============================================================
-- CoachPro — Features update
-- ============================================================

-- Feature 3 : Poids de corps sur les exercices
-- poids_corps = true signifie que la charge de base est le poids du corps
-- Le lest éventuel est stocké dans series_realisees.charge
alter table exercices add column if not exists poids_corps boolean default false;

-- Sur series_realisees, 'charge' représente déjà le lest (ou null si pas de lest)
-- On ajoute poids_corps_kg pour injecter le poids du corps au moment de la série
-- (déduit automatiquement depuis profiles.poids ou data_tracking)
alter table series_realisees add column if not exists poids_corps_kg numeric;

-- Index perf pour les requêtes de tonnage avec poids de corps
create index if not exists idx_sr_poids_corps
  on series_realisees(exercice_id)
  where poids_corps_kg is not null;
