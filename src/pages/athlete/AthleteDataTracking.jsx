import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Layout from '../../components/shared/Layout'
import { metricColor } from '../../lib/tracking'

function today() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function getLast7Days() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export default function AthleteDataTracking() {
  const { profile } = useAuth()

  const [activeBloc, setActiveBloc] = useState(null)
  const [blocs, setBlocs] = useState([])
  const [objectifs, setObjectifs] = useState(null)
  const [selectedDate, setSelectedDate] = useState(today())
  const [entry, setEntry] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [recentEntries, setRecentEntries] = useState([])

  const days = getLast7Days()

  useEffect(() => { fetchBlocs() }, [profile])
  useEffect(() => {
    if (activeBloc) {
      fetchObjectifs()
      fetchRecent()
    }
  }, [activeBloc])
  useEffect(() => {
    if (activeBloc) fetchEntry(selectedDate)
  }, [selectedDate, activeBloc])

  function emptyForm() {
    return {
      sport_fait: false,
      kcal: '',
      proteines: '',
      glucides: '',
      lipides: '',
      sommeil: '',
      pas_journaliers: '',
      stress: '',
      poids: '',
    }
  }

  async function fetchBlocs() {
    if (!profile) return
    const { data } = await supabase
      .from('blocs')
      .select('*')
      .eq('athlete_id', profile.id)
      .order('created_at', { ascending: false })

    setBlocs(data || [])
    if (data?.length) setActiveBloc(data[0])
  }

  async function fetchObjectifs() {
    const { data } = await supabase
      .from('objectifs_bloc')
      .select('*')
      .eq('bloc_id', activeBloc.id)
      .single()

    setObjectifs(data)
  }

  async function fetchEntry(date) {
    const { data } = await supabase
      .from('data_tracking')
      .select('*')
      .eq('athlete_id', profile.id)
      .eq('date', date)
      .single()

    setEntry(data)
    setForm(data ? { ...data } : emptyForm())
  }

  async function fetchRecent() {
    const { data } = await supabase
      .from('data_tracking')
      .select('*')
      .eq('athlete_id', profile.id)
      .eq('bloc_id', activeBloc.id)
      .order('date', { ascending: false })
      .limit(28)

    setRecentEntries(data || [])
  }

  // 🔥 clé de correction
  function getObjectifsAt(date) {
    // si tu as une logique par semaine, branche-la ici
    return objectifs
  }

  const columns = [
    { key: 'kcal', label: 'Kcal' },
    { key: 'proteines', label: 'P' },
    { key: 'glucides', label: 'G' },
    { key: 'lipides', label: 'L' },
    { key: 'sommeil', label: 'Sommeil', suffix: 'h' },
    { key: 'pas_journaliers', label: 'Pas', format: v => v.toLocaleString('fr') },
    { key: 'stress', label: 'Stress' },
  ]

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Mon suivi quotidien</h1>

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
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="px-3 py-2">Sport</th>

                  {columns.map(c => (
                    <th key={c.key} className="px-3 py-2">
                      {c.label}
                    </th>
                  ))}

                  <th className="px-3 py-2">Poids</th>
                </tr>
              </thead>

              <tbody>
                {recentEntries.map(e => {
                  const objE = getObjectifsAt(e.date)
                  const bE = objE?.bornes || {}

                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedDate(e.date)}
                      className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                        e.date === selectedDate ? 'bg-brand-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-2">
                        {formatDate(e.date)}
                      </td>

                      <td className="text-center">
                        {e.sport_fait ? '✓' : '—'}
                      </td>

                      {columns.map(c => {
                        const value = e[c.key]

                        return (
                          <td
                            key={c.key}
                            className={`text-center ${metricColor(value, c.key === 'pas_journaliers' ? 'pas' : c.key, objE, bE)}`}
                          >
                            {value != null
                              ? c.format
                                ? c.format(value)
                                : `${value}${c.suffix || ''}`
                              : '—'}
                          </td>
                        )
                      })}

                      <td className="text-center text-gray-600">
                        {e.poids ? `${e.poids}kg` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}