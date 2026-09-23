import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutGrid, Undo2, Download, Plus, Trash2, Paintbrush, ChevronLeft, ChevronRight, ChevronDown,
  FileCode2, FileUp, FilePlus2, X, Eye, AlertTriangle,
} from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { computePercentages, rarityOf } from '../lib/weightMath.js';
import {
  readPreview, layoutSlots, parseSlots, formatSlots, toggleSlot, fillText, rewardVars, rewardLimit,
  renderRewardLore, rewardItem, prettyMaterial, previewIssues,
  MENU_TYPES, ITEM_TYPES, COMMON_MATERIALS, NEW_PREVIEW,
} from '../lib/previewMenu.js';
import { AssetsBar, BrushButton, FlatGrid, McChest, SlotItem, Tooltip, SCALES, SLOT } from './MenuGrid.jsx';
import { Button, Card, Field, Toggle, TextInput, NumberInput, LinesInput, inputCls, downloadText } from './fields.jsx';

export default function PreviewEditor() {
  const { model, server, preview, openPreview } = useCrate();
  const ownName = `${String(model.preview.id ?? 'default').toLowerCase()}.yml`;

  // al entrar, abre el preview que usa esta caja si está en la carpeta
  useEffect(() => {
    if (!preview && server?.previews?.[ownName]) openPreview(ownName, server.previews[ownName]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return preview ? <Workspace key={preview.name} /> : <Picker ownName={ownName} />;
}

function Picker({ ownName }) {
  const { server, openPreview } = useCrate();
  const fileRef = useRef(null);
  const names = Object.keys(server?.previews ?? {}).sort();
  const newName = names.includes(ownName) ? 'nuevo_preview.yml' : ownName;

  return (
    <Card title="Editor de previews" icon={LayoutGrid} className="max-w-3xl">
      <p className="text-sm text-ink-500 leading-relaxed">
        El menú que se abre al previsualizar una caja (<code className="text-parch-200">previews/*.yml</code>). A la izquierda se
        configura y a la derecha se ve cómo queda, con las rewards de esta caja.
      </p>
      {names.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {names.map((name) => (
            <button
              key={name}
              onClick={() => openPreview(name, server.previews[name])}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-mono-tab transition-colors ${
                name === ownName ? 'border-gold-500/40 bg-gold-500/10 text-gold-400' : 'border-ink-700 bg-ink-900 text-parch-200 hover:bg-ink-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              <span className="flex-1 truncate">{name}</span>
              {name === ownName && <span className="text-[9px] uppercase tracking-wider">esta caja</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-500">Abrí la carpeta del plugin para listar sus previews, o abrí un archivo.</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button icon={FileUp} onClick={() => fileRef.current.click()}>Abrir .yml</Button>
        <Button icon={FilePlus2} onClick={() => openPreview(newName, NEW_PREVIEW)}>Nuevo desde la plantilla del plugin</Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".yml,.yaml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files[0];
          file?.text().then((text) => openPreview(file.name, text));
          e.target.value = '';
        }}
      />
    </Card>
  );
}

function Workspace() {
  const {
    model, fileName, preview, closePreview, previewEdit: edit, undoPreview, canUndoPreview, rarityWeights, rarityNames,
    mcAssets, mcFont,
  } = useCrate();
  const p = useMemo(() => readPreview(preview.text), [preview.text]);
  const layout = layoutSlots(p);
  const [brush, setBrush] = useState(null); // 'reward' | id de un ítem: a qué se le asignan los slots clickeados
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [page, setPage] = useState(0);
  const [showYaml, setShowYaml] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [scale, setScale] = useState(2);

  const crateVars = { crate_name: model.name ?? '', crate_id: String(fileName ?? '').replace(/\.ya?ml$/i, '') };
  // PreviewMenu: rewards sorteables en el orden del archivo, repartidas en Reward.Slots por página
  const rewards = useMemo(
    () => computePercentages(model.rewards, rarityWeights).filter((r) => r.weight > 0),
    [model.rewards, rarityWeights],
  );
  const rewardSlots = p.reward.slots.filter((s) => s >= 0 && s < layout.size);
  const perPage = Math.max(1, rewardSlots.length);
  const pages = Math.max(1, Math.ceil(rewards.length / perPage));
  const current = Math.min(page, pages - 1);
  const rewardAt = new Map();
  rewardSlots.forEach((slot, i) => {
    const reward = rewards[current * perPage + i];
    if (reward) rewardAt.set(slot, reward);
  });
  const issues = previewIssues(p, layout, rewards.length);
  const focus = brush ?? selected;
  const highlighted = focus === 'reward' ? p.reward.slots : p.content.find((c) => c.id === focus)?.slots ?? [];

  const isHidden = (item) => (item.type === 'page_next' && current >= pages - 1)
    || (item.type === 'page_previous' && current === 0)
    || (item.type === 'milestones' && model.milestones.list.length === 0);

  // qué se dibuja en cada slot
  const cells = layout.slots.map((item, slot) => {
    const reward = rewardAt.get(slot);
    if (reward) return rewardItem(reward);
    return item && { material: item.material, cmd: item.modelData, skin: item.skinUrl, glint: item.glint, amount: item.amount, dim: isHidden(item) };
  });

  const clickSlot = (slot) => {
    if (brush === 'reward') return edit.set(['Reward', 'Slots'], formatSlots(toggleSlot(p.reward.slots, slot)));
    if (brush) {
      const item = p.content.find((c) => c.id === brush);
      return item && edit.set(['Content', item.id, 'Slots'], formatSlots(toggleSlot(item.slots, slot)));
    }
    const item = layout.slots[slot];
    if (item?.type === 'page_next') setPage(Math.min(pages - 1, current + 1));
    else if (item?.type === 'page_previous') setPage(Math.max(0, current - 1));
    else if (!rewardAt.has(slot) && item) setSelected(item.id);
  };

  const addItem = (id) => {
    edit.node(['Content', id], {
      Priority: 0,
      Item: { Material: 'minecraft:black_stained_glass_pane', Lore: [], Hide_Tooltip: true },
      Slots: '',
      Type: 'null',
    });
    setSelected(id);
    setBrush(id);
  };
  const deleteItem = (id) => {
    edit.del(['Content', id]);
    if (selected === id) setSelected(null);
    if (brush === id) setBrush(null);
  };

  let tip = null;
  if (hover != null) {
    const reward = rewardAt.get(hover);
    const item = layout.slots[hover];
    if (reward) {
      const rarity = rarityOf(reward, rarityWeights);
      const vars = rewardVars(reward, crateVars, rarityNames?.[rarity] ?? rarity);
      tip = {
        title: fillText(p.reward.name, vars),
        lore: renderRewardLore(p.reward.lore, reward, vars, p.reward.limitInfo, rewardLimit(reward)),
        source: `reward ${reward.key} · slot ${hover}`,
      };
    } else if (item) {
      tip = item.hideTooltip
        ? { hidden: true, source: `${item.id} · slot ${hover} · sin tooltip (Hide_Tooltip)` }
        : {
          title: fillText(item.displayName ?? prettyMaterial(item.material), crateVars),
          lore: item.lore.map((l) => fillText(l, crateVars)),
          source: `${item.id} · slot ${hover}`,
        };
    }
  }

  const chest = mcAssets?.gui && layout.cols === 9; // inventario con la textura del juego
  const slotProps = { cells, highlighted, hover, setHover, onClick: clickSlot, showNumbers, brush };

  return (
    <div className="grid gap-6 items-start xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      <datalist id="dl-materials">{COMMON_MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>

      <div className="min-w-0 space-y-6">
        <Card
          title={preview.name}
          icon={LayoutGrid}
          actions={(
            <div className="flex items-center gap-1">
              <Button variant="ghost" icon={Undo2} onClick={undoPreview} disabled={!canUndoPreview} title="Deshacer (preview)" />
              <Button variant="ghost" icon={FileCode2} onClick={() => setShowYaml((v) => !v)} title="Ver YAML" />
              <Button variant="primary" icon={Download} onClick={() => downloadText(preview.name, preview.text)}>Exportar</Button>
              <Button variant="ghost" icon={X} onClick={closePreview} title="Elegir otro preview" />
            </div>
          )}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tamaño (MenuType)">
                <select value={p.menuType} onChange={(e) => edit.set(['Settings', 'MenuType'], e.target.value)} className={inputCls}>
                  {(MENU_TYPES.includes(p.menuType) ? MENU_TYPES : [p.menuType, ...MENU_TYPES]).map((type) => (
                    <option key={type} value={type}>{type.replace('minecraft:', '')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Refresco (seg, -1 = no)">
                <NumberInput value={p.autoRefresh} onCommit={(v) => edit.set(['Settings', 'Auto_Refresh'], Math.round(v))} />
              </Field>
            </div>
            <Field label="Título" hint="%crate_name% = nombre de la caja.">
              <TextInput value={p.title} onCommit={(v) => edit.set(['Settings', 'Title'], v)} />
            </Field>
            <Toggle label="PlaceholderAPI en el menú" checked={p.papi} onChange={(v) => edit.set(['Settings', 'PlaceholderAPI', 'Enabled'], v)} />
            {showYaml && (
              <pre className="max-h-80 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-3 text-[11px] font-mono text-parch-200">{preview.text}</pre>
            )}
          </div>
        </Card>

        <Card
          title="Rewards (Reward)"
          actions={<BrushButton active={brush === 'reward'} onClick={() => setBrush(brush === 'reward' ? null : 'reward')} />}
        >
          <div className="space-y-4">
            <Toggle label="Ocultar las que el jugador no puede ganar" checked={p.reward.hideUnavailable} onChange={(v) => edit.set(['Reward', 'Hide_Unavailable'], v)} />
            <Field label={`Slots · ${p.reward.slots.length} (se llenan en este orden)`} hint={`${rewards.length} rewards sorteables en esta caja → ${pages} página(s).`}>
              <TextInput value={formatSlots(p.reward.slots)} onCommit={(v) => edit.set(['Reward', 'Slots'], formatSlots(parseSlots(v)))} />
            </Field>
            <Field label="Nombre">
              <TextInput value={p.reward.name} onCommit={(v) => edit.set(['Reward', 'Name'], v)} />
            </Field>
            <Field
              label="Lore (Default)"
              hint="%reward_name% %reward_description% %reward_roll_chance% %reward_rarity_name% %reward_weight% %limits% %no_permission% %empty-if-above% %empty-if-below% y PlaceholderAPI (%nf_#.##_...%)."
            >
              <LinesInput value={p.reward.lore} keepEmpty rows={6} onCommit={(v) => edit.seq(['Reward', 'Lore', 'Default'], v)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sin permiso (No_Permission)">
                <LinesInput value={p.reward.noPermission} keepEmpty rows={2} onCommit={(v) => edit.seq(['Reward', 'Lore', 'No_Permission'], v)} />
              </Field>
              <Field label="Límites (LimitInfo, %amount%)">
                <LinesInput value={p.reward.limitInfo} keepEmpty rows={2} onCommit={(v) => edit.seq(['Reward', 'Lore', 'LimitInfo'], v)} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title={`Ítems fijos (Content) · ${p.content.length}`}>
          <div className="space-y-2">
            {p.content.map((item) => (
              <ContentItem
                key={item.id}
                item={item}
                open={selected === item.id}
                painting={brush === item.id}
                onToggle={() => setSelected(selected === item.id ? null : item.id)}
                onBrush={() => setBrush(brush === item.id ? null : item.id)}
                onDelete={() => deleteItem(item.id)}
                edit={edit}
              />
            ))}
          </div>
          <AddItem existing={p.content.map((c) => c.id)} onAdd={addItem} />
        </Card>
      </div>

      <div className="min-w-0 space-y-4 xl:sticky xl:top-20">
        <AssetsBar />
        <Card
          title="Vista previa"
          icon={Eye}
          actions={(
            <div className="flex items-center gap-3 text-xs text-ink-500">
              {chest && (
                <div className="flex items-center gap-1" role="group" aria-label="Escala de la GUI">
                  {SCALES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setScale(s)}
                      className={`h-6 min-w-7 rounded-md px-1.5 font-mono-tab ${s === scale ? 'bg-gold-500/15 text-gold-400' : 'hover:text-parch-200'}`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" icon={ChevronLeft} onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} title="Página anterior del menú" />
                  <span className="font-mono-tab">{current + 1}/{pages}</span>
                  <Button variant="ghost" icon={ChevronRight} onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1} title="Página siguiente del menú" />
                </div>
              )}
            </div>
          )}
        >
          {chest ? (
            <McChest assets={mcAssets} font={mcFont} scale={scale} rows={layout.rows} title={fillText(p.title, crateVars)} tip={tip} {...slotProps} />
          ) : (
            <FlatGrid cols={layout.cols} title={fillText(p.title, crateVars)} assets={mcAssets} {...slotProps} />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} className="accent-gold-500" />
              Números de slot
            </label>
            {brush ? (
              <span>
                Pintando <b className="text-gold-400">{brush === 'reward' ? 'slots de rewards' : brush}</b>: click en un slot para agregarlo o quitarlo.{' '}
                <button className="underline hover:text-parch-200" onClick={() => setBrush(null)}>Terminar</button>
              </span>
            ) : (
              <span>Click en un ítem para editarlo · con el pincel asignás slots · las flechas cambian de página.</span>
            )}
          </div>
          {chest ? (
            <p className="mt-2 min-h-4 text-[11px] text-ink-500" aria-live="polite">{tip?.source}</p>
          ) : (
            <Tooltip tip={tip} />
          )}
        </Card>

        {issues.length > 0 && (
          <div className="space-y-1 rounded-xl border border-gold-500/30 bg-gold-400/5 px-4 py-3">
            {issues.map((msg) => (
              <p key={msg} className="flex items-start gap-2 text-xs text-gold-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />{msg}
              </p>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-500 leading-relaxed">
          Las rewards se ven como las vería un jugador con permiso y sin límites alcanzados.
          {!mcAssets && ' Sin las texturas del juego, los íconos son aproximados.'}
        </p>
      </div>
    </div>
  );
}

function ContentItem({ item, open, painting, onToggle, onBrush, onDelete, edit }) {
  const { mcAssets } = useCrate();
  const path = (...rest) => ['Content', item.id, ...rest];
  const setOptional = (key, value) => (value === '' ? edit.del(path('Item', key)) : edit.set(path('Item', key), value));
  const types = ITEM_TYPES.includes(item.type) ? ITEM_TYPES : [item.type, ...ITEM_TYPES];

  return (
    <div className={`rounded-lg border ${open ? 'border-ink-600 bg-ink-800/40' : 'border-ink-700'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-500" />}
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center" style={SLOT}>
            <SlotItem cell={{ material: item.material, cmd: item.modelData, skin: item.skinUrl, glint: item.glint }} assets={mcAssets} size={24} />
          </span>
          <span className="truncate text-xs font-mono text-parch-200">{item.id}</span>
          <span className="shrink-0 text-[10px] text-ink-500">
            {item.slots.length} slot(s) · P{item.priority}{item.type !== 'null' ? ` · ${item.type}` : ''}
          </span>
        </button>
        <Button variant={painting ? 'primary' : 'ghost'} icon={Paintbrush} onClick={onBrush} title="Pintar slots de este ítem" />
        <Button variant="ghost" icon={Trash2} onClick={onDelete} title="Borrar ítem" />
      </div>

      {open && (
        <div className="space-y-3 border-t border-ink-700 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Material">
              <TextInput value={item.material} list="dl-materials" onCommit={(v) => edit.set(path('Item', 'Material'), v.trim())} />
            </Field>
            <Field label="Acción (Type)">
              <select value={item.type} onChange={(e) => edit.set(path('Type'), e.target.value)} className={inputCls}>
                {types.map((type) => <option key={type} value={type}>{type === 'null' ? 'ninguna' : type}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Nombre (Display_Name)">
            <TextInput value={item.displayName ?? ''} preview onCommit={(v) => setOptional('Display_Name', v)} />
          </Field>
          <Field label="Lore">
            <LinesInput value={item.lore} keepEmpty rows={2} preview onCommit={(v) => edit.seq(path('Item', 'Lore'), v)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Slots">
              <TextInput value={formatSlots(item.slots)} onCommit={(v) => edit.set(path('Slots'), formatSlots(parseSlots(v)))} />
            </Field>
            <Field label="Prioridad">
              <NumberInput value={item.priority} onCommit={(v) => edit.set(path('Priority'), Math.round(v))} />
            </Field>
            <Field label="Cantidad">
              <NumberInput value={item.amount} onCommit={(v) => edit.set(path('Item', 'Amount'), Math.max(1, Math.round(v)))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Sin tooltip" checked={item.hideTooltip} onChange={(v) => edit.set(path('Item', 'Hide_Tooltip'), v)} />
            <Toggle label="Brillo encantado" checked={item.glint} onChange={(v) => edit.set(path('Item', 'Enchant_Glint'), v)} />
          </div>
          {/player_head/i.test(item.material) && (
            <Field label="Textura (SkinURL)" hint="El hash de textures.minecraft.net/texture/…">
              <TextInput value={item.skinUrl ?? ''} onCommit={(v) => setOptional('SkinURL', v.trim())} />
            </Field>
          )}
          {item.hasClickCommands && <p className="text-[10px] text-ink-500">Tiene Click_Commands: se conservan tal cual.</p>}
        </div>
      )}
    </div>
  );
}

function AddItem({ existing, onAdd }) {
  const [id, setId] = useState('');
  const add = () => {
    const clean = id.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!clean || existing.includes(clean)) return;
    onAdd(clean);
    setId('');
  };
  return (
    <div className="mt-3 flex gap-2">
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        placeholder="id del ítem nuevo (ej. info)"
        className={inputCls}
      />
      <Button icon={Plus} onClick={add}>Ítem</Button>
    </div>
  );
}
