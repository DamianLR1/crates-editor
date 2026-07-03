import React, { useState } from 'react';
import { Layers, Info, RotateCcw, Plus } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { DEFAULT_RARITY_WEIGHTS } from '../lib/weightMath.js';

/**
 * Rewards.Rarities.<id>.Weight vive en el config.yml GLOBAL del plugin
 * (compartido por TODAS las crates del server), no en el archivo de la
 * crate que estás editando. Por eso este panel es independiente del
 * archivo abierto: es "cómo está configurado tu server", no algo que se
 * exporte en el YAML de la crate. Afecta el % real solo si la crate mezcla
 * 2+ rarezas — con una sola, es irrelevante (colapsa a weight/total).
 */
export default function RarityPanel() {
  const { model, rarityWeights, setRarityWeight, resetRarityWeights } = useCrate();
  const [newId, setNewId] = useState('');

  if (!model) return null;

  const usedRarities = [...new Set(model.rewards.map((r) => String(r.rarity || 'common').trim().toLowerCase() || 'common'))];
  // Mostrar las rarezas en uso en esta crate primero, y después cualquier otra
  // ya configurada (por si el admin tiene más rarezas definidas globalmente
  // que usa en otras crates del server).
  const allIds = [...new Set([...usedRarities, ...Object.keys(rarityWeights)])];

  const addRarity = () => {
    const id = newId.trim().toLowerCase();
    if (!id || allIds.includes(id)) return;
    setRarityWeight(id, DEFAULT_RARITY_WEIGHTS[id] ?? 10);
    setNewId('');
  };

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-parch-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-gold-400" strokeWidth={1.5} />
          Pesos de Rareza
        </h3>
        <button
          onClick={resetRarityWeights}
          className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-parch-200 transition-colors"
        >
          <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
          Restaurar defaults
        </button>
      </div>

      <div className="flex items-start gap-2 bg-ink-800/60 border border-ink-700 rounded-lg px-3 py-2 mb-4 text-xs text-ink-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gold-400" strokeWidth={1.5} />
        <span>
          Esto vive en <code className="text-parch-200">Rewards.Rarities</code> del{' '}
          <code className="text-parch-200">config.yml</code> GLOBAL del plugin — es compartido por
          todo el server, no se guarda en el archivo de esta crate. Solo importa si la crate mezcla
          2+ rarezas distintas.
        </span>
      </div>

      <div className="space-y-2">
        {allIds.map((id) => (
          <div key={id} className="flex items-center gap-3 bg-ink-800 rounded-lg px-3 py-2">
            <span className="text-xs font-mono-tab text-parch-200 flex-1 flex items-center gap-2">
              {id}
              {usedRarities.includes(id) && (
                <span className="text-[9px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
                  en uso
                </span>
              )}
            </span>
            <input
              type="number"
              step="1"
              value={rarityWeights[id] ?? DEFAULT_RARITY_WEIGHTS[id] ?? 0}
              onChange={(e) => setRarityWeight(id, e.target.value)}
              className="w-24 bg-ink-950 border border-ink-600 rounded-lg px-2 py-1.5 text-sm text-right font-mono-tab text-parch-100 outline-none focus:border-gold-500"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          type="text"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRarity()}
          placeholder="id de rareza nueva (ej. epic)"
          className="flex-1 bg-ink-800 border border-ink-600 rounded-lg px-3 py-1.5 text-xs text-parch-100 placeholder:text-ink-500 outline-none focus:border-gold-500"
        />
        <button
          onClick={addRarity}
          className="inline-flex items-center gap-1 bg-ink-800 hover:bg-ink-700 border border-ink-600 text-ink-500 hover:text-parch-200 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
