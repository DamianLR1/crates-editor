import React, { useState } from 'react';
import { ArrowRightLeft, X, AlertTriangle } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';

/**
 * Se muestra una vez, justo después de convertir un archivo de
 * SpecializedCrates a ExcellentCrates (ver CrateStore.convertSpecializedFile).
 * Resume qué se convirtió y lista los warnings puntuales (rewards omitidos,
 * lore con "Probabilidad" auto-generada que puede haber quedado desactualizada,
 * etc.) para que el admin los revise antes de subir el archivo al server.
 */
export default function ConversionWarningsBanner() {
  const { conversionWarnings, dismissConversionWarnings } = useCrate();
  const [expanded, setExpanded] = useState(false);

  if (!conversionWarnings) return null;
  const { sourceName, rewardCount, items } = conversionWarnings;
  const hasWarnings = items && items.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-6 pt-4">
      <div className="rounded-xl border border-gold-500/30 bg-gold-400/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <ArrowRightLeft className="w-4 h-4 mt-0.5 text-gold-400 shrink-0" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-parch-200">
              Convertido desde <span className="font-medium">{sourceName}</span> (SpecializedCrates) —
              {' '}{rewardCount} reward{rewardCount === 1 ? '' : 's'}. Los pesos se calcularon 1:1 desde el
              {' '}<code className="text-xs bg-ink-800 px-1 py-0.5 rounded">chance</code> original, así que
              las probabilidades quedan idénticas a las que tenías en SpecializedCrates.
            </p>
            {hasWarnings && (
              <div className="mt-2">
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300"
                >
                  <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {items.length} cosa{items.length === 1 ? '' : 's'} para revisar
                  {expanded ? ' (ocultar)' : ' (ver detalle)'}
                </button>
                {expanded && (
                  <ul className="mt-2 space-y-1.5 text-xs text-ink-500 list-disc list-inside">
                    {items.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-ink-500">
              Revisá el pool y los items antes de subirlo al server — el conversor asume que todo
              reward de tipo "ITEM" con nbt-tags mapea a un preview VANILLA (así lo maneja
              SpecializedCrates); si tenías handlers custom del lado de ExcellentCrates, agregalos manualmente.
            </p>
          </div>
          <button
            onClick={dismissConversionWarnings}
            className="text-ink-500 hover:text-parch-200 shrink-0"
            title="Cerrar"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
