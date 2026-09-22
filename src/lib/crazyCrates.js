// crazyCrates.js
// CrazyCrates -> crate de ExcellentCrates 6.3.3 (de ahí, con el conversor, pasa a 6.6.1).
// El YAML viejo de CrazyCrates sortea con Chance/MaxRange, pero desde 4.x el plugin migra eso a
// Weight y sortea por peso como ExcellentCrates. Acá se usa la misma fórmula del plugin
// (MiscUtils.calculateWeight, la que llama su WeightMigrator), así el reparto queda igual.
import { parseDocument } from 'yaml';
import { stripMcCodes } from './mcText.js';

const DATA_VERSION = 4189;
const MAX_RANGE = 100000; // tope que aplica el migrador de CrazyCrates

/** Una crate de CrazyCrates: sección Crate con Prizes. */
export const isCrazyCrate = (text) => /^Crate:/m.test(String(text)) && /^ {2}Prizes:/m.test(String(text));

/** MiscUtils.calculateWeight: (Chance / MaxRange) × 100, redondeado a un decimal. */
export function crazyWeight(chance, maxRange) {
  const range = Math.min(maxRange > 0 ? maxRange : 100, MAX_RANGE);
  return Math.round((chance / range) * 1000) / 10;
}

export function parseCrazyCrate(text) {
  // como Bukkit (SnakeYAML): una clave repetida no rompe el archivo, gana la última
  const doc = parseDocument(String(text), { uniqueKeys: false });
  if (doc.errors.length) throw new Error(`Error al parsear el YAML de CrazyCrates: ${doc.errors[0].message}`);
  const root = doc.toJS()?.Crate;
  if (!root?.Prizes) throw new Error('No parece una crate de CrazyCrates: falta la sección "Crate" con sus "Prizes".');

  const warnings = [];
  // Un id de premio repetido: CrazyCrates carga solo el último, los anteriores nunca salen
  const pairs = doc.getIn(['Crate', 'Prizes'], true)?.items ?? [];
  const idOf = (pair) => String(pair.key?.value ?? pair.key);
  const nameOf = (pair) => plain(String(pair.value?.get?.('DisplayName') ?? idOf(pair)));
  for (const id of new Set(pairs.map(idOf))) {
    const same = pairs.filter((pair) => idOf(pair) === id);
    if (same.length < 2) continue;
    warnings.push(`El premio "${id}" está ${same.length} veces: CrazyCrates carga sólo el último (${nameOf(same.at(-1))}) y la conversión hace lo mismo. `
      + `Nunca salían: ${same.slice(0, -1).map(nameOf).join(', ')}. Si los querés, agregalos con otro id.`);
  }
  const crateCommands = list(root['Prize-Commands']).map(toExcellentCommand);
  const rewards = [];
  const used = new Map();

  for (const [id, prize] of Object.entries(root.Prizes)) {
    if (!prize || typeof prize !== 'object') continue;
    const name = String(prize.DisplayName ?? id);
    const label = `Premio "${id}" (${plain(name)})`;
    const commands = list(prize.Commands).map(toExcellentCommand);
    // Chance 10 y MaxRange 100 son los valores por defecto del migrador cuando la clave no está
    const weight = crazyWeight(num(prize.Chance, 10), num(prize.MaxRange, 100));

    if (list(prize.Messages).some((m) => String(m).trim())) {
      warnings.push(`${label}: los Messages no se convirtieron; en ExcellentCrates los mensajes van como comandos o con Broadcast.`);
    }
    if (prize.Items) warnings.push(`${label}: la sección Items no se convirtió, el premio quedó solo con sus comandos.`);
    if (String(prize.DisplayNbt ?? '').trim()) warnings.push(`${label}: DisplayNbt no se convirtió; el preview quedó con el ítem plano.`);
    if (prize.Tiers) warnings.push(`${label}: los Tiers (cajas Cosmic/Casino) no existen en ExcellentCrates.`);
    if (!commands.length && !crateCommands.length) warnings.push(`${label}: no tiene comandos, así que no entrega nada.`);

    rewards.push({
      key: uniqueKey(plain(name), id, used),
      weight,
      originalChance: num(prize.Chance, 10),
      name,
      description: list(prize.Lore ?? prize.DisplayLore).map((l) => String(l)),
      commands: commands.length ? commands : crateCommands, // CrazyCrates cae en Prize-Commands si el premio no trae
      previewData: { type: 'VANILLA', tagValue: tagValueOf(prize), tagDataVersion: DATA_VERSION },
    });
  }
  if (!rewards.length) throw new Error('La crate de CrazyCrates no tiene premios en "Prizes".');

  const key = root.PhysicalKey;
  if (key) warnings.push(`La llave (${plain(String(key.Name ?? ''))} · ${String(key.Item ?? 'TRIPWIRE_HOOK')}) no se convierte sola: creá su archivo en keys/ y ponela en Key.Ids.`);
  if (root.CrateType) warnings.push(`El tipo de caja "${root.CrateType}" no tiene equivalente: ExcellentCrates usa sus propias animaciones (Animation.Id).`);
  if (root['opening-command']?.toggle === true) warnings.push('Los comandos al abrir (opening-command) no existen en 6.3.3; en 6.6.1 serían Post-Open.Commands.');
  if (root.Preview?.Toggle === false) warnings.push('La preview estaba apagada en CrazyCrates; en la crate convertida queda encendida.');
  if (root.Tiers) warnings.push('Los Tiers (Cosmic/Casino) no se convirtieron: ExcellentCrates sortea por rareza.');

  return {
    sourcePlugin: 'CrazyCrates',
    crateName: String(root.CrateName ?? root.Name ?? 'Crate convertida'),
    description: list(root.Lore).map((l) => String(l)),
    itemMaterial: material(root.Item ?? 'chest'),
    keyMaterial: key?.Item ?? null,
    keyName: key?.Name ?? null,
    keyRequire: num(root.RequiredKeys, 0) > 0,
    hologramEnabled: root.Hologram?.Toggle === true,
    hologramLines: list(root.Hologram?.Message).map((l) => String(l)),
    hologramYOffset: num(root.Hologram?.Height, 0),
    rewards,
    suggestedTargetTotal: Math.round(rewards.reduce((acc, r) => acc + r.weight, 0) * 10) / 10,
    warnings,
  };
}

/** Preview del premio: DisplayItem + DisplayAmount, con model data, item model y brillo si los trae. */
function tagValueOf(prize) {
  const components = [];
  const cmd = num(prize.Settings?.['Custom-Model-Data'], null);
  if (cmd != null) components.push(`"minecraft:custom_model_data":{floats:[${cmd.toFixed(1)}f]}`);
  const model = prize.Settings?.Model;
  if (model?.Id) components.push(`"minecraft:item_model":"${model.Namespace || 'minecraft'}:${model.Id}"`);
  if (prize.Glowing === true) components.push('"minecraft:enchantment_glint_override":1b');
  const amount = Math.max(1, Math.trunc(num(prize.DisplayAmount, 1)));
  const id = material(prize.DisplayItem ?? 'red_terracotta'); // el default del propio plugin
  return `{${components.length ? `components:{${components.join(',')}},` : ''}count:${amount},id:"minecraft:${id}"}`;
}

const toExcellentCommand = (cmd) => String(cmd).replaceAll('%player%', '%player_name%');
const material = (value) => String(value).toLowerCase().replace(/^minecraft:/, '').trim();
const plain = (value) => stripMcCodes(String(value)).trim();
const list = (value) => (Array.isArray(value) ? value : []);
const num = (value, fallback) => (value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback);

function uniqueKey(name, id, used) {
  const base = slug(name) || `premio_${slug(String(id)) || used.size + 1}`;
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}_${n}`;
}

const slug = (value) => String(value)
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9_]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40)
  .replace(/_+$/, '');
