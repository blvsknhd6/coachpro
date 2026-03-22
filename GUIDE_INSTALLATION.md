# Guide d'installation CoachPro
## Pour Windows — sans expérience en développement

---

## ÉTAPE 1 — Installer Node.js

1. Va sur https://nodejs.org
2. Clique sur le bouton vert **"LTS"** (la version stable)
3. Télécharge et installe — laisse tout par défaut, clique "Next" partout
4. Une fois installé, ouvre le **Terminal** de VS Code :
   - Dans VS Code : menu `Terminal` → `Nouveau terminal`
5. Tape cette commande pour vérifier que ça marche :
   ```
   node --version
   ```
   Tu dois voir quelque chose comme `v20.x.x` ✓

---

## ÉTAPE 2 — Créer un compte Supabase (gratuit)

1. Va sur https://supabase.com et clique **"Start for free"**
2. Inscris-toi avec ton email (ou GitHub)
3. Clique **"New project"**
   - Organisation : laisse celle créée par défaut
   - Nom du projet : `coachpro`
   - Mot de passe base de données : note-le quelque part (tu n'en auras pas besoin souvent)
   - Région : **Southeast Asia (Singapore)** — la plus proche d'Australie
4. Attends 1-2 minutes que le projet se crée

---

## ÉTAPE 3 — Créer la base de données

1. Dans Supabase, clique sur **"SQL Editor"** dans le menu de gauche
2. Clique **"New query"**
3. Ouvre le fichier `src/lib/supabase.sql` dans VS Code
4. Copie **tout son contenu** (Ctrl+A puis Ctrl+C)
5. Colle-le dans l'éditeur SQL de Supabase (Ctrl+V)
6. Clique **"Run"** (ou Ctrl+Enter)
7. Tu dois voir `Success. No rows returned` en bas ✓

---

## ÉTAPE 4 — Récupérer tes clés Supabase

1. Dans Supabase, clique sur **"Project Settings"** (icône engrenage en bas à gauche)
2. Clique **"API"**
3. Tu vois deux valeurs importantes :
   - **Project URL** → ressemble à `https://abcdefgh.supabase.co`
   - **anon public** → une longue clé qui commence par `eyJ...`
4. Garde cette page ouverte, tu en auras besoin à l'étape suivante

---

## ÉTAPE 5 — Configurer le projet

1. Dans VS Code, ouvre le dossier `coachpro` :
   - Menu `Fichier` → `Ouvrir le dossier` → sélectionne le dossier `coachpro`
2. Crée un fichier `.env` à la racine du projet :
   - Clic droit sur l'explorateur de fichiers (panneau gauche) → `Nouveau fichier`
   - Nomme-le exactement `.env`
3. Colle ce contenu dans le fichier `.env` en remplaçant les valeurs :
   ```
   VITE_SUPABASE_URL=https://TONPROJECTID.supabase.co
   VITE_SUPABASE_ANON_KEY=TON_ANON_KEY_QUI_COMMENCE_PAR_eyJ
   ```
4. Sauvegarde (Ctrl+S)

---

## ÉTAPE 6 — Installer les dépendances et lancer l'appli

Dans le terminal VS Code, tape ces commandes une par une :

```bash
npm install
```
*(attend que ça se termine, ~1 minute)*

```bash
npm run dev
```

Tu vas voir quelque chose comme :
```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
```

**Ouvre http://localhost:5173 dans ton navigateur** — l'appli tourne ! ✓

---

## ÉTAPE 7 — Créer ton compte coach

Tu dois créer ton compte manuellement dans Supabase :

1. Dans Supabase, va dans **"Authentication"** → **"Users"**
2. Clique **"Add user"** → **"Create new user"**
3. Entre ton email et un mot de passe
4. Clique **"Create user"**
5. Note l'**UUID** de l'utilisateur créé (colonne "User UID")
6. Va dans **"SQL Editor"** → **"New query"** et colle :
   ```sql
   insert into profiles (id, role, full_name, email)
   values (
     'COLLE_TON_UUID_ICI',
     'coach',
     'Ton Prénom Nom',
     'ton@email.com'
   );
   ```
7. Remplace les valeurs et clique **"Run"**
8. Retourne sur l'appli, connecte-toi avec tes identifiants ✓

---

## ÉTAPE 8 — Déployer sur Internet (optionnel mais recommandé)

Pour que tes coachées puissent accéder à l'appli depuis leur téléphone :

### Créer un compte Vercel (gratuit)
1. Va sur https://vercel.com et inscris-toi
2. Connecte ton compte GitHub (crée-en un sur github.com si tu n'en as pas)

### Mettre le projet sur GitHub
Dans le terminal VS Code :
```bash
git init
git add .
git commit -m "Initial commit"
```
Ensuite, crée un nouveau dépôt sur github.com (bouton "+") et suis les instructions affichées.

### Déployer sur Vercel
1. Sur Vercel, clique **"Add New Project"**
2. Sélectionne ton dépôt GitHub `coachpro`
3. Dans **"Environment Variables"**, ajoute tes deux variables :
   - `VITE_SUPABASE_URL` → ta valeur
   - `VITE_SUPABASE_ANON_KEY` → ta valeur
4. Clique **"Deploy"**

En 2 minutes, ton appli est en ligne sur une URL type `coachpro.vercel.app` 🎉

---

## Utilisation quotidienne

### Lancer l'appli en local
```bash
npm run dev
```
Puis ouvre http://localhost:5173

### Créer une nouvelle coachée
1. Connecte-toi en tant que coach
2. Dashboard → "Ajouter une coachée"
3. Entre son nom, email et un mot de passe temporaire
4. Donne-lui ses identifiants → elle se connecte et voit son espace athlète

### Créer un programme
1. Clique sur la coachée → "Nouveau bloc" (ex: "Bloc 1 - Prise de masse")
2. "Éditer le programme" → "Semaine" pour créer les semaines
3. Les 4 séances et les activités bonus sont créées automatiquement
4. Remplis les exercices (muscle, nom, sets, reps, repos)

### Ce que voit la coachée
- Ses séances par semaine avec progression
- Saisie en temps réel : une ligne par série (charge + reps + notes)
- Son suivi quotidien : nutrition, sommeil, pas, stress, poids (optionnel)

---

## En cas de problème

**`npm install` échoue** → Vérifie que Node.js est bien installé : `node --version`

**L'appli ne charge pas** → Vérifie que le fichier `.env` existe et contient les bonnes valeurs

**Erreur de connexion** → Vérifie que le profil coach a bien été créé dans la table `profiles`

**La coachée ne peut pas se connecter** → Vérifie dans Supabase > Authentication > Users que son compte existe
