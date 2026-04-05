// ============================================================
// PATCH : remplacement de analyzeRepas dans
//   - src/pages/athlete/AthleteHome.jsx
//   - src/pages/coach/CoachHome.jsx
//
// Dans chaque fichier, remplace l'intégralité de la fonction
// analyzeRepas() par la version ci-dessous.
// ============================================================

// ── VERSION CORRIGÉE ─────────────────────────────────────────
async function analyzeRepas() {
  if (!repasInput.trim()) return
  setAnalyzeLoading(true)

  try {
    // 1. Appel vers notre route Vercel sécurisée (jamais l'API directement)
    const response = await fetch('/api/analyze-repas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal: repasInput }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || `Erreur serveur ${response.status}`)
    }

    const macros = await response.json()

    // 2. Insertion en base — identique à avant
    await supabase.from('repas').insert({
      athlete_id: profile.id,
      date:       today,
      description: repasInput.trim(),
      kcal:       Math.round(macros.kcal      || 0),
      proteines:  Math.round((macros.proteines || 0) * 10) / 10,
      glucides:   Math.round((macros.glucides  || 0) * 10) / 10,
      lipides:    Math.round((macros.lipides   || 0) * 10) / 10,
    })

    setRepasInput('')

    // 3. Rechargement de la liste du jour
    const { data: allRepas } = await supabase
      .from('repas')
      .select('*')
      .eq('athlete_id', profile.id)
      .eq('date', today)
      .order('created_at')

    const list = allRepas || []
    setRepasJour(list)
    const newTotals = recalcTotals(list)

    // 4. Mise à jour du data_tracking
    if (activeBlocId) {
      await supabase.from('data_tracking').upsert({
        athlete_id: profile.id,
        date:       today,
        bloc_id:    activeBlocId,
        kcal:       Math.round(newTotals.kcal),
        proteines:  Math.round(newTotals.proteines * 10) / 10,
        glucides:   Math.round(newTotals.glucides  * 10) / 10,
        lipides:    Math.round(newTotals.lipides   * 10) / 10,
      }, { onConflict: 'athlete_id,date' })
    }
  } catch (e) {
    console.error('analyzeRepas:', e)
    alert(`Impossible d'analyser ce repas : ${e.message}`)
  }

  setAnalyzeLoading(false)
}

// ── DIFFÉRENCES PAR RAPPORT À L'ANCIEN CODE ──────────────────
//
// SUPPRIMÉ :
//   const response = await fetch('https://api.anthropic.com/v1/messages', {
//     headers: { 'Content-Type': 'application/json' },   ← pas de clé API !
//     body: JSON.stringify({ model: '...', ... })
//   })
//
// AJOUTÉ :
//   const response = await fetch('/api/analyze-repas', { ... })
//   → appel relatif vers la fonction Vercel
//   → la clé ANTHROPIC_API_KEY est lue côté serveur via process.env
//   → gestion d'erreur améliorée avec message affiché
// ============================================================
