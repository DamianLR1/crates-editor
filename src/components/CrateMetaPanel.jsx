import React, { useState, useEffect } from 'react';
import { Settings2, Box, Flag } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import McText from './McText.jsx';

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
  const { updateCrateField, updateCrateStringSeq } = useCrate();
  const [name, setName] = useState(model.name || '');
  const [description, setDescription] = useState((model.description || []).join('\n'));
  const [keyIds, setKeyIds] = useState((model.key?.ids || []).join('\n'));

  useEffect(() => setName(model.name || ''), [model.name]);
  useEffect(() => setDescription((model.description || []).join('\n')), []); // eslint-disable-line
  useEffect(() => setKeyIds((model.key?.ids || []).join('\n')), []); // eslint-disable-line

  return (
    <div className="space-y-4">
      <Field label="Nombre de la caja">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== model.name && updateCrateField(['Name'], name)}
          className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm text-parch-100 outline-none focus:border-gold-500 font-mono"
        />
        <div className="mt-1.5 px-1"><McText text={name} className="text-sm" /></div>
      </Field>

      <Field label="Descripción — una línea por renglón">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => updateCrateStringSeq(['Description'], description.split('\n').filter(Boolean))}
          rows={3}
          className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono resize-none"
        />
        <div className="mt-1.5 px-1 space-y-0.5">
          {description.split('\n').filter(Boolean).map((line, i) => (
            <McText key={i} text={line} className="text-xs block" />
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <ToggleField
          label="Llave requerida"
          checked={!!model.key?.required}
          onChange={(v) => updateCrateField(['Key', 'Required'], v)}
        />
        <ToggleField
          label="Preview activo"
          checked={!!model.preview?.enabled}
          onChange={(v) => updateCrateField(['Preview', 'Enabled'], v)}
        />
        <ToggleField
          label="Animación activa"
          checked={!!model.animation?.enabled}
          onChange={(v) => updateCrateField(['Animation', 'Enabled'], v)}
        />
        <ToggleField
          label="Ítem apilable"
          checked={!!model.itemStackable}
          onChange={(v) => updateCrateField(['ItemStackable'], v)}
        />
      </div>

      <Field label="IDs de llave — una por renglón">
        <textarea
          value={keyIds}
          onChange={(e) => setKeyIds(e.target.value)}
          onBlur={() => updateCrateStringSeq(['Key', 'Ids'], keyIds.split('\n').filter(Boolean))}
          rows={2}
          className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ID de Preview">
          <TextInput value={model.preview?.id} onCommit={(v) => updateCrateField(['Preview', 'Id'], v)} />
        </Field>
        <Field label="ID de Animación">
          <TextInput value={model.animation?.id} onCommit={(v) => updateCrateField(['Animation', 'Id'], v)} />
        </Field>
      </div>

      <Field label="Cooldown de apertura (segundos)">
        <NumberInput value={model.opening?.cooldown ?? 0} onCommit={(v) => updateCrateField(['Opening', 'Cooldown'], v)} />
      </Field>

      {model.itemProvider && (
        <div className="pt-2 border-t border-ink-800">
          <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2 mt-3">
            Ítem físico de la caja (ItemProvider)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <MetaStat label="Handler" value={model.itemProvider.handler || model.itemProvider.type || '—'} />
            <MetaStat label="Item ID" value={model.itemProvider.itemId || '(NBT crudo)'} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- BLOQUE ----------

function BlockTab({ model }) {
  const { updateCrateField, updateCrateStringSeq } = useCrate();
  const [positions, setPositions] = useState((model.block?.positions || []).join('\n'));

  useEffect(() => setPositions((model.block?.positions || []).join('\n')), []); // eslint-disable-line

  return (
    <div className="space-y-4">
      <Field label="Posiciones — una por renglón (x,y,z,crateId)">
        <textarea
          value={positions}
          onChange={(e) => setPositions(e.target.value)}
          onBlur={() => updateCrateStringSeq(['Block', 'Positions'], positions.split('\n').filter(Boolean))}
          rows={3}
          className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono resize-none"
        />
        <p className="text-[10px] text-ink-500 mt-1">
          {model.block?.positions?.length || 0} bloque(s) colocado(s) en el mundo
        </p>
      </Field>

      <ToggleField
        label="Pushback activo"
        checked={!!model.block?.pushbackEnabled}
        onChange={(v) => updateCrateField(['Block', 'Pushback', 'Enabled'], v)}
      />

      <div className="pt-2 border-t border-ink-800">
        <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2 mt-3">Holograma</p>
        <div className="space-y-3">
          <ToggleField
            label="Holograma activo"
            checked={!!model.block?.hologramEnabled}
            onChange={(v) => updateCrateField(['Block', 'Hologram', 'Enabled'], v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Template">
              <TextInput
                value={model.block?.hologramTemplate}
                onCommit={(v) => updateCrateField(['Block', 'Hologram', 'Template'], v)}
              />
            </Field>
            <Field label="Offset en Y">
              <NumberInput
                value={model.block?.hologramYOffset ?? 0}
                step={0.1}
                onCommit={(v) => updateCrateField(['Block', 'Hologram', 'Y_Offset'], v)}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-ink-800">
        <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2 mt-3">Efecto de apertura</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modelo">
            <select
              value={model.block?.effectModel || 'simple'}
              onChange={(e) => updateCrateField(['Block', 'Effect', 'Model'], e.target.value)}
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500"
            >
              <option value="simple">Simple</option>
              <option value="none">Ninguno</option>
            </select>
          </Field>
          <Field label="Partícula">
            <TextInput
              value={model.block?.effectParticleName}
              onCommit={(v) => updateCrateField(['Block', 'Effect', 'Particle', 'Name'], v)}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---------- MILESTONES ----------

function MilestonesTab({ model }) {
  const { updateCrateField } = useCrate();
  return (
    <div className="space-y-4">
      <ToggleField
        label="Metas repetibles"
        checked={!!model.milestones?.repeatable}
        onChange={(v) => updateCrateField(['Milestones', 'Repeatable'], v)}
      />
      <p className="text-xs text-ink-500 leading-relaxed">
        El editor de recompensas por hito (milestone rewards individuales) todavía no está soportado
        visualmente en esta versión — se preserva tal cual al exportar si ya existen en el YAML.
      </p>
    </div>
  );
}

// ---------- Inputs reutilizables ----------

function TextInput({ value, onCommit }) {
  const [local, setLocal] = useState(value || '');
  useEffect(() => setLocal(value || ''), [value]);
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== value && onCommit(local)}
      className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono"
    />
  );
}

function NumberInput({ value, onCommit, step = 1 }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      type="number"
      step={step}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => Number(local) !== value && onCommit(Number(local))}
      className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs text-parch-100 outline-none focus:border-gold-500 font-mono-tab"
    />
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between bg-ink-800 rounded-lg px-3 py-2 cursor-pointer">
      <span className="text-xs text-parch-200">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-gold-500"
      />
    </label>
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

function MetaStat({ label, value }) {
  return (
    <div className="bg-ink-800 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-0.5">{label}</p>
      <p className="text-xs text-parch-100 truncate">{value}</p>
    </div>
  );
}
