// crateFile.js
// Lectura y edición de crates de ExcellentCrates en los dos formatos del
// server: 6.3.3 (fork) y 6.6.1 (source del mod). El formato se detecta por
// archivo (detectFormat) y cada edición escribe las claves de esa versión.
//
// Edición quirúrgica: cada cambio se aplica sobre un Document de `yaml` y
// después patchText() reescribe SOLO los pares clave/valor que cambiaron; el
// resto se copia byte a byte del texto original. Hace falta porque el plugin
// guarda con SnakeYAML, que parte las líneas largas (NBT, nombres MiniMessage)
// de una forma que la librería `yaml` no replica.
//
// Se parsea como YAML 1.1 (lo que usa SnakeYAML) para que `yes`/`on`/`no` y
// similares se lean igual que en el plugin y se escriban entre comillas.

import { parseDocument, Document, YAMLMap, YAMLSeq, isMap, isNode, isPair, isScalar } from 'yaml';

export const V633 = '6.3.3';
export const V661 = '6.6.1';

const PARSE_OPTIONS = { version: '1.1' };
export const STRINGIFY_OPTIONS = {
  lineWidth: 0, // sin wrap: una línea por valor
  indentSeq: false, // "- item" al nivel de la clave, como SnakeYAML
  singleQuote: true, // strings nuevos: plain si se puede, si no comillas simples
};

// DataVersion de 1.21.4. Sirve también en servers más nuevos: Minecraft
// actualiza el NBT viejo al cargarlo (al revés no).
export const DATA_VERSION = 4189;
const COMMAND_BLOCK = '{count:1,id:"minecraft:command_block"}';
const TRIAL_KEY = '{count:1,id:"minecraft:trial_key"}';

// Limits "sin límite" de 6.6.1 (LimitValues.unlimited)
export const UNLIMITED_LIMITS = { Enabled: false, CooldownType: 'DAILY', GlobalAmount: -1, PlayerAmount: -1, GlobalCooldown: 0, PlayerCooldown: 0 };

export class CrateParseError extends Error {
  constructor(yamlErrors) {
    super(`Error al parsear YAML: ${yamlErrors.map((e) => e.message).join('; ')}`);
    this.yamlErrors = yamlErrors;
  }
}

export function parseYaml(text) {
  const doc = parseDocument(text, PARSE_OPTIONS);
  if (doc.errors.length > 0) throw new CrateParseError(doc.errors);
  return doc;
}

export function loadCrateFile(text) {
  const doc = parseYaml(text);
  return { doc, model: buildModel(doc), warnings: doc.warnings };
}

export function crateFormat(text) {
  return detectFormat(parseYaml(text).contents);
}

/** Aplica `edit(doc)` y devuelve el texto nuevo, tocando solo lo que cambió. */
export function editCrateText(text, edit) {
  const original = parseYaml(text);
  const doc = parseYaml(text);
  edit(doc);
  forceBlockStyleDeep(doc.contents);
  return patchText(text, original, doc);
}

/** true si el archivo sale idéntico sin editar nada. */
export function checkRoundTripFidelity(text) {
  return editCrateText(text, () => {}) === text;
}

// 6.3.3 guarda Key/Opening; 6.6.1 los migra a CostOptions/OpeningCooldown y siempre escribe Post-Open.
function detectFormat(root) {
  if (!isMap(root) || root.has('Key') || root.has('Opening')) return V633;
  return ['OpeningCooldown', 'CostOptions', 'Post-Open'].some((k) => root.has(k)) ? V661 : V633;
}

// ---- Modelo plano para la UI (solo lectura) ----

function buildModel(doc) {
  const root = doc.contents;
  const format = detectFormat(root);
  const costOptions = getPairs(root, ['CostOptions']).map(([id, node]) => ({
    id: String(id),
    enabled: getScalar(node, 'Enabled') ?? true, // Cost.read
    name: getScalar(node, 'Name') ?? String(id),
    entries: getPairs(node, ['Entries']).map(([index, entry]) => ({
      index, // crudo ('0' o 0) para editar por path
      type: String(getScalar(entry, 'Type') ?? '').toLowerCase(),
      key: getScalar(entry, 'Key'),
      currency: getScalar(entry, 'Currency'),
      amount: Number(getScalar(entry, 'Amount')) || 0,
    })),
  }));
  const key = { required: getScalar(root, ['Key', 'Required']), ids: getStrings(root, ['Key', 'Ids']) };
  const effectModel = getScalar(root, ['Block', 'Effect', 'Model']) ?? 'none';

  return {
    format,
    name: getScalar(root, 'Name'),
    description: getStrings(root, 'Description'),
    itemProvider: readItem(getNode(root, ['ItemProvider'])),
    itemStackable: getScalar(root, 'ItemStackable') ?? true, // default del plugin
    permissionRequired: getScalar(root, 'Permission_Required') ?? false,
    preview: { enabled: getScalar(root, ['Preview', 'Enabled']), id: getScalar(root, ['Preview', 'Id']) },
    animation: { enabled: getScalar(root, ['Animation', 'Enabled']), id: getScalar(root, ['Animation', 'Id']) },
    // 6.3.3
    key,
    opening: {
      cooldown: getScalar(root, ['Opening', 'Cooldown']) ?? 0,
      costs: getPairs(root, ['Opening', 'Cost']).map(([id, v]) => ({ id: String(id), amount: Number(isScalar(v) ? v.value : v) || 0 })),
    },
    // 6.6.1
    openingCooldown: {
      enabled: getScalar(root, ['OpeningCooldown', 'Enabled']) ?? false,
      value: getScalar(root, ['OpeningCooldown', 'Value']) ?? 0,
    },
    openingLimit: getScalar(root, ['OpeningLimits', 'Amount']) ?? 1,
    costOptions,
    postOpenCommands: getStrings(root, ['Post-Open', 'Commands']),
    // llaves que abren la caja, en cualquiera de los dos formatos
    keyIds: format === V661
      ? [...new Set(costOptions.flatMap((o) => o.entries.filter((e) => e.type === 'key').map((e) => String(e.key ?? '').toLowerCase())))]
      : key.ids,
    block: {
      positions: getStrings(root, ['Block', 'Positions']),
      pushbackEnabled: getScalar(root, ['Block', 'Pushback', 'Enabled']),
      hologramEnabled: getScalar(root, ['Block', 'Hologram', 'Enabled']),
      hologramTemplate: getScalar(root, ['Block', 'Hologram', 'Template']),
      hologramYOffset: getScalar(root, ['Block', 'Hologram', 'Y_Offset']) ?? 0,
      effectEnabled: getScalar(root, ['Block', 'Effect', 'Enabled']) ?? effectModel !== 'none', // default de 6.6.1
      effectModel,
      effectParticleName: getScalar(root, ['Block', 'Effect', 'Particle', 'Name']),
    },
    milestones: {
      repeatable: getScalar(root, ['Milestones', 'Repeatable']),
      // `key` queda crudo ('0' o 0) para poder editarlo por path
      list: getPairs(root, ['Milestones', 'List']).map(([key, node]) => ({
        key,
        rewardId: getScalar(node, 'Reward_Id'),
        openings: Number(getScalar(node, 'Openings')) || 0,
      })),
    },
    dataVersion: getScalar(root, '_dataver'),
    rewards: buildRewardsModel(root),
  };
}

function buildRewardsModel(root) {
  return getPairs(root, ['Rewards', 'List']).map(([rawKey, node]) => {
    const winLimit = (side) => ({
      enabled: getScalar(node, ['Win_Limit', side, 'Enabled']) ?? false,
      amount: getScalar(node, ['Win_Limit', side, 'Amount']) ?? -1,
      cooldown: getScalar(node, ['Win_Limit', side, 'Cooldown']) ?? 0,
      cooldownStep: getScalar(node, ['Win_Limit', side, 'CooldownStep']) ?? 1,
    });
    const limit = (field, fallback) => getScalar(node, ['Limits', field]) ?? fallback;
    const commands = getStrings(node, 'Commands');
    const r = {
      key: String(rawKey),
      // RewardFactory: sin Type es COMMAND si tiene comandos, si no ITEM
      type: getScalar(node, 'Type') ?? (commands.length ? 'COMMAND' : 'ITEM'),
      weight: Number(getScalar(node, 'Weight')) || 0,
      rarity: getScalar(node, 'Rarity'),
      broadcast: getScalar(node, 'Broadcast') ?? false,
      placeholderApply: getScalar(node, 'Placeholder_Apply') ?? false,
      name: getScalar(node, 'Name'),
      description: getStrings(node, 'Description'),
      commands,
      ignoredForPermissions: getStrings(node, 'Ignored_For_Permissions'),
      requiredPermissions: getStrings(node, 'Required_Permissions'),
      customPreview: getScalar(node, 'Custom_Preview') ?? false,
      // 6.3.3
      winLimit: { player: winLimit('Player'), global: winLimit('Global') },
      // 6.6.1
      limits: {
        enabled: limit('Enabled', false),
        cooldownType: String(limit('CooldownType', 'DAILY')).toUpperCase(),
        globalAmount: limit('GlobalAmount', -1),
        playerAmount: limit('PlayerAmount', -1),
        globalCooldown: limit('GlobalCooldown', 0),
        playerCooldown: limit('PlayerCooldown', 0),
      },
      previewData: readItem(getNode(node, ['PreviewData'])),
      itemsData: getPairs(node, ['ItemsData']).map(([index, item]) => ({ index: String(index), ...readItem(item) })),
    };
    // ITEM muestra su primer ítem salvo Custom_Preview (ItemReward.getPreview)
    const shown = r.type === 'ITEM' && !r.customPreview ? r.itemsData[0] : r.previewData;
    r.displayName = String(r.name || itemLabel(shown) || r.key);
    return r;
  });
}

/**
 * Ítem normalizado de cualquiera de los dos formatos:
 *  6.3.3: Type: VANILLA + Tag {Value, DataVersion} | Type: CUSTOM + Handler/ItemId/Amount
 *  6.6.1: Provider: vanilla + Data {Value, DataVersion} | Provider: <adaptador> + Data {ID, Amount}
 * Si hay Type manda Type (así lo resuelve ItemHelper.read en 6.6.1).
 */
export function readItem(node) {
  if (!isMap(node)) return null;
  const type = getScalar(node, 'Type');
  const provider = getScalar(node, 'Provider');
  if (type == null && provider != null) {
    const adapter = String(provider).toLowerCase();
    return adapter === 'vanilla'
      ? { type: 'VANILLA', tagValue: getScalar(node, ['Data', 'Value']), tagDataVersion: getScalar(node, ['Data', 'DataVersion']) }
      : { type: 'CUSTOM', handler: adapter, itemId: getScalar(node, ['Data', 'ID']), amount: getScalar(node, ['Data', 'Amount']) };
  }
  return {
    type: String(type ?? 'VANILLA').toUpperCase(), // ItemTypes.read: sin Type = VANILLA
    handler: getScalar(node, 'Handler'),
    itemId: getScalar(node, 'ItemId'),
    amount: getScalar(node, 'Amount'),
    tagValue: getScalar(node, ['Tag', 'Value']),
    tagDataVersion: getScalar(node, ['Tag', 'DataVersion']),
  };
}

/** Sección de ítem (PreviewData, ItemsData.N, ItemProvider, Icon) con las claves de cada versión. */
export function itemNode(format, item = {}) {
  const custom = item.type === 'CUSTOM';
  const value = item.tagValue || COMMAND_BLOCK;
  const dataVersion = item.tagDataVersion > 0 ? item.tagDataVersion : DATA_VERSION;
  const amount = Math.max(1, Number(item.amount) || 1);
  if (format === V661) {
    // AdaptedItemStack.write: Provider (nombre del adaptador, minúsculas) + Data
    return custom
      ? { Provider: String(item.handler || 'mmoitems').toLowerCase(), Data: { ID: item.itemId ?? '', Amount: amount } }
      : { Provider: 'vanilla', Data: { Value: value, DataVersion: dataVersion } };
  }
  return custom
    ? { Type: 'CUSTOM', Handler: item.handler || 'MMOItems', ItemId: item.itemId ?? '', Amount: amount }
    : { Type: 'VANILLA', Tag: { Value: value, DataVersion: dataVersion } };
}

/** Opción de costo de 6.6.1 (Cost.write). */
export function costOption(name, entries, enabled = true) {
  return {
    Enabled: enabled,
    Name: name,
    Icon: itemNode(V661, { tagValue: TRIAL_KEY }),
    Entries: Object.fromEntries(entries.map((entry, i) => [String(i), entry])),
  };
}

/**
 * Nombre legible de un ítem normalizado (ver readItem).
 * ponytail: saca MMOITEMS_NAME o el id del SNBT con regex, sin parser SNBT;
 * alcanza para mostrar, no para editar el NBT.
 */
export function itemLabel(item) {
  if (!item) return null;
  if (item.type === 'CUSTOM') return `${item.handler}:${item.itemId}` + (item.amount > 1 ? ` x${item.amount}` : '');
  const tag = String(item.tagValue ?? '');
  const last = (re) => [...tag.matchAll(re)].at(-1)?.[1]; // el id/count de nivel superior van al final
  const name = tag.match(/MMOITEMS_NAME:"((?:[^"\\]|\\.)*)"/)?.[1] ?? last(/\bid:"(?:minecraft:)?([^"]+)"/g);
  if (!name) return null;
  const count = Number(last(/\bcount:(\d+)/g) ?? 1);
  return count > 1 ? `${name} x${count}` : name;
}

function getNode(root, path) {
  try {
    return root?.getIn(path, true);
  } catch {
    return undefined;
  }
}

function getScalar(root, path) {
  const node = getNode(root, [path].flat());
  return isScalar(node) ? node.value : node;
}

function getStrings(root, path) {
  const node = getNode(root, [path].flat());
  return node?.items ? node.items.map((it) => String((isScalar(it) ? it.value : it) ?? '')) : [];
}

function getPairs(root, path) {
  const node = getNode(root, path);
  return isMap(node) ? node.items.map((p) => [keyOf(p), p.value]) : [];
}

const keyOf = (pair) => (isScalar(pair.key) ? pair.key.value : pair.key);

// ---- Edición (se llaman dentro de editCrateText) ----

const rewardPath = (key, ...rest) => ['Rewards', 'List', key, ...rest];

/**
 * En vez de doc.setIn: con YAML 1.1 la librería crea los mapas intermedios
 * que faltan como `!!omap` (SnakeYAML no lo lee como sección normal).
 */
export function setIn(doc, path, value) {
  let node = doc.contents;
  for (const key of path.slice(0, -1)) {
    let next = node.get(key, true);
    if (!isMap(next)) node.set(key, (next = new YAMLMap()));
    node = next;
  }
  node.set(path[path.length - 1], isNode(value) ? value : doc.createNode(value));
}

export function setRewardWeight(doc, key, weight) {
  setField(doc, rewardPath(key, 'Weight'), weight);
}

/** `field` puede ser 'Name' o un path ['Limits', 'Enabled']. */
export function setRewardField(doc, key, field, value) {
  setField(doc, rewardPath(key, ...[field].flat()), value);
}

/** Setea un valor en cualquier path. Si ya había un escalar conserva su estilo (comillas, "10.0"). */
export function setField(doc, path, value) {
  if (Array.isArray(value)) return setStringSeq(doc, path, value);
  const existing = doc.getIn(path, true);
  if (isScalar(existing)) existing.value = value;
  else setIn(doc, path, value);
}

export function setStringSeq(doc, path, values) {
  const seq = doc.createNode(values);
  seq.flow = values.length === 0; // "Key: []" en la misma línea, como SnakeYAML
  setIn(doc, path, seq);
}

/** Reemplaza un sub-árbol entero (ej. PreviewData al pasar de vanilla a custom). */
export function setNode(doc, path, obj) {
  setIn(doc, path, obj);
}

/** Borra un path; si el mapa padre queda vacío también lo borra (el plugin no deja secciones vacías). */
export function deleteField(doc, path) {
  doc.deleteIn(path);
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length > 0 ? doc.getIn(parentPath, true) : null;
  if (isMap(parent) && parent.items.length === 0) doc.deleteIn(parentPath);
}

export function addReward(doc, key, data, format) {
  const node = doc.createNode(rewardToPlainObject(data, format));
  node.get('Weight', true).minFractionDigits = 1; // el plugin guarda doubles: "10.0"
  setIn(doc, rewardPath(key), node);
}

export function deleteReward(doc, key) {
  doc.deleteIn(rewardPath(key));
}

export function renameReward(doc, oldKey, newKey) {
  const list = doc.getIn(['Rewards', 'List'], true);
  const pair = isMap(list) && list.items.find((p) => String(keyOf(p)) === oldKey);
  if (pair) pair.key = doc.createNode(newKey);
}

/** Milestones.List.<n> con n siguiente al mayor (el plugin reindexa 0..N al guardar). */
export function addMilestone(doc, rewardId, openings) {
  const list = doc.getIn(['Milestones', 'List'], true);
  const ids = isMap(list) ? list.items.map((p) => Number(keyOf(p))).filter(Number.isFinite) : [];
  const id = String(ids.length ? Math.max(...ids) + 1 : 0);
  setIn(doc, ['Milestones', 'List', id], { Reward_Id: rewardId, Openings: openings });
}

// Mismo orden de claves que AbstractReward.write + CommandReward.writeAdditional de cada versión.
function rewardToPlainObject(r, format) {
  const head = {
    Type: 'COMMAND',
    PreviewData: itemNode(format),
    Weight: r.weight ?? 10, // AbstractReward: setWeight(10D)
    Rarity: r.rarity || 'common',
    Broadcast: false,
  };
  const tail = {
    Ignored_For_Permissions: [],
    Required_Permissions: [],
    Name: r.name || '&eNuevo Premio',
    Description: r.description ?? [],
    Commands: r.commands ?? [],
  };
  if (format === V661) return { ...head, Limits: UNLIMITED_LIMITS, ...tail };
  const limit = () => ({ Enabled: false, Amount: -1, Cooldown: 0, CooldownStep: 1 });
  return { ...head, Placeholder_Apply: false, Win_Limit: { Player: limit(), Global: limit() }, ...tail };
}

/**
 * Colecciones no vacías en estilo bloque (createNode/setIn a veces generan
 * flow: `Limits: { Enabled: ... }`). Las vacías quedan flow: `Ids: []`.
 */
export function forceBlockStyleDeep(node) {
  if (!(node instanceof YAMLMap || node instanceof YAMLSeq)) return;
  if (node.items.length > 0) node.flow = false;
  for (const item of node.items) forceBlockStyleDeep(isPair(item) ? item.value : item);
}

// ---- Serialización por parches ----

function patchText(src, original, doc) {
  const root = original.contents;
  if (!isBlockMap(root) || !isMap(doc.contents)) return doc.toString(STRINGIFY_OPTIONS);
  return src.slice(0, lineStart(src, root.items[0].key.range[0])) + patchMap(src, root, doc.contents, src.length);
}

/**
 * Emite los pares de `next` reusando el texto de `prev` (el mismo mapa antes
 * de editar) para todo par cuyo valor no cambió. `end` es donde termina el
 * texto de `prev` en `src`. Un par cambiado se re-emite solo él; si es un
 * mapa, se baja un nivel para re-emitir solo los hijos que cambiaron.
 */
function patchMap(src, prev, next, end) {
  const indent = column(src, prev.items[0].key.range[0]);
  let out = '';
  for (const pair of next.items) {
    const i = prev.items.findIndex((p) => keyOf(p) === keyOf(pair));
    if (i === -1) {
      out += freshPair(pair, indent);
      continue;
    }
    const old = prev.items[i];
    const start = lineStart(src, old.key.range[0]);
    const stop = i + 1 < prev.items.length ? lineStart(src, prev.items[i + 1].key.range[0]) : end;
    if (sameValue(old.value, pair.value)) {
      out += src.slice(start, stop);
    } else if (isBlockMap(old.value) && isBlockMap(pair.value)) {
      out += src.slice(start, lineStart(src, old.value.items[0].key.range[0])) + patchMap(src, old.value, pair.value, stop);
    } else {
      out += freshPair(pair, indent);
    }
  }
  return out;
}

function freshPair(pair, indent) {
  const doc = new Document(null, PARSE_OPTIONS);
  doc.contents = new YAMLMap();
  doc.contents.items.push(pair);
  return doc.toString(STRINGIFY_OPTIONS).replace(/^(?=.)/gm, ' '.repeat(indent));
}

const isBlockMap = (node) => isMap(node) && !node.flow && node.items.length > 0;
const toJS = (node) => (typeof node?.toJSON === 'function' ? node.toJSON() : node);
const sameValue = (a, b) => JSON.stringify(toJS(a)) === JSON.stringify(toJS(b));
const lineStart = (src, pos) => src.lastIndexOf('\n', pos - 1) + 1;
const column = (src, pos) => pos - lineStart(src, pos);
