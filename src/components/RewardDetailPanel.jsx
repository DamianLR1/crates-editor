import React, { useState } from 'react';
import { useCrate } from '../store/CrateStore.jsx';
import { itemLabel, itemNode, V661 } from '../lib/crateFile.js';
import { mostCommonRarity } from '../lib/weightMath.js';
import McText from './McText.jsx';
import { Field, Section, Toggle, TextInput, NumberInput, LinesInput, inputCls } from './fields.jsx';

// Qué usa el plugin según el tipo (igual en 6.3.3 y 6.6.1):
//  - COMMAND: Name/Description/Commands. Con un preview custom (MMOItems, Nexo...)
//    nombre y lore salen del ítem y el plugin BORRA Name/Description al guardar.
//  - ITEM: entrega ItemsData; nombre y lore salen del primer ítem (o de
//    PreviewData si Custom_Preview está activo). No usa Name ni Commands.
export default function RewardDetailPanel({ reward, onRename }) {
  const { model, updateField } = useCrate();
  const format = model.format;
  const set = (field, value) => updateField(reward.key, field, value);
  const isItem = reward.type === 'ITEM';
  const customPreview = reward.previewData?.type === 'CUSTOM';
  // 6.6.1: Placeholder_Apply sólo existe en rewards ITEM; los comandos siempre procesan PlaceholderAPI
  const showPlaceholders = format !== V661 || isItem;

  return (
    <div className="px-5 pb-5 pt-1 bg-ink-950/40 border-t border-ink-800">
      <div className="grid gap-5 pt-4 lg:grid-cols-2">
        <div className="space-y-4">
          <KeyField reward={reward} onRename={onRename} />
          {!isItem && (
            <Field label="Nombre" hint={customPreview ? 'Preview custom: el plugin muestra el nombre del ítem y borra este campo al guardar.' : null}>
              <TextInput value={reward.name} preview className="text-sm" onCommit={(v) => set('Name', v)} />
            </Field>
          )}
          <RarityField reward={reward} onChange={(v) => set('Rarity', v)} />
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Broadcast al ganar" checked={reward.broadcast} onChange={(v) => set('Broadcast', v)} />
            {showPlaceholders && (
              <Toggle label={isItem ? 'Placeholders en ítems' : 'Placeholders (PAPI)'} checked={reward.placeholderApply} onChange={(v) => set('Placeholder_Apply', v)} />
            )}
          </div>
        </div>

        <div className="space-y-4">
          {isItem ? (
            <ItemsDataField reward={reward} />
          ) : (
            <>
              <Field label="Descripción (lore) — una línea por renglón" hint={customPreview ? 'Ignorada con preview custom.' : null}>
                <LinesInput value={reward.description} rows={4} keepEmpty preview onCommit={(v) => set('Description', v)} />
              </Field>
              <Field label="Comandos — uno por renglón, %player_name% disponible">
                <LinesInput value={reward.commands} rows={4} onCommit={(v) => set('Commands', v)} />
              </Field>
            </>
          )}
        </div>
      </div>

      {(!isItem || reward.customPreview) && <PreviewDataSection reward={reward} format={format} />}
      <PermissionsSection reward={reward} set={set} />
      {format === V661 ? <LimitsSection reward={reward} set={set} /> : <WinLimitSection reward={reward} set={set} />}
    </div>
  );
}

function KeyField({ reward, onRename }) {
  const [error, setError] = useState(null);
  const commit = (key) => {
    if (!/^[a-z0-9_]+$/.test(key)) return setError('Solo minúsculas, números y guion bajo.');
    setError(onRename(key) ? null : 'Ese id ya lo usa otro reward.');
  };
  return (
    <Field
      label={`ID del reward · tipo ${reward.type}`}
      hint={error ? <span className="text-crimson-400">{error}</span> : 'El plugin guarda los IDs en minúsculas.'}
    >
      <TextInput value={reward.key} lower onCommit={commit} />
    </Field>
  );
}

function RarityField({ reward, onChange }) {
  const { rarityWeights } = useCrate();
  const ids = Object.keys(rarityWeights);
  const current = String(reward.rarity ?? '').toLowerCase();
  const valid = ids.includes(current);
  return (
    <Field
      label="Rareza (afecta el % real)"
      hint={valid ? null : <span className="text-gold-400">"{reward.rarity}" no existe: el plugin usa "{mostCommonRarity(rarityWeights)}".</span>}
    >
      <select value={current} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {!valid && <option value={current}>{reward.rarity ?? '(sin rareza)'}</option>}
        {ids.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
    </Field>
  );
}

function ItemsDataField({ reward }) {
  const { updateField } = useCrate();
  return (
    <Field label={`Ítems que entrega (ItemsData) — ${reward.itemsData.length}`} hint="El NBT se edita in-game; acá se conserva tal cual.">
      <ul className="bg-ink-800/60 rounded-lg px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
        {reward.itemsData.map((it) => (
          <li key={it.index} className="text-xs truncate"><McText text={itemLabel(it) ?? '(ítem sin id)'} /></li>
        ))}
        {reward.itemsData.length === 0 && <li className="text-xs text-crimson-400">Sin ítems: este reward no entrega nada.</li>}
      </ul>
      <div className="mt-3">
        <Toggle label="Preview personalizado (Custom_Preview)" checked={reward.customPreview} onChange={(v) => updateField(reward.key, 'Custom_Preview', v)} />
      </div>
    </Field>
  );
}

function PreviewDataSection({ reward, format }) {
  const { setRewardNode } = useCrate();
  const pd = reward.previewData;
  const mode = pd?.type === 'CUSTOM' ? 'CUSTOM' : 'VANILLA';
  // Se reescribe la sección entera con las claves de la versión (Type/Tag o Provider/Data)
  const save = (patch) => setRewardNode(reward.key, 'PreviewData', itemNode(format, { ...pd, ...patch }));
  const label = itemLabel(pd);

  return (
    <Section title="Ítem del preview (PreviewData) — lo que se ve en el menú de la caja">
      <div className="flex gap-2">
        {[['VANILLA', 'Vanilla + NBT'], ['CUSTOM', 'Custom (MMOItems / Nexo / …)']].map(([m, text]) => (
          <button
            key={m}
            onClick={() => m !== mode && save({ type: m })}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
              mode === m ? 'bg-gold-500/15 border-gold-500/40 text-gold-400' : 'bg-ink-800 border-ink-600 text-ink-500 hover:text-parch-200'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {mode === 'VANILLA' ? (
        <Field label='SNBT del ítem (ej: {count:1,id:"minecraft:paper"})' hint={label ? <>Se ve como: <McText text={label} /></> : null}>
          <TextInput value={pd?.tagValue} multiline onCommit={(v) => save({ type: 'VANILLA', tagValue: v })} />
        </Field>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <Field label={format === V661 ? 'Provider' : 'Handler'}>
            <TextInput value={pd.handler} list="dl-handlers" onCommit={(v) => save({ handler: v })} />
          </Field>
          <div className="col-span-2">
            <Field label="ItemId (ej: SWORD:ESPADA)">
              <TextInput value={pd.itemId} onCommit={(v) => save({ itemId: v })} />
            </Field>
          </div>
          <Field label="Cantidad">
            <NumberInput value={pd.amount ?? 1} onCommit={(v) => save({ amount: Math.round(v) })} />
          </Field>
        </div>
      )}
    </Section>
  );
}

function PermissionsSection({ reward, set }) {
  return (
    <Section title="Permisos">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Requeridos (alcanza con uno)">
          <LinesInput value={reward.requiredPermissions} rows={2} onCommit={(v) => set('Required_Permissions', v)} />
        </Field>
        <Field label="Excluye a quien tenga alguno">
          <LinesInput value={reward.ignoredForPermissions} rows={2} onCommit={(v) => set('Ignored_For_Permissions', v)} />
        </Field>
      </div>
    </Section>
  );
}

// ---- 6.6.1: Limits (un solo Enabled, modo de cooldown compartido) ----
function LimitsSection({ reward, set }) {
  const l = reward.limits;
  const setLimit = (field, v) => set(['Limits', field], v);
  const whole = (field, min) => (v) => setLimit(field, Math.max(min, Math.round(v)));
  return (
    <Section
      title="Límites (Limits)"
      hint="Máximo -1 = sin límite. Cooldown 0 = sin cooldown. DAILY: se reinicia a la medianoche (cualquier valor > 0); CUSTOM: el valor es en segundos."
    >
      <Toggle label="Límites activos" checked={l.enabled} onChange={(v) => setLimit('Enabled', v)} />
      {l.enabled && (
        <div className="grid grid-cols-5 gap-2">
          <Field label="Modo">
            <select value={l.cooldownType} onChange={(e) => setLimit('CooldownType', e.target.value)} className={inputCls}>
              <option value="DAILY">DAILY</option>
              <option value="CUSTOM">CUSTOM</option>
            </select>
          </Field>
          <Field label="Máx. jugador"><NumberInput value={l.playerAmount} onCommit={whole('PlayerAmount', -1)} /></Field>
          <Field label="Máx. global"><NumberInput value={l.globalAmount} onCommit={whole('GlobalAmount', -1)} /></Field>
          <Field label="Cooldown jugador"><NumberInput value={l.playerCooldown} onCommit={whole('PlayerCooldown', 0)} /></Field>
          <Field label="Cooldown global"><NumberInput value={l.globalCooldown} onCommit={whole('GlobalCooldown', 0)} /></Field>
        </div>
      )}
    </Section>
  );
}

// ---- 6.3.3: Win_Limit (Player y Global por separado) ----
const LIMIT_SIDES = [
  ['player', 'Player', 'Por jugador'],
  ['global', 'Global', 'Global (servidor)'],
];

function WinLimitSection({ reward, set }) {
  return (
    <Section
      title="Límites de victoria (Win_Limit)"
      hint="Cooldown en segundos: 0 = nunca se reinicia, -2 = a medianoche. «Cada N» (CooldownStep): el cooldown arranca cada N victorias."
    >
      <div className="grid grid-cols-2 gap-3">
        {LIMIT_SIDES.map(([k, side, title]) => {
          const limit = reward.winLimit[k];
          const setLimit = (field, v) => set(['Win_Limit', side, field], v);
          return (
            <div key={side} className="bg-ink-800/40 rounded-lg p-3 space-y-2">
              <Toggle label={title} checked={limit.enabled} onChange={(v) => setLimit('Enabled', v)} />
              {limit.enabled && (
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Máx. (-1 = ∞)">
                    <NumberInput value={limit.amount} onCommit={(v) => setLimit('Amount', Math.round(v))} />
                  </Field>
                  <Field label="Cooldown">
                    <NumberInput value={limit.cooldown} onCommit={(v) => setLimit('Cooldown', Math.round(v))} />
                  </Field>
                  <Field label="Cada N">
                    <NumberInput value={limit.cooldownStep} onCommit={(v) => setLimit('CooldownStep', Math.max(1, Math.round(v)))} />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
