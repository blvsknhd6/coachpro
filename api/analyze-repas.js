export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const { meal } = req.body
  if (!meal?.trim()) return res.status(400).json({ error: 'Le champ "meal" est requis' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY manquante' })

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Tu es un expert en nutrition. Analyse ce repas : "${meal.trim()}". Retourne UNIQUEMENT un objet JSON valide avec ces 4 clés : "kcal", "proteines", "glucides", "lipides". Valeurs numériques uniquement.` }] }],
          generationConfig: { response_mime_type: 'application/json' }
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      // Renvoie l'erreur Gemini exacte pour debug
      return res.status(502).json({ 
        error: 'Erreur Gemini', 
        status: response.status,
        detail: data 
      })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const macros = JSON.parse(text)

    return res.status(200).json({
      kcal:      Math.round(Number(macros.kcal)      || 0),
      proteines: Math.round((Number(macros.proteines) || 0) * 10) / 10,
      glucides:  Math.round((Number(macros.glucides)  || 0) * 10) / 10,
      lipides:   Math.round((Number(macros.lipides)   || 0) * 10) / 10,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
