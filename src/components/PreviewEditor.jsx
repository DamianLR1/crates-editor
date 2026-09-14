import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutGrid, Undo2, Download, Plus, Trash2, Paintbrush, ChevronLeft, ChevronRight, ChevronDown,
  FileCode2, FileUp, FilePlus2, X, Eye, AlertTriangle, CheckCircle2, Image as ImageIcon,
} from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { computePercentages, rarityOf } from '../lib/weightMath.js';
import {
  readPreview, layoutSlots, parseSlots, formatSlots, toggleSlot, fillText, rewardVars, rewardLimit,
  renderRewardLore, rewardItem, itemVisual, prettyMaterial, previewIssues,
  MENU_TYPES, ITEM_TYPES, COMMON_MATERIALS, NEW_PREVIEW,
} from '../lib/previewMenu.js';
import McText from './McText.jsx';
import { McItem, McBitmapText } from './McRender.jsx';
import { Button, Card, Field, Toggle, TextInput, NumberInput, LinesInput, inputCls, downloadText } from './fields.jsx';

// Colores del inventario vanilla (se usan si no hay texturas del juego cargadas)
const GUI = { background: '#c6c6c6', border: '3px solid', borderColor: '#ffffff #555555 #555555 #ffffff' };
const SLOT = { background: '#8b8b8b', border: '2px solid', borderColor: '#373737 #ffffff #ffffff #373737' };
// Tooltip del juego: fondo 0xF0100010 y borde en degradé 0x505000FF -> 0x5028007F
const TOOLTIP_BG = 'rgba(16,0,16,0.94)';
const TOOLTIP_BORDER = 'linear-gradient(rgba(80,0,255,0.31), rgba(40,0,127,0.31)) 1';
const SCALES = [1, 2, 3];

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
            <FlatGrid cols={layout.cols} title={fillText(p.title, crateVars)} {...slotProps} />
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

// ---- Texturas del juego ----

function AssetsBar() {
  const { mcAssets, mcFont, mcStatus, loadMcAssets, clearMcAssets } = useCrate();
  const fileRef = useRef(null);
  const addRef = useRef(null);
  const hasUnifont = mcAssets && [...mcAssets.files.keys()].some((k) => k.endsWith('.hex'));
  const pick = (ref) => ref.current.click();

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-xs">
      {mcAssets ? (
        <div className="space-y-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Texturas de <span className="text-parch-200">{mcAssets.label}</span>
            {mcFont ? '· fuente del juego' : '· cargando fuente…'}
            <button className="underline hover:text-parch-200" onClick={() => pick(addRef)}>Agregar archivo</button>
            <button className="underline hover:text-parch-200" onClick={() => pick(fileRef)}>Cambiar</button>
            <button className="underline hover:text-crimson-400" onClick={clearMcAssets}>Quitar</button>
          </p>
          {!hasUnifont && (
            <p className="text-ink-500 leading-relaxed">
              Para versalitas (ᴄᴀᴊᴀ), flechas y emojis falta la fuente unifont: agregá el <code className="text-parch-200">unifont.zip</code> del
              juego (está en <code className="text-parch-200">.minecraft\assets\objects</code>, con nombre hash).
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <ImageIcon className="w-4 h-4 mt-0.5 shrink-0 text-gold-400" strokeWidth={1.5} />
          <div className="flex-1 space-y-2">
            <p className="text-parch-200">Ver el menú con las texturas y la fuente de Minecraft</p>
            <p className="text-ink-500 leading-relaxed">
              Elegí el .jar de tu cliente, por ejemplo <code className="text-parch-200">%APPDATA%\.minecraft\versions\1.21.4\1.21.4.jar</code>, y si
              querés un resource pack .zip. Se leen en tu navegador y quedan guardados acá: no se suben a ningún lado (son assets de
              Mojang y no se publican con el editor).
            </p>
            <Button icon={FileUp} onClick={() => pick(fileRef)} disabled={mcStatus === 'loading'}>Cargar .jar / .zip</Button>
          </div>
        </div>
      )}
      {mcStatus === 'loading' && <p className="mt-2 text-gold-400">Leyendo texturas…</p>}
      {mcStatus && mcStatus !== 'loading' && <p className="mt-2 text-crimson-400">{mcStatus}</p>}
      {/* sin `accept`: el unifont.zip del juego se guarda con nombre hash, sin extensión */}
      <input ref={fileRef} data-testid="mc-assets" type="file" multiple className="hidden" onChange={(e) => { loadMcAssets(e.target.files); e.target.value = ''; }} />
      <input ref={addRef} data-testid="mc-assets-add" type="file" multiple className="hidden" onChange={(e) => { loadMcAssets(e.target.files, true); e.target.value = ''; }} />
    </div>
  );
}

/** Inventario de cofre del juego (textures/gui/container/generic_54.png), como ContainerScreen. */
function McChest({ assets, font, scale, rows, title, tip, cells, highlighted, hover, setHover, onClick, showNumbers, brush }) {
  const top = 17 + rows * 18; // encabezado + filas del cofre; debajo va el inventario del jugador (96 px)
  const layer = (sy, height) => ({
    width: 176 * scale,
    height: height * scale,
    backgroundImage: `url(${assets.gui})`,
    backgroundSize: `${256 * scale}px ${256 * scale}px`,
    backgroundPosition: `0 ${-sy * scale}px`,
    imageRendering: 'pixelated',
  });
  const label = (text, x, y) => (
    <div className="pointer-events-none absolute" style={{ left: x * scale, top: (y - 2) * scale }}>
      {font
        ? <McBitmapText text={text} font={font} scale={scale} defaultColor="#404040" shadow={false} />
        : <McText text={text} defaultColor="#404040" className="whitespace-nowrap text-sm" />}
    </div>
  );
  const col = hover % 9;
  const row = Math.floor(hover / 9);
  const tipStyle = { top: (17 + row * 18 - 12) * scale, ...(col < 5 ? { left: (7 + col * 18 + 22) * scale } : { right: (176 - 7 - col * 18 + 4) * scale }) };

  return (
    <div className="relative select-none" style={{ width: 176 * scale, height: (top + 96) * scale }} data-testid="menu-grid">
      <div style={layer(0, top)} />
      <div style={layer(126, 96)} />
      {label(title, 8, 6)}
      {label('Inventario', 8, top + 3)}
      {cells.map((cell, slot) => (
        <button
          key={slot}
          type="button"
          aria-label={`Slot ${slot}`}
          onClick={() => onClick(slot)}
          onMouseEnter={() => setHover(slot)}
          onMouseLeave={() => setHover(null)}
          className={`absolute ${brush ? 'cursor-crosshair' : 'cursor-pointer'}`}
          style={{ left: (7 + (slot % 9) * 18) * scale, top: (17 + Math.floor(slot / 9) * 18) * scale, width: 18 * scale, height: 18 * scale }}
        >
          {cell && (
            <span className="absolute" style={{ left: scale, top: scale }}>
              <SlotItem cell={cell} assets={assets} font={font} size={16 * scale} scale={scale} />
            </span>
          )}
          {hover === slot && <span className="pointer-events-none absolute bg-white/50" style={{ left: scale, top: scale, width: 16 * scale, height: 16 * scale }} />}
          {highlighted.includes(slot) && <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-gold-400" />}
          {showNumbers && <span className="pointer-events-none absolute left-0.5 top-0 text-[8px] leading-none text-black/50">{slot}</span>}
        </button>
      ))}
      {tip && !tip.hidden && hover != null && <McTooltip tip={tip} font={font} scale={scale} style={tipStyle} />}
    </div>
  );
}

function McTooltip({ tip, font, scale, style }) {
  const line = (text, key) => (font
    ? <McBitmapText key={key} text={text} font={font} scale={scale} />
    : <McText key={key} text={text || ' '} className="block whitespace-nowrap text-xs" />);
  return (
    <div className="pointer-events-none absolute z-30" style={{ ...style, background: TOOLTIP_BG, padding: scale }}>
      <div style={{ border: `${scale}px solid transparent`, borderImage: TOOLTIP_BORDER, padding: `${scale}px ${2 * scale}px` }}>
        {line(tip.title, 'title')}
        {tip.lore.length > 0 && <div style={{ height: 2 * scale }} />}
        {tip.lore.map((text, i) => line(text, i))}
      </div>
    </div>
  );
}

// ---- Sin texturas: grilla aproximada ----

function FlatGrid({ cols, title, cells, highlighted, hover, setHover, onClick, showNumbers, brush }) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-block p-2" style={GUI}>
        <div className="mb-1.5 px-0.5 text-sm whitespace-nowrap">
          {/* el título de un inventario vanilla es gris oscuro si no tiene color */}
          <McText text={title} defaultColor="#404040" />
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 2.5rem)` }} data-testid="menu-grid">
          {cells.map((cell, slot) => (
            <button
              key={slot}
              type="button"
              aria-label={`Slot ${slot}`}
              onClick={() => onClick(slot)}
              onMouseEnter={() => setHover(slot)}
              onMouseLeave={() => setHover(null)}
              className={`relative w-10 h-10 flex items-center justify-center ${brush ? 'cursor-crosshair' : 'cursor-pointer'}`}
              style={SLOT}
            >
              {cell && <SlotItem cell={cell} size={36} />}
              {highlighted.includes(slot) && <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-gold-400" />}
              {hover === slot && <span className="pointer-events-none absolute inset-0 bg-white/30" />}
              {showNumbers && <span className="pointer-events-none absolute left-0.5 top-0 text-[8px] leading-none text-black/45">{slot}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Contenido de un slot: textura del juego si hay, si no un ícono aproximado; y la cantidad abajo a la derecha. */
function SlotItem({ cell, assets = null, font = null, size, scale = 2 }) {
  const fallback = <ItemIcon visual={itemVisual(cell.material)} glint={cell.glint} dim={cell.dim} />;
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      {assets
        ? <McItem assets={assets} material={cell.material} cmd={cell.cmd} itemModel={cell.itemModel} skin={cell.skin} glint={cell.glint} dim={cell.dim} size={size} fallback={fallback} />
        : fallback}
      {cell.amount > 1 && (
        font ? (
          <span className="pointer-events-none absolute" style={{ right: -2 * scale, top: 7 * scale }}>
            <McBitmapText text={String(cell.amount)} font={font} scale={scale} />
          </span>
        ) : (
          <span className="pointer-events-none absolute bottom-0 right-0.5 text-[10px] font-bold leading-none text-white" style={{ textShadow: '1px 1px 0 #3f3f3f' }}>
            {cell.amount}
          </span>
        )
      )}
    </span>
  );
}

function ItemIcon({ visual, glint = false, dim = false }) {
  const opacity = dim ? 0.35 : 1;
  if (visual.pane) {
    return <span className="absolute inset-[3px]" style={{ opacity, background: visual.color, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.22)' }} />;
  }
  return (
    <span className="relative flex h-full w-full items-center justify-center" style={{ opacity }}>
      <span
        className="text-xl leading-none"
        style={{ color: visual.color, textShadow: '1px 1px 0 #3f3f3f', filter: glint ? 'drop-shadow(0 0 3px #c084fc)' : undefined }}
      >
        {visual.glyph ?? <span className="text-[10px] font-bold tracking-tight">{visual.label}</span>}
      </span>
    </span>
  );
}

function Tooltip({ tip }) {
  return (
    <div className="mt-3 min-h-24" aria-live="polite">
      {tip?.hidden && <p className="text-xs text-ink-500">{tip.source}</p>}
      {tip && !tip.hidden && (
        <div className="inline-block max-w-full rounded px-2.5 py-2 text-xs text-parch-100" style={{ background: TOOLTIP_BG, border: '2px solid', borderColor: '#5000ff #28007f #28007f #5000ff' }}>
          <McText text={tip.title} className="block text-sm" />
          {tip.lore.map((line, i) => <McText key={i} text={line || ' '} className="block" />)}
          <p className="mt-1.5 text-[10px] text-ink-500">{tip.source}</p>
        </div>
      )}
    </div>
  );
}

function BrushButton({ active, onClick }) {
  return <Button variant={active ? 'primary' : 'default'} icon={Paintbrush} onClick={onClick}>{active ? 'Pintando…' : 'Pintar slots'}</Button>;
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
