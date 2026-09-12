import React, { useState } from 'react';
import { Settings2, Box, Flag, Trash2, Plus } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { itemLabel } from '../lib/crateFile.js';
import McText from './McText.jsx';
import { Field, Section, Toggle, TextInput, NumberInput, LinesInput, EFFECTS, inputCls } from './fields.jsx';

const TABS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'block', label: 'Bloque', icon: Box },
  { id: 'milestones', label: 'Metas', icon: Flag },
];

export default function CrateMetaPanel() {
  const { model } = useCrate();
  const [tab, setTab] = useState('general');
  if (!model) return null;

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-1 p-1.5 border-b border-ink-700 bg-ink-950/40">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${tab === id ? 'bg-ink-700 text-parch-100' : 'text-ink-500 hover:text-parch-200'}`}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'general' && <GeneralTab model={model} />}
        {tab === 'block' && <BlockTab model={model} />}
        {tab === 'milestones' && <MilestonesTab model={model} />}
      </div>
    </div>
  );
}

// ---------- GENERAL ----------

function GeneralTab({ model }) {
  const { fileName, server, updateCrateField, updateCrateStringSeq } = useCrate();
  const crateId = String(fileName ?? '').replace(/\.ya?ml$/i, '').toLowerCase();

  return (
    <div className="space-y-4">
      <Field label="Nombre de la caja">
        <TextInput value={model.name} preview className="text-sm" onCommit={(v) => updateCrateField(['Name'], v)} />
      </Field>

      <Field label="Descripción — una línea por renglón">
        <LinesInput value={model.description} keepEmpty preview onCommit={(v) => updateCrateStringSeq(['Description'], v)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Toggle label="Llave requerida" checked={model.key.required} onChange={(v) => updateCrateField(['Key', 'Required'], v)} />
        <Toggle label="Preview activo" checked={model.preview.enabled} onChange={(v) => updateCrateField(['Preview', 'Enabled'], v)} />
        <Toggle label="Animación activa" checked={model.animation.enabled} onChange={(v) => updateCrateField(['Animation', 'Enabled'], v)} />
        <Toggle label="Ítem apilable" checked={model.itemStackable} onChange={(v) => updateCrateField(['ItemStackable'], v)} />
        <Toggle label="Requiere permiso" checked={model.permissionRequired} onChange={(v) => updateCrateField(['Permission_Required'], v)} />
      </div>
      {model.permissionRequired && (
        <p className="px-1 text-[10px] text-ink-500">
          Permiso: <code className="text-parch-200">excellentcrates.crate.{crateId}</code>
        </p>
      )}

      <Field label="IDs de llave — una por renglón" hint={server?.keyIds.length ? `En keys/: ${server.keyIds.join(', ')}` : null}>
        <LinesInput value={model.key.ids} rows={2} lower onCommit={(v) => updateCrateStringSeq(['Key', 'Ids'], v)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ID de Preview">
          <TextInput value={model.preview.id} list="dl-previews" lower onCommit={(v) => updateCrateField(['Preview', 'Id'], v)} />
        </Field>
        <Field label="ID de Animación">
          <TextInput value={model.animation.id} list="dl-animations" lower onCommit={(v) => updateCrateField(['Animation', 'Id'], v)} />
        </Field>
      </div>

      <Field label="Cooldown de apertura (segundos)">
        <NumberInput value={model.opening.cooldown} onCommit={(v) => updateCrateField(['Opening', 'Cooldown'], Math.round(v))} />
      </Field>

      <CostsEditor costs={model.opening.costs} />

      {model.itemProvider && (
        <Section title="Ítem físico de la caja (ItemProvider)" hint="Se cambia in-game; acá se conserva tal cual.">
          <McText text={itemLabel(model.itemProvider) ?? '(NBT sin id)'} className="text-xs" />
        </Section>
      )}
    </div>
  );
}

function CostsEditor({ costs }) {
  const { updateCrateField, deleteCrateField } = useCrate();
  const [currency, setCurrency] = useState('');

  const add = () => {
    const id = currency.trim().toLowerCase();
    if (!id || costs.some((c) => c.id === id)) return;
    updateCrateField(['Opening', 'Cost', id], 1);
    setCurrency('');
  };

  return (
    <Field label="Costo de apertura (Opening.Cost)" hint="Se cobra al abrir. Requiere EconomyBridge; sin él el plugin lo ignora.">
      <div className="space-y-2">
        {costs.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs font-mono text-parch-200 truncate">{c.id}</span>
            <NumberInput value={c.amount} step={0.01} onCommit={(v) => updateCrateField(['Opening', 'Cost', c.id], v)} />
            <IconButton title="Quitar" onClick={() => deleteCrateField(['Opening', 'Cost', c.id])}><Trash2 className="w-4 h-4" strokeWidth={1.5} /></IconButton>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            list="dl-currencies"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="moneda (ej. vault)"
            className={inputCls}
          />
          <IconButton title="Agregar" onClick={add}><Plus className="w-4 h-4" strokeWidth={2} /></IconButton>
        </div>
      </div>
    </Field>
  );
}

// ---------- BLOQUE ----------

function BlockTab({ model }) {
  const { updateCrateField, updateCrateStringSeq } = useCrate();
  const b = model.block;
  const effects = EFFECTS.includes(b.effectModel) ? EFFECTS : [b.effectModel, ...EFFECTS];

  return (
    <div className="space-y-4">
      <Field label="Posiciones — una por renglón (x,y,z,mundo)" hint={`${b.positions.length} bloque(s). Normalmente se asignan in-game.`}>
        <LinesInput value={b.positions} rows={3} onCommit={(v) => updateCrateStringSeq(['Block', 'Positions'], v)} />
      </Field>

      <Toggle label="Empujar al jugador (Pushback)" checked={b.pushbackEnabled} onChange={(v) => updateCrateField(['Block', 'Pushback', 'Enabled'], v)} />

      <Section title="Holograma">
        <Toggle label="Holograma activo" checked={b.hologramEnabled} onChange={(v) => updateCrateField(['Block', 'Hologram', 'Enabled'], v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Template (config.yml)">
            <TextInput value={b.hologramTemplate} list="dl-holograms" lower onCommit={(v) => updateCrateField(['Block', 'Hologram', 'Template'], v)} />
          </Field>
          <Field label="Offset en Y">
            <NumberInput value={b.hologramYOffset} step={0.1} onCommit={(v) => updateCrateField(['Block', 'Hologram', 'Y_Offset'], v)} />
          </Field>
        </div>
      </Section>

      <Section title="Efecto de partículas">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modelo">
            <select value={b.effectModel} onChange={(e) => updateCrateField(['Block', 'Effect', 'Model'], e.target.value)} className={inputCls}>
              {effects.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </Field>
          <Field label="Partícula (Bukkit)">
            <TextInput value={b.effectParticleName} onCommit={(v) => updateCrateField(['Block', 'Effect', 'Particle', 'Name'], v.trim().toUpperCase())} />
          </Field>
        </div>
      </Section>
    </div>
  );
}

// ---------- MILESTONES ----------

function MilestonesTab({ model }) {
  const { updateCrateField, deleteCrateField, addMilestone } = useCrate();
  const rewardKeys = model.rewards.map((r) => r.key);
  const list = [...model.milestones.list].sort((a, b) => a.openings - b.openings);
  const nextOpenings = (list.at(-1)?.openings ?? 0) + 10;
  const path = (m, ...rest) => ['Milestones', 'List', m.key, ...rest];

  return (
    <div className="space-y-4">
      <Toggle label="Metas repetibles" checked={model.milestones.repeatable} onChange={(v) => updateCrateField(['Milestones', 'Repeatable'], v)} />

      <div className="space-y-2">
        {list.map((m) => (
          <div key={String(m.key)} className="flex items-center gap-2">
            <div className="w-24 shrink-0">
              <NumberInput value={m.openings} onCommit={(v) => updateCrateField(path(m, 'Openings'), Math.round(v))} />
            </div>
            <select value={m.rewardId ?? ''} onChange={(e) => updateCrateField(path(m, 'Reward_Id'), e.target.value)} className={inputCls}>
              {!rewardKeys.includes(m.rewardId) && <option value={m.rewardId ?? ''}>{m.rewardId} (no existe)</option>}
              {rewardKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <IconButton title="Quitar" onClick={() => deleteCrateField(path(m))}><Trash2 className="w-4 h-4" strokeWidth={1.5} /></IconButton>
          </div>
        ))}
        <button
          onClick={() => addMilestone(rewardKeys[0], nextOpenings)}
          disabled={rewardKeys.length === 0}
          className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-parch-200 disabled:opacity-40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Agregar meta
        </button>
      </div>

      <p className="text-xs text-ink-500 leading-relaxed">
        Al llegar a N aperturas de esta caja el jugador recibe ese reward. Requiere <code>Milestones.Enabled: true</code> en config.yml.
      </p>
    </div>
  );
}

function IconButton({ title, onClick, children }) {
  return (
    <button title={title} onClick={onClick} className="shrink-0 text-ink-500 hover:text-parch-200 transition-colors">
      {children}
    </button>
  );
}
