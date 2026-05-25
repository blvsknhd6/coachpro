# Guide d'intégration — 4 nouvelles features CoachPro

## Ordre recommandé

1. SQL (base de données)
2. Nouveau fichier utilitaire
3. Fichiers remplaçables directement
4. Fichiers nécessitant un patch manuel

---

## ÉTAPE 1 — SQL (Supabase > SQL Editor > New query)

**Fichier : `supabase_features.sql`**

Colle et exécute ce fichier dans Supabase.
Il ajoute :
- `exercices.poids_corps` (boolean) — marque un exercice comme étant au poids de corps
- `series_realisees.poids_corps_kg` (numeric) — snapshot du poids de l'athlète au moment de la série

---

## ÉTAPE 2 — Nouveau fichier utilitaire

**Fichier : `tonnage.js` → `src/lib/tonnage.js`**

Crée ce fichier dans `src/lib/`. Il contient les fonctions
`calcSerieTonnage` et `calcExerciceTonnage` qui gèrent le calcul
du volume en tenant compte des exercices au poids de corps.
Utilisé par ProgressionPanel, AthleteProgression, CoachProgression.

---

## ÉTAPE 3 — Fichiers à remplacer intégralement

Ces fichiers remplacent directement leurs équivalents dans le projet.
Copie le contenu et écrase le fichier existant.

### `AthleteSeance.jsx` → `src/pages/athlete/AthleteSeance.jsx`

**Features incluses :**
- **Feature 1** : Dans le récap S-1, un bouton "Compléter la semaine précédente"
  apparaît si des sets n'ont pas été réalisés. Il navigue directement vers
  la séance de la semaine précédente.
- **Feature 2** : Badge "⚠ En cours" / "✓ Terminé" sur la barre de progression
  de la séance en cours. Badge "incomplet" sur le récap S-1.
- **Feature 3** : Si un exercice est au poids de corps (`poids_corps = true`),
  le champ charge devient le lest additionnel. La SerieRow affiche le poids
  total (poids corps + lest) en temps réel. Le tonnage est calculé correctement.

### `CoachBlocEditor.jsx` → `src/pages/coach/CoachBlocEditor.jsx`

**Features incluses :**
- **Feature 3** : Colonne 🏃 dans la grille d'exercices pour toggler `poids_corps`.
  Se propage automatiquement aux semaines suivantes comme les autres champs.
  Le champ charge indicative est désactivé si poids_corps est actif.
- **Feature 4** : Bouton "🏋️ Vue multi-semaines" qui apparaît quand le mode
  Powerlifting est activé. Ouvre une modal avec un tableau :
  - Lignes : Squat / Bench / Deadlift
  - Colonnes : chaque semaine du bloc
  - Champs éditables : Sets, Reps, Charge indicative, RPE, Note coach
  - Sauvegarde immédiate à la perte de focus (onBlur)

### `AthleteEntrainement.jsx` → `src/pages/athlete/AthleteEntrainement.jsx`

**Features incluses :**
- **Feature 2** : Les cartes de séances ont maintenant 4 états visuels :
  - Gris "N exercices" → non commencé
  - Amber "⚠ En cours · X/Y" → commencé mais incomplet
  - Vert "✓ Terminé" → tous les sets réalisés
  - La barre de progression change de couleur selon l'état
  - Détail des exercices partiels (sous la barre, seulement si partial)

### `CoachAthleteView.jsx` → `src/pages/coach/CoachAthleteView.jsx`

**Features incluses :**
- **Feature 2** : Même logique d'état (non commencé / en cours / terminé)
  visible dans la vue récap du coach. Les sets manquants apparaissent en
  pointillés amber dans le détail déroulant d'une séance.
  Les activités bonus ont aussi un compteur X/Y coloré.

### `ProgressionPanel.jsx` → `src/components/shared/ProgressionPanel.jsx`

**Features incluses :**
- **Feature 3** : Le calcul du tonnage utilise maintenant `calcSerieTonnage`
  qui prend en compte `poids_corps` et `poids_corps_kg`.
  Import ajouté : `import { calcSerieTonnage } from '../../lib/tonnage'`

---

## ÉTAPE 4 — Patch manuel (AthleteProgression + CoachProgression)

**Fichier de référence : `PATCH_progression_tonnage.js`**

Ce fichier n'est PAS à copier directement. Il contient les fonctions
modifiées à reporter manuellement dans deux fichiers.

### Dans `src/pages/athlete/AthleteProgression.jsx`

1. Ajouter l'import en haut :
   ```js
   import { calcSerieTonnage } from '../../lib/tonnage'
   ```

2. Remplacer la fonction `loadTonnageAndVolume` par celle du patch.
   Attention : cette version utilise `setVolumeMuscles` et
   `setVolumeParSemaineData` (variables spécifiques à AthleteProgression).
   Décommente la ligne `setVolumeMuscles` et `setVolumeParSemaineData`,
   et commente/supprime la ligne `setVolumeData`.

3. Remplacer la fonction `loadFavData` par celle du patch.

### Dans `src/pages/coach/CoachProgression.jsx`

1. Ajouter l'import en haut :
   ```js
   import { calcSerieTonnage } from '../../lib/tonnage'
   ```

2. Remplacer la fonction `loadTonnageAndVolume` par celle du patch.
   Attention : cette version utilise `setVolumeData` (spécifique à
   CoachProgression — bar chart horizontal des muscles).
   Décommente la ligne `setVolumeData`, et commente/supprime les lignes
   `setVolumeMuscles` et `setVolumeParSemaineData`.

3. Remplacer la fonction `loadFavData` par celle du patch.

---

## ÉTAPE 5 — CoachMyTraining.jsx (Feature 2, optionnel)

`CoachMyTraining.jsx` affiche déjà le pourcentage de complétion par exercice
via `series_realisees.length > 0`. Pour une cohérence parfaite avec la
Feature 2 (sets partiels), tu peux appliquer le même pattern que dans
`AthleteEntrainement.jsx` :

Dans la fonction qui construit les cartes de séance :
```js
// Remplacer :
const doneEx = seance.exercices?.filter(e => (e.series_realisees?.length || 0) > 0).length || 0

// Par (pour avoir sets complets vs partiels) :
const totalSets = seance.exercices?.reduce((acc, ex) => acc + (ex.sets || 0), 0) || 0
const doneSets  = seance.exercices?.reduce((acc, ex) =>
  acc + (ex.series_realisees?.filter(s => s.reps || s.charge).length || 0), 0) || 0
```
Et adapter le fetch pour inclure `reps, charge` dans `series_realisees`.

---

## Récapitulatif des fichiers

| Fichier | Action | Features |
|---|---|---|
| `supabase_features.sql` | Exécuter dans Supabase | 3 |
| `src/lib/tonnage.js` | Créer (nouveau fichier) | 3 |
| `src/pages/athlete/AthleteSeance.jsx` | Remplacer | 1, 2, 3 |
| `src/pages/coach/CoachBlocEditor.jsx` | Remplacer | 3, 4 |
| `src/pages/athlete/AthleteEntrainement.jsx` | Remplacer | 2 |
| `src/pages/coach/CoachAthleteView.jsx` | Remplacer | 2 |
| `src/components/shared/ProgressionPanel.jsx` | Remplacer | 3 |
| `src/pages/athlete/AthleteProgression.jsx` | Patch manuel | 3 |
| `src/pages/coach/CoachProgression.jsx` | Patch manuel | 3 |

---

## Notes importantes

### Feature 1 — Clic sur série S-1
- Le bouton "Compléter la semaine précédente" n'apparaît que si :
  - On est en S2 ou plus (S1 n'a pas de précédent)
  - Au moins un set est manquant dans la séance précédente
- La navigation utilise `prevSeanceId` et `prevSemaineId` récupérés
  pendant `fetchSeriesPrev`

### Feature 2 — État partiel
- "Partiel" = au moins 1 set avec reps ou charge, mais pas tous les sets
- Le calcul se base sur `sets` (le nombre prescrit) vs séries effectivement
  renseignées avec reps ou charge
- Dans `AthleteEntrainement`, le fetch a été mis à jour pour récupérer
  `reps` et `charge` dans `series_realisees` (nécessaire pour distinguer
  "série créée" vs "série réellement remplie")

### Feature 3 — Poids de corps
- Pour les exercices marqués 🏃 `poids_corps = true` :
  - Le champ "charge" dans la séance devient le **lest additionnel** (0 si aucun)
  - Le tonnage = (poids_corps_kg + lest) × reps × multiplicateur
  - `poids_corps_kg` est un snapshot sauvegardé à la création de la série
    (depuis le dernier `data_tracking.poids` ou `profiles.poids`)
  - Si aucun poids n'est connu, seul le lest est compté
- Exemples d'exercices concernés : tractions, dips, pompes lestées,
  fentes au poids de corps, gainage (sets = durée), etc.

### Feature 4 — Vue multi-semaines powerlifting
- N'apparaît que si le bloc a `powerlifting = true`
- Charge indicative et RPE sont éditables par semaine (ne se propagent pas)
- Sets et reps sont éditables et se sauvegardent directement en base
  **sans déclencher la propagation** (la propagation n'est déclenchée
  que depuis l'éditeur semaine par semaine)
- Si tu veux que sets/reps se propagent depuis cette vue aussi, il faudrait
  appeler `propagate()` après chaque update — c'est volontairement omis
  pour l'instant pour garder un contrôle précis semaine par semaine
