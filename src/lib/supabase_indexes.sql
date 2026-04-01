-- ============================================================
-- CoachPro — Index de performance
-- Colle ce SQL dans : Supabase > SQL Editor > New query
-- ============================================================

-- Les colonnes les plus filtrées dans l'app

-- series_realisees : filtres fréquents par athlète + semaine
create index if not exists idx_sr_athlete_semaine
  on series_realisees(athlete_id, semaine_id);

-- series_realisees : jointure sur exercice_id depuis exercices
create index if not exists idx_sr_exercice
  on series_realisees(exercice_id);

-- exercices : chargés quasi systématiquement par seance_id
create index if not exists idx_exercices_seance
  on exercices(seance_id);

-- seances : filtres par semaine_id (très fréquent)
create index if not exists idx_seances_semaine
  on seances(semaine_id);

-- semaines : filtres par bloc_id + tri par numero
create index if not exists idx_semaines_bloc_numero
  on semaines(bloc_id, numero);

-- blocs : filtres par athlete_id
create index if not exists idx_blocs_athlete
  on blocs(athlete_id, created_at desc);

-- data_tracking : filtres par athlète + date (suivi quotidien)
create index if not exists idx_dt_athlete_date
  on data_tracking(athlete_id, date desc);

-- data_tracking : filtres par bloc pour les stats du coach
create index if not exists idx_dt_bloc
  on data_tracking(bloc_id);

-- activites_realisees : jointures par semaine + athlète
create index if not exists idx_ar_semaine_athlete
  on activites_realisees(semaine_id, athlete_id);

-- repas : filtres par athlète + date (widget accueil)
create index if not exists idx_repas_athlete_date
  on repas(athlete_id, date desc);
