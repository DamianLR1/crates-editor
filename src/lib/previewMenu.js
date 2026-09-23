// previewMenu.js
// Menú de preview de una crate (previews/<id>.yml). Mismo formato en 6.3.3 y
// 6.6.1 (PreviewMenu + menús de nightcore):
//  - Settings: MenuType (minecraft:generic_9xN), Title, Auto_Refresh, PlaceholderAPI.
//  - Reward: Slots donde se listan las rewards sorteables de la caja (en ese
//    orden y paginadas) y Name/Lore con placeholders.
//  - Content: ítems fijos; en un slot gana el de mayor Priority.
// La edición usa editCrateText (sirve para cualquier YAML): solo cambian las
// líneas tocadas y se conservan los comentarios del archivo.

import { isMap, isScalar, parse } from 'yaml';
import { parseYaml } from './crateFile.js';

export const MENU_TYPES = [1, 2, 3, 4, 5, 6].map((rows) => `minecraft:generic_9x${rows}`);
export const ITEM_TYPES = ['null', 'close', 'user_skin', 'page_next', 'page_previous', 'open', 'milestones'];
// PreviewMenu.loadConfiguration: slots por defecto si el archivo no los define
const DEFAULT_REWARD_SLOTS = [10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33, 34];

export function menuShape(menuType) {
  const id = String(menuType ?? '').toLowerCase();
  const grid = id.match(/generic_(\d)x(\d)/);
  if (grid) return { cols: Number(grid[1]), rows: Number(grid[2]) };
  if (id.includes('hopper')) return { cols: 5, rows: 1 };
  return { cols: 9, rows: 5 }; // PreviewMenu usa GENERIC_9X5 por defecto
}

/** "0,4,9-11" | 4 | [1,2] -> [0,4,9,10,11]. Respeta el orden (en Reward.Slots es el orden de llenado). */
export function parseSlots(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger);
  return String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean).flatMap((part) => {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
    const n = Number(part);
    return Number.isInteger(n) ? [n] : [];
  });
}

export const formatSlots = (slots) => slots.join(',');
export const toggleSlot = (slots, slot) => (slots.includes(slot) ? slots.filter((s) => s !== slot) : [...slots, slot]);

/**
 * Ítem "cosmético" de nightcore (Material, Display_Name, Lore, Model.Data...).
 * `get(path, fallback)` lee del YAML y `base` es dónde vive el ítem: los del menú
 * cuelgan de Item, los de un spinner de opening están sueltos bajo su id.
 */
export function readCosmeticItem(get, base) {
  const field = (key, fallback) => get([...base, key], fallback);
  const lore = field('Lore', []);
  return {
    material: String(field('Material', 'minecraft:stone')),
    amount: Number(field('Amount', 1)) || 1,
    displayName: field('Display_Name') ?? field('Item_Name') ?? field('Name') ?? null, // Name: formato viejo de nightcore
    lore: Array.isArray(lore) ? lore.map((line) => String(line ?? '')) : [],
    hideTooltip: field('Hide_Tooltip', false) === true,
    glint: field('Enchant_Glint', false) === true,
    skinUrl: field('SkinURL') ?? null,
    // Model.Data en nightcore nuevo, Custom_Model_Data en el viejo: el modelo del resource pack
    modelData: Number(get([...base, 'Model', 'Data'], field('Custom_Model_Data'))) || null,
  };
}

export function readPreview(text) {
  const doc = parseYaml(text);
  const get = (path, fallback) => {
    const node = doc.getIn(path, true);
    const value = isScalar(node) ? node.value : node?.toJSON?.() ?? node;
    return value ?? fallback;
  };
  const lines = (path) => {
    const value = get(path, []);
    return Array.isArray(value) ? value.map((l) => String(l ?? '')) : [];
  };
  const content = doc.getIn(['Content'], true);

  return {
    menuType: String(get(['Settings', 'MenuType'], 'minecraft:generic_9x5')),
    title: String(get(['Settings', 'Title'], '%crate_name%')),
    autoRefresh: Number(get(['Settings', 'Auto_Refresh'], -1)),
    papi: get(['Settings', 'PlaceholderAPI', 'Enabled'], false) === true,
    reward: {
      hideUnavailable: get(['Reward', 'Hide_Unavailable'], true) === true,
      slots: parseSlots(get(['Reward', 'Slots'], DEFAULT_REWARD_SLOTS)),
      name: String(get(['Reward', 'Name'], '%reward_name%')),
      lore: lines(['Reward', 'Lore', 'Default']),
      noPermission: lines(['Reward', 'Lore', 'No_Permission']),
      limitInfo: lines(['Reward', 'Lore', 'LimitInfo']),
    },
    content: (isMap(content) ? content.items : []).map((pair) => {
      const id = String(isScalar(pair.key) ? pair.key.value : pair.key);
      return {
        id,
        priority: Number(get(['Content', id, 'Priority'], 0)) || 0,
        slots: parseSlots(get(['Content', id, 'Slots'], '')),
        type: String(get(['Content', id, 'Type'], 'null')),
        ...readCosmeticItem(get, ['Content', id, 'Item']),
        hasClickCommands: doc.hasIn(['Content', id, 'Click_Commands']),
      };
    }),
  };
}

/**
 * Ítem fijo que se ve en cada slot. Gana la Priority más alta; con la misma,
 * el que viene después en el archivo.
 * ponytail: el desempate por orden no está verificado contra nightcore; alcanza porque
 * los menús reales no repiten prioridad en un mismo slot.
 */
export function layoutSlots(preview) {
  const { cols, rows } = menuShape(preview.menuType);
  const size = cols * rows;
  const slots = Array.from({ length: size }, () => null);
  for (const item of preview.content) {
    for (const s of item.slots) {
      if (s >= 0 && s < size && (!slots[s] || item.priority >= slots[s].priority)) slots[s] = item;
    }
  }
  return { cols, rows, size, slots };
}

/** Reemplaza %var% y aplica %nf_<formato>_<número>% (NumberFormatter de PlaceholderAPI). */
export function fillText(text, vars) {
  let out = String(text ?? '');
  for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`%${key}%`, String(value ?? ''));
  return out.replace(/%nf_([#0.,]+)_(-?\d+(?:\.\d+)?)%/g, (_, format, number) => {
    const digits = format.split('.')[1] ?? '';
    const fixed = Number(number).toFixed(digits.length);
    return digits.includes('0') ? fixed : fixed.replace(/\.?0+$/, '');
  });
}

export function rewardVars(reward, crateVars, rarityName) {
  return {
    ...crateVars,
    reward_name: reward.displayName,
    reward_id: reward.key,
    reward_weight: reward.weight,
    reward_roll_chance: String(Number(Number(reward.percent ?? 0).toFixed(2))),
    reward_rarity_name: rarityName,
  };
}

/** Máximo de victorias del reward (Limits en 6.6.1, Win_Limit en 6.3.3), o null si no tiene. */
export function rewardLimit(reward) {
  const l = reward.limits;
  const amounts = [
    ...(l?.enabled ? [l.playerAmount, l.globalAmount] : []),
    ...[reward.winLimit?.player, reward.winLimit?.global].filter((s) => s?.enabled).map((s) => s.amount),
  ].filter((a) => a > -1);
  return amounts.length ? Math.min(...amounts) : null;
}

/**
 * Lore de un reward como la arma PreviewMenu, para un jugador de muestra con
 * permiso y sin cooldown: %reward_description% y %limits% se expanden a varias
 * líneas, %no_permission% desaparece.
 */
export function renderRewardLore(lines, reward, vars, limitInfo, limitAmount) {
  const out = [];
  for (const line of lines) {
    if (line.includes('%reward_description%')) out.push(...reward.description);
    else if (/%(no_permission|win_limit_no_permission|win_limit_cooldown|win_limit_drained)%/.test(line)) continue;
    else if (/%(limits|win_limit_amount)%/.test(line)) {
      if (limitAmount != null) out.push(...limitInfo.map((l) => l.replaceAll('%amount%', String(limitAmount))));
    } else out.push(line);
  }
  return applyEmptyLines(out.map((l) => fillText(l, vars)));
}

const EMPTY_IF = /^%empty-if-(above|below)%$/i;
const blankish = (line) => !line.trim() || EMPTY_IF.test(line);

/** NightMeta.addEmptyLines: %empty-if-above/below% es una línea vacía solo si la vecina no lo es. */
export function applyEmptyLines(lore) {
  const out = [...lore];
  for (let i = 0; i < out.length; i++) {
    const match = out[i].match(EMPTY_IF);
    if (!match) continue;
    const neighbour = match[1].toLowerCase() === 'above' ? out[i - 1] : out[i + 1];
    if (neighbour === undefined || blankish(neighbour)) out.splice(i, 1);
    else out[i] = '';
    i = -1; // igual que nightcore: vuelve a empezar después de cada cambio
  }
  return out;
}

/** Ítem con el que se muestra el reward en el menú: material, cantidad, skin (cabezas) y brillo. */
export function rewardItem(reward) {
  const item = reward.type === 'ITEM' && !reward.customPreview ? reward.itemsData[0] : reward.previewData;
  if (!item) return { material: 'minecraft:paper' };
  if (item.type === 'CUSTOM') {
    const amount = Number(item.amount) || 1;
    const known = reward.pluginItem; // de los yml de MMOItems (withPluginItem)
    if (known) return { material: known.material, amount, cmd: known.cmd, itemModel: null, skin: null, glint: false };
    // Nexo genera assets/nexo/items/<id>.json en su resource pack
    if (String(item.handler).toLowerCase() === 'nexo') return { material: 'custom', amount, itemModel: `nexo:${item.itemId}` };
    return { material: 'custom', amount };
  }
  const tag = String(item.tagValue ?? '');
  const last = (re) => [...tag.matchAll(re)].at(-1)?.[1]; // id y count de nivel superior van al final del SNBT
  // custom_model_data: {floats:[N]} desde 1.21.4, un entero antes; con item_model eligen el modelo del resource pack
  const cmd = tag.match(/"minecraft:custom_model_data":(?:\{[^}]*?floats:\[)?(-?\d+(?:\.\d+)?)/)?.[1];
  return {
    material: last(/\bid:"([^"]+)"/g) ?? 'minecraft:paper',
    amount: Number(last(/\bcount:(\d+)/g) ?? 1),
    skin: skinFromTag(tag),
    glint: /enchantment_glint_override":(?:1b|true)|"minecraft:enchantments":\{(?:levels:)?\{[^}]/.test(tag),
    cmd: cmd == null ? null : Number(cmd),
    itemModel: tag.match(/"minecraft:item_model":"([^"]+)"/)?.[1] ?? null,
  };
}

/** plugins/MMOItems/item/<tipo>.yml -> { 'TIPO:ID': { material, cmd, name } } (base.material, base.custom-model-data, base.name). */
export function readMmoItems(fileName, text) {
  const type = String(fileName).replace(/\.ya?ml$/i, '').toUpperCase();
  const items = {};
  // como Bukkit (SnakeYAML): una clave repetida no rompe el archivo, gana la última
  for (const [id, node] of Object.entries(parse(text, { uniqueKeys: false, logLevel: 'error' }) ?? {})) {
    const base = node?.base;
    if (!base?.material) continue; // config.yml y demás archivos del plugin
    items[`${type}:${String(id).toUpperCase()}`] = {
      material: `minecraft:${String(base.material).toLowerCase()}`,
      cmd: Number(base['custom-model-data'] ?? base.custom_model_data) || null, // MMOItems acepta las dos
      // MMOItems usa el hex de Bukkit con & (&x&R&R&G&G&B&B)
      name: base.name == null ? null : String(base.name).replace(/&x((?:&[0-9a-f]){6})/gi, (_, hex) => `#${hex.replace(/&/g, '')}`),
    };
  }
  return items;
}

/** Reward CUSTOM de MMOItems con su ítem conocido: ícono y, si no tiene Name propio, el nombre del ítem (como en el juego). */
export function withPluginItem(reward, pluginItems) {
  const shown = reward.type === 'ITEM' && !reward.customPreview ? reward.itemsData?.[0] : reward.previewData;
  const known = shown?.type === 'CUSTOM' && String(shown.handler).toLowerCase() === 'mmoitems'
    ? pluginItems?.[String(shown.itemId).toUpperCase()] : null;
  return known ? { ...reward, pluginItem: known, displayName: reward.name ? reward.displayName : known.name ?? reward.displayName } : reward;
}

/** Hash de la skin de una cabeza a partir del componente minecraft:profile del SNBT. */
export function skinFromTag(tag) {
  const encoded = String(tag ?? '').match(/name:"textures",value:"([A-Za-z0-9+/=]+)"/)?.[1];
  if (!encoded) return null;
  try {
    return JSON.parse(atob(encoded)).textures?.SKIN?.url?.split('/').pop() ?? null;
  } catch {
    return null;
  }
}

export const prettyMaterial = (material) => String(material).replace(/^minecraft:/i, '').toLowerCase()
  .split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// ponytail: íconos aproximados (color de tinte / glifo); sin texturas de Minecraft, que no se pueden redistribuir
const DYES = {
  white: '#f9fffe', orange: '#f9801d', magenta: '#c74ebd', light_blue: '#3ab3da', yellow: '#fed83d', lime: '#80c71f',
  pink: '#f38baa', gray: '#474f52', light_gray: '#9d9d97', cyan: '#169c9c', purple: '#8932b8', blue: '#3c44aa',
  brown: '#835432', green: '#5e7c16', red: '#b02e26', black: '#1d1d21',
};
const GLYPHS = {
  arrow: ['➜', '#f0f0f0'], spectral_arrow: ['➜', '#f8e45c'], iron_door: ['▯', '#d8d8d8'], oak_door: ['▯', '#a0763c'],
  barrier: ['⊘', '#e53935'], player_head: ['☻', '#c8a27c'], skeleton_skull: ['☠', '#e0e0e0'], paper: ['▤', '#f5f5f5'],
  book: ['▥', '#8d5a2b'], writable_book: ['▥', '#8d5a2b'], enchanted_book: ['▥', '#b56cff'], chest: ['▣', '#b5832f'],
  ender_chest: ['▣', '#1f6b5b'], barrel: ['▣', '#8a6a3a'], nether_star: ['✦', '#fffbe6'], clock: ['◷', '#f2c94c'],
  compass: ['◎', '#bdbdbd'], emerald: ['◆', '#2ecc71'], diamond: ['◆', '#5ce1e6'], amethyst_shard: ['◆', '#b07fe0'],
  gold_ingot: ['▰', '#f5c542'], iron_ingot: ['▰', '#e0e0e0'], netherite_ingot: ['▰', '#6b5f63'], gold_nugget: ['•', '#f5c542'],
  sunflower: ['✿', '#f7d51d'], poppy: ['✿', '#e53935'], tripwire_hook: ['⚷', '#c9b27c'], trial_key: ['⚷', '#9b7dff'],
  ominous_trial_key: ['⚷', '#5ad1c4'], experience_bottle: ['⚗', '#9be15d'], potion: ['⚗', '#e66fd2'],
  command_block: ['▣', '#c7883e'], golden_apple: ['●', '#f5c542'], enchanted_golden_apple: ['●', '#f5c542'],
  custom: ['✦', '#c084fc'],
};

export function itemVisual(material) {
  const id = String(material ?? '').toLowerCase().replace(/^minecraft:/, '');
  const pane = id.match(/^(.+?)_stained_glass(?:_pane)?$/);
  if (pane && DYES[pane[1]]) return { pane: true, color: DYES[pane[1]] };
  if (id === 'glass_pane' || id === 'glass') return { pane: true, color: '#cfe8ee' };
  if (GLYPHS[id]) return { glyph: GLYPHS[id][0], color: GLYPHS[id][1] };
  if (id.endsWith('_sword')) return { glyph: '⚔', color: '#e0e0e0' };
  if (/_(pickaxe|axe|shovel|hoe)$/.test(id)) return { glyph: '⛏', color: '#e0e0e0' };
  if (/_(helmet|chestplate|leggings|boots)$/.test(id)) return { glyph: '⛨', color: '#e0e0e0' };
  return { label: id.split('_').map((w) => w[0] ?? '').join('').slice(0, 3).toUpperCase() || '?', color: '#f0f0f0' };
}

export const COMMON_MATERIALS = [
  ...Object.keys(DYES).map((dye) => `minecraft:${dye}_stained_glass_pane`),
  ...['glass_pane', 'arrow', 'iron_door', 'barrier', 'player_head', 'paper', 'book', 'chest', 'ender_chest', 'nether_star',
    'clock', 'compass', 'emerald', 'diamond', 'gold_ingot', 'tripwire_hook', 'trial_key', 'sunflower', 'experience_bottle']
    .map((m) => `minecraft:${m}`),
];

export function previewIssues(preview, { size }, rewardCount) {
  const issues = [];
  const outside = (slots) => slots.filter((s) => s < 0 || s >= size);
  const badReward = outside(preview.reward.slots);
  if (badReward.length) issues.push(`Slots de rewards fuera del menú (${size} slots): ${badReward.join(', ')}.`);
  for (const item of preview.content) {
    const bad = outside(item.slots);
    if (bad.length) issues.push(`"${item.id}": slots fuera del menú: ${bad.join(', ')}.`);
    if (!ITEM_TYPES.includes(item.type)) issues.push(`"${item.id}": acción "${item.type}" desconocida.`);
  }
  const perPage = preview.reward.slots.length - badReward.length;
  if (perPage === 0) issues.push('No hay slots para las rewards: el menú no muestra ninguna.');
  else if (rewardCount > perPage && !preview.content.some((c) => c.type === 'page_next')) {
    issues.push(`La caja tiene ${rewardCount} rewards y entran ${perPage} por página, pero no hay ítem page_next.`);
  }
  return issues;
}

// Lo que genera PreviewMenu la primera vez (defaults de loadConfiguration).
export const NEW_PREVIEW = `Settings:
  MenuType: minecraft:generic_9x5
  Title: <black>%crate_name%</black>
  Auto_Refresh: -1
  PlaceholderAPI:
    Enabled: true
Reward:
  Hide_Unavailable: true
  Slots: 10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34
  Name: '%reward_name%'
  Lore:
    Default:
    - '%no_permission%'
    - '%empty-if-above%'
    - '<dark_gray>»</dark_gray><gray> Rarity: <white>%reward_rarity_name%</white> → <green>%reward_roll_chance%%</green></gray>'
    - '%limits%'
    - '%empty-if-below%'
    - '%reward_description%'
    No_Permission:
    - <gray><red>✘</red> You don't have access to this reward.</gray>
    LimitInfo:
    - '<dark_gray>»</dark_gray><gray> Rolls Available: </gray><yellow>%amount%</yellow>'
Content:
  black_stained_glass_pane:
    Priority: 0
    Item:
      Material: minecraft:black_stained_glass_pane
      Lore: []
      Hide_Tooltip: true
    Slots: 1,2,3,5,6,7,9,18,27,17,26,35,37,38,39,40,41,42,43
    Type: 'null'
  gray_stained_glass_pane:
    Priority: 0
    Item:
      Material: minecraft:gray_stained_glass_pane
      Lore: []
      Hide_Tooltip: true
    Slots: 0,4,8,36,44
    Type: 'null'
  milestones:
    Priority: 10
    Item:
      Material: minecraft:player_head
      Display_Name: <gold><b>Milestones</b></gold>
      Lore: []
      SkinURL: 1daf09284530ce92ed2df2a62e1b05a11f1871f85ae559042844206d66c0b5b0
    Slots: '4'
    Type: milestones
  close:
    Priority: 10
    Item:
      Material: minecraft:iron_door
      Display_Name: <red><b>Close</b></red>
      Lore: []
    Slots: '40'
    Type: close
  page_next:
    Priority: 10
    Item:
      Material: minecraft:arrow
      Display_Name: <white><b><u>Next Page</u> →</b></white>
      Lore: []
    Slots: '26'
    Type: page_next
  page_previous:
    Priority: 10
    Item:
      Material: minecraft:arrow
      Display_Name: <white><b>← <u>Previous Page</u></b></white>
      Lore: []
    Slots: '18'
    Type: page_previous
`;
