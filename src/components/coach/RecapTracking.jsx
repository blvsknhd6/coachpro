import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function RecapTracking({ athleteId, blocId }) {
  const [data, setData]       = useState([])
  const [objectifs, setObjectifs] = useState(null)
  const [semaines, setSemaines]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [blocId])

  async function fetchData() {
    setLoading(true)
    const [{ data: tracking }, { data: obj }, { data: sems }] = await Promise.all([
      supabase.from('data_tracking').select('*').eq('athlete_id', athleteId).eq('bloc_id', blocId).order('date'),
      supabase.from('objectifs_bloc').select('*').eq('bloc_id', blocId).single(),
      supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero'),
    ])
    setData(tracking || [])
    setObjectifs(obj)
    setSemaines(sems || [])
    setLoading(false)
  }

  // Bilans par semaine (moyenne des jours remplis)
  function bilanSemaines() {
    if (!semaines.length || !data.length) return []
    // On groupe par semaine (7 jours par semaine, à partir du premier jour de tracking)
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))
    const firstDate = sorted[0] ? new Date(sorted[0].date) : null
    if (!firstDate) return []

    return semaines.map((sem, i) => {
      const startDay = i * 7
      const endDay = startDay + 6
      const jours = sorted.filter((d, idx) => {
        const dayNum = Math.floor((new Date(d.date) - firstDate) / 86400000)
        return dayNum >= startDay && dayNum <= endDay
      })
      const avg = (key) => {
        const vals = jours.map(j => j[key]).filter(v => v !== null && v !== undefined)
        return vals.length ? (vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1) : null
      }
      return {
        name: `S${sem.numero}`,
        kcal: avg('kcal'),
        proteines: avg('proteines'),
        glucides: avg('glucides'),
        lipides: avg('lipides'),
        sommeil: avg('sommeil'),
        pas: avg('pas_journaliers'),
        stress: avg('stress'),
        sport: jours.filter(j => j.sport_fait).length,
      }
    }).filter(s => s.kcal !== null || s.sport > 0)
  }

  const bilans = bilanSemaines()
  const poidsData = data.filter(d => d.poids).map(d => ({ date: d.date, poids: d.poids }))

  if (loading) return <p className="text-sm text-gray-400">Chargement du suivi…</p>

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700">Suivi du bloc</h3>

      {bilans.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune donnée saisie par la coachée pour l'instant.</p>
      ) : (
        <>
          {/* Tableau récap */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="text-left px-4 py-3 font-medium">Semaine</th>
                  <th className="px-3 py-3 font-medium text-right">Sport</th>
                  <th className="px-3 py-3 font-medium text-right">Kcal moy.</th>
                  <th className="px-3 py-3 font-medium text-right">P</th>
                  <th className="px-3 py-3 font-medium text-right">G</th>
                  <th className="px-3 py-3 font-medium text-right">L</th>
                  <th className="px-3 py-3 font-medium text-right">Sommeil</th>
                  <th className="px-3 py-3 font-medium text-right">Pas</th>
                  <th className="px-3 py-3 font-medium text-right">Stress</th>
                </tr>
                {objectifs && (
                  <tr className="border-b border-gray-100 text-xs text-brand-500 bg-brand-50/50">
                    <td className="px-4 py-2 font-medium">Objectifs</td>
                    <td className="px-3 py-2 text-right">—</td>
                    <td className="px-3 py-2 text-right">{objectifs.kcal ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.proteines ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.glucides ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.lipides ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.sommeil ?? '—'}h</td>
                    <td className="px-3 py-2 text-right">{objectifs.pas_journaliers ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.stress_cible ?? '—'}/10</td>
                  </tr>
                )}
              </thead>
              <tbody>
                {bilans.map(b => (
                  <tr key={b.name} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{b.name}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.sport}j</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.kcal ?? '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.proteines ?? '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.glucides ?? '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.lipides ?? '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.sommeil ?? '—'}h</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.pas ? Number(b.pas).toLocaleString('fr') : '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{b.stress ?? '—'}/10</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Graphique kcal */}
          {bilans.some(b => b.kcal) && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-500 mb-3">Kcal moyennes par semaine</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={bilans}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="kcal" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Kcal" />
                  {objectifs?.kcal && (
                    <Line type="monotone" dataKey={() => objectifs.kcal} stroke="#a5b4fc" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Objectif" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Poids */}
          {poidsData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-500 mb-3">Évolution du poids</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={poidsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} width={35} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => [`${v} kg`]} />
                  <Line type="monotone" dataKey="poids" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Poids" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
