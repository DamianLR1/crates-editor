import React, { useState } from 'react';
import { ArrowRightLeft, X, AlertTriangle } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';

/**
 * Aviso que queda arriba después de una conversión (SpecializedCrates -> 6.3.3
 * o 6.3.3 -> 6.6.1): resume qué pasó y lista lo que hay que revisar antes de
 * subir el archivo al server.
 */
export default function ConversionWarningsBanner() {
  const { conversionWarnings, dismissConversionWarnings } = useCrate();
  const [expanded, setExpanded] = useState(true);

  if (!conversionWarnings) return null;
  const { title, items = [], note } = conversionWarnings;

  return (
    <div className="px-6 pt-4">
      <div className="flex items-start gap-3 rounded-xl border border-gold-500/30 bg-gold-400/5 px-4 py-3">
        <ArrowRightLeft className="w-4 h-4 mt-0.5 text-gold-400 shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-parch-200">{title}</p>
          {items.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300">
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
                {items.length} cosa{items.length === 1 ? '' : 's'} para revisar {expanded ? '(ocultar)' : '(ver)'}
              </button>
              {expanded && (
                <ul className="mt-2 space-y-1.5 text-xs text-ink-500 list-disc list-inside">
                  {items.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}
          {note && <p className="mt-2 text-xs text-ink-500">{note}</p>}
        </div>
        <button onClick={dismissConversionWarnings} className="text-ink-500 hover:text-parch-200 shrink-0" title="Cerrar">
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
