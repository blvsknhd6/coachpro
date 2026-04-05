// api/analyze-repas.js
// Fonction serverless Vercel — proxy sécurisé vers l'API Google Gemini (100% gratuit)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const { meal } = req.body
  if (!meal?.trim()) return res.status(400).json({ error: 'Le champ "meal" est requis' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY manquante dans les variables d\'environnement')
    return res.status(500).json({ error: 'Configuration serveur manquante' })
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Tu es un expert en nutrition. Analyse ce repas : "${meal.trim()}".
Retourne UNIQUEMENT un objet JSON valide contenant exactement ces 4 clés :
"kcal", "proteines", "glucides", "lipides".
Les valeurs sont des nombres. N'ajoute aucun texte avant ou après le JSON.`
            }]
          }],
          generationConfig: {
            response_mime_type: 'application/json'
          }
        })
      }
    )

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Erreur Gemini API:', response.status, errBody)
      return res.status(502).json({ error: 'Erreur lors de l\'appel à l\'IA' })
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const macros = JSON.parse(text)

    return res.status(200).json({
      kcal:      Math.round(Number(macros.kcal)      || 0),
      proteines: Math.round((Number(macros.proteines) || 0) * 10) / 10,
      glucides:  Math.round((Number(macros.glucides)  || 0) * 10) / 10,
      lipides:   Math.round((Number(macros.lipides)   || 0) * 10) / 10,
    })
  } catch (error) {
    console.error('Erreur analyze-repas:', error)
    return res.status(500).json({ error: 'Erreur interne lors de l\'analyse' })
  }
}
