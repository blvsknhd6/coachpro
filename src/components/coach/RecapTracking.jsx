import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function RecapTracking({ athleteId, blocId, coachMode = false }) {
  const [data, setData]         = useState([])
  const [objectifs, setObjectifs] = useState(null)
  const [semaines, setSemaines] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving]     = useState(false)

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

  async function saveEntry() {
    setSaving(true)
    await supabase.from('data_tracking').update({
      sport_fait: editForm.sport_fait,
      kcal: editForm.kcal || null,
      proteines: editForm.proteines || null,
      glucides: editForm.glucides || null,
      lipides: editForm.lipides || null,
      sommeil: editForm.sommeil || null,
      pas_journaliers: editForm.pas_journaliers || null,
      stress: editForm.stress || null,
      poids: editForm.poids || null,
    }).eq('id', editingEntry)
    setEditingEntry(null)
    fetchData()
    setSaving(false)
  }

  function bilanSemaines() {
    if (!semaines.length || !data.length) return []
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))
    const firstDate = sorted[0] ? new Date(sorted[0].date) : null
    if (!firstDate) return []
    return semaines.map((sem, i) => {
      const startDay = i * 7, endDay = startDay + 6
      const jours = sorted.filter(d => {
        const dayNum = Math.floor((new Date(d.date) - firstDate) / 86400000)
        return dayNum >= startDay && dayNum <= endDay
      })
      const avg = (key) => {
        const vals = jours.map(j => j[key]).filter(v => v !== null && v !== undefined)
        return vals.length ? (vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1) : null
      }
      return { name: `S${sem.numero}`, kcal: avg('kcal'), proteines: avg('proteines'), glucides: avg('glucides'), lipides: avg('lipides'), sommeil: avg('sommeil'), pas: avg('pas_journaliers'), stress: avg('stress'), sport: jours.filter(j => j.sport_fait).length }
    }).filter(s => s.kcal !== null || s.sport > 0)
  }

  const bilans = bilanSemaines()
  const poidsData = data.filter(d => d.poids).map(d => ({ date: d.date, poids: d.poids }))

  if (loading) return <p className="text-sm text-gray-400">Chargement du suivi…</p>

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700">Suivi du bloc</h3>

      {/* Modal édition entrée */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold mb-4">Modifier l'entrée</h3>
            <div className="grid grid-cols-2 gap-3">
              {[['kcal','Kcal'],['proteines','Protéines (g)'],['glucides','Glucides (g)'],['lipides','Lipides (g)'],['sommeil','Sommeil (h)'],['pas_journaliers','Pas'],['stress','Stress /10'],['poids','Poids (kg)']].map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input type="number" value={editForm[key] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={editForm.sport_fait || false}
                    onChange={e => setEditForm(f => ({ ...f, sport_fait: e.target.checked }))}
                    className="rounded" />
                  Sport fait ce jour
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEntry} disabled={saving} className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => setEditingEntry(null)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {bilans.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune donnée saisie pour l'instant.</p>
      ) : (
        <>
          <div className="bg-white border border-gray-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="text-left px-4 py-3 font-medium">Semaine</th>
                  <th className="px-3 py-3 font-medium text-right">Sport</th>
                  <th className="px-3 py-3 font-medium text-right">Kcal</th>
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
                  <tr key={b.name} className="border-b border-gray-50 hover:bg-gray-50">
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

          {/* Entrées journalières modifiables */}
          {coachMode && data.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700">Entrées journalières</h4>
                <span className="text-xs text-gray-400">Cliquez sur une ligne pour modifier</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-50">
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="px-3 py-2">Sport</th>
                      <th className="px-3 py-2">Kcal</th>
                      <th className="px-3 py-2">P</th>
                      <th className="px-3 py-2">G</th>
                      <th className="px-3 py-2">L</th>
                      <th className="px-3 py-2">Sommeil</th>
                      <th className="px-3 py-2">Pas</th>
                      <th className="px-3 py-2">Stress</th>
                      <th className="px-3 py-2">Poids</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data].sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => (
                      <tr key={e.id}
                        onClick={() => { setEditingEntry(e.id); setEditForm({ ...e }) }}
                        className="border-b border-gray-50 hover:bg-brand-50 cursor-pointer transition-colors">
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                          {new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-3 py-2 text-center">{e.sport_fait ? '✓' : '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.kcal ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.proteines ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.glucides ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.lipides ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.sommeil ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.pas_journaliers ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.stress ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.poids ? `${e.poids}kg` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
                  {objectifs?.kcal && <Line type="monotone" dataKey={() => objectifs.kcal} stroke="#a5b4fc" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Objectif" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

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
