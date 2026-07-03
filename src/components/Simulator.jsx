import React, { useState, useMemo } from 'react';
import { Dices, Play, RotateCcw } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { simulateOpenings, formatPercent, round, DEFAULT_RARITY_WEIGHTS } from '../lib/weightMath.js';
import McText from './McText.jsx';

const PRESETS = [1, 10, 100, 1000, 10000, 100000];

export default function Simulator() {
  const { model, rarityWeights } = useCrate();
  const [count, setCount] = useState(1000);
  const [sim, setSim] = useState(null);
  const [lastOpened, setLastOpened] = useState([]);
  const [running, setRunning] = useState(false);

  const run = () => {
    if (!model) return;
    setRunning(true);
    // pequeño delay para que se sienta como "tirando" incluso en counts bajos
    setTimeout(() => {
      const result = simulateOpenings(model.rewards, count, Math.random, rarityWeights);
      setSim(result);
      if (count <= 50) {
        setLastOpened(rollIndividually(model.rewards, count, rarityWeights));
      } else {
        setLastOpened([]);
      }
      setRunning(false);
    }, count > 10000 ? 200 : 400);
  };

  const reset = () => {
    setSim(null);
    setLastOpened([]);
  };

  const sorted = useMemo(() => {
    if (!sim) return [];
    return [...sim.results].sort((a, b) => b.weight - a.weight);
  }, [sim]);

  if (!model) return null;

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-parch-200 flex items-center gap-2">
          <Dices className="w-4 h-4 text-gold-400" strokeWidth={1.5} />
          Simulador de aperturas
        </h3>
        {sim && (
          <button onClick={reset} className="text-ink-500 hover:text-parch-200 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setCount(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono-tab border transition-colors
              ${count === p
                ? 'bg-gold-500/15 border-gold-500/40 text-gold-400'
                : 'bg-ink-800 border-ink-600 text-ink-500 hover:text-parch-200'}`}
          >
            {p.toLocaleString('es-AR')}
          </button>
        ))}
        <button
          onClick={run}
          disabled={running}
          className="ml-auto inline-flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 text-xs font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" strokeWidth={2} />
          {running ? 'Abriendo...' : `Abrir ${count.toLocaleString('es-AR')}`}
        </button>
      </div>

      {lastOpened.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {lastOpened.map((r, i) => (
            <div
              key={i}
              className="bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 animate-[fadeIn_0.3s_ease-out]"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}
            >
              <McText text={r.name} className="text-xs" />
            </div>
          ))}
        </div>
      )}

      {sim && (
        <div>
          <p className="text-xs text-ink-500 mb-3">
            {sim.count.toLocaleString('es-AR')} apertura(s) simuladas · comparando % teórico vs. observado
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {sorted.map((r) => (
              <SimRow key={r.key} result={r} />
            ))}
          </div>
        </div>
      )}

      {!sim && !running && (
        <div className="text-center py-8 text-ink-500 text-sm">
          Elegí una cantidad y presioná "Abrir" para simular.
        </div>
      )}
    </div>
  );
}

function SimRow({ result }) {
  const delta = round(result.observedPercent - result.theoreticalPercent, 3);
  const deltaColor = Math.abs(delta) < 0.5 ? 'text-ink-500' : delta > 0 ? 'text-emerald-400' : 'text-crimson-400';

  return (
    <div className="flex items-center gap-3 bg-ink-800/60 rounded-lg px-3 py-2">
      <div className="min-w-0 flex-1">
        <McText text={result.name} className="text-xs truncate block" />
      </div>
      <div className="text-right shrink-0 w-16">
        <p className="text-[10px] text-ink-500">Teórico</p>
        <p className="text-xs font-mono-tab text-parch-200">{formatPercent(result.theoreticalPercent)}</p>
      </div>
      <div className="text-right shrink-0 w-16">
        <p className="text-[10px] text-ink-500">Real</p>
        <p className="text-xs font-mono-tab text-parch-100">{formatPercent(result.observedPercent)}</p>
      </div>
      <div className="text-right shrink-0 w-14">
        <p className="text-[10px] text-ink-500">Δ</p>
        <p className={`text-xs font-mono-tab ${deltaColor}`}>{delta > 0 ? '+' : ''}{delta}</p>
      </div>
      <div className="text-right shrink-0 w-14">
        <p className="text-[10px] text-ink-500">Hits</p>
        <p className="text-xs font-mono-tab text-parch-200">{result.hits.toLocaleString('es-AR')}</p>
      </div>
    </div>
  );
}

/**
 * Tira `n` aperturas individuales (para animación de resultados cuando n es
 * chico), replicando el sorteo real de dos pasos de Crate.rollReward:
 * primero Rarity por su Weight, después Reward dentro de esa Rarity.
 */
function rollIndividually(rewards, n, rarityWeights) {
  const active = rewards.filter((r) => Number(r.weight) > 0);
  const groups = new Map(); // rarityId -> rewards[]
  for (const r of active) {
    const id = String(r.rarity || 'common').trim().toLowerCase() || 'common';
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(r);
  }
  const rarityList = [...groups.entries()].map(([id, list]) => ({
    id,
    rewards: list,
    weight: rarityWeights?.[id] ?? DEFAULT_RARITY_WEIGHTS[id] ?? 1,
    sum: list.reduce((a, r) => a + Number(r.weight), 0),
  })).filter((g) => g.weight > 0 && g.sum > 0);

  const totalRarityWeight = rarityList.reduce((a, g) => a + g.weight, 0);
  const out = [];
  if (totalRarityWeight <= 0) return out;

  for (let i = 0; i < n; i++) {
    let rarityRoll = Math.random() * totalRarityWeight;
    let chosenGroup = rarityList[rarityList.length - 1];
    for (const g of rarityList) {
      rarityRoll -= g.weight;
      if (rarityRoll <= 0) { chosenGroup = g; break; }
    }
    let roll = Math.random() * chosenGroup.sum;
    for (const r of chosenGroup.rewards) {
      roll -= Number(r.weight);
      if (roll <= 0) {
        out.push(r);
        break;
      }
    }
  }
  return out;
}
