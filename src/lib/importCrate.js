// importCrate.js
// CrazyCrates o SpecializedCrates -> ExcellentCrates en la versión elegida: 5.3.3 (servers 1.20.4),
// 6.3.3 o 6.6.1 (esta pasando por 6.3.3 con el conversor). Devuelve la crate y su llave.
import { stringify } from 'yaml';
import { STRINGIFY_OPTIONS, DATA_VERSION } from './crateFile.js';
import { convertCrate, convertKey } from './convert661.js';
import { parseCrazyCrate, isCrazyCrate } from './crazyCrates.js';
import { parseSpecializedCrate, buildExcellentCratesYaml } from './specializedConverter.js';
import { buildCrate533, buildKey533, V533 } from './ecrates533.js';

export const TARGETS = [['5.3.3', '5.3.3 · server 1.20.4'], ['6.3.3', '6.3.3'], ['6.6.1', '6.6.1']];

/**
 * -> { source, id, target, rewards, total, warnings, files: [{ dir, name, text }], editable }
 * editable: el texto de la crate cuando el editor la puede abrir (6.x); si no, null.
 */
export function importCrate(fileName, text, target) {
  const parsed = isCrazyCrate(text) ? parseCrazyCrate(text) : parseSpecializedCrate(text);
  const id = idOf(fileName);
  const warnings = [...parsed.warnings];
  let crate;
  let key;
  if (target === V533) {
    crate = buildCrate533(parsed, id);
    key = buildKey533(parsed);
  } else {
    crate = buildExcellentCratesYaml(parsed, { crateId: id });
    key = key633(parsed);
    if (target === '6.6.1') {
      const converted = convertCrate(crate);
      crate = converted.text;
      warnings.push(...converted.warnings);
      key = convertKey(key).text;
    }
  }
  return {
    source: parsed.sourcePlugin,
    id,
    target,
    rewards: parsed.rewards.length,
    total: parsed.suggestedTargetTotal,
    warnings,
    files: [{ dir: 'crates', name: `${id}.yml`, text: crate }, { dir: 'keys', name: `${id}.yml`, text: key }],
    editable: target === V533 ? null : crate,
  };
}

/** Llave de 6.3.3 (la crate la busca por su id en Key.Ids). */
const key633 = (parsed) => stringify({
  Name: String(parsed.keyName ?? parsed.crateName),
  Virtual: false,
  ItemData: {
    Type: 'VANILLA',
    Tag: { Value: `{count:1,id:"minecraft:${String(parsed.keyMaterial ?? 'tripwire_hook').toLowerCase()}"}`, DataVersion: DATA_VERSION },
  },
  ItemStackable: false,
}, STRINGIFY_OPTIONS);

/** El id de ExcellentCrates es el nombre del archivo, en minúsculas. */
const idOf = (fileName) => String(fileName)
  .replace(/\.(crate|ya?ml)$/i, '')
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'crate';
