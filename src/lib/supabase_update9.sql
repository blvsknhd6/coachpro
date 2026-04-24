-- ============================================================
-- CoachPro — Update 9
-- date_naissance remplace age sur profiles
-- ============================================================

alter table profiles add column if not exists date_naissance date;

-- On garde age pour compatibilité le temps de la migration
-- mais il sera calculé dynamiquement à partir de date_naissance
-- alter table profiles drop column if exists age;
