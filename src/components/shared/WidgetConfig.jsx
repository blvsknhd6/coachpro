import { useState } from 'react'
import { usePreferences } from '../../hooks/usePreferences'

export default function WidgetConfig({ onClose }) {
  const { prefs, toggleWidget, addCustomWidget, removeWidget, reorderWidgets } = usePreferences()
  const [newLabel, setNewLabel]   = useState('')
  const [dragIdx, setDragIdx]     = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  if (!prefs) return null

  function handleDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  function handleDrop(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null); setDragOverIdx(null); return
    }
    const newWidgets = [...prefs.home_widgets]
    const [moved] = newWidgets.splice(dragIdx, 1)
    newWidgets.splice(idx, 0, moved)
    reorderWidgets(newWidgets)
    setDragIdx(null); setDragOverIdx(null)
  }

  function handleDragEnd() {
    setDragIdx(null); setDragOverIdx(null)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">Configurer les widgets</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <p className="text-xs text-gray-400 px-5 pt-3 pb-1">
          <span className="mr-1">⠿</span> Glisse pour réordonner
        </p>
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1">
          {prefs.home_widgets.map((w, idx) => (
            <div
              key={w.id}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragLeave={() => setDragOverIdx(null)}
              className={`rounded-xl transition-all ${
                dragOverIdx === idx && dragIdx !== idx
                  ? 'border-2 border-brand-400 bg-brand-50'
                  : 'border-2 border-transparent'
              }`}
            >
              <div
                className={`flex items-center justify-between py-2 px-2 rounded-lg transition-opacity ${
                  dragIdx === idx ? 'opacity-40' : ''
                }`}
              >
                {/* Drag handle */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnd={handleDragEnd}
                    className="text-gray-300 cursor-grab active:cursor-grabbing select-none text-lg leading-none flex-shrink-0"
                    title="Glisser pour réordonner"
                  >
                    ⠿
                  </span>
                  <span className="text-sm text-gray-700 truncate">{w.label}</span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleWidget(w.id)}
                    className={`w-10 h-6 rounded-full transition-colors relative ${w.enabled ? 'bg-brand-600' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${w.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                  {w.custom && (
                    <button onClick={() => removeWidget(w.id)} className="text-gray-300 hover:text-red-400 text-sm leading-none">×</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newLabel.trim() && (addCustomWidget(newLabel.trim()), setNewLabel(''))}
              placeholder="Nom du widget personnalisé…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              onClick={() => { if (newLabel.trim()) { addCustomWidget(newLabel.trim()); setNewLabel('') } }}
              className="bg-brand-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              + Ajouter
            </button>
          </div>
          <button onClick={onClose} className="w-full mt-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
