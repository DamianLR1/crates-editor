// crateFile.js
// Lectura y edición de crates de ExcellentCrates con el formato que escribe el
// fork 6.3.3 del server (auditado contra Crate.java, AbstractReward.java,
// CommandReward.java, ItemReward.java y LimitValues.java).
//
// Edición quirúrgica: cada cambio se aplica sobre un Document de `yaml` y
// después patchText() reescribe SOLO los pares clave/valor que cambiaron; el
// resto se copia byte a byte del texto original. Hace falta porque el plugin
// guarda con SnakeYAML, que parte las líneas largas (NBT, nombres MiniMessage)
// de una forma que la librería `yaml` no replica: reserializar el archivo
// entero cambiaba cientos de líneas aunque los valores fueran idénticos.
//
// Se parsea como YAML 1.1 (lo que usa SnakeYAML) para que `yes`/`on`/`no` y
// similares se lean igual que en el plugin y se escriban entre comillas.

import { parseDocument, Document, YAMLMap, YAMLSeq, isMap, isNode, isPair, isScalar } from 'yaml';

const PARSE_OPTIONS = { version: '1.1' };
const STRINGIFY_OPTIONS = {
  lineWidth: 0, // sin wrap: una línea por valor
  indentSeq: false, // "- item" al nivel de la clave, como SnakeYAML
  singleQuote: true, // strings nuevos: plain si se puede, si no comillas simples
};

// DataVersion de 1.21.4, la que escribe el plugin del server en los Tag.
export const DATA_VERSION = 4189;

export class CrateParseError extends Error {
  constructor(yamlErrors) {
    super(`Error al parsear YAML: ${yamlErrors.map((e) => e.message).join('; ')}`);
    this.yamlErrors = yamlErrors;
  }
}

function parse(text) {
  const doc = parseDocument(text, PARSE_OPTIONS);
  if (doc.errors.length > 0) throw new CrateParseError(doc.errors);
  return doc;
}

export function loadCrateFile(text) {
  const doc = parse(text);
  return { doc, model: buildModel(doc), warnings: doc.warnings };
}

/** Aplica `edit(doc)` y devuelve el texto nuevo, tocando solo lo que cambió. */
export function editCrateText(text, edit) {
  const original = parse(text);
  const doc = parse(text);
  edit(doc);
  forceBlockStyleDeep(doc.contents);
  return patchText(text, original, doc);
}

/** true si el archivo sale idéntico sin editar nada. */
export function checkRoundTripFidelity(text) {
  return editCrateText(text, () => {}) === text;
}

// ---- Modelo plano para la UI (solo lectura) ----

function buildModel(doc) {
  const root = doc.contents;
  return {
    name: getScalar(root, 'Name'),
    description: getStrings(root, 'Description'),
    itemProvider: buildItemModel(getNode(root, ['ItemProvider'])),
    itemStackable: getScalar(root, 'ItemStackable') ?? true, // default del plugin
    permissionRequired: getScalar(root, 'Permission_Required') ?? false,
    preview: { enabled: getScalar(root, ['Preview', 'Enabled']), id: getScalar(root, ['Preview', 'Id']) },
    animation: { enabled: getScalar(root, ['Animation', 'Enabled']), id: getScalar(root, ['Animation', 'Id']) },
    opening: {
      cooldown: getScalar(root, ['Opening', 'Cooldown']) ?? 0,
      // Opening.Cost.<moneda>: monto (EconomyBridge)
      costs: getPairs(root, ['Opening', 'Cost']).map(([id, v]) => ({ id: String(id), amount: Number(isScalar(v) ? v.value : v) || 0 })),
    },
    key: { required: getScalar(root, ['Key', 'Required']), ids: getStrings(root, ['Key', 'Ids']) },
    block: {
      positions: getStrings(root, ['Block', 'Positions']),
      pushbackEnabled: getScalar(root, ['Block', 'Pushback', 'Enabled']),
      hologramEnabled: getScalar(root, ['Block', 'Hologram', 'Enabled']),
      hologramTemplate: getScalar(root, ['Block', 'Hologram', 'Template']),
      hologramYOffset: getScalar(root, ['Block', 'Hologram', 'Y_Offset']) ?? 0,
      effectModel: getScalar(root, ['Block', 'Effect', 'Model']) ?? 'none',
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
    const limit = (side) => ({
      enabled: getScalar(node, ['Win_Limit', side, 'Enabled']) ?? false,
      amount: getScalar(node, ['Win_Limit', side, 'Amount']) ?? -1,
      cooldown: getScalar(node, ['Win_Limit', side, 'Cooldown']) ?? 0,
      cooldownStep: getScalar(node, ['Win_Limit', side, 'CooldownStep']) ?? 1,
    });
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
      winLimit: { player: limit('Player'), global: limit('Global') },
      previewData: buildItemModel(getNode(node, ['PreviewData'])),
      itemsData: getPairs(node, ['ItemsData']).map(([index, item]) => ({ index: String(index), ...buildItemModel(item) })),
    };
    // ITEM muestra su primer ítem salvo Custom_Preview (ItemReward.getPreview)
    const shown = r.type === 'ITEM' && !r.customPreview ? r.itemsData[0] : r.previewData;
    r.displayName = String(r.name || itemLabel(shown) || r.key);
    return r;
  });
}

function buildItemModel(node) {
  if (!isMap(node)) return null;
  return {
    type: getScalar(node, 'Type') ?? 'VANILLA', // ItemTypes.read: sin Type = VANILLA
    handler: getScalar(node, 'Handler'),
    itemId: getScalar(node, 'ItemId'),
    amount: getScalar(node, 'Amount'),
    tagValue: getScalar(node, ['Tag', 'Value']),
    tagDataVersion: getScalar(node, ['Tag', 'DataVersion']),
  };
}

/**
 * Nombre legible de un ítem (PreviewData / ItemsData / ItemProvider).
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

// En vez de doc.setIn: con YAML 1.1 la librería crea los mapas intermedios
// que faltan como `!!omap` (SnakeYAML no lo lee como sección normal).
function setIn(doc, path, value) {
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

/** `field` puede ser 'Name' o un path ['Win_Limit', 'Player', 'Enabled']. */
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

/** Reemplaza un sub-árbol entero (ej. PreviewData al pasar de VANILLA a CUSTOM). */
export function setNode(doc, path, obj) {
  setIn(doc, path, obj);
}

/** Borra un path; si el mapa padre queda vacío también lo borra (el plugin no deja `Cost: {}`). */
export function deleteField(doc, path) {
  doc.deleteIn(path);
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length > 0 ? doc.getIn(parentPath, true) : null;
  if (isMap(parent) && parent.items.length === 0) doc.deleteIn(parentPath);
}

export function addReward(doc, key, data) {
  const node = doc.createNode(rewardToPlainObject(data));
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

/** PreviewData por defecto: el de CommandReward es un command_block vanilla. */
export function defaultPreviewData(type) {
  return type === 'CUSTOM'
    ? { Type: 'CUSTOM', Handler: 'MMOItems', ItemId: '', Amount: 1 }
    : { Type: 'VANILLA', Tag: { Value: '{count:1,id:"minecraft:command_block"}', DataVersion: DATA_VERSION } };
}

// Mismo orden de claves que AbstractReward.write + CommandReward.writeAdditional.
function rewardToPlainObject(r) {
  const limit = () => ({ Enabled: false, Amount: -1, Cooldown: 0, CooldownStep: 1 });
  return {
    Type: 'COMMAND',
    PreviewData: defaultPreviewData('VANILLA'),
    Weight: r.weight ?? 10, // AbstractReward: setWeight(10D)
    Rarity: r.rarity || 'common',
    Broadcast: false,
    Placeholder_Apply: false,
    Win_Limit: { Player: limit(), Global: limit() },
    Ignored_For_Permissions: [],
    Required_Permissions: [],
    Name: r.name || '&eNuevo Premio',
    Description: r.description ?? [],
    Commands: r.commands ?? [],
  };
}

/**
 * Colecciones no vacías en estilo bloque (createNode/setIn a veces generan
 * flow: `Win_Limit: { Player: ... }`). Las vacías quedan flow: `Ids: []`.
 */
function forceBlockStyleDeep(node) {
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
