import React, { useEffect, useState } from 'react';
import { useCrate } from '../store/CrateStore.jsx';
import McText from './McText.jsx';

export const inputCls =
  'w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500';

// Ids reales del fork 6.3.3 (EffectId.java, OpeningManager.loadDefaults).
export const EFFECTS = ['none', 'simple', 'helix', 'spiral', 'sphere', 'heart', 'pulsar', 'beacon', 'tornado', 'vortex'];
const DEFAULT_ANIMATIONS = ['csgo', 'enclosing', 'mystery', 'roulette', 'storm', 'simple_roll', 'selective_1', 'selective_3'];
const HANDLERS = ['MMOItems', 'Nexo', 'Oraxen', 'ItemsAdder', 'HeadDatabase'];
const CURRENCIES = ['vault', 'playerpoints', 'xp_level', 'xp_points'];

/** Sugerencias para los <input list="dl-..."> (con carpeta abierta: los ids reales del server). */
export function Datalists() {
  const { server } = useCrate();
  const lists = {
    'dl-previews': server?.previewIds ?? ['default'],
    'dl-animations': server?.animationIds ?? DEFAULT_ANIMATIONS,
    'dl-holograms': server?.hologramIds ?? ['default'],
    'dl-handlers': HANDLERS,
    'dl-currencies': CURRENCIES,
  };
  return Object.entries(lists).map(([id, values]) => (
    <datalist key={id} id={id}>
      {values.map((v) => <option key={v} value={v} />)}
    </datalist>
  ));
}

// Borrador local que se resetea cuando cambia el valor de afuera (undo, otra crate).
function useDraft(value) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft];
}

const blurOnEnter = (e) => e.key === 'Enter' && e.currentTarget.blur();

export function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1.5 px-1 text-[10px] text-ink-500 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function Section({ title, hint, children }) {
  return (
    <div className="mt-5 pt-4 border-t border-ink-800">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">{title}</p>
      <div className="space-y-3">{children}</div>
      {hint && <p className="mt-2 text-[10px] text-ink-500 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 bg-ink-800 rounded-lg px-3 py-2 cursor-pointer">
      <span className="text-xs text-parch-200">{label}</span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-gold-500 shrink-0"
      />
    </label>
  );
}

export function TextInput({ value, onCommit, list, lower = false, multiline = false, preview = false, className = '' }) {
  const current = value == null ? '' : String(value);
  const [draft, setDraft] = useDraft(current);
  const commit = () => {
    const v = lower ? draft.trim().toLowerCase() : draft;
    setDraft(v);
    if (v !== current) onCommit(v);
  };
  const props = {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    className: `${inputCls} font-mono ${className}`,
  };
  return (
    <>
      {multiline
        ? <textarea rows={3} {...props} className={`${props.className} resize-y break-all`} />
        : <input type="text" list={list} onKeyDown={blurOnEnter} {...props} />}
      {preview && draft && (
        <div className="mt-1.5 px-1"><McText text={draft} className="text-xs" /></div>
      )}
    </>
  );
}

export function NumberInput({ value, onCommit, step = 1 }) {
  const current = Number(value) || 0;
  const [draft, setDraft] = useDraft(String(current));
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n) && n !== current) onCommit(n);
    else setDraft(String(current));
  };
  return (
    <input
      type="number"
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={blurOnEnter}
      className={`${inputCls} font-mono-tab`}
    />
  );
}

/**
 * Lista de strings, un renglón por item. `keepEmpty` conserva las líneas
 * vacías del medio (la lore las usa como separador) y solo recorta las del final.
 */
export function LinesInput({ value, onCommit, rows = 3, lower = false, keepEmpty = false, preview = false }) {
  const joined = (value || []).join('\n');
  const [draft, setDraft] = useDraft(joined);
  let lines = draft.split('\n').map((l) => (lower ? l.trim().toLowerCase() : l));
  if (keepEmpty) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  } else {
    lines = lines.filter((l) => l.trim());
  }
  return (
    <>
      <textarea
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== joined && onCommit(lines)}
        className={`${inputCls} font-mono resize-y`}
      />
      {preview && lines.length > 0 && (
        <div className="mt-1.5 px-1 space-y-0.5">
          {lines.map((line, i) => <McText key={i} text={line || ' '} className="text-xs block" />)}
        </div>
      )}
    </>
  );
}
