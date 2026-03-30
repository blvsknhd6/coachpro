import { useState } from 'react'
import { usePreferences } from '../../hooks/usePreferences'

export default function WidgetConfig({ onClose }) {
  const { prefs, toggleWidget, addCustomWidget, removeWidget } = usePreferences()
  const [newLabel, setNewLabel] = useState('')

  if (!prefs) return null

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">Configurer les widgets</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {prefs.home_widgets.map(w => (
            <div key={w.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-700">{w.label}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleWidget(w.id)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${w.enabled ? 'bg-brand-600' : 'bg-gray-200'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${w.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                {w.custom && (
                  <button onClick={() => removeWidget(w.id)} className="text-gray-300 hover:text-red-400 text-sm">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Nom du widget personnalisé…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <button onClick={() => { if (newLabel.trim()) { addCustomWidget(newLabel.trim()); setNewLabel('') } }}
              className="bg-brand-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
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
