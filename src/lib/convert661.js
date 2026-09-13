// convert661.js
// Convierte crates y llaves de ExcellentCrates 6.3.3 (fork) al formato 6.6.1.
//
// Hace lo mismo que 6.6.1 al cargar un archivo viejo (Crate.load,
// AbstractReward.load, RewardFactory.read, ItemHelper.read) pero sin los bugs
// de esa migración automática, que cambian cómo se comporta la caja:
//  - Opening.Cooldown: 6.6.1 guarda OpeningCooldown.Value = 0 (lee el campo
//    antes de cargarlo). Acá se conserva el valor.
//  - Key + Opening.Cost: 6.6.1 crea una opción por llave y otra por moneda, todas
//    con Enabled = Key.Required: se podía pagar con plata en vez de la llave, o
//    la caja quedaba gratis. En 6.3.3 había que tener la llave Y pagar, así que
//    acá cada opción de llave lleva también los costos de moneda.
//  - Win_Limit con cooldown -2 (medianoche): 6.6.1 lo pasa a DAILY con valor 0,
//    que es "sin cooldown". Acá queda DAILY con valor 1.
// Un archivo que ya está en 6.6.1 sale igual (la conversión es idempotente).

import { Scalar, isMap, isScalar, isSeq } from 'yaml';
import {
  parseYaml, crateFormat, STRINGIFY_OPTIONS, V633, V661, UNLIMITED_LIMITS,
  readItem, itemNode, costOption, setIn, forceBlockStyleDeep,
} from './crateFile.js';

// Orden en que 6.6.1 escribe las claves (Crate.write, AbstractReward.write, CrateKey.write)
const CRATE_ORDER = ['Name', 'Description', 'ItemProvider', 'ItemStackable', 'Permission_Required', 'Preview', 'Animation',
  'OpeningCooldown', 'OpeningLimits', 'Block', 'Milestones', '_dataver', 'Post-Open', 'Rewards', 'CostOptions'];
const REWARD_ORDER = ['Type', 'PreviewData', 'Weight', 'Rarity', 'Broadcast', 'Limits', 'Ignored_For_Permissions',
  'Required_Permissions', 'Name', 'Description', 'Commands', 'Custom_Preview', 'Placeholder_Apply', 'ItemsData'];
const KEY_ORDER = ['Name', 'Virtual', 'ItemData', 'ItemStackable'];

// ponytail: 6.6.1 usa el ícono de la moneda (EconomyBridge), que acá no se conoce
const GOLD_INGOT = '{count:1,id:"minecraft:gold_ingot"}';

const keyOf = (pair) => (isScalar(pair.key) ? pair.key.value : pair.key);
const scalar = (node) => (isScalar(node) ? node.value : node);

export function convertCrate(text) {
  const doc = parseYaml(text);
  const root = doc.contents;
  if (!isMap(root)) throw new Error('El archivo no es una crate de ExcellentCrates.');
  const warnings = [];
  const wasLegacy = crateFormat(text) === V633;

  convertItem(doc, ['ItemProvider']);

  if (!root.has('OpeningCooldown')) {
    const cooldown = Number(scalar(doc.getIn(['Opening', 'Cooldown'], true))) || 0;
    root.set('OpeningCooldown', doc.createNode({ Enabled: cooldown !== 0, Value: cooldown }));
  }
  if (!root.has('OpeningLimits')) root.set('OpeningLimits', doc.createNode({ Amount: 1 }));
  convertCosts(doc, warnings);
  root.delete('Key');
  root.delete('Opening');

  const effect = doc.getIn(['Block', 'Effect'], true);
  if (isMap(effect) && !effect.has('Enabled')) {
    effect.items.unshift(doc.createPair('Enabled', String(effect.get('Model') ?? 'none').toLowerCase() !== 'none'));
  }
  if (!root.has('_dataver')) root.set('_dataver', 600); // sin esto 6.6.1 hace un backup al cargar
  if (!root.has('Post-Open')) root.set('Post-Open', doc.createNode({ Commands: [] }));

  let placeholderFlag = 0;
  let placeholderNew = 0;
  const list = doc.getIn(['Rewards', 'List'], true);
  for (const pair of isMap(list) ? list.items : []) {
    if (!isMap(pair.value)) continue;
    const reward = pair.value;
    const id = String(keyOf(pair));
    const path = ['Rewards', 'List', keyOf(pair)];
    const commands = reward.get('Commands', true);
    if (!reward.has('Type')) reward.set('Type', isSeq(commands) && commands.items.length ? 'COMMAND' : 'ITEM');
    const type = String(reward.get('Type')).toUpperCase();

    convertItem(doc, [...path, 'PreviewData']);
    const items = reward.get('ItemsData', true);
    for (const item of isMap(items) ? [...items.items] : []) convertItem(doc, [...path, 'ItemsData', keyOf(item)]);

    if (reward.has('Win_Limit')) {
      reward.set('Limits', doc.createNode(convertLimits(reward, id, warnings)));
      reward.delete('Win_Limit');
    } else if (!reward.has('Limits')) {
      reward.set('Limits', doc.createNode(UNLIMITED_LIMITS));
    }

    if (type === 'COMMAND') {
      // 6.6.1: CommandReward siempre procesa PlaceholderAPI y no lee Placeholder_Apply
      const flag = reward.get('Placeholder_Apply') === true;
      if (flag) placeholderFlag++;
      else if (isSeq(commands) && commands.items.some((c) => /%(?!player_name%)[\w.:-]+%/.test(String(scalar(c))))) placeholderNew++;
      reward.delete('Placeholder_Apply');
    } else if (!reward.has('Placeholder_Apply')) {
      reward.set('Placeholder_Apply', false);
    }
    reorder(reward, REWARD_ORDER);
  }
  if (placeholderFlag) {
    warnings.push(`${placeholderFlag} reward(s) COMMAND tenían Placeholder_Apply: en 6.6.1 esa opción no existe para comandos; siempre se procesa PlaceholderAPI.`);
  }
  if (wasLegacy && placeholderNew) {
    warnings.push(`${placeholderNew} reward(s) COMMAND tienen placeholders en los comandos que en 6.3.3 no se procesaban (Placeholder_Apply: false). En 6.6.1 sí se procesan: revisá que sea lo que querés.`);
  }

  forceBlockStyleDeep(root);
  reorder(root, CRATE_ORDER);
  return { text: doc.toString(STRINGIFY_OPTIONS), warnings };
}

export function convertKey(text) {
  const doc = parseYaml(text);
  if (!isMap(doc.contents)) throw new Error('El archivo no es una llave de ExcellentCrates.');
  convertItem(doc, ['ItemData']);
  forceBlockStyleDeep(doc.contents);
  reorder(doc.contents, KEY_ORDER);
  return { text: doc.toString(STRINGIFY_OPTIONS), warnings: [] };
}

/** Type/Tag o Type/Handler -> Provider/Data. Un ítem vacío se borra (6.6.1 pone su ítem "?"). */
function convertItem(doc, path) {
  const item = readItem(doc.getIn(path, true));
  if (!item) return;
  if (item.type === 'VANILLA' && !/\bid:"/.test(String(item.tagValue ?? ''))) {
    doc.deleteIn(path);
    return;
  }
  setIn(doc, path, itemNode(V661, item));
}

/** Key.Required/Key.Ids + Opening.Cost -> CostOptions, conservando "llave Y moneda" de 6.3.3. */
function convertCosts(doc, warnings) {
  const root = doc.contents;
  if (!root.has('Key') && !doc.hasIn(['Opening', 'Cost'])) return;

  const required = scalar(doc.getIn(['Key', 'Required'], true)) === true;
  const idsNode = doc.getIn(['Key', 'Ids'], true);
  const keyIds = [...new Set((isSeq(idsNode) ? idsNode.items : [])
    .map((n) => String(scalar(n) ?? '').trim().toLowerCase()).filter(Boolean))];
  const costNode = doc.getIn(['Opening', 'Cost'], true);
  const costs = (isMap(costNode) ? costNode.items : []).map((p) => [String(keyOf(p)), Number(scalar(p.value)) || 0]);
  // un nodo nuevo por uso: si se repite el mismo nodo, `yaml` escribe anchors (&a1 / *a1)
  const currencies = () => costs.map(([currency, amount]) => ({ Type: 'currency', Currency: currency, Amount: double(amount) }));

  const options = keyIds.map((id) => [
    `key_${id}`,
    costOption(`${id} Key`, [{ Type: 'key', Key: id, Amount: 1 }, ...(required ? currencies() : [])], required),
  ]);
  if (costs.length && !(required && keyIds.length)) {
    const single = costs.length === 1 ? costs[0][0] : null;
    options.push([
      single ? `eco_${single}` : 'eco',
      { ...costOption(single ? `${single} Currency` : 'Currency', currencies()), Icon: itemNode(V661, { tagValue: GOLD_INGOT }) },
    ]);
  }

  if (!required && keyIds.length) {
    warnings.push(`Key.Required estaba en false: las opciones de llave quedan deshabilitadas y la caja se abre ${costs.length ? 'pagando la moneda' : 'gratis'}, como en 6.3.3.`);
  }
  if (required && !keyIds.length) {
    warnings.push(`Key.Required estaba en true sin IDs de llave (en 6.3.3 no se podía abrir). En 6.6.1 queda ${costs.length ? 'con costo de moneda' : 'sin costo'}: revisalo.`);
  }
  // Restos de una corrida previa de 6.6.1: sin entradas el plugin las ignora (Cost.isValid), se descartan
  const existing = doc.getIn(['CostOptions'], true);
  if (isMap(existing)) {
    const empty = existing.items.filter((p) => {
      const entries = isMap(p.value) ? p.value.get('Entries', true) : null;
      return !isMap(entries) || entries.items.length === 0;
    }).map(keyOf);
    empty.forEach((id) => existing.delete(id));
    if (empty.length) warnings.push(`Se descartaron ${empty.length} opción(es) de costo sin entradas (${empty.join(', ')}), restos de una corrida de 6.6.1.`);
    if (existing.items.length) warnings.push('Ya había CostOptions con entradas (restos de una corrida de 6.6.1): se conservaron. Revisá que no queden opciones duplicadas.');
  }
  for (const [id, option] of options) setIn(doc, ['CostOptions', id], option);
  if (isMap(existing) && existing.items.length === 0) root.delete('CostOptions');
}

/**
 * Win_Limit (Player/Global, cada uno con Enabled) -> Limits (un solo Enabled).
 * 6.3.3: cooldown 0 o -1 = nunca se reinicia, -2 = medianoche, >0 = segundos.
 * 6.6.1: cooldown 0 = sin cooldown; DAILY con valor > 0 = próxima medianoche.
 */
function convertLimits(reward, id, warnings) {
  const side = (name) => {
    const node = reward.getIn(['Win_Limit', name], true);
    const read = (key, fallback) => (isMap(node) ? node.get(key) : undefined) ?? fallback;
    return {
      enabled: read('Enabled', false) === true,
      amount: Number(read('Amount', -1)),
      cooldown: Number(read('Cooldown', 0)),
      step: Number(read('CooldownStep', 1)),
    };
  };
  const player = side('Player');
  const global = side('Global');
  const active = [player, global].filter((l) => l.enabled);
  const daily = active.some((l) => l.cooldown === -2);
  const cooldown = (l) => (!l.enabled || l.cooldown === 0 || l.cooldown === -1 ? 0 : daily ? 1 : l.cooldown);

  if (daily && active.some((l) => l.cooldown > 0)) {
    warnings.push(`"${id}": mezclaba cooldown a medianoche y en segundos; 6.6.1 tiene un solo modo, quedó DAILY para los dos.`);
  }
  if (active.some((l) => l.step > 1)) {
    warnings.push(`"${id}": CooldownStep no existe en 6.6.1 y se descartó.`);
  }
  return {
    Enabled: active.length > 0,
    CooldownType: active.length && !daily ? 'CUSTOM' : 'DAILY',
    GlobalAmount: global.enabled ? global.amount : -1,
    PlayerAmount: player.enabled ? player.amount : -1,
    GlobalCooldown: cooldown(global),
    PlayerCooldown: cooldown(player),
  };
}

function double(value) {
  const node = new Scalar(value);
  node.minFractionDigits = 1; // EcoCostEntry guarda un double: "10000.0"
  return node;
}

function reorder(map, order) {
  const rank = (pair) => {
    const i = order.indexOf(String(keyOf(pair)));
    return i === -1 ? order.length : i;
  };
  map.items.sort((a, b) => rank(a) - rank(b)); // estable: las claves desconocidas quedan al final, en su orden
}
