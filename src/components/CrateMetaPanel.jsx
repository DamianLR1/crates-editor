import React, { useState } from 'react';
import { Settings2, KeyRound, Box, Flag, Trash2, Plus } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { itemLabel, costOption, V661 } from '../lib/crateFile.js';
import McText from './McText.jsx';
import { Field, Section, Toggle, TextInput, NumberInput, LinesInput, Button, EFFECTS, inputCls } from './fields.jsx';

const TABS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'opening', label: 'Apertura y costos', icon: KeyRound },
  { id: 'block', label: 'Bloque', icon: Box },
  { id: 'milestones', label: 'Metas', icon: Flag },
];

export default function CrateMetaPanel() {
  const { model } = useCrate();
  const [tab, setTab] = useState('general');
  if (!model) return null;

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-1 p-1.5 border-b border-ink-700 bg-ink-950/40" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors
              ${tab === id ? 'bg-ink-700 text-parch-100' : 'text-ink-500 hover:text-parch-200'}`}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'general' && <GeneralTab model={model} />}
        {tab === 'opening' && (model.format === V661 ? <Opening661 model={model} /> : <Opening633 model={model} />)}
        {tab === 'block' && <BlockTab model={model} />}
        {tab === 'milestones' && <MilestonesTab model={model} />}
      </div>
    </div>
  );
}

// ---------- GENERAL ----------

function GeneralTab({ model }) {
  const { fileName, updateCrateField, updateCrateStringSeq } = useCrate();
  const crateId = String(fileName ?? '').replace(/\.ya?ml$/i, '').toLowerCase();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Nombre de la caja">
          <TextInput value={model.name} preview className="text-sm" onCommit={(v) => updateCrateField(['Name'], v)} />
        </Field>
        <Field label="Descripción — una línea por renglón">
          <LinesInput value={model.description} keepEmpty preview onCommit={(v) => updateCrateStringSeq(['Description'], v)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="ID de Preview (previews/)">
          <TextInput value={model.preview.id} list="dl-previews" lower onCommit={(v) => updateCrateField(['Preview', 'Id'], v)} />
        </Field>
        <Field label="ID de Animación (openings/)">
          <TextInput value={model.animation.id} list="dl-animations" lower onCommit={(v) => updateCrateField(['Animation', 'Id'], v)} />
        </Field>
      </div>

      {model.itemProvider && (
        <Section title="Ítem físico de la caja (ItemProvider)" hint="Se cambia in-game; acá se conserva tal cual.">
          <McText text={itemLabel(model.itemProvider) ?? '(NBT sin id)'} className="text-xs" />
        </Section>
      )}
    </div>
  );
}

// ---------- APERTURA: 6.3.3 (Key + Opening) ----------

function Opening633({ model }) {
  const { server, updateCrateField, updateCrateStringSeq } = useCrate();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 items-end">
        <Toggle label="Llave requerida" checked={model.key.required} onChange={(v) => updateCrateField(['Key', 'Required'], v)} />
        <Field label="Cooldown de apertura (segundos)">
          <NumberInput value={model.opening.cooldown} onCommit={(v) => updateCrateField(['Opening', 'Cooldown'], Math.round(v))} />
        </Field>
      </div>
      <Field label="IDs de llave — una por renglón (sirve cualquiera)" hint={server?.keyIds.length ? `En keys/: ${server.keyIds.join(', ')}` : null}>
        <LinesInput value={model.key.ids} rows={2} lower onCommit={(v) => updateCrateStringSeq(['Key', 'Ids'], v)} />
      </Field>
      <CostsEditor costs={model.opening.costs} />
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
    <Field label="Costo de apertura (Opening.Cost)" hint="Se cobra al abrir, además de la llave. Requiere EconomyBridge.">
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

// ---------- APERTURA: 6.6.1 (OpeningCooldown + CostOptions + Post-Open) ----------

function Opening661({ model }) {
  const { updateCrateField, updateCrateStringSeq } = useCrate();
  return (
    <div className="space-y-5">
      <div>
        <div className="grid grid-cols-3 gap-3 items-end">
          <Toggle label="Cooldown de apertura" checked={model.openingCooldown.enabled} onChange={(v) => updateCrateField(['OpeningCooldown', 'Enabled'], v)} />
          <Field label="Cooldown (segundos)">
            <NumberInput value={model.openingCooldown.value} onCommit={(v) => updateCrateField(['OpeningCooldown', 'Value'], Math.round(v))} />
          </Field>
          <Field label="Aperturas por período">
            <NumberInput value={model.openingLimit} onCommit={(v) => updateCrateField(['OpeningLimits', 'Amount'], Math.max(1, Math.round(v)))} />
          </Field>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-ink-500">
          Dentro de cada período de cooldown el jugador puede abrir la caja «Aperturas por período» veces. Cooldown -1 = una sola vez, nunca se reinicia.
        </p>
      </div>

      <Field label="Opciones de costo (CostOptions)" hint="El jugador elige una opción y paga todas sus entradas. Sin opciones activas la caja se abre gratis.">
        <CostOptionsEditor options={model.costOptions} />
      </Field>

      <Field label="Comandos al abrir (Post-Open) — uno por renglón" hint="Se ejecutan cada vez que alguien abre la caja. %player_name% disponible.">
        <LinesInput value={model.postOpenCommands} rows={3} onCommit={(v) => updateCrateStringSeq(['Post-Open', 'Commands'], v)} />
      </Field>
    </div>
  );
}

function CostOptionsEditor({ options }) {
  const { updateCrateField, deleteCrateField, setCrateNode } = useCrate();
  const [newId, setNewId] = useState('');

  const addOption = () => {
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!id || options.some((o) => o.id === id)) return;
    setCrateNode(['CostOptions', id], costOption(id, []));
    setNewId('');
  };
  const entryPath = (o, e, ...rest) => ['CostOptions', o.id, 'Entries', e.index, ...rest];
  const addEntry = (o, entry) => {
    const next = Math.max(-1, ...o.entries.map((e) => Number(e.index)).filter(Number.isFinite)) + 1;
    setCrateNode(['CostOptions', o.id, 'Entries', String(next)], entry);
  };

  return (
    <div className="space-y-3">
      {options.map((o) => (
        <div key={o.id} className="rounded-lg border border-ink-700 bg-ink-800/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <code className="w-28 shrink-0 truncate text-xs text-gold-400" title={o.id}>{o.id}</code>
            <div className="flex-1">
              <TextInput value={o.name} placeholder="Nombre visible" onCommit={(v) => updateCrateField(['CostOptions', o.id, 'Name'], v)} />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-ink-500 shrink-0 cursor-pointer">
              <input type="checkbox" checked={o.enabled} onChange={(e) => updateCrateField(['CostOptions', o.id, 'Enabled'], e.target.checked)} className="accent-gold-500" />
              Activa
            </label>
            <IconButton title="Borrar opción" onClick={() => deleteCrateField(['CostOptions', o.id])}><Trash2 className="w-4 h-4" strokeWidth={1.5} /></IconButton>
          </div>

          {o.entries.map((e) => (
            <div key={String(e.index)} className="flex items-center gap-2 pl-3">
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-ink-500">
                {e.type === 'key' ? 'Llave' : e.type === 'currency' ? 'Moneda' : e.type}
              </span>
              <div className="flex-1">
                {e.type === 'key' ? (
                  <TextInput value={e.key} list="dl-keys" lower placeholder="id de llave" onCommit={(v) => updateCrateField(entryPath(o, e, 'Key'), v)} />
                ) : (
                  <TextInput value={e.currency} list="dl-currencies" lower placeholder="moneda" onCommit={(v) => updateCrateField(entryPath(o, e, 'Currency'), v)} />
                )}
              </div>
              <div className="w-28 shrink-0">
                <NumberInput
                  value={e.amount}
                  step={e.type === 'key' ? 1 : 0.01}
                  onCommit={(v) => updateCrateField(entryPath(o, e, 'Amount'), e.type === 'key' ? Math.max(1, Math.round(v)) : v)}
                />
              </div>
              <IconButton title="Quitar entrada" onClick={() => deleteCrateField(entryPath(o, e))}><Trash2 className="w-4 h-4" strokeWidth={1.5} /></IconButton>
            </div>
          ))}

          <div className="flex gap-2 pl-3">
            <Button variant="ghost" icon={Plus} onClick={() => addEntry(o, { Type: 'key', Key: '', Amount: 1 })}>Llave</Button>
            <Button variant="ghost" icon={Plus} onClick={() => addEntry(o, { Type: 'currency', Currency: 'vault', Amount: 1 })}>Moneda</Button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addOption()}
          placeholder="id de la opción nueva (ej. llave_oro)"
          className={inputCls}
        />
        <Button icon={Plus} onClick={addOption}>Opción</Button>
      </div>
    </div>
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
        {model.format === V661 && (
          <Toggle label="Efecto activo" checked={b.effectEnabled} onChange={(v) => updateCrateField(['Block', 'Effect', 'Enabled'], v)} />
        )}
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
        <Button variant="ghost" icon={Plus} onClick={() => addMilestone(rewardKeys[0], nextOpenings)} disabled={rewardKeys.length === 0}>
          Agregar meta
        </Button>
      </div>

      <p className="text-xs text-ink-500 leading-relaxed">
        Al llegar a N aperturas de esta caja el jugador recibe ese reward. Requiere <code>Milestones.Enabled: true</code> en config.yml.
      </p>
    </div>
  );
}

function IconButton({ title, onClick, children }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className="shrink-0 text-ink-500 hover:text-parch-200 transition-colors">
      {children}
    </button>
  );
}
