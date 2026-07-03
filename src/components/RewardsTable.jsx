import React, { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { computePercentages, formatPercent } from '../lib/weightMath.js';
import WeightBar from './WeightBar.jsx';
import McText from './McText.jsx';
import RewardDetailPanel from './RewardDetailPanel.jsx';

export default function RewardsTable() {
  const { model, updateWeight, removeReward, createReward, renameRewardKey, targetTotal, rarityWeights } = useCrate();
  const [expandedKey, setExpandedKey] = useState(null);
  const [filter, setFilter] = useState('');

  if (!model) return null;

  const withPercents = computePercentages(model.rewards, rarityWeights);
  const maxPercent = Math.max(...withPercents.map((r) => r.percent), 1);

  const filtered = withPercents.filter((r) =>
    r.key.toLowerCase().includes(filter.toLowerCase()) ||
    (r.name || '').toLowerCase().includes(filter.toLowerCase())
  );

  const handleNewReward = () => {
    let n = 1;
    while (model.rewards.some((r) => r.key === `nuevo_premio_${n}`)) n++;
    const key = `nuevo_premio_${n}`;
    createReward(key, { type: 'COMMAND', weight: 10, name: '&eNuevo Premio', commands: [] });
    setExpandedKey(key);
  };

  // Renombrar el id/key del reward (ej. "nuevo_premio_1" -> "espada_legendaria").
  // Devuelve true/false para que RewardDetailPanel sepa si el cambio se aplicó
  // (rechazamos duplicados y keys vacías antes de tocar el doc).
  const handleRename = (oldKey, newKey) => {
    const clean = newKey.trim();
    if (!clean || clean === oldKey) return false;
    if (model.rewards.some((r) => r.key === clean)) return false;
    renameRewardKey(oldKey, clean);
    if (expandedKey === oldKey) setExpandedKey(clean);
    return true;
  };

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
        <div>
          <h3 className="text-sm font-medium text-parch-200">Rewards</h3>
          <p className="text-xs text-ink-500 mt-0.5">{model.rewards.length} premio(s) en el pool</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Buscar..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-ink-800 border border-ink-600 rounded-lg px-3 py-1.5 text-xs text-parch-100 placeholder:text-ink-500 outline-none focus:border-gold-500 w-40"
          />
          <button
            onClick={handleNewReward}
            className="inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Nuevo premio
          </button>
        </div>
      </div>

      <div className="divide-y divide-ink-800">
        {filtered.map((reward) => (
          <RewardRow
            key={reward.key}
            reward={reward}
            maxPercent={maxPercent}
            targetTotal={targetTotal}
            expanded={expandedKey === reward.key}
            onToggle={() => setExpandedKey(expandedKey === reward.key ? null : reward.key)}
            onWeightChange={(w) => updateWeight(reward.key, w)}
            onDelete={() => removeReward(reward.key)}
            onRename={(newKey) => handleRename(reward.key, newKey)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-5 py-10 text-center text-ink-500 text-sm">
            No hay premios que coincidan con la búsqueda.
          </div>
        )}
      </div>
    </div>
  );
}

function RewardRow({ reward, maxPercent, targetTotal, expanded, onToggle, onWeightChange, onDelete, onRename }) {
  const [localWeight, setLocalWeight] = useState(reward.weight);

  React.useEffect(() => setLocalWeight(reward.weight), [reward.weight]);

  const commit = () => {
    const n = parseFloat(localWeight);
    if (!isNaN(n) && n !== reward.weight) onWeightChange(n);
  };

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3 hover:bg-ink-800/50 transition-colors group">
        <button onClick={onToggle} className="text-ink-500 hover:text-parch-200 shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <McText text={reward.name} className="text-sm truncate" />
            <span className="text-[10px] text-ink-500 font-mono-tab shrink-0">{reward.key}</span>
          </div>
          <div className="mt-1.5 max-w-xs">
            <WeightBar percent={reward.percent} rarity={reward.rarity} maxPercent={maxPercent} />
          </div>
        </div>

        <div className="w-24 text-right shrink-0">
          <p className="text-sm font-semibold text-parch-100 font-mono-tab">
            {formatPercent(reward.percent)}
          </p>
        </div>

        <input
          type="number"
          step="0.1"
          value={localWeight}
          onChange={(e) => setLocalWeight(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="w-20 bg-ink-800 border border-ink-600 rounded-lg px-2 py-1.5 text-sm text-right font-mono-tab text-parch-100 outline-none focus:border-gold-500 shrink-0"
        />

        <button
          onClick={onDelete}
          className="text-ink-500 hover:text-crimson-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          title="Eliminar premio"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {expanded && <RewardDetailPanel reward={reward} onRename={onRename} />}
    </div>
  );
}