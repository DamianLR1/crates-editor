// specializedConverter.js
import { parseDocument } from 'yaml';

export function parseSpecializedCrate(text) {
  const doc = parseDocument(text, { keepSourceTokens: true, uniqueKeys: false });
  
  // 1. FIX: Ignoramos el error de claves duplicadas de YAML estricto
  const fatalErrors = doc.errors.filter(e => 
    e.code !== 'DUPLICATE_KEY' && !e.message.includes('Map keys must be unique')
  );

  if (fatalErrors.length > 0) {
    throw new Error(`Error al parsear YAML de SpecializedCrates: ${fatalErrors.map((e) => e.message).join('; ')}`);
  }

  const root = doc.contents;
  const warnings = [];

  const crateName = get(root, ['crate', 'name']) ?? get(root, ['reward-display', 'name']) ?? 'Crate Convertida';
  const keyMaterial = get(root, ['key', 'material']);
  const keyName = get(root, ['key', 'name']);
  const keyRequire = get(root, ['key', 'require']) ?? true;
  const hologramLines = getSeq(root, ['hologram', 'lines']);
  const hologramEnabled = hologramLines.length > 0;
  const hologramYOffset = get(root, ['hologram', 'reward-hologram-yoffset']) ?? 0;

  const rewardsNode = get(root, ['rewards'], true);
  const rewards = [];

  if (rewardsNode && typeof rewardsNode === 'object') {
    const list = doc.getIn(['rewards'], true);
    if (list?.items) {
      const byKey = new Map();
      const order = [];
      for (const pair of list.items) {
        const key = String(pair.key.value ?? pair.key);
        if (byKey.has(key)) {
          warnings.push(`Reward "${key}" estaba duplicado en el archivo original de SpecializedCrates — se usó la última definición.`);
        } else {
          order.push(key);
        }
        byKey.set(key, pair.value);
      }
      for (const key of order) {
        const converted = convertSingleReward(doc, byKey.get(key), key, warnings);
        if (converted) rewards.push(converted);
      }
    }
  }

  const seenSlugs = new Map();
  for (const r of rewards) {
    if (!seenSlugs.has(r.key)) {
      seenSlugs.set(r.key, 1);
      continue;
    }
    const n = seenSlugs.get(r.key) + 1;
    seenSlugs.set(r.key, n);
    const original = r.key;
    r.key = `${original}_${n}`;
    warnings.push(`Reward "${original}" colisionaba con otro tras normalizar el nombre — se renombró a "${r.key}".`);
  }

  const totalChance = round(rewards.reduce((acc, r) => acc + r.weight, 0), 4);

  return {
    sourcePlugin: 'SpecializedCrates',
    crateName,
    keyMaterial,
    keyName,
    keyRequire,
    hologramEnabled,
    hologramLines,
    hologramYOffset,
    rewards,
    suggestedTargetTotal: totalChance,
    warnings,
  };
}

function convertSingleReward(doc, node, key, warnings) {
  const chance = num(get(node, ['chance']), null);
  if (chance == null) {
    warnings.push(`Reward "${key}" no tiene campo "chance" — se omitió de la conversión.`);
    return null;
  }

  const commands = getSeq(node, ['commands']).map((c) => normalizeCommand(c));
  const displayItem = get(node, ['display-item']);
  const name = get(displayItem, ['name']) ?? key;
  const lore = getSeq(displayItem, ['lore']);
  const material = get(displayItem, ['material']) ?? 'PAPER';
  const amount = num(get(displayItem, ['amount']), 1);
  const nbtTags = get(displayItem, ['nbt-tags']);
  const customModelData = get(displayItem, ['custom-model-data']);

  const hasAutoProbabilityLine = lore.some((l) => /Probabilidad/i.test(l));
  if (hasAutoProbabilityLine) {
    warnings.push(`Reward "${key}": la lore incluye una línea de "Probabilidad" auto-generada — revisala manualmente.`);
  }

  const tagValue = buildVanillaTagValue({ material, amount, nbtTags });

  return {
    key: sanitizeKey(key),
    weight: chance,
    originalChance: chance,
    name,
    description: lore,
    commands,
    previewData: {
      type: 'VANILLA',
      tagValue,
      tagDataVersion: 4189,
    },
    customModelData,
  };
}

function normalizeCommand(cmd) {
  return String(cmd).replaceAll('{name}', '%player_name%');
}

function buildVanillaTagValue({ material, amount, nbtTags }) {
  const id = `minecraft:${String(material).toLowerCase()}`;
  if (nbtTags && typeof nbtTags === 'string' && nbtTags.trim().startsWith('{')) {
    const trimmed = nbtTags.trim();
    const inner = trimmed.slice(1, -1);
    const hasCount = /(^|,)\s*count\s*:/.test(inner);
    const hasId = /(^|,)\s*id\s*:/.test(inner);
    let result = inner;
    if (!hasCount) result += `,count:${amount ?? 1}`;
    if (!hasId) result += `,id:"${id}"`;
    return `{${result}}`;
  }
  return `{count:${amount ?? 1},id:"${id}"}`;
}

// 2. FIX: Reemplazamos "+" por "_plus" para no pisar items
function sanitizeKey(key) {
  let cleaned = String(key).replace(/^'|'$/g, '');
  cleaned = cleaned.replace(/\+/g, '_plus');

  if (/^\d+$/.test(cleaned)) return `reward_${cleaned}`;
  
  const ascii = cleaned.normalize('NFKD').replace(/[^\x20-\x7E]/g, '');
  const slug = ascii.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  
  return slug || `reward_${Math.random().toString(36).slice(2, 8)}`;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round(v, d) {
  const f = 10 ** d;
  return Math.round((v + Number.EPSILON) * f) / f;
}

function get(node, path, raw = false) {
  if (!node) return undefined;
  try {
    const val = node.getIn ? node.getIn(path, raw) : undefined;
    if (val === undefined) return undefined;
    return val?.value !== undefined && !raw ? val.value : val;
  } catch {
    return undefined;
  }
}

function getSeq(node, path) {
  if (!node) return [];
  try {
    const val = node.getIn ? node.getIn(path, true) : undefined;
    if (!val || !val.items) return [];
    return val.items.map((it) => (it?.value !== undefined ? it.value : String(it)));
  } catch {
    return [];
  }
}

export function buildExcellentCratesYaml(parsed, options = {}) {
  const crateId = options.crateId || slugify(parsed.crateName) || 'crate_convertida';

  const rewardsYaml = parsed.rewards.map((r) => rewardBlock(r)).join('\n');

  return `Name: '${escapeSingleQuotes(parsed.crateName)}'
Description: []
ItemStackable: false
Permission_Required: false
Preview:
  Enabled: true
  Id: ${crateId}
Animation:
  Enabled: true
  Id: ${crateId}
Opening:
  Cooldown: 0
Key:
  Required: ${parsed.keyRequire}
  Ids:
  - ${crateId}
Block:
  Positions: []
  Pushback:
    Enabled: false
  Hologram:
    Enabled: ${parsed.hologramEnabled}
    Template: ${crateId}
    Y_Offset: ${parsed.hologramYOffset}
  Effect:
    Model: simple
    Particle:
      Name: EGG_CRACK
Milestones:
  Repeatable: false
Rewards:
  List:
${rewardsYaml}
`;
}

// 3. FIX: Estructura YAML a prueba de balas para comandos vacíos
function rewardBlock(r) {
  // Aseguramos que lore siempre tenga al menos una línea
  const lore = r.description && r.description.length > 0
    ? r.description.map((l) => `      - '${escapeSingleQuotes(l)}'`).join('\n')
    : `      - '&7Sin descripción'`;

  // Si no hay comandos, ExcellentCrates también soporta una lista vacía
  // (igual que SpecializedCrates: "Commands: []"). Importante: el "[]"
  // tiene que ir en la MISMA línea que la key ("Commands: []", flow style).
  // Si el "[]" queda solo en su propia línea sin la key adelante, el
  // parser YAML lo puede interpretar como un implicit map key y tira
  // "Implicit map keys need to be followed by map values".
  const finalCommands = (r.commands && r.commands.length > 0)
    ? r.commands.map((c) => `      - '${escapeSingleQuotes(c)}'`).join('\n')
    : null; // null = sin comandos, se escribe "Commands: []" inline abajo

  return `    ${r.key}:
      Type: COMMAND
      PreviewData:
        Type: VANILLA
        Tag:
          Value: '${escapeSingleQuotes(r.previewData.tagValue)}'
          DataVersion: ${r.previewData.tagDataVersion}
      Weight: ${r.weight}
      Rarity: common
      Broadcast: false
      Placeholder_Apply: false
      Win_Limit:
        Player:
          Enabled: false
          Amount: -1
          Cooldown: 0
          CooldownStep: 1
        Global:
          Enabled: false
          Amount: -1
          Cooldown: 0
          CooldownStep: 1
      Ignored_For_Permissions: []
      Required_Permissions: []
      Name: '${escapeSingleQuotes(r.name)}'
      Description:
${lore}
      Commands:${finalCommands === null ? ' []' : `\n${finalCommands}`}
`;
}

function escapeSingleQuotes(str) {
  return String(str ?? '').replaceAll("'", "''");
}

function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}