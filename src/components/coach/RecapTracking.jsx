import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { metricColor } from '../../lib/tracking'

export default function RecapTracking({ athleteId, blocId, coachMode = false }) {
  const [data, setData]               = useState([])
  const [objectifs, setObjectifs]     = useState(null)
  const [historique, setHistorique]   = useState([]) // liste triée par date_debut desc
  const [semaines, setSemaines]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editForm, setEditForm]       = useState({})
  const [saving, setSaving]           = useState(false)

  useEffect(() => { fetchData() }, [blocId])

  async function fetchData() {
    setLoading(true)
    const [{ data: tracking }, { data: obj }, { data: sems }, { data: hist }] = await Promise.all([
      supabase.from('data_tracking').select('*').eq('athlete_id', athleteId).eq('bloc_id', blocId).order('date'),
      supabase.from('objectifs_bloc').select('*').eq('bloc_id', blocId).single(),
      supabase.from('semaines').select('*').eq('bloc_id', blocId).order('numero'),
      supabase.from('objectifs_bloc_historique')
        .select('*').eq('bloc_id', blocId).order('date_debut', { ascending: false }),
    ])
    setData(tracking || [])
    setObjectifs(obj)
    setSemaines(sems || [])
    setHistorique(hist || [])
    setLoading(false)
  }

  /**
   * Retourne les objectifs en vigueur à une date donnée.
   * Cherche dans l'historique le dernier enregistrement dont date_debut <= dateStr.
   * Fallback sur objectifs_bloc courants si aucun historique antérieur.
   */
  function getObjectifsAt(dateStr) {
    if (!historique.length) return objectifs
    // historique trié desc, on cherche le premier dont date_debut <= dateStr
    const applicable = historique.find(h => h.date_debut <= dateStr)
    return applicable || objectifs
  }

  async function saveEntry() {
    setSaving(true)
    await supabase.from('data_tracking').update({
      sport_fait:      editForm.sport_fait,
      kcal:            editForm.kcal            || null,
      proteines:       editForm.proteines        || null,
      glucides:        editForm.glucides         || null,
      lipides:         editForm.lipides          || null,
      sommeil:         editForm.sommeil          || null,
      pas_journaliers: editForm.pas_journaliers  || null,
      stress:          editForm.stress           || null,
      poids:           editForm.poids            || null,
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
        const vals = jours.map(j => j[key]).filter(v => v != null)
        return vals.length ? (vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1) : null
      }

      // Date représentative de la semaine (milieu) pour aller chercher les bons objectifs
      const midDate = jours.length
        ? jours[Math.floor(jours.length / 2)]?.date
        : null

      return {
        name:       `S${sem.numero}`,
        midDate,
        kcal:       avg('kcal'),
        proteines:  avg('proteines'),
        glucides:   avg('glucides'),
        lipides:    avg('lipides'),
        sommeil:    avg('sommeil'),
        pas:        avg('pas_journaliers'),
        stress:     avg('stress'),
        sport:      jours.filter(j => j.sport_fait).length,
      }
    }).filter(s => s.kcal !== null || s.sport > 0)
  }

  const bilans    = bilanSemaines()
  const poidsData = data.filter(d => d.poids).map(d => ({ date: d.date, poids: d.poids }))
  const bornes    = objectifs?.bornes || {}

  // Couleur d'une cellule : utilise les objectifs en vigueur à la date de la semaine
  function cc(value, key, midDate) {
    const obj = midDate ? getObjectifsAt(midDate) : objectifs
    const b   = obj?.bornes || {}
    return metricColor(value, key, obj, b)
  }

  const fmt = (v, isInt = false) =>
    v == null ? '—' : isInt ? Math.round(v) : parseFloat(v).toFixed(1).replace(/\.0$/, '')

  if (loading) return <p className="text-sm text-gray-400">Chargement du suivi…</p>

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700">Suivi du bloc</h3>

      {editingEntry && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold mb-4">Modifier l'entrée</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['kcal','Kcal'], ['proteines','Protéines (g)'], ['glucides','Glucides (g)'],
                ['lipides','Lipides (g)'], ['sommeil','Sommeil (h)'], ['pas_journaliers','Pas'],
                ['stress','Stress /10'], ['poids','Poids (kg)'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500">{label}</label>
                  <input type="number" value={editForm[key] || ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={editForm.sport_fait || false}
                    onChange={e => setEditForm(f => ({ ...f, sport_fait: e.target.checked }))}
                    className="rounded"
                  />
                  Sport fait ce jour
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEntry} disabled={saving}
                className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => setEditingEntry(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {bilans.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune donnée saisie pour l'instant.</p>
      ) : (
        <>
          {/* ── Tableau résumé par semaine ── */}
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
                {/* Ligne objectifs courants */}
                {objectifs && (
                  <tr className="border-b border-gray-100 text-xs text-brand-600 bg-brand-50/50">
                    <td className="px-4 py-2 font-medium">Objectifs actuels</td>
                    <td className="px-3 py-2 text-right">
                      {objectifs.seances_par_semaine != null ? `${objectifs.seances_par_semaine}j` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">{objectifs.kcal           ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.proteines       ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.glucides        ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.lipides         ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.sommeil         != null ? `${objectifs.sommeil}h` : '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.pas_journaliers ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{objectifs.stress_cible    != null ? `${objectifs.stress_cible}/10` : '—'}</td>
                  </tr>
                )}
                {/* Ligne bornes si elles existent */}
                {objectifs && Object.keys(bornes).length > 0 && (
                  <tr className="border-b border-gray-100 text-xs text-gray-400 bg-gray-50/50">
                    <td className="px-4 py-2 italic">Bornes</td>
                    <td className="px-3 py-2 text-right">
                      {bornes.seances ? `${bornes.seances.min}–${bornes.seances.max}j` : ''}
                    </td>
                    {['kcal','proteines','glucides','lipides'].map(k => (
                      <td key={k} className="px-3 py-2 text-right">
                        {bornes[k] ? `${bornes[k].min}–${bornes[k].max}` : ''}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      {bornes.sommeil ? `${bornes.sommeil.min}–${bornes.sommeil.max}h` : ''}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {bornes.pas ? `${bornes.pas.min}–${bornes.pas.max}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {bornes.stress ? `${bornes.stress.min}–${bornes.stress.max}/10` : ''}
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {bilans.map(b => (
                  <tr key={b.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {b.name}
                      {historique.length > 0 && b.midDate && (() => {
                        const h = historique.find(h => h.date_debut <= b.midDate)
                        const isOld = h && h.date_debut < (historique[0]?.date_debut || '')
                        return isOld
                          ? <span className="ml-1.5 text-xs text-gray-300" title={`Objectifs du ${h.date_debut}`}>📅</span>
                          : null
                      })()}
                    </td>
                    <td className={`px-3 py-3 text-right ${cc(b.sport, 'seances', b.midDate)}`}>{b.sport}j</td>
                    <td className={`px-3 py-3 text-right ${cc(b.kcal, 'kcal', b.midDate)}`}>{fmt(b.kcal, true)}</td>
                    <td className={`px-3 py-3 text-right ${cc(b.proteines, 'proteines', b.midDate)}`}>{fmt(b.proteines)}</td>
                    <td className={`px-3 py-3 text-right ${cc(b.glucides, 'glucides', b.midDate)}`}>{fmt(b.glucides)}</td>
                    <td className={`px-3 py-3 text-right ${cc(b.lipides, 'lipides', b.midDate)}`}>{fmt(b.lipides)}</td>
                    <td className={`px-3 py-3 text-right ${cc(b.sommeil, 'sommeil', b.midDate)}`}>{fmt(b.sommeil)}h</td>
                    <td className={`px-3 py-3 text-right ${cc(b.pas, 'pas', b.midDate)}`}>
                      {b.pas ? Math.round(b.pas).toLocaleString('fr') : '—'}
                    </td>
                    <td className={`px-3 py-3 text-right ${cc(b.stress, 'stress', b.midDate)}`}>{fmt(b.stress)}/10</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Entrées journalières modifiables (mode coach) ── */}
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
                        <td className={`px-3 py-2 text-center ${cc(e.kcal, 'kcal', e.date)}`}>{e.kcal ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${cc(e.proteines, 'proteines', e.date)}`}>{e.proteines ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${cc(e.glucides, 'glucides', e.date)}`}>{e.glucides ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${cc(e.lipides, 'lipides', e.date)}`}>{e.lipides ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${cc(e.sommeil, 'sommeil', e.date)}`}>{e.sommeil ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${cc(e.pas_journaliers, 'pas', e.date)}`}>{e.pas_journaliers ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${cc(e.stress, 'stress', e.date)}`}>{e.stress ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.poids ? `${e.poids}kg` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Graphe Kcal ── */}
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
                    <Line type="monotone" dataKey={() => objectifs.kcal} stroke="#a5b4fc" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Objectif actuel" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Graphe Poids ── */}
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
