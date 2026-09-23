// openingMenu.js
// Animación de apertura de una caja (openings/inventory/<id>.yml). El formato es
// el mismo en 6.3.3 y 6.6.1 (InventoryProvider + SpinnerData del plugin):
//  - Settings: Menu_Type, Title, WinSlots, Max_Ticks_To_Skip, Completion_Pause_Ticks.
//  - Settings.RunOnLaunch.<ANIMATION|REWARD>.<run>: qué spinner corre, en qué slots,
//    con qué modo, cuánto tarda en arrancar y sus pasos ("giros:ticks").
//  - Spinners.<TIPO>.<id>: de dónde salen los ítems (pool con Chance, o rarezas).
//  - Content.Default.<id>: los ítems fijos del fondo.
// createOpening() repite tick a tick lo que hace AbstractSpinner, para que la
// simulación se vea igual que en el server (20 ticks = 1 segundo).

import { isMap, isScalar } from 'yaml';
import { parseYaml } from './crateFile.js';
import { menuShape, parseSlots, readCosmeticItem, rewardItem } from './previewMenu.js';
import { buildRoller, rarityOf } from './weightMath.js';

export const OPENING_MENU_TYPES = [1, 2, 3, 4, 5, 6].map((rows) => `generic_9x${rows}`);
export const SPINNER_TYPES = ['ANIMATION', 'REWARD'];
// SpinMode del plugin (sí, "SEQUENTAL" y "SYNCRHONIZED" están así de escritos en el código).
export const SPIN_MODES = ['SEQUENTAL', 'SYNCRHONIZED', 'INDEPENDENT', 'RANDOM'];
export const MODE_HINTS = {
  SEQUENTAL: 'los ítems se corren de un slot al siguiente, como una cinta',
  SYNCRHONIZED: 'todos los slots muestran el mismo ítem a la vez',
  INDEPENDENT: 'cada slot sortea su propio ítem',
  RANDOM: 'cambian algunos slots al azar en cada giro',
};

export const openingShape = (model) => {
  const { cols, rows } = menuShape(model.menuType);
  return { cols, rows, size: cols * rows };
};

/** "35:1" = 35 giros, uno por tick. */
export const parseStep = (raw) => {
  const [spins = 0, interval = 0] = String(raw ?? '').split(':').map((n) => Math.abs(Math.trunc(Number(n))) || 0);
  return { spins, interval };
};
export const formatStep = (step) => `${step.spins}:${step.interval}`;

/**
 * Formato viejo: SpinTimes "giros:ticks:retraso:cada_cuántos:cuánto_frena".
 * El plugin lo migra a Spins la primera vez que carga el archivo (SpinnerData.read).
 */
function stepsFromFlat(raw) {
  const [total = 0, speed = 0, delay = 0, slowStep = 0, slowAmount = 0] = String(raw ?? '')
    .split(':').map((n) => Math.abs(Math.trunc(Number(n))) || 0);
  if (!slowStep || !slowAmount) return { steps: [{ spins: total, interval: speed }], delay };

  const steps = [];
  for (let left = total, i = 0; left > 0; i++) {
    const spins = Math.min(slowStep, left);
    steps.push({ spins, interval: speed + i * slowAmount });
    left -= spins;
  }
  return { steps, delay };
}

export function readOpening(text) {
  const doc = parseYaml(text);
  const get = (path, fallback) => {
    const node = doc.getIn(path, true);
    const value = isScalar(node) ? node.value : node?.toJSON?.() ?? node;
    return value ?? fallback;
  };
  const ids = (path) => {
    const node = doc.getIn(path, true);
    return isMap(node) ? node.items.map((pair) => String(isScalar(pair.key) ? pair.key.value : pair.key)) : [];
  };

  const runs = [];
  for (const type of SPINNER_TYPES) {
    for (const id of ids(['Settings', 'RunOnLaunch', type])) {
      const base = ['Settings', 'RunOnLaunch', type, id];
      const spins = get([...base, 'Spins'], null);
      const legacy = spins === null && doc.hasIn([...base, 'SpinTimes']) ? stepsFromFlat(get([...base, 'SpinTimes'], '')) : null;
      runs.push({
        type,
        id,
        spinnerId: String(get([...base, 'SpinnerId'], '')).toLowerCase(),
        mode: String(get([...base, 'Mode'], 'SEQUENTAL')).toUpperCase(),
        slots: parseSlots(get([...base, 'Slots'], '')),
        spinDelay: legacy ? legacy.delay : Number(get([...base, 'SpinDelay'], 0)) || 0,
        steps: legacy ? legacy.steps : (Array.isArray(spins) ? spins : []).map(parseStep),
        sound: get([...base, 'Sound'], null),
        legacy: !!legacy,
      });
    }
  }

  const spinners = { ANIMATION: {}, REWARD: {} };
  for (const id of ids(['Spinners', 'ANIMATION'])) {
    const base = ['Spinners', 'ANIMATION', id];
    spinners.ANIMATION[id.toLowerCase()] = {
      id,
      items: ids([...base, 'Items']).map((itemId) => ({
        id: itemId,
        chance: Number(get([...base, 'Items', itemId, 'Chance'], 100)) || 0,
        ...readCosmeticItem(get, [...base, 'Items', itemId]),
      })),
    };
  }
  for (const id of ids(['Spinners', 'REWARD'])) {
    const rarities = get(['Spinners', 'REWARD', id, 'Rarities'], ['*']);
    spinners.REWARD[id.toLowerCase()] = {
      id,
      rarities: (Array.isArray(rarities) ? rarities : [rarities]).map((r) => String(r).toLowerCase()),
    };
  }

  return {
    menuType: String(get(['Settings', 'Menu_Type'], 'generic_9x3')),
    title: String(get(['Settings', 'Title'], '%crate_name%')),
    winSlots: parseSlots(get(['Settings', 'WinSlots'], '')),
    maxTicksToSkip: Number(get(['Settings', 'Max_Ticks_To_Skip'], 40)),
    completionPause: Number(get(['Settings', 'Completion_Pause_Ticks'], 40)),
    content: ids(['Content', 'Default']).map((id) => ({
      id,
      slots: parseSlots(get(['Content', 'Default', id, 'Slots'], '')),
      ...readCosmeticItem(get, ['Content', 'Default', id, 'Item']),
    })),
    runs,
    spinners,
  };
}

const itemCell = (item) => ({
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

const rewardCell = (reward) => ({
  ...rewardItem(reward),
  name: reward.displayName,
  lore: reward.description ?? [],
  source: `reward ${reward.key}`,
});

/** Pool de ítems de un spinner ANIMATION: sorteo por Chance, como Rnd.getByWeight. */
function animationPicker(model, run, random) {
  const items = model.spinners.ANIMATION[run.spinnerId]?.items ?? [];
  const total = items.reduce((sum, item) => sum + Math.max(0, item.chance), 0);
  return () => {
    if (!items.length || total <= 0) return null;
    let roll = random() * total;
    for (const item of items) {
      roll -= Math.max(0, item.chance);
      if (roll <= 0) return itemCell(item);
    }
    return itemCell(items[items.length - 1]);
  };
}

/**
 * RewardSpinner: reserva un premio por cada slot ganador que recorre y lo deja
 * caer justo al final; el resto de los giros muestra premios al azar.
 */
function rewardPicker(model, run, ctx) {
  const rarities = model.spinners.REWARD[run.spinnerId]?.rarities ?? ['*'];
  const pool = ctx.rewards.filter((r) => rarities.includes('*') || rarities.includes(rarityOf(r, ctx.rarityWeights)));
  const roller = buildRoller(pool, ctx.rarityWeights);
  const rollReward = () => (roller ? roller(ctx.random) : null);

  let index = ctx.won.length; // arranca después de lo que reservaron los spinners anteriores
  for (const win of model.winSlots) if (run.slots.includes(win)) ctx.won.push(rollReward());

  // shouldUsePredictedReward: en qué giro el premio reservado entra al slot ganador
  const isFinalSpin = (slot, spinsLeft) => {
    if (run.mode === 'SYNCRHONIZED') return spinsLeft === 1;
    if (run.mode === 'INDEPENDENT' || run.mode === 'RANDOM') return spinsLeft === 1 && model.winSlots.includes(slot);
    if (run.mode === 'SEQUENTAL') {
      return model.winSlots.some((win) => {
        const stepsAway = run.slots.indexOf(win) + 1;
        return stepsAway > 0 && spinsLeft === stepsAway;
      });
    }
    return false;
  };

  return (slot, spinsLeft) => {
    const reward = index < ctx.won.length && isFinalSpin(slot, spinsLeft) ? ctx.won[index++] : rollReward();
    return reward ? rewardCell(reward) : null;
  };
}

function makeSpinner(model, run, ctx) {
  const pick = run.type === 'REWARD' ? rewardPicker(model, run, ctx) : animationPicker(model, run, ctx.random);
  const steps = run.steps.map((step) => ({ ...step }));
  const requiredSpins = steps.reduce((sum, step) => sum + step.spins, 0);
  const outside = (slot) => slot < 0 || slot >= ctx.cells.length;

  let current = null;
  let interval = 1;
  let stepCount = 0;
  let tickCount = 0;
  let spinDelay = run.spinDelay;
  let spinCount = 0;
  let running = false;

  const nextStep = () => {
    current = steps.shift() ?? null;
    // un intervalo de 0 le hace tirar "/ by zero" al plugin; acá se toma como 1 y openingIssues lo avisa
    interval = Math.max(1, current?.interval ?? 1);
    stepCount = 0;
    tickCount = 0;
  };

  const spin = () => {
    const spinsLeft = requiredSpins - spinCount;
    const slots = run.slots;

    if (run.mode === 'SEQUENTAL') {
      const item = pick(-1, spinsLeft);
      for (let i = slots.length - 1; i >= 0; i--) {
        if (outside(slots[i])) continue;
        ctx.cells[slots[i]] = i === 0 ? item : ctx.cells[slots[i - 1]];
      }
    } else if (run.mode === 'SYNCRHONIZED') {
      const item = pick(-1, spinsLeft);
      for (const slot of slots) if (!outside(slot)) ctx.cells[slot] = item;
    } else if (run.mode === 'RANDOM' && run.type === 'ANIMATION') {
      // Rnd.get(n + 1) slots distintos al azar
      const rest = slots.filter((slot) => !outside(slot));
      let roll = Math.floor(ctx.random() * (slots.length + 1));
      while (roll > 0 && rest.length) {
        const slot = rest.splice(Math.floor(ctx.random() * rest.length), 1)[0];
        ctx.cells[slot] = pick(slot, spinsLeft);
        roll--;
      }
    } else {
      // INDEPENDENT (y RANDOM en spinners de premios, que el plugin trata como INDEPENDENT)
      for (const slot of slots) if (!outside(slot)) ctx.cells[slot] = pick(slot, spinsLeft);
    }

    stepCount++;
    spinCount++;
    if (stepCount >= current.spins) nextStep();
  };

  return {
    run,
    start() {
      running = true;
      nextStep();
    },
    tick() {
      if (!running) return;
      if (current === null) {
        running = false;
        return;
      }
      // isSpinTime: el retraso se come ticks pero igual los cuenta, así que el primer
      // giro cae en el primer múltiplo del intervalo, no apenas termina el retraso.
      if (spinDelay > 0) spinDelay--;
      else if (tickCount === 0 || tickCount % interval === 0) spin();
      tickCount++;
    },
    isCompleted: () => current === null,
    hasSpin: () => spinCount > 0,
    isRunning: () => running,
    spins: () => spinCount,
    totalSpins: () => requiredSpins,
  };
}

/**
 * Una apertura lista para simular. `cells` es el inventario (se modifica en cada
 * tick) y `won` son los premios que salieron. 1 tick = 50 ms en el server.
 */
export function createOpening(model, { rewards = [], rarityWeights = {}, random = Math.random } = {}) {
  const { size } = openingShape(model);
  const ctx = { cells: Array.from({ length: size }, () => null), won: [], rewards, rarityWeights, random };

  for (const item of model.content) {
    for (const slot of item.slots) if (slot >= 0 && slot < size) ctx.cells[slot] = itemCell(item);
  }

  const spinners = model.runs.map((run) => makeSpinner(model, run, ctx));
  spinners.forEach((spinner) => spinner.start());

  let ticks = 0;
  let closeTicks = model.completionPause;
  // isSpinnersCompleted: todos giraron al menos una vez y ya terminaron
  const spinnersDone = () => spinners.length > 0 && spinners.every((s) => s.hasSpin() && (!s.isRunning() || s.isCompleted()));

  return {
    cells: ctx.cells,
    won: ctx.won,
    spinners,
    tick() {
      if (spinnersDone()) {
        if (closeTicks > 0) closeTicks--;
      }
      spinners.forEach((spinner) => spinner.tick());
      ticks++;
    },
    ticks: () => ticks,
    spinnersDone,
    isDone: () => spinnersDone() && closeTicks <= 0,
    canSkip: () => model.maxTicksToSkip >= 0 && ticks <= model.maxTicksToSkip,
  };
}

/** Cuántos ticks dura de punta a punta (se simula en seco: es el número exacto). */
export function openingDuration(model) {
  const run = createOpening(model, { random: () => 0.5 });
  let ticks = 0;
  while (!run.isDone() && ticks < 2400) {
    run.tick();
    ticks++;
  }
  return ticks;
}

export function openingIssues(model) {
  const { size } = openingShape(model);
  const issues = [];
  const outside = (slots) => slots.filter((slot) => slot < 0 || slot >= size);

  const badWin = outside(model.winSlots);
  if (badWin.length) issues.push(`Slots ganadores fuera del menú (${size} slots): ${badWin.join(', ')}.`);
  if (!model.winSlots.length) issues.push('Sin WinSlots: no hay dónde caiga el premio.');

  for (const item of model.content) {
    const bad = outside(item.slots);
    if (bad.length) issues.push(`Ítem fijo "${item.id}": slots fuera del menú: ${bad.join(', ')}.`);
  }

  for (const run of model.runs) {
    const label = `${run.type === 'REWARD' ? 'Premios' : 'Animación'} "${run.id}"`;
    if (!model.spinners[run.type]?.[run.spinnerId]) {
      issues.push(`${label}: el spinner "${run.spinnerId}" no existe en Spinners.${run.type}; el plugin lo saltea.`);
    }
    if (!SPIN_MODES.includes(run.mode)) issues.push(`${label}: modo "${run.mode}" desconocido.`);
    const bad = outside(run.slots);
    if (bad.length) issues.push(`${label}: slots fuera del menú: ${bad.join(', ')}.`);
    if (!run.slots.length) issues.push(`${label}: sin slots, no se ve nada.`);
    if (!run.steps.length || run.steps.every((step) => step.spins <= 0)) {
      issues.push(`${label}: sin giros (Spins). El plugin nunca da por terminada la animación y el menú queda abierto.`);
    }
    if (run.steps.some((step) => step.spins > 0 && step.interval <= 0)) {
      issues.push(`${label}: un paso tiene intervalo 0 y el plugin tira "/ by zero". Poné 1 o más.`);
    }
    if (run.type === 'REWARD' && !model.winSlots.some((slot) => run.slots.includes(slot))) {
      issues.push(`${label}: no pasa por ningún slot ganador, así que no entrega premios.`);
    }
    if (run.legacy) issues.push(`${label}: usa el SpinTimes viejo; el plugin lo migra solo a Spins al cargarlo.`);
  }

  if (!model.runs.some((run) => run.type === 'REWARD')) {
    issues.push('No hay ningún spinner de premios (REWARD): la caja no entrega nada.');
  }
  return issues;
}

// openings/inventory/<id>.yml nuevo: una fila que gira y frena en el slot del medio.
export const NEW_OPENING = `Settings:
  Menu_Type: generic_9x3
  Title: <black>Opening %crate_name%...</black>
  WinSlots: '13'
  Max_Ticks_To_Skip: 40
  Completion_Pause_Ticks: 40
  RunOnLaunch:
    ANIMATION:
      background:
        SpinnerId: blink
        Mode: INDEPENDENT
        Slots: 0,1,2,3,4,5,6,7,8,18,19,20,21,22,23,24,25,26
        SpinDelay: 0
        Spins:
        - '12:1'
        - '12:2'
        - '20:4'
    REWARD:
      main:
        SpinnerId: normal
        Mode: SEQUENTAL
        Slots: 17,16,15,14,13,12,11,10,9
        SpinDelay: 0
        Spins:
        - '12:1'
        - '12:2'
        - '5:4'
        - '3:6'
        - '2:10'
        - '1:14'
        Sound: minecraft:block.note_block.xylophone;0.8;1.0
Content:
  Default:
    pointer:
      Item:
        Material: minecraft:lime_stained_glass_pane
        Display_Name: <green><b>></b></green>
        Lore: []
        Hide_Tooltip: true
      Slots: 4,22
Spinners:
  ANIMATION:
    blink:
      Items:
        on:
          Chance: 1.0
          Material: minecraft:gray_stained_glass_pane
          Display_Name: ' '
          Lore: []
          Hide_Tooltip: true
        off:
          Chance: 1.0
          Material: minecraft:black_stained_glass_pane
          Display_Name: ' '
          Lore: []
          Hide_Tooltip: true
  REWARD:
    normal:
      Rarities:
      - '*'
`;
