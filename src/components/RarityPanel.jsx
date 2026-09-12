import React, { useState } from 'react';
import { Layers, Info, RotateCcw, Plus } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { rarityOf } from '../lib/weightMath.js';
import McText from './McText.jsx';

/**
 * Rewards.Rarities.<id>.Weight vive en el config.yml GLOBAL del plugin, no en
 * el archivo de la crate: no se exporta. Con la carpeta del plugin abierta se
 * cargan las reales; si no, se configuran a mano (quedan guardadas localmente).
 * Solo importa si la crate mezcla 2+ rarezas.
 */
export default function RarityPanel() {
  const { model, server, rarityWeights, rarityNames, setRarityWeight, resetRarityWeights } = useCrate();
  const [newId, setNewId] = useState('');

  if (!model) return null;

  // rareza efectiva: una inexistente cae a la más común, igual que en el plugin
  const usedRarities = [...new Set(model.rewards.map((r) => rarityOf(r, rarityWeights)))];
  const allIds = [...new Set([...usedRarities, ...Object.keys(rarityWeights)])];

  const addRarity = () => {
    const id = newId.trim().toLowerCase();
    if (!id || allIds.includes(id)) return;
    setRarityWeight(id, 10);
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
          {server?.rarities ? 'Recargar del config' : 'Restaurar defaults'}
        </button>
      </div>

      <div className="flex items-start gap-2 bg-ink-800/60 border border-ink-700 rounded-lg px-3 py-2 mb-4 text-xs text-ink-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gold-400" strokeWidth={1.5} />
        <span>
          {server?.rarities ? (
            <>Cargadas de <code className="text-parch-200">Rewards.Rarities</code> del config.yml de tu carpeta. Cambiarlas acá no modifica el server.</>
          ) : (
            <>Viven en <code className="text-parch-200">Rewards.Rarities</code> del config.yml GLOBAL, no en esta crate. Abrí la carpeta del plugin para usar las reales.</>
          )}
        </span>
      </div>

      <div className="space-y-2">
        {allIds.map((id) => (
          <div key={id} className="flex items-center gap-3 bg-ink-800 rounded-lg px-3 py-2">
            <span className="text-xs font-mono-tab text-parch-200 flex-1 flex items-center gap-2 min-w-0">
              <span className="truncate">{id}</span>
              {rarityNames?.[id] && <McText text={rarityNames[id]} className="text-[10px] truncate" />}
              {usedRarities.includes(id) && (
                <span className="text-[9px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 shrink-0">
                  en uso
                </span>
              )}
            </span>
            <input
              type="number"
              step="any"
              value={rarityWeights[id] ?? 0}
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
