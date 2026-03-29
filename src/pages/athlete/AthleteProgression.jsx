import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import Layout from '../../components/shared/Layout'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function AthleteProgression() {
  const { profile } = useAuth()
  const theme = useTheme()
  const [exercices, setExercices] = useState([]) // liste unique d'exercices réalisés
  const [selectedExo, setSelectedExo] = useState('')
  const [chargeData, setChargeData] = useState([])
  const [tonnageData, setTonnageData] = useState([])
  const [volumeData, setVolumeData] = useState([])
  const [loading, setLoading] = useState(true)
  const color = theme.isFemme ? '#ec4899' : '#6366f1'

  useEffect(() => { if (profile) fetchExercices() }, [profile])
  useEffect(() => { if (selectedExo) fetchChargeData() }, [selectedExo])

  async function fetchExercices() {
    // Récupérer tous les exercices que l'athlète a réalisés
    const { data: sr } = await supabase.from('series_realisees').select('exercice_id').eq('athlete_id', profile.id)
    if (!sr?.length) { setLoading(false); return }

    const ids = [...new Set(sr.map(s => s.exercice_id))]
    const { data: exs } = await supabase.from('exercices').select('id, nom').in('id', ids)
    const unique = []
    const seen = new Set()
    ;(exs || []).forEach(e => { if (!seen.has(e.nom)) { seen.add(e.nom); unique.push(e) } })
    setExercices(unique.sort((a, b) => a.nom.localeCompare(b.nom)))
    if (unique.length > 0) setSelectedExo(unique[0].nom)

    await fetchTonnageData()
    setLoading(false)
  }

  async function fetchChargeData() {
    // Charge max par semaine pour l'exercice sélectionné
    const { data: exs } = await supabase.from('exercices').select('id, seance_id').eq('nom', selectedExo)
    if (!exs?.length) return

    const { data: seances } = await supabase.from('seances').select('id, semaine_id').in('id', exs.map(e => e.seance_id))
    const semaineIds = [...new Set((seances || []).map(s => s.semaine_id))]
    const { data: semaines } = await supabase.from('semaines').select('id, numero, bloc_id').in('id', semaineIds).order('numero')

    const data = []
    for (const sem of (semaines || [])) {
      const exsInSem = exs.filter(e => seances?.find(s => s.id === e.seance_id && s.semaine_id === sem.id))
      if (!exsInSem.length) continue
      const { data: sr } = await supabase.from('series_realisees').select('charge, reps')
        .eq('athlete_id', profile.id).in('exercice_id', exsInSem.map(e => e.id))
        .not('charge', 'is', null)
      if (!sr?.length) continue
      const maxCharge = Math.max(...sr.map(s => Number(s.charge)))
      data.push({ semaine: `S${sem.numero}`, charge: maxCharge })
    }
    setChargeData(data)
  }

  async function fetchTonnageData() {
    // Tonnage total par semaine (sets × reps × charge)
    const { data: blocs } = await supabase.from('blocs').select('id').eq('athlete_id', profile.id)
    if (!blocs?.length) return

    const { data: semaines } = await supabase.from('semaines').select('id, numero').in('bloc_id', blocs.map(b => b.id)).order('numero').limit(12)

    const tonnageByWeek = []
    const volumeByMuscle = {}

    for (const sem of (semaines || [])) {
      const { data: seanceIds } = await supabase.from('seances').select('id').eq('semaine_id', sem.id)
      if (!seanceIds?.length) continue
      const { data: exIds } = await supabase.from('exercices').select('id, muscle').in('seance_id', seanceIds.map(s => s.id))
      if (!exIds?.length) continue
      const { data: sr } = await supabase.from('series_realisees').select('charge, reps, exercice_id')
        .eq('athlete_id', profile.id).in('exercice_id', exIds.map(e => e.id))
        .not('charge', 'is', null).not('reps', 'is', null)

      let tonnage = 0
      ;(sr || []).forEach(s => {
        const t = Number(s.charge) * Number(s.reps)
        tonnage += t
        const muscle = exIds.find(e => e.id === s.exercice_id)?.muscle || 'autre'
        volumeByMuscle[muscle] = (volumeByMuscle[muscle] || 0) + t
      })
      if (tonnage > 0) tonnageByWeek.push({ semaine: `S${sem.numero}`, tonnage: Math.round(tonnage) })
    }

    setTonnageData(tonnageByWeek)
    setVolumeData(Object.entries(volumeByMuscle).map(([m, v]) => ({ muscle: m, volume: Math.round(v) })).sort((a, b) => b.volume - a.volume).slice(0, 8))
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/athlete" className="text-sm text-gray-400 hover:text-gray-700">← Accueil</Link>
        <h1 className="text-xl font-semibold">Ma progression</h1>
      </div>

      {loading ? <p className="text-sm text-gray-400">Chargement…</p> : exercices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">Aucune donnée pour l'instant. Commence à remplir tes séances !</p>
      ) : (
        <div className="space-y-6">
          {/* Charge par exercice */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-700">Charge max par semaine</p>
              <select value={selectedExo} onChange={e => setSelectedExo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none">
                {exercices.map(e => <option key={e.id} value={e.nom}>{e.nom}</option>)}
              </select>
            </div>
            {chargeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chargeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="semaine" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={35} unit="kg" />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => [`${v}kg`]} />
                  <Line type="monotone" dataKey="charge" stroke={color} strokeWidth={2} dot={{ r: 4, fill: color }} name="Charge max" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-gray-400 text-center py-8">Pas encore de données pour cet exercice</p>}
          </div>

          {/* Tonnage hebdo */}
          {tonnageData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-sm font-medium text-gray-700 mb-4">Volume total par semaine (kg)</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={tonnageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="semaine" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={45} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => [`${v.toLocaleString('fr')} kg`]} />
                  <Bar dataKey="tonnage" fill={color} radius={[4, 4, 0, 0]} name="Tonnage" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Volume par groupe musculaire */}
          {volumeData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-sm font-medium text-gray-700 mb-4">Volume par groupe musculaire (total)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={volumeData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="muscle" type="category" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => [`${v.toLocaleString('fr')} kg`]} />
                  <Bar dataKey="volume" fill={color} radius={[0, 4, 4, 0]} name="Volume" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
