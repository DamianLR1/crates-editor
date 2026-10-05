// ecrates533.js
// ExcellentCrates 5.3.3 (servers 1.20.4, con nightcore 2.6.4): crate y llave a partir de lo que
// leen los importadores (crazyCrates.js, specializedConverter.js).
//
// En 5.3.3 el ítem de preview de cada reward se guarda codificado (nightcore ItemUtil.compress): el
// NBT binario del ItemStack de 1.20.4 ({id, Count, tag}), sin comprimir, escrito como número en
// base 32. El menú de preview muestra el nombre y la lore de ese ítem (%reward_preview_name% y
// %reward_preview_lore%), así que van adentro del NBT como texto JSON de Minecraft.
import { stringify } from 'yaml';
import { STRINGIFY_OPTIONS } from './crateFile.js';
import { parseMcText, parseMcTextWithGradients, VANILLA_COLORS } from './mcText.js';

export const V533 = '5.3.3';

// ---- NBT ----

const TAG = { end: 0, byte: 1, short: 2, int: 3, string: 8, list: 9, compound: 10 };
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/** writeUTF de Java (UTF-8 modificado): cada unidad UTF-16 por separado y el 0 en dos bytes. */
function utf(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 1 && c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return [out.length >> 8, out.length & 0xff, ...out];
}

/** Valores como [tipo, valor]; las listas llevan además el tipo de sus elementos: ['list', tipo, [...]]. */
function payload([type, value, items]) {
  if (type === 'byte') return [value & 0xff];
  if (type === 'short') return [(value >> 8) & 0xff, value & 0xff];
  if (type === 'int') return u32(value);
  if (type === 'string') return utf(value);
  if (type === 'list') return [TAG[value], ...u32(items.length), ...items.flatMap(payload)];
  return [...Object.entries(value).flatMap(([k, v]) => [TAG[v[0]], ...utf(k), ...payload(v)]), TAG.end];
}

/** ItemStack de 1.20.4 codificado como lo lee ExcellentCrates 5.3.3 (Rewards.List.<id>.Preview). */
export function encodeItem({ material, amount = 1, name = null, lore = [], cmd = null, glint = false }) {
  const display = {};
  if (name != null) display.Name = ['string', jsonText(name)];
  if (lore.length) display.Lore = ['list', 'string', lore.map((line) => ['string', jsonText(line)])];
  const tag = {};
  if (Object.keys(display).length) tag.display = ['compound', display];
  if (cmd != null) tag.CustomModelData = ['int', Math.trunc(cmd)];
  if (glint) { // 1.20.4 no tiene enchantment_glint_override: un encantamiento oculto
    tag.Enchantments = ['list', 'compound', [['compound', { id: ['string', 'minecraft:unbreaking'], lvl: ['short', 1] }]]];
    tag.HideFlags = ['int', 1];
  }
  const root = { id: ['string', `minecraft:${material}`], Count: ['byte', Math.min(127, amount)] };
  if (Object.keys(tag).length) root.tag = ['compound', tag];
  const bytes = [TAG.compound, 0, 0, ...payload(['compound', root])]; // compound raíz sin nombre
  return BigInt(`0x${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}`).toString(32);
}

// ---- Texto ----

/** Texto de CrazyCrates (MiniMessage o legacy) -> componente JSON, sin la itálica que el juego pone a nombres y lore. */
export function jsonText(text) {
  const extra = parseMcTextWithGradients(String(text), '#FFFFFF', VANILLA_COLORS).map((r) => ({
    text: r.text,
    color: r.color.toLowerCase(),
    italic: r.italic,
    ...(r.bold && { bold: true }),
    ...(r.underline && { underlined: true }),
    ...(r.strike && { strikethrough: true }),
    ...(r.obf && { obfuscated: true }),
  }));
  return JSON.stringify({ text: '', extra: extra.length ? extra : [{ text: '' }] });
}

/**
 * Texto -> etiquetas que entiende nightcore 2.6.4. No tiene <dark_green>, <bold>, <gold>...: cada tramo
 * va con su color en <#hex> y sus formatos (<b>, <i>, <u>, <st>, <obf>), con <r> entre tramos.
 */
export const toNight26 = (text) => parseMcText(String(text ?? ''), '#FFFFFF', VANILLA_COLORS)
  .map((r, i) => `${i ? '<r>' : ''}<${r.color.toLowerCase()}>${r.bold ? '<b>' : ''}${r.italic ? '<i>' : ''}`
    + `${r.underline ? '<u>' : ''}${r.strike ? '<st>' : ''}${r.obf ? '<obf>' : ''}${r.text}`)
  .join('');

// ---- Archivos ----

const LIMIT = { Enabled: false, Amount: -1, Cooldown: 0, CooldownStep: 1 };

/** crates/<crateId>.yml de 5.3.3 (mismas claves y orden que Crate.write). */
export function buildCrate533(parsed, crateId) {
  const crate = {
    Name: toNight26(parsed.crateName),
    // sin Animation_Config la caja abre al instante (BasicOpening), como QuickCrate
    ...(parsed.animation !== null && { Animation_Config: parsed.animation ?? 'csgo' }),
    Preview_Config: parsed.previewId ?? 'default',
    Permission_Required: false,
    Opening: { Cooldown: 0 },
    Key: { Required: Boolean(parsed.keyRequire), Ids: [crateId] },
    Rewards: { List: Object.fromEntries(parsed.rewards.map((r) => [r.key, rewardOf(r)])) },
    Item: {
      Material: String(parsed.itemMaterial ?? 'chest').toUpperCase(),
      Name: toNight26(parsed.crateName),
      Lore: (parsed.description ?? []).map(toNight26),
    },
    Block: {
      Positions: [],
      Pushback: { Enabled: false },
      Hologram: { Enabled: Boolean(parsed.hologramEnabled), Template: 'default', Y_Offset: Number(parsed.hologramYOffset) || 0 },
      Effect: { Model: 'SIMPLE', Particle: { Name: 'null' } },
    },
    Milestones: { Repeatable: false },
  };
  return stringify(crate, STRINGIFY_OPTIONS);
}

function rewardOf(r) {
  return {
    Name: toNight26(r.name),
    Weight: r.weight,
    Rarity: 'common',
    Broadcast: false,
    Placeholder_Apply: false,
    Win_Limit: { Player: { ...LIMIT }, Global: { ...LIMIT } },
    Preview: encodeItem({ ...r.display, name: r.name, lore: r.description ?? [] }),
    Commands: r.commands,
    Items: [],
    Ignored_For_Permissions: [],
  };
}

/** keys/<id>.yml de 5.3.3: el ítem como Material/Name/Lore (no codificado). */
export function buildKey533(parsed, virtual = false) {
  const name = toNight26(parsed.keyName ?? parsed.crateName);
  return stringify({
    Name: name,
    Virtual: virtual,
    Item: { Material: String(parsed.keyMaterial ?? 'TRIPWIRE_HOOK').toUpperCase(), Name: name, Lore: (parsed.keyLore ?? []).map(toNight26) },
  }, STRINGIFY_OPTIONS);
}
