import React, { useRef } from 'react';
import { Paintbrush, CheckCircle2, FileUp, Image as ImageIcon } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { itemVisual } from '../lib/previewMenu.js';
import McText from './McText.jsx';
import { McItem, McBitmapText } from './McRender.jsx';
import { Button } from './fields.jsx';

// La grilla de un inventario de Minecraft, con las texturas del juego si están
// cargadas. La usan el editor de previews y el de openings.

// Colores del inventario vanilla (se usan si no hay texturas del juego cargadas)
export const GUI = { background: '#c6c6c6', border: '3px solid', borderColor: '#ffffff #555555 #555555 #ffffff' };
export const SLOT = { background: '#8b8b8b', border: '2px solid', borderColor: '#373737 #ffffff #ffffff #373737' };
// Tooltip del juego: fondo 0xF0100010 y borde en degradé 0x505000FF -> 0x5028007F
export const TOOLTIP_BG = 'rgba(16,0,16,0.94)';
export const TOOLTIP_BORDER = 'linear-gradient(rgba(80,0,255,0.31), rgba(40,0,127,0.31)) 1';
export const SCALES = [1, 2, 3];

/** Inventario de cofre del juego (textures/gui/container/generic_54.png), como ContainerScreen. */
export function McChest({ assets, font, scale, rows, title, tip, cells, highlighted, hover, setHover, onClick, showNumbers, brush }) {
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

export function FlatGrid({ cols, title, assets, cells, highlighted, hover, setHover, onClick, showNumbers, brush }) {
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
              {cell && <SlotItem cell={cell} assets={assets} size={36} />}
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
export function SlotItem({ cell, assets = null, font = null, size, scale = 2 }) {
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

export function Tooltip({ tip }) {
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

export function BrushButton({ active, onClick }) {
  return <Button variant={active ? 'primary' : 'default'} icon={Paintbrush} onClick={onClick}>{active ? 'Pintando…' : 'Pintar slots'}</Button>;
}

// ---- Texturas del juego ----

export function AssetsBar() {
  const { mcAssets, mcFont, mcStatus, loadMcAssets, clearMcAssets, pluginItems, loadMmoItems, clearMmoItems } = useCrate();
  const fileRef = useRef(null);
  const addRef = useRef(null);
  const mmoRef = useRef(null);
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
          {!mcAssets.gui && (
            <p className="text-gold-400 leading-relaxed">
              Faltan el inventario y las texturas vanilla (el jar del server, <code>paper-….jar</code>, no los trae). Agregá la copia que guarda
              Nexo, <code className="text-parch-200">plugins/Nexo/pack/.assetCache/1.21.4/1.21.4.zip</code>, o el jar del cliente,
              {' '}<code className="text-parch-200">%APPDATA%\.minecraft\versions\1.21.4\1.21.4.jar</code>.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <ImageIcon className="w-4 h-4 mt-0.5 shrink-0 text-gold-400" strokeWidth={1.5} />
          <div className="flex-1 space-y-2">
            <p className="text-parch-200">Ver el menú con las texturas y la fuente de Minecraft</p>
            <p className="text-ink-500 leading-relaxed">
              Con Nexo, elegí juntos <code className="text-parch-200">plugins/Nexo/pack/pack.zip</code> y
              {' '}<code className="text-parch-200">plugins/Nexo/pack/.assetCache/1.21.4/1.21.4.zip</code> (los assets vanilla). Si no, el .jar de tu
              cliente (<code className="text-parch-200">%APPDATA%\.minecraft\versions\1.21.4\1.21.4.jar</code>) y el resource pack .zip. Se leen en tu navegador y quedan guardados acá: no se suben a ningún lado (son assets de
              Mojang y no se publican con el editor).
            </p>
            <Button icon={FileUp} onClick={() => pick(fileRef)} disabled={mcStatus === 'loading'}>Cargar .jar / .zip</Button>
          </div>
        </div>
      )}
      {mcStatus === 'loading' && <p className="mt-2 text-gold-400">Leyendo texturas…</p>}
      {mcStatus && mcStatus !== 'loading' && <p className="mt-2 text-crimson-400">{mcStatus}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-ink-800 pt-2 text-ink-500">
        Ítems de MMOItems:
        {pluginItems ? <span className="text-parch-200">{Object.keys(pluginItems).length} cargados</span> : 'no cargados (las rewards CUSTOM se ven con un ícono genérico)'}
        <button className="underline hover:text-parch-200" onClick={() => pick(mmoRef)}>{pluginItems ? 'Cambiar' : 'Elegir carpeta plugins/MMOItems/item'}</button>
        {pluginItems && <button className="underline hover:text-crimson-400" onClick={clearMmoItems}>Quitar</button>}
      </p>
      <input ref={mmoRef} data-testid="mmoitems" type="file" webkitdirectory="" multiple className="hidden" onChange={(e) => { loadMmoItems(e.target.files); e.target.value = ''; }} />
      {/* sin `accept`: el unifont.zip del juego se guarda con nombre hash, sin extensión */}
      <input ref={fileRef} data-testid="mc-assets" type="file" multiple className="hidden" onChange={(e) => { loadMcAssets(e.target.files); e.target.value = ''; }} />
      <input ref={addRef} data-testid="mc-assets-add" type="file" multiple className="hidden" onChange={(e) => { loadMcAssets(e.target.files, true); e.target.value = ''; }} />
    </div>
  );
}
