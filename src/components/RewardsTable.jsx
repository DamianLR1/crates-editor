import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronRight, ChevronLeft, Search, Gift } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { computePercentages, formatPercent, mostCommonRarity, rarityOf } from '../lib/weightMath.js';
import WeightBar from './WeightBar.jsx';
import McText from './McText.jsx';
import RewardDetailPanel from './RewardDetailPanel.jsx';
import { Button, Card, inputCls } from './fields.jsx';

const PAGE_SIZES = [10, 25, 50, 100];
const SORTS = {
  file: ['Orden del archivo', null],
  chanceDesc: ['Mayor probabilidad', (a, b) => b.percent - a.percent],
  chanceAsc: ['Menor probabilidad', (a, b) => a.percent - b.percent],
  id: ['ID', (a, b) => a.key.localeCompare(b.key)],
};
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_7.5rem_6rem_1.5rem] gap-4';
const selectCls = 'bg-ink-800 border border-ink-600 rounded-lg px-2 py-1.5 text-xs text-parch-100 outline-none focus:border-gold-500';
const DECIMALS_KEY = 'editor-excellentcrates:decimales';
const readDecimals = () => {
  try {
    const saved = localStorage.getItem(DECIMALS_KEY);
    return saved === null ? 6 : Math.min(6, Math.max(0, Math.round(Number(saved)) || 0));
  } catch {
    return 6; // sin storage (modo privado): el default
  }
};

export default function RewardsTable() {
  const { model, updateWeight, removeReward, createReward, renameRewardKey, rarityWeights } = useCrate();
  const [expandedKey, setExpandedKey] = useState(null);
  const [filter, setFilter] = useState('');
  const [rarity, setRarity] = useState('');
  const [sort, setSort] = useState('file');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  // sólo cómo se ve el %: el valor real (y el peso) no se redondea
  const [decimals, setDecimals] = useState(readDecimals);
  useEffect(() => {
    try { localStorage.setItem(DECIMALS_KEY, String(decimals)); } catch { /* sin storage */ }
  }, [decimals]);

  const withPercents = useMemo(() => computePercentages(model.rewards, rarityWeights), [model.rewards, rarityWeights]);
  const maxPercent = Math.max(...withPercents.map((r) => r.percent), 1);
  const rarities = [...new Set(withPercents.map((r) => rarityOf(r, rarityWeights)))];

  const q = filter.trim().toLowerCase();
  let rows = withPercents.filter((r) =>
    (!q || r.key.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q))
    && (!rarity || rarityOf(r, rarityWeights) === rarity));
  if (SORTS[sort][1]) rows = [...rows].sort(SORTS[sort][1]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * pageSize, (current + 1) * pageSize);
  const resetting = (setter) => (e) => { setter(e.target.value); setPage(0); };

  const handleNewReward = () => {
    let n = 1;
    while (model.rewards.some((r) => r.key === `nuevo_premio_${n}`)) n++;
    const key = `nuevo_premio_${n}`;
    // el wizard del plugin usa la rareza más común (CrateManager.getMostCommonRarity)
    createReward(key, { weight: 10, name: '&eNuevo Premio', rarity: mostCommonRarity(rarityWeights) });
    setFilter('');
    setRarity('');
    setSort('file');
    setPage(Number.MAX_SAFE_INTEGER); // el nuevo va al final: última página
    setExpandedKey(key);
  };

  // Renombrar el id/key del reward. Devuelve true/false para que el detalle sepa si se aplicó.
  const handleRename = (oldKey, newKey) => {
    const clean = newKey.trim().toLowerCase();
    if (!clean || clean === oldKey) return false;
    if (model.rewards.some((r) => r.key === clean)) return false;
    renameRewardKey(oldKey, clean);
    if (expandedKey === oldKey) setExpandedKey(clean);
    return true;
  };

  return (
    <Card
      title={`Recompensas (${model.rewards.length})`}
      icon={Gift}
      bodyClassName=""
      actions={<Button variant="success" icon={Plus} onClick={handleNewReward}>Nuevo premio</Button>}
    >
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-ink-800">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-ink-500" />
          <input
            type="text"
            placeholder="Buscar por nombre o ID..."
            value={filter}
            onChange={resetting(setFilter)}
            className={`${inputCls} py-1.5 pl-8`}
          />
        </div>
        <select value={rarity} onChange={resetting(setRarity)} className={selectCls} aria-label="Filtrar por rareza">
          <option value="">Todas las rarezas</option>
          {rarities.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <select value={sort} onChange={resetting(setSort)} className={selectCls} aria-label="Ordenar">
          {Object.entries(SORTS).map(([id, [label]]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select
          value={decimals}
          onChange={(e) => setDecimals(Number(e.target.value))}
          className={selectCls}
          aria-label="Decimales del porcentaje"
          title="Sólo cambia cómo se ve el %: el valor real no se redondea"
        >
          {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n === 0 ? '% sin decimales' : `% con ${n} decimal${n > 1 ? 'es' : ''}`}</option>)}
        </select>
      </div>

      <div className={`${COLUMNS} px-5 py-2 text-[10px] uppercase tracking-wider text-ink-500 border-b border-ink-800`}>
        <span className="pl-7">Recompensa</span>
        <span className="text-right">Probabilidad</span>
        <span className="text-right">Peso</span>
        <span />
      </div>

      <div className="divide-y divide-ink-800">
        {visible.map((reward) => (
          <RewardRow
            key={reward.key}
            reward={reward}
            maxPercent={maxPercent}
            decimals={decimals}
            expanded={expandedKey === reward.key}
            onToggle={() => setExpandedKey(expandedKey === reward.key ? null : reward.key)}
            onWeightChange={(w) => updateWeight(reward.key, w)}
            onDelete={() => removeReward(reward.key)}
            onRename={(newKey) => handleRename(reward.key, newKey)}
          />
        ))}
        {visible.length === 0 && (
          <div className="px-5 py-10 text-center text-ink-500 text-sm">
            {model.rewards.length ? 'No hay premios que coincidan con el filtro.' : 'Esta caja todavía no tiene premios.'}
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-ink-700 text-xs text-ink-500">
        <span>
          {rows.length
            ? `Mostrando ${current * pageSize + 1}–${Math.min(rows.length, (current + 1) * pageSize)} de ${rows.length}`
            : 'Sin resultados'}
        </span>
        <nav className="flex items-center gap-1" aria-label="Paginación">
          <PageButton disabled={current === 0} onClick={() => setPage(current - 1)} label="Página anterior">
            <ChevronLeft className="w-3.5 h-3.5" />
          </PageButton>
          {pageList(current, pages).map((p, i) => (p == null
            ? <span key={`gap${i}`} className="px-1">…</span>
            : <PageButton key={p} active={p === current} onClick={() => setPage(p)}>{p + 1}</PageButton>))}
          <PageButton disabled={current >= pages - 1} onClick={() => setPage(current + 1)} label="Página siguiente">
            <ChevronRight className="w-3.5 h-3.5" />
          </PageButton>
        </nav>
        <label className="flex items-center gap-2">
          Por página
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className={selectCls}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </footer>
    </Card>
  );
}

/** Números de página a mostrar: todas si son pocas, si no primera, vecinas de la actual y última (null = "…"). */
function pageList(current, pages) {
  if (pages <= 7) return [...Array(pages).keys()];
  const wanted = [...new Set([0, current - 1, current, current + 1, pages - 1])].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b);
  return wanted.flatMap((p, i) => (i && p - wanted[i - 1] > 1 ? [null, p] : [p]));
}

function PageButton({ children, active, disabled, onClick, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`min-w-7 h-7 px-2 inline-flex items-center justify-center rounded-md font-mono-tab border transition-colors disabled:opacity-30 ${
        active ? 'bg-gold-500/15 text-gold-400 border-gold-500/40' : 'border-transparent hover:bg-ink-800 hover:text-parch-200'
      }`}
    >
      {children}
    </button>
  );
}

function RewardRow({ reward, maxPercent, decimals, expanded, onToggle, onWeightChange, onDelete, onRename }) {
  const [localWeight, setLocalWeight] = useState(reward.weight);
  useEffect(() => setLocalWeight(reward.weight), [reward.weight]);

  const commit = () => {
    const n = parseFloat(localWeight);
    if (!isNaN(n) && n !== reward.weight) onWeightChange(n);
  };

  return (
    <div>
      <div className={`${COLUMNS} items-center px-5 py-3 hover:bg-ink-800/40 transition-colors group`}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onToggle} className="text-ink-500 hover:text-parch-200 shrink-0" title={expanded ? 'Cerrar' : 'Editar'}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <McText text={reward.displayName} className="text-sm truncate" />
              <span className="text-[10px] text-ink-500 font-mono-tab shrink-0">{reward.key}</span>
              {reward.type === 'ITEM' && (
                <span className="text-[9px] uppercase tracking-wider text-ink-500 border border-ink-600 rounded px-1 shrink-0">ítem</span>
              )}
            </div>
            <div className="mt-1.5 max-w-xs">
              <WeightBar percent={reward.percent} rarity={reward.rarity} maxPercent={maxPercent} />
            </div>
          </div>
        </div>

        <p className="text-right text-sm font-semibold text-parch-100 font-mono-tab" title={`Exacto: ${formatPercent(reward.percent, 10)}`}>
          {reward.percent.toFixed(decimals)}%
        </p>

        <input
          type="number"
          step="0.1"
          value={localWeight}
          onChange={(e) => setLocalWeight(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="w-full bg-ink-800 border border-ink-600 rounded-lg px-2 py-1.5 text-sm text-right font-mono-tab text-parch-100 outline-none focus:border-gold-500"
        />

        <button
          onClick={onDelete}
          className="justify-self-end text-ink-500 hover:text-crimson-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Eliminar premio (se puede deshacer)"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {expanded && <RewardDetailPanel reward={reward} onRename={onRename} />}
    </div>
  );
}
