-- ============================================================
-- CoachPro — Dates réelles des semaines
-- Colle ce SQL dans : Supabase > SQL Editor > New query
-- ============================================================

-- On ajoute date_debut sur semaines pour ancrer chaque semaine
-- dans le calendrier réel. Remplie lors de la création du bloc
-- ou manuellement par le coach.
alter table semaines add column if not exists date_debut date;

-- Index pour les requêtes RecapTracking
create index if not exists idx_semaines_bloc_date
  on semaines(bloc_id, date_debut);

-- Vue pratique : pour chaque entrée de tracking, retrouver
-- le numéro de semaine du bloc correspondant
-- (utilisée dans RecapTracking pour le calcul de bilan)
create or replace view data_tracking_avec_semaine as
select
  dt.*,
  s.id          as semaine_id,
  s.numero      as semaine_numero,
  s.date_debut  as semaine_date_debut
from data_tracking dt
left join lateral (
  select s.id, s.numero, s.date_debut
  from semaines s
  join blocs b on b.id = s.bloc_id
  where b.id = dt.bloc_id
    and s.date_debut is not null
    and s.date_debut <= dt.date
  order by s.date_debut desc
  limit 1
) s on true;
