import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard, Undo2, Download, Plus, Trash2, ChevronDown, ChevronRight, FileCode2, FileUp, FilePlus2,
  X, Eye, Play, Square, RotateCcw, AlertTriangle, Trophy,
} from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { computePercentages } from '../lib/weightMath.js';
import { fillText, formatSlots, parseSlots, toggleSlot, prettyMaterial, COMMON_MATERIALS } from '../lib/previewMenu.js';
import {
  readOpening, openingShape, openingIssues, openingDuration, createOpening, formatStep, parseStep,
  OPENING_MENU_TYPES, SPIN_MODES, MODE_HINTS, NEW_OPENING,
} from '../lib/openingMenu.js';
import { AssetsBar, BrushButton, FlatGrid, McChest, SlotItem, Tooltip, SCALES, SLOT } from './MenuGrid.jsx';
import { Button, Card, Field, Toggle, TextInput, NumberInput, LinesInput, inputCls, downloadText } from './fields.jsx';

// Editor de la animación de apertura (openings/inventory/<id>.yml). Igual que el
// de previews: a la izquierda se configura, a la derecha se ve el menú; y el botón
// Simular reproduce la animación con las rewards de esta caja, a 20 ticks por segundo.

const TICK_MS = 50;

export default function OpeningEditor() {
  const { model, server, opening, openOpening } = useCrate();
  const ownName = `${String(model.animation.id ?? 'csgo').toLowerCase()}.yml`;

  // al entrar, abre la animación que usa esta caja si está en la carpeta
  useEffect(() => {
    if (!opening && server?.openings?.[ownName]) openOpening(ownName, server.openings[ownName]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return opening ? <Workspace key={opening.name} /> : <Picker ownName={ownName} />;
}

function Picker({ ownName }) {
  const { model, server, openOpening } = useCrate();
  const fileRef = useRef(null);
  const names = Object.keys(server?.openings ?? {}).sort();
  const newName = names.includes(ownName) ? 'nueva_animacion.yml' : ownName;

  return (
    <Card title="Editor de openings" icon={Clapperboard} className="max-w-3xl">
      <p className="text-sm text-ink-500 leading-relaxed">
        La animación que ve el jugador al abrir la caja (<code className="text-parch-200">openings/inventory/*.yml</code>). A la
        izquierda se configura, a la derecha se ve el menú y con <b className="text-parch-200">Simular</b> corre la animación con las
        rewards de esta caja.
        {!model.animation.enabled && ' Ojo: esta caja tiene la animación desactivada en su configuración.'}
      </p>
      {names.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {names.map((name) => (
            <button
              key={name}
              onClick={() => openOpening(name, server.openings[name])}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-mono-tab transition-colors ${
                name === ownName ? 'border-gold-500/40 bg-gold-500/10 text-gold-400' : 'border-ink-700 bg-ink-900 text-parch-200 hover:bg-ink-800'
              }`}
            >
              <Clapperboard className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              <span className="flex-1 truncate">{name}</span>
              {name === ownName && <span className="text-[9px] uppercase tracking-wider">esta caja</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-500">
          Abrí la carpeta del plugin para listar sus animaciones, o abrí un archivo de <code>openings/inventory/</code>.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button icon={FileUp} onClick={() => fileRef.current.click()}>Abrir .yml</Button>
        <Button icon={FilePlus2} onClick={() => openOpening(newName, NEW_OPENING)}>Nueva animación</Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".yml,.yaml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files[0];
          file?.text().then((text) => openOpening(file.name, text));
          e.target.value = '';
        }}
      />
    </Card>
  );
}

function Workspace() {
  const {
    model, fileName, opening, closeOpening, openingEdit: edit, undoOpening, canUndoOpening,
    rarityWeights, mcAssets, mcFont,
  } = useCrate();
  const o = useMemo(() => readOpening(opening.text), [opening.text]);
  const shape = openingShape(o);
  const [brush, setBrush] = useState(null); // 'win' | 'run:<TIPO>:<id>' | 'item:<id>'
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [showYaml, setShowYaml] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [scale, setScale] = useState(2);
  const [sim, setSim] = useState(null); // { cells, ticks, won, done }
  const timer = useRef(null);

  const crateVars = { crate_name: model.name ?? '', crate_id: String(fileName ?? '').replace(/\.ya?ml$/i, '') };
  const rewards = useMemo(
    () => computePercentages(model.rewards, rarityWeights).filter((r) => r.weight > 0),
    [model.rewards, rarityWeights],
  );
  const duration = useMemo(() => openingDuration(o), [o]);
  const issues = useMemo(() => openingIssues(o), [o]);

  // Simulación: un tick cada 50 ms, como el server.
  const stop = () => {
    clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    stop(); // si se edita el archivo, la corrida vieja ya no vale
    setSim(null);
  }, [opening.text]);

  const simulate = () => {
    stop();
    setBrush(null);
    const run = createOpening(o, { rewards, rarityWeights });
    setSim({ cells: [...run.cells], ticks: 0, won: run.won, done: false });
    // Manda el reloj: si el navegador frena el intervalo (pestaña en segundo plano,
    // cuadro lento), se ponen al día los ticks que falten en vez de ir en cámara lenta.
    const started = performance.now();
    timer.current = setInterval(() => {
      const target = Math.floor((performance.now() - started) / TICK_MS);
      while (run.ticks() < target && !run.isDone()) run.tick();
      const done = run.isDone();
      setSim({ cells: [...run.cells], ticks: run.ticks(), won: run.won, done });
      if (done) stop();
    }, TICK_MS);
  };

  const cellOf = (item) => ({
    material: item.material,
    amount: item.amount,
    cmd: item.modelData,
    skin: item.skinUrl,
    glint: item.glint,
    name: item.displayName,
    lore: item.lore,
    hideTooltip: item.hideTooltip,
    source: item.id,
  });

  // Quieto: sólo los ítems fijos (es lo que ve el jugador el primer tick).
  const staticCells = useMemo(() => {
    const cells = Array.from({ length: shape.size }, () => null);
    for (const item of o.content) {
      for (const slot of item.slots) if (slot >= 0 && slot < shape.size) cells[slot] = cellOf(item);
    }
    return cells;
  }, [o, shape.size]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = sim ? sim.cells : staticCells;
  const running = !!timer.current;

  const slotsOf = (key) => {
    if (key === 'win') return o.winSlots;
    if (key?.startsWith('run:')) {
      const [, type, id] = key.split(':');
      return o.runs.find((r) => r.type === type && r.id === id)?.slots ?? [];
    }
    if (key?.startsWith('item:')) return o.content.find((c) => c.id === key.slice(5))?.slots ?? [];
    return [];
  };
  const highlighted = slotsOf(brush ?? selected);

  const clickSlot = (slot) => {
    if (!brush) {
      const item = o.content.find((c) => c.slots.includes(slot));
      if (item) setSelected(`item:${item.id}`);
      return;
    }
    if (brush === 'win') return edit.set(['Settings', 'WinSlots'], formatSlots(toggleSlot(o.winSlots, slot)));
    if (brush.startsWith('run:')) {
      const [, type, id] = brush.split(':');
      const run = o.runs.find((r) => r.type === type && r.id === id);
      return run && edit.set(['Settings', 'RunOnLaunch', type, id, 'Slots'], formatSlots(toggleSlot(run.slots, slot)));
    }
    const item = o.content.find((c) => c.id === brush.slice(5));
    return item && edit.set(['Content', 'Default', item.id, 'Slots'], formatSlots(toggleSlot(item.slots, slot)));
  };

  let tip = null;
  const cell = hover != null ? cells[hover] : null;
  if (cell) {
    tip = cell.hideTooltip
      ? { hidden: true, source: `${cell.source} · slot ${hover} · sin tooltip (Hide_Tooltip)` }
      : {
        title: fillText(cell.name ?? prettyMaterial(cell.material), crateVars),
        lore: (cell.lore ?? []).map((line) => fillText(line, crateVars)),
        source: `${cell.source} · slot ${hover}`,
      };
  }

  const chest = mcAssets?.gui && shape.cols === 9;
  const slotProps = { cells, highlighted, hover, setHover, onClick: clickSlot, showNumbers, brush };
  const seconds = (ticks) => `${(ticks / 20).toFixed(1)} s`;

  return (
    <div className="grid gap-6 items-start xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      <datalist id="dl-materials">{COMMON_MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>

      <div className="min-w-0 space-y-6">
        <Card
          title={opening.name}
          icon={Clapperboard}
          actions={(
            <div className="flex items-center gap-1">
              <Button variant="ghost" icon={Undo2} onClick={undoOpening} disabled={!canUndoOpening} title="Deshacer (opening)" />
              <Button variant="ghost" icon={FileCode2} onClick={() => setShowYaml((v) => !v)} title="Ver YAML" />
              <Button variant="primary" icon={Download} onClick={() => downloadText(opening.name, opening.text)}>Exportar</Button>
              <Button variant="ghost" icon={X} onClick={closeOpening} title="Elegir otra animación" />
            </div>
          )}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tamaño (Menu_Type)">
                <select value={o.menuType} onChange={(e) => edit.set(['Settings', 'Menu_Type'], e.target.value)} className={inputCls}>
                  {(OPENING_MENU_TYPES.includes(o.menuType) ? OPENING_MENU_TYPES : [o.menuType, ...OPENING_MENU_TYPES]).map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duración" hint="Calculada de los giros (20 ticks = 1 s).">
                <p className="px-1 py-1.5 font-mono-tab text-parch-100">{seconds(duration)}</p>
              </Field>
            </div>
            <Field label="Título" hint="%crate_name% = nombre de la caja.">
              <TextInput value={o.title} onCommit={(v) => edit.set(['Settings', 'Title'], v)} />
            </Field>
            <Field
              label={`Slots ganadores (WinSlots) · ${o.winSlots.length}`}
              hint="Dónde cae el premio. Cada slot ganador que toca un spinner de premios entrega una reward."
            >
              <div className="flex gap-2">
                <TextInput value={formatSlots(o.winSlots)} onCommit={(v) => edit.set(['Settings', 'WinSlots'], formatSlots(parseSlots(v)))} />
                <BrushButton active={brush === 'win'} onClick={() => setBrush(brush === 'win' ? null : 'win')} />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ticks para saltear" hint="-1 = no se puede saltear.">
                <NumberInput value={o.maxTicksToSkip} onCommit={(v) => edit.set(['Settings', 'Max_Ticks_To_Skip'], Math.round(v))} />
              </Field>
              <Field label="Pausa al terminar (ticks)">
                <NumberInput value={o.completionPause} onCommit={(v) => edit.set(['Settings', 'Completion_Pause_Ticks'], Math.max(0, Math.round(v)))} />
              </Field>
            </div>
            {showYaml && (
              <pre className="max-h-80 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-3 text-[11px] font-mono text-parch-200">{opening.text}</pre>
            )}
          </div>
        </Card>

        <Card title={`Giros (RunOnLaunch) · ${o.runs.length}`}>
          <div className="space-y-2">
            {o.runs.map((run) => (
              <RunCard
                key={`${run.type}:${run.id}`}
                run={run}
                opening={o}
                open={selected === `run:${run.type}:${run.id}`}
                painting={brush === `run:${run.type}:${run.id}`}
                onToggle={() => setSelected(selected === `run:${run.type}:${run.id}` ? null : `run:${run.type}:${run.id}`)}
                onBrush={() => setBrush(brush === `run:${run.type}:${run.id}` ? null : `run:${run.type}:${run.id}`)}
                onDelete={() => edit.del(['Settings', 'RunOnLaunch', run.type, run.id])}
                edit={edit}
              />
            ))}
          </div>
          <AddRun
            existing={o.runs.map((r) => `${r.type}:${r.id}`)}
            onAdd={(type, id, spinnerId) => {
              edit.node(['Settings', 'RunOnLaunch', type, id], {
                SpinnerId: spinnerId,
                Mode: type === 'REWARD' ? 'SEQUENTAL' : 'INDEPENDENT',
                Slots: '',
                SpinDelay: 0,
                Spins: ['20:2'],
              });
              setSelected(`run:${type}:${id}`);
              setBrush(`run:${type}:${id}`);
            }}
            spinners={o.spinners}
          />
        </Card>

        <Card title="Spinners (de dónde salen los ítems)">
          <div className="space-y-2">
            {Object.values(o.spinners.REWARD).map((spinner) => (
              <div key={`r-${spinner.id}`} className="rounded-lg border border-ink-700 px-3 py-2 space-y-2">
                <p className="text-xs font-mono text-parch-200">
                  <span className="mr-2 rounded bg-gold-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold-400">premios</span>
                  {spinner.id}
                </p>
                <Field label="Rarezas (Rarities)" hint="* = todas. Con varias, se sortea primero la rareza y después el premio.">
                  <TextInput
                    value={spinner.rarities.join(', ')}
                    onCommit={(v) => edit.seq(['Spinners', 'REWARD', spinner.id, 'Rarities'], v.split(',').map((s) => s.trim()).filter(Boolean))}
                  />
                </Field>
              </div>
            ))}
            {Object.values(o.spinners.ANIMATION).map((spinner) => (
              <AnimationSpinnerCard key={`a-${spinner.id}`} spinner={spinner} edit={edit} />
            ))}
          </div>
        </Card>

        <Card title={`Ítems fijos (Content.Default) · ${o.content.length}`}>
          <div className="space-y-2">
            {o.content.map((item) => (
              <ContentItem
                key={item.id}
                item={item}
                open={selected === `item:${item.id}`}
                painting={brush === `item:${item.id}`}
                onToggle={() => setSelected(selected === `item:${item.id}` ? null : `item:${item.id}`)}
                onBrush={() => setBrush(brush === `item:${item.id}` ? null : `item:${item.id}`)}
                onDelete={() => edit.del(['Content', 'Default', item.id])}
                edit={edit}
              />
            ))}
          </div>
          <AddItem
            existing={o.content.map((c) => c.id)}
            onAdd={(id) => {
              edit.node(['Content', 'Default', id], {
                Item: { Material: 'minecraft:black_stained_glass_pane', Display_Name: ' ', Lore: [], Hide_Tooltip: true },
                Slots: '',
              });
              setSelected(`item:${id}`);
              setBrush(`item:${id}`);
            }}
          />
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
                <div className="flex items-center gap-1" role="group" aria-label="Escala del menú">
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
              {running
                ? <Button variant="default" icon={Square} onClick={stop}>Detener</Button>
                : <Button variant="primary" icon={sim ? RotateCcw : Play} onClick={simulate} disabled={!o.runs.length}>Simular</Button>}
              {sim && !running && <Button variant="ghost" icon={X} onClick={() => setSim(null)} title="Volver al menú quieto" />}
            </div>
          )}
        >
          {chest ? (
            <McChest assets={mcAssets} font={mcFont} scale={scale} rows={shape.rows} title={fillText(o.title, crateVars)} tip={tip} {...slotProps} />
          ) : (
            <FlatGrid cols={shape.cols} title={fillText(o.title, crateVars)} assets={mcAssets} {...slotProps} />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} className="accent-gold-500" />
              Números de slot
            </label>
            {sim ? (
              <span className="font-mono-tab">
                tick {sim.ticks} · {seconds(sim.ticks)} {sim.done ? '· terminó' : ''}
              </span>
            ) : brush ? (
              <span>
                Pintando <b className="text-gold-400">{brush === 'win' ? 'slots ganadores' : brush.replace(/^(run|item):/, '')}</b>: click en un slot
                para agregarlo o quitarlo. <button className="underline hover:text-parch-200" onClick={() => setBrush(null)}>Terminar</button>
              </span>
            ) : (
              <span>Con el pincel asignás slots · Simular corre la animación completa ({seconds(duration)}).</span>
            )}
          </div>

          {sim?.won.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-parch-200">
              <Trophy className="w-3.5 h-3.5 text-gold-400" strokeWidth={1.5} />
              {sim.done ? 'Salió:' : 'Va a salir:'}
              {sim.won.map((reward, i) => (
                <span key={i} className="rounded bg-ink-800 px-1.5 py-0.5 font-mono-tab text-[11px]">{reward?.key ?? '—'}</span>
              ))}
            </p>
          )}
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
          La simulación sortea los premios con los pesos de esta caja, igual que el plugin. El sonido de cada giro no se reproduce acá.
          {!mcAssets && ' Sin las texturas del juego, los íconos son aproximados.'}
        </p>
      </div>
    </div>
  );
}

function RunCard({ run, opening, open, painting, onToggle, onBrush, onDelete, edit }) {
  const path = (...rest) => ['Settings', 'RunOnLaunch', run.type, run.id, ...rest];
  const spinnerIds = Object.keys(opening.spinners[run.type] ?? {});
  const ids = spinnerIds.includes(run.spinnerId) ? spinnerIds : [run.spinnerId, ...spinnerIds];
  const modes = SPIN_MODES.includes(run.mode) ? SPIN_MODES : [run.mode, ...SPIN_MODES];
  const spins = run.steps.reduce((sum, step) => sum + step.spins, 0);

  return (
    <div className={`rounded-lg border ${open ? 'border-ink-600 bg-ink-800/40' : 'border-ink-700'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-500" />}
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
            run.type === 'REWARD' ? 'bg-gold-500/15 text-gold-400' : 'bg-ink-700 text-ink-400'
          }`}
          >
            {run.type === 'REWARD' ? 'premios' : 'animación'}
          </span>
          <span className="truncate text-xs font-mono text-parch-200">{run.id}</span>
          <span className="shrink-0 text-[10px] text-ink-500">{run.slots.length} slot(s) · {spins} giros</span>
        </button>
        <BrushButton active={painting} onClick={onBrush} />
        <Button variant="ghost" icon={Trash2} onClick={onDelete} title="Borrar este giro" />
      </div>

      {open && (
        <div className="space-y-3 border-t border-ink-700 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Spinner (SpinnerId)">
              <select value={run.spinnerId} onChange={(e) => edit.set(path('SpinnerId'), e.target.value)} className={inputCls}>
                {ids.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </Field>
            <Field label="Modo" hint={MODE_HINTS[run.mode]}>
              <select value={run.mode} onChange={(e) => edit.set(path('Mode'), e.target.value)} className={inputCls}>
                {modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </Field>
          </div>
          <Field
            label={`Slots · ${run.slots.length}`}
            hint={run.mode === 'SEQUENTAL' ? 'El orden importa: los ítems entran por el primero y salen por el último.' : null}
          >
            <TextInput value={formatSlots(run.slots)} onCommit={(v) => edit.set(path('Slots'), formatSlots(parseSlots(v)))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Retraso (SpinDelay, ticks)">
              <NumberInput value={run.spinDelay} onCommit={(v) => edit.set(path('SpinDelay'), Math.max(0, Math.round(v)))} />
            </Field>
            <Field label="Sonido por giro">
              <TextInput
                value={run.sound ?? ''}
                onCommit={(v) => (v.trim() ? edit.set(path('Sound'), v.trim()) : edit.del(path('Sound')))}
              />
            </Field>
          </div>
          <Field label="Pasos (Spins)" hint="Uno por línea, 'giros:ticks'. Más ticks = más lento; los últimos pasos son el frenado.">
            <LinesInput
              value={run.steps.map(formatStep)}
              rows={Math.min(8, Math.max(3, run.steps.length + 1))}
              onCommit={(lines) => edit.seq(path('Spins'), lines.filter(Boolean).map((line) => formatStep(parseStep(line))))}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function AnimationSpinnerCard({ spinner, edit }) {
  const { mcAssets } = useCrate();
  const [open, setOpen] = useState(false);
  const path = (...rest) => ['Spinners', 'ANIMATION', spinner.id, ...rest];
  const total = spinner.items.reduce((sum, item) => sum + Math.max(0, item.chance), 0);

  return (
    <div className={`rounded-lg border ${open ? 'border-ink-600 bg-ink-800/40' : 'border-ink-700'}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-500" />}
        <span className="shrink-0 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-400">animación</span>
        <span className="truncate text-xs font-mono text-parch-200">{spinner.id}</span>
        <span className="shrink-0 text-[10px] text-ink-500">{spinner.items.length} ítem(s)</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-ink-700 px-3 py-3">
          {spinner.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              <span className="relative mt-1 flex h-8 w-8 shrink-0 items-center justify-center" style={SLOT}>
                <SlotItem cell={{ material: item.material, cmd: item.modelData, skin: item.skinUrl, glint: item.glint }} assets={mcAssets} size={24} />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <TextInput value={item.material} list="dl-materials" onCommit={(v) => edit.set(path('Items', item.id, 'Material'), v.trim())} />
                  <NumberInput
                    value={item.chance}
                    step={0.1}
                    onCommit={(v) => edit.set(path('Items', item.id, 'Chance'), Math.max(0, v))}
                    title="Peso del sorteo"
                  />
                </div>
                <TextInput
                  value={item.displayName ?? ''}
                  preview
                  onCommit={(v) => (v === '' ? edit.del(path('Items', item.id, 'Display_Name')) : edit.set(path('Items', item.id, 'Display_Name'), v))}
                />
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button variant="ghost" icon={Trash2} onClick={() => edit.del(path('Items', item.id))} title="Borrar ítem" />
                <span className="text-[10px] text-ink-500 font-mono-tab">
                  {total > 0 ? `${Math.round((Math.max(0, item.chance) / total) * 100)}%` : '—'}
                </span>
              </div>
            </div>
          ))}
          <AddItem
            existing={spinner.items.map((i) => i.id)}
            label="Ítem del spinner"
            onAdd={(id) => edit.node(path('Items', id), {
              Chance: 1.0,
              Material: 'minecraft:white_stained_glass_pane',
              Display_Name: ' ',
              Lore: [],
              Hide_Tooltip: true,
            })}
          />
        </div>
      )}
    </div>
  );
}

function ContentItem({ item, open, painting, onToggle, onBrush, onDelete, edit }) {
  const { mcAssets } = useCrate();
  const path = (...rest) => ['Content', 'Default', item.id, ...rest];
  const setOptional = (key, value) => (value === '' ? edit.del(path('Item', key)) : edit.set(path('Item', key), value));

  return (
    <div className={`rounded-lg border ${open ? 'border-ink-600 bg-ink-800/40' : 'border-ink-700'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-500" />}
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center" style={SLOT}>
            <SlotItem cell={{ material: item.material, cmd: item.modelData, skin: item.skinUrl, glint: item.glint }} assets={mcAssets} size={24} />
          </span>
          <span className="truncate text-xs font-mono text-parch-200">{item.id}</span>
          <span className="shrink-0 text-[10px] text-ink-500">{item.slots.length} slot(s)</span>
        </button>
        <BrushButton active={painting} onClick={onBrush} />
        <Button variant="ghost" icon={Trash2} onClick={onDelete} title="Borrar ítem" />
      </div>

      {open && (
        <div className="space-y-3 border-t border-ink-700 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Material">
              <TextInput value={item.material} list="dl-materials" onCommit={(v) => edit.set(path('Item', 'Material'), v.trim())} />
            </Field>
            <Field label="Slots">
              <TextInput value={formatSlots(item.slots)} onCommit={(v) => edit.set(path('Slots'), formatSlots(parseSlots(v)))} />
            </Field>
          </div>
          <Field label="Nombre (Display_Name)">
            <TextInput value={item.displayName ?? ''} preview onCommit={(v) => setOptional('Display_Name', v)} />
          </Field>
          <Field label="Lore">
            <LinesInput value={item.lore} keepEmpty rows={2} preview onCommit={(v) => edit.seq(path('Item', 'Lore'), v)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Sin tooltip" checked={item.hideTooltip} onChange={(v) => edit.set(path('Item', 'Hide_Tooltip'), v)} />
            <Toggle label="Brillo encantado" checked={item.glint} onChange={(v) => edit.set(path('Item', 'Enchant_Glint'), v)} />
          </div>
          {/player_head/i.test(item.material) && (
            <Field label="Textura (SkinURL)" hint="El hash de textures.minecraft.net/texture/…">
              <TextInput value={item.skinUrl ?? ''} onCommit={(v) => setOptional('SkinURL', v.trim())} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function AddRun({ existing, spinners, onAdd }) {
  const [type, setType] = useState('ANIMATION');
  const [id, setId] = useState('');
  const spinnerIds = Object.keys(spinners[type] ?? {});

  const add = () => {
    const clean = id.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!clean || existing.includes(`${type}:${clean}`) || !spinnerIds.length) return;
    onAdd(type, clean, spinnerIds[0]);
    setId('');
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} w-36`}>
          <option value="ANIMATION">animación</option>
          <option value="REWARD">premios</option>
        </select>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="id del giro nuevo (ej. col_2)"
          className={inputCls}
        />
        <Button icon={Plus} onClick={add} disabled={!spinnerIds.length}>Giro</Button>
      </div>
      {!spinnerIds.length && <p className="text-[10px] text-ink-500">No hay spinners de ese tipo en el archivo: creá uno en Spinners primero.</p>}
    </div>
  );
}

function AddItem({ existing, onAdd, label = 'Ítem' }) {
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
        placeholder={`id del ítem nuevo (ej. borde)`}
        className={inputCls}
      />
      <Button icon={Plus} onClick={add}>{label}</Button>
    </div>
  );
}
