import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'
import { metricColor } from '../../lib/tracking'

function today() { return new Date().toISOString().split('T')[0] }

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getLast7Days() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export default function AthleteDataTracking() {
  const { profile } = useAuth()
  const [activeBloc, setActiveBloc]       = useState(null)
  const [blocs, setBlocs]                 = useState([])
  const [objectifs, setObjectifs]         = useState(null)
  const [selectedDate, setSelectedDate]   = useState(today())
  const [form, setForm]                   = useState(emptyForm())
  const [saved, setSaved]                 = useState(false)
  const [recentEntries, setRecentEntries] = useState([])
  const saveTimerRef                      = useRef(null)
  const activeBlocIdRef                   = useRef(null)
  const days = getLast7Days()

  useEffect(() => { fetchBlocs() }, [profile])
  useEffect(() => { if (activeBloc) { activeBlocIdRef.current = activeBloc.id; fetchObjectifs(); fetchRecent() } }, [activeBloc])
  useEffect(() => { if (activeBloc) fetchEntry(selectedDate) }, [selectedDate, activeBloc])

  function emptyForm() {
    return { sport_fait: false, kcal: '', proteines: '', glucides: '', lipides: '', sommeil: '', pas_journaliers: '', stress: '', poids: '' }
  }

  async function fetchBlocs() {
    if (!profile) return
    const { data } = await supabase.from('blocs').select('*').eq('athlete_id', profile.id).order('created_at', { ascending: false })
    setBlocs(data || [])
    if (data?.length) setActiveBloc(data[0])
  }

  async function fetchObjectifs() {
    const { data } = await supabase.from('objectifs_bloc').select('*').eq('bloc_id', activeBloc.id).single()
    setObjectifs(data)
  }

  async function fetchEntry(date) {
    const { data } = await supabase.from('data_tracking').select('*')
      .eq('athlete_id', profile.id).eq('date', date).single()
    setForm(data ? {
      sport_fait:      data.sport_fait      || false,
      kcal:            data.kcal            ?? '',
      proteines:       data.proteines       ?? '',
      glucides:        data.glucides        ?? '',
      lipides:         data.lipides         ?? '',
      sommeil:         data.sommeil         ?? '',
      pas_journaliers: data.pas_journaliers ?? '',
      stress:          data.stress          ?? '',
      poids:           data.poids           ?? '',
    } : emptyForm())
  }

  async function fetchRecent() {
    const { data } = await supabase.from('data_tracking').select('*')
      .eq('athlete_id', profile.id).eq('bloc_id', activeBloc.id)
      .order('date', { ascending: false }).limit(28)
    setRecentEntries(data || [])
  }

  // Sauvegarde automatique — appelée onBlur ou onChange (stress/sport)
  const autoSave = useCallback(async (updatedForm) => {
    if (!activeBlocIdRef.current || !profile) return
    const payload = {
      athlete_id:      profile.id,
      bloc_id:         activeBlocIdRef.current,
      date:            selectedDate,
      sport_fait:      updatedForm.sport_fait,
      kcal:            updatedForm.kcal            === '' ? null : Number(updatedForm.kcal),
      proteines:       updatedForm.proteines        === '' ? null : Number(updatedForm.proteines),
      glucides:        updatedForm.glucides         === '' ? null : Number(updatedForm.glucides),
      lipides:         updatedForm.lipides          === '' ? null : Number(updatedForm.lipides),
      sommeil:         updatedForm.sommeil          === '' ? null : Number(updatedForm.sommeil),
      pas_journaliers: updatedForm.pas_journaliers  === '' ? null : Number(updatedForm.pas_journaliers),
      stress:          updatedForm.stress           === '' ? null : Number(updatedForm.stress),
      poids:           updatedForm.poids            === '' ? null : Number(updatedForm.poids),
    }
    await supabase.from('data_tracking').upsert(payload, { onConflict: 'athlete_id,date' })
    setSaved(true)
    fetchRecent()
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000)
  }, [profile, selectedDate])

  function handleChange(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleBlur(key, value) {
    const updated = { ...form, [key]: value }
    setForm(updated)
    autoSave(updated)
  }

  function handleSportToggle() {
    const updated = { ...form, sport_fait: !form.sport_fait }
    setForm(updated)
    autoSave(updated)
  }

  function handleStressSelect(n) {
    const updated = { ...form, stress: form.stress === n ? '' : n }
    setForm(updated)
    autoSave(updated)
  }

  const bornes = objectifs?.bornes || {}

  function fieldAccent(key, bilanKey) {
    const val = form[key]
    if (val === '' || val == null) return ''
    const color = metricColor(val, bilanKey, objectifs, bornes)
    if (color.includes('green')) return 'border-green-300 bg-green-50'
    if (color.includes('amber')) return 'border-amber-300 bg-amber-50'
    if (color.includes('red'))   return 'border-red-300 bg-red-50'
    return ''
  }

  const hc = (value, bilanKey) => metricColor(value, bilanKey, objectifs, bornes) || 'text-gray-600'

  function field(formKey, bilanKey, label, unit, opts = {}) {
    const accent = fieldAccent(formKey, bilanKey)
    const objVal = bilanKey === 'stress' ? objectifs?.stress_cible
                 : bilanKey === 'pas'    ? objectifs?.pas_journaliers
                 : objectifs?.[bilanKey]
    return (
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            value={form[formKey]}
            step={opts.step}
            min={opts.min}
            max={opts.max}
            onChange={e => handleChange(formKey, e.target.value)}
            onBlur={e => handleBlur(formKey, e.target.value)}
            placeholder={objVal ? String(objVal) : '—'}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors ${accent || 'border-gray-200 bg-white'}`}
          />
          {unit && <span className="text-xs text-gray-400 flex-shrink-0">{unit}</span>}
        </div>
        {objVal && <p className="text-xs text-gray-400 mt-0.5">Objectif : {objVal}{unit ? ' ' + unit : ''}</p>}
        {bornes[bilanKey]?.min != null && (
          <p className="text-xs text-gray-300 mt-0.5">Bornes : {bornes[bilanKey].min}–{bornes[bilanKey].max}{unit ? ' ' + unit : ''}</p>
        )}
      </div>
    )
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Mon suivi quotidien</h1>
        {saved && <span className="text-xs text-green-500 font-medium">✓ Enregistré</span>}
      </div>

      {blocs.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {blocs.map(b => (
            <button key={b.id} onClick={() => setActiveBloc(b)}
              className={`px-3 py-1.5 rounded-lg text-sm ${activeBloc?.id === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Sélecteur de date */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {days.map(d => {
          const hasEntry = recentEntries.some(e => e.date === d)
          return (
            <button key={d} onClick={() => setSelectedDate(d)}
              className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs transition-all ${
                selectedDate === d ? 'bg-brand-600 text-white'
                : hasEntry ? 'bg-brand-50 border border-brand-200 text-brand-700'
                : 'bg-white border border-gray-100 text-gray-500 hover:border-gray-200'
              }`}>
              <span>{formatDate(d).split(' ')[0]}</span>
              <span className="font-medium">{formatDate(d).split(' ')[1]}</span>
              {hasEntry && selectedDate !== d && <div className="w-1 h-1 bg-brand-400 rounded-full mt-0.5" />}
            </button>
          )
        })}
      </div>

      {!activeBloc ? (
        <p className="text-sm text-gray-400">Aucun programme actif.</p>
      ) : (
        <div className="space-y-4">

          {/* Sport du jour */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Activité du jour</h3>
            <button onClick={handleSportToggle}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-sm font-medium ${
                form.sport_fait ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200'
              }`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${form.sport_fait ? 'border-brand-500 bg-brand-500' : 'border-gray-300'}`}>
                {form.sport_fait && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              {form.sport_fait ? 'Sport fait ✓' : 'Marquer le sport comme fait'}
            </button>
          </div>

          {/* Nutrition */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Nutrition</h3>
            <div className="grid grid-cols-2 gap-4">
              {field('kcal',      'kcal',      'Calories',  'kcal')}
              {field('proteines', 'proteines', 'Protéines', 'g')}
              {field('glucides',  'glucides',  'Glucides',  'g')}
              {field('lipides',   'lipides',   'Lipides',   'g')}
            </div>
          </div>

          {/* Bien-être */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Bien-être</h3>
            <div className="grid grid-cols-2 gap-4">
              {field('sommeil',        'sommeil', 'Sommeil',         'h',  { step: '0.5', min: '0', max: '24' })}
              {field('pas_journaliers','pas',     'Pas journaliers', '')}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Stress /10</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
                    const isSelected = form.stress === n
                    const colorClass = isSelected
                      ? n <= 3 ? 'bg-green-500 text-white'
                      : n <= 6 ? 'bg-amber-400 text-white'
                      : 'bg-red-500 text-white'
                      : 'bg-gray-50 text-gray-500 border border-gray-100 hover:border-gray-300'
                    return (
                      <button key={n} onClick={() => handleStressSelect(n)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${colorClass}`}>
                        {n}
                      </button>
                    )
                  })}
                </div>
                {objectifs?.stress_cible && <p className="text-xs text-gray-400 mt-1">Objectif : ≤ {objectifs.stress_cible}/10</p>}
              </div>
              {field('poids', 'poids', 'Poids (optionnel)', 'kg', { step: '0.1' })}
            </div>
          </div>

          {/* Historique */}
          {recentEntries.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50">
                <h3 className="text-sm font-medium text-gray-700">Historique</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-50">
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Sport</th>
                      <th className="px-3 py-2 font-medium">Kcal</th>
                      <th className="px-3 py-2 font-medium">P</th>
                      <th className="px-3 py-2 font-medium">G</th>
                      <th className="px-3 py-2 font-medium">L</th>
                      <th className="px-3 py-2 font-medium">Sommeil</th>
                      <th className="px-3 py-2 font-medium">Pas</th>
                      <th className="px-3 py-2 font-medium">Stress</th>
                      <th className="px-3 py-2 font-medium">Poids</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEntries.map(e => (
                      <tr key={e.id}
                        className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${e.date === selectedDate ? 'bg-brand-50/50' : ''}`}
                        onClick={() => setSelectedDate(e.date)}>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.sport_fait ? '✓' : '—'}</td>
                        <td className={`px-3 py-2 text-center ${hc(e.kcal, 'kcal')}`}>{e.kcal ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${hc(e.proteines, 'proteines')}`}>{e.proteines ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${hc(e.glucides, 'glucides')}`}>{e.glucides ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${hc(e.lipides, 'lipides')}`}>{e.lipides ?? '—'}</td>
                        <td className={`px-3 py-2 text-center ${hc(e.sommeil, 'sommeil')}`}>{e.sommeil ?? '—'}h</td>
                        <td className={`px-3 py-2 text-center ${hc(e.pas_journaliers, 'pas')}`}>
                          {e.pas_journaliers ? Number(e.pas_journaliers).toLocaleString('fr') : '—'}
                        </td>
                        <td className={`px-3 py-2 text-center ${hc(e.stress, 'stress')}`}>{e.stress ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{e.poids ? `${e.poids}kg` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}