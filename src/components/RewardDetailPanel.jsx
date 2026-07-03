import React, { useState, useEffect } from 'react';
import { useCrate } from '../store/CrateStore.jsx';
import McText from './McText.jsx';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// Igual criterio que usa el resto del editor/plugin para keys YAML seguras:
// letras/números/guion bajo, sin espacios ni caracteres especiales.
const KEY_PATTERN = /^[a-zA-Z0-9_]+$/;

export default function RewardDetailPanel({ reward, onRename }) {
  const { updateField } = useCrate();
  const [name, setName] = useState(reward.name || '');
  const [description, setDescription] = useState((reward.description || []).join('\n'));
  const [commands, setCommands] = useState((reward.commands || []).join('\n'));
  const [keyDraft, setKeyDraft] = useState(reward.key);
  const [keyError, setKeyError] = useState(null);

  useEffect(() => setName(reward.name || ''), [reward.key]);
  useEffect(() => setDescription((reward.description || []).join('\n')), [reward.key]);
  useEffect(() => setCommands((reward.commands || []).join('\n')), [reward.key]);
  useEffect(() => { setKeyDraft(reward.key); setKeyError(null); }, [reward.key]);

  const commitKey = () => {
    const clean = keyDraft.trim();
    if (clean === reward.key) return;
    if (!KEY_PATTERN.test(clean)) {
      setKeyError('Solo letras, números y guion bajo (sin espacios ni tildes)');
      return;
    }
    const ok = onRename ? onRename(clean) : false;
    if (!ok) {
      setKeyError('Ese id ya lo usa otro reward');
      setKeyDraft(reward.key);
    } else {
      setKeyError(null);
    }
  };

  return (
    <div className="px-5 pb-5 pt-1 bg-ink-950/40 border-t border-ink-800">
      <div className="grid grid-cols-2 gap-5 pt-4">
        <div className="space-y-4">
          <Field label="ID del reward (key en Rewards.List)">
            <input
              type="text"
              value={keyDraft}
              onChange={(e) => { setKeyDraft(e.target.value); setKeyError(null); }}
              onBlur={commitKey}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              className={`w-full bg-ink-800 border rounded-lg px-3 py-2 text-sm text-parch-100 outline-none font-mono
                ${keyError ? 'border-crimson-500 focus:border-crimson-500' : 'border-ink-600 focus:border-gold-500'}`}
            />
            {keyError
              ? <p className="mt-1.5 px-1 text-xs text-crimson-400">{keyError}</p>
              : <p className="mt-1.5 px-1 text-xs text-ink-500">Cambia la key <code>Rewards.List.{reward.key}</code> del YAML. No afecta el peso ni el %.</p>}
          </Field>

          <Field label="Nombre">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== reward.name && updateField(reward.key, 'Name', name)}
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm text-parch-100 outline-none focus:border-gold-500 font-mono"
            />
            <div className="mt-1.5 px-1"><McText text={name} className="text-xs" /></div>
          </Field>

          <Field label="Tipo">
            <select
              value={reward.type}
              onChange={(e) => updateField(reward.key, 'Type', e.target.value)}
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm text-parch-100 outline-none focus:border-gold-500"
            >
              <option value="COMMAND">COMMAND</option>
              <option value="ITEM">ITEM</option>
            </select>
          </Field>

          <Field label="Rareza (visual, no afecta el %)">
            <select
              value={reward.rarity || 'common'}
              onChange={(e) => updateField(reward.key, 'Rarity', e.target.value)}
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm text-parch-100 outline-none focus:border-gold-500 capitalize"
            >
              {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Broadcast al ganar">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!reward.broadcast}
                onChange={(e) => updateField(reward.key, 'Broadcast', e.target.checked)}
                className="w-4 h-4 accent-gold-500"
              />
              <span className="text-xs text-ink-500">Anunciar a todo el server</span>
            </label>
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Descripción (lore) — una línea por renglón">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => updateField(reward.key, 'Description', description.split('\n').filter(Boolean))}
              rows={4}
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono resize-none"
            />
            <div className="mt-1.5 px-1 space-y-0.5">
              {description.split('\n').filter(Boolean).map((line, i) => (
                <McText key={i} text={line} className="text-xs block" />
              ))}
            </div>
          </Field>

          <Field label="Comandos — uno por renglón, %player_name% disponible">
            <textarea
              value={commands}
              onChange={(e) => setCommands(e.target.value)}
              onBlur={() => updateField(reward.key, 'Commands', commands.split('\n').filter(Boolean))}
              rows={4}
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono resize-none"
            />
          </Field>
        </div>
      </div>

      <PreviewDataSection reward={reward} />
      <WinLimitSection reward={reward} />
    </div>
  );
}

/**
 * Editor del ítem que el jugador ve en el menú de preview de la crate.
 * ExcellentCrates soporta dos modos: VANILLA (item vanilla + NBT crudo en
 * Tag.Value) o CUSTOM (delegado a un Handler externo como MMOItems/Nexo,
 * identificado por ItemId). Sin esto, un reward creado desde el editor
 * se ve como un item roto/genérico en el juego.
 */
function PreviewDataSection({ reward }) {
  const { updateField } = useCrate();
  const pd = reward.previewData || {};
  const mode = pd.type === 'CUSTOM' ? 'CUSTOM' : 'VANILLA';

  const [tagValue, setTagValue] = useState(pd.tagValue || '');
  const [itemId, setItemId] = useState(pd.itemId || '');
  const [handler, setHandler] = useState(pd.handler || 'MMOItems');

  useEffect(() => {
    setTagValue(pd.tagValue || '');
    setItemId(pd.itemId || '');
    setHandler(pd.handler || 'MMOItems');
  }, [reward.key]);

  if (reward.itemsData) {
    // Reward tipo ITEM con múltiples piezas (ItemsData) — no editable acá,
    // requiere el editor multi-item que se agrega en una iteración futura.
    return (
      <div className="mt-5 pt-4 border-t border-ink-800">
        <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">Preview del ítem</p>
        <div className="bg-ink-800/60 rounded-lg px-3 py-2 text-xs text-ink-500">
          Este reward usa <code className="text-gold-400">ItemsData</code> (múltiples piezas físicas). La edición
          de cada pieza todavía no está soportada visualmente — se preserva tal cual al exportar.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-4 border-t border-ink-800">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">
        Preview del ítem (lo que se ve en el menú de la caja)
      </p>
      <div className="bg-ink-800/40 rounded-lg p-3 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => updateField(reward.key, ['PreviewData', 'Type'], 'VANILLA')}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
              mode === 'VANILLA' ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'bg-ink-800 border-ink-600 text-ink-500'
            }`}
          >
            Vanilla + NBT
          </button>
          <button
            onClick={() => updateField(reward.key, ['PreviewData', 'Type'], 'CUSTOM')}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
              mode === 'CUSTOM' ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'bg-ink-800 border-ink-600 text-ink-500'
            }`}
          >
            Custom (MMOItems / Nexo / Oraxen)
          </button>
        </div>

        {mode === 'VANILLA' ? (
          <Field label="Tag NBT (formato SNBT, ej: {count:1,id:&quot;minecraft:paper&quot;})">
            <textarea
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              onBlur={() => tagValue !== pd.tagValue && updateField(reward.key, ['PreviewData', 'Tag', 'Value'], tagValue)}
              rows={2}
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono resize-none"
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Handler">
              <select
                value={handler}
                onChange={(e) => { setHandler(e.target.value); updateField(reward.key, ['PreviewData', 'Handler'], e.target.value); }}
                className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500"
              >
                <option value="MMOItems">MMOItems</option>
                <option value="Nexo">Nexo</option>
                <option value="Oraxen">Oraxen</option>
                <option value="ItemsAdder">ItemsAdder</option>
                <option value="HeadDatabase">HeadDatabase</option>
              </select>
            </Field>
            <Field label="ItemId (ej: ARMOR:BOTASPASCUAS2026)">
              <input
                type="text"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                onBlur={() => itemId !== pd.itemId && updateField(reward.key, ['PreviewData', 'ItemId'], itemId)}
                className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono"
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Editor de límites de victoria (Win_Limit): cuántas veces puede ganar
 * este reward un jugador individual (Player) o el server entero (Global),
 * con cooldown de reseteo. Sin esto expuesto, quedaba enterrado en el
 * YAML y nunca se podía ajustar desde la UI.
 */
function WinLimitSection({ reward }) {
  const { updateField } = useCrate();
  const wl = reward.winLimit || { player: {}, global: {} };

  return (
    <div className="mt-5 pt-4 border-t border-ink-800">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">Límites de victoria (Win_Limit)</p>
      <div className="grid grid-cols-2 gap-3">
        <WinLimitSide
          title="Por jugador"
          side="Player"
          data={wl.player}
          rewardKey={reward.key}
          updateField={updateField}
        />
        <WinLimitSide
          title="Global (servidor)"
          side="Global"
          data={wl.global}
          rewardKey={reward.key}
          updateField={updateField}
        />
      </div>
    </div>
  );
}

function WinLimitSide({ title, side, data, rewardKey, updateField }) {
  return (
    <div className="bg-ink-800/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-parch-200 font-medium">{title}</span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!data?.enabled}
            onChange={(e) => updateField(rewardKey, ['Win_Limit', side, 'Enabled'], e.target.checked)}
            className="w-3.5 h-3.5 accent-gold-500"
          />
          <span className="text-[10px] text-ink-500">Activo</span>
        </label>
      </div>
      {data?.enabled && (
        <div className="grid grid-cols-2 gap-2">
          <MiniNumberField
            label="Máx."
            value={data?.amount ?? -1}
            onCommit={(v) => updateField(rewardKey, ['Win_Limit', side, 'Amount'], v)}
          />
          <MiniNumberField
            label="Cooldown (seg)"
            value={data?.cooldown ?? 0}
            onCommit={(v) => updateField(rewardKey, ['Win_Limit', side, 'Cooldown'], v)}
          />
        </div>
      )}
    </div>
  );
}

function MiniNumberField({ label, value, onCommit }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div>
      <p className="text-[9px] text-ink-500 mb-0.5">{label}</p>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => Number(local) !== value && onCommit(Number(local))}
        className="w-full bg-ink-800 border border-ink-600 rounded px-1.5 py-1 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono-tab"
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}