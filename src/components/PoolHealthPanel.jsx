import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Target, Info } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { suggestResidualFix, round } from '../lib/weightMath.js';

export default function PoolHealthPanel() {
  const { model, validation, targetTotal, setTargetTotal } = useCrate();
  if (!model || !validation) return null;

  const { total, residual, issues, healthy } = validation;
  const diff = round(targetTotal - total, 4);
  const suggestions = !residual.isClean
    ? suggestResidualFix(model.rewards, targetTotal)
    : null;

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-parch-200 flex items-center gap-2">
          <Target className="w-4 h-4 text-gold-400" strokeWidth={1.5} />
          Salud del pool
        </h3>
        {healthy ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Sin errores
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-crimson-400">
            <XCircle className="w-3.5 h-3.5" /> {issues.filter(i => i.level === 'error').length} error(es)
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Total actual" value={total} accent={diff === 0 ? 'emerald' : 'gold'} />
        <StatEditable
          label="Objetivo"
          value={targetTotal}
          onChange={setTargetTotal}
        />
        <Stat
          label="Diferencia"
          value={diff}
          accent={diff === 0 ? 'emerald' : Math.abs(diff) < targetTotal * 0.05 ? 'gold' : 'crimson'}
          signed
        />
      </div>

      {issues.length > 0 && (
        <div className="space-y-2 mb-3">
          {issues.map((issue, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border
                ${issue.level === 'error'
                  ? 'bg-crimson-500/10 border-crimson-500/30 text-crimson-400'
                  : issue.level === 'info'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-gold-500/10 border-gold-500/30 text-gold-400'}`}
            >
              {issue.level === 'info'
                ? <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
                : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />}
              <span className="leading-relaxed">{issue.msg}</span>
            </div>
          ))}
        </div>
      )}

      {suggestions && !suggestions.alreadyClean && suggestions.suggestions.length > 0 && (
        <div className="bg-ink-800 rounded-lg p-3 text-xs">
          <p className="text-parch-200 font-medium mb-2">Sugerencias para cerrar el residuo:</p>
          <ul className="space-y-1.5 text-ink-500">
            {suggestions.suggestions.map((s, i) => (
              <li key={i}>
                Bajar <span className="text-gold-400 font-mono-tab">{s.itemsToAdjust}</span> de los{' '}
                <span className="text-gold-400 font-mono-tab">{s.groupCount}</span> ítems con peso{' '}
                <span className="text-parch-200 font-mono-tab">{s.originalWeight}</span> a peso{' '}
                <span className="text-parch-200 font-mono-tab">{s.newWeight}</span>.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent = 'parch', signed = false }) {
  const colorMap = {
    emerald: 'text-emerald-400',
    gold: 'text-gold-400',
    crimson: 'text-crimson-400',
    parch: 'text-parch-100',
  };
  const display = signed && value > 0 ? `+${value}` : value;
  return (
    <div className="bg-ink-800 rounded-lg px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold font-mono-tab ${colorMap[accent]}`}>{display}</p>
    </div>
  );
}

function StatEditable({ label, value, onChange }) {
  return (
    <div className="bg-ink-800 rounded-lg px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">{label}</p>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-transparent text-lg font-semibold font-mono-tab text-parch-100 w-full outline-none focus:text-gold-400"
      />
    </div>
  );
}
