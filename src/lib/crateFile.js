// crateFile.js
// Wrapper sobre la librería `yaml` (Eemeli Meurman) en modo "documento CST",
// que preserva comentarios, orden de claves, estilo de comillas e indentación
// del archivo original. Cualquier edición se hace vía set/delete sobre el
// Document, y solo las líneas realmente tocadas cambian al reserializar.
//
// Esto es lo que permite "edición quirúrgica": subís un pascuas2026.yml,
// cambiás el Weight de un reward en la UI, y el diff en git muestra
// una sola línea modificada, no el archivo entero reformateado.

import { parseDocument, Scalar, YAMLMap, YAMLSeq } from 'yaml';

/**
 * Carga un archivo de crate ExcellentCrates y devuelve:
 * - doc: el Document crudo (para reserializar preservando formato)
 * - model: una representación plana y amigable para la UI
 */
export function loadCrateFile(text) {
  const doc = parseDocument(text, { keepSourceTokens: true });

  if (doc.errors.length > 0) {
    throw new CrateParseError(doc.errors);
  }

  const model = buildModel(doc);
  return { doc, model, warnings: doc.warnings };
}

export class CrateParseError extends Error {
  constructor(yamlErrors) {
    super(`Error al parsear YAML: ${yamlErrors.map((e) => e.message).join('; ')}`);
    this.yamlErrors = yamlErrors;
  }
}

/**
 * Construye un modelo plano legible desde el Document YAML.
 * No modifica el doc; solo lee. Cubre TODAS las secciones que usa
 * ExcellentCrates en un config.yml de crate real: metadata de item,
 * preview, animación, key, block (con hologram/effect/pushback),
 * milestones, y la lista completa de rewards con todos sus subcampos.
 */
function buildModel(doc) {
  const root = doc.contents;

  const model = {
    name: getScalar(root, 'Name'),
    description: getSeqOfStrings(root, 'Description'),
    itemProvider: buildItemProviderModel(root, ['ItemProvider']),
    itemStackable: getScalar(root, 'ItemStackable'),
    permissionRequired: getScalar(root, 'Permission_Required'),
    preview: {
      enabled: getScalar(root, ['Preview', 'Enabled']),
      id: getScalar(root, ['Preview', 'Id']),
    },
    animation: {
      enabled: getScalar(root, ['Animation', 'Enabled']),
      id: getScalar(root, ['Animation', 'Id']),
    },
    opening: {
      cooldown: getScalar(root, ['Opening', 'Cooldown']),
    },
    key: {
      required: getScalar(root, ['Key', 'Required']),
      ids: getSeqOfStrings(root, ['Key', 'Ids']),
    },
    block: {
      positions: getSeqOfStrings(root, ['Block', 'Positions']),
      pushbackEnabled: getScalar(root, ['Block', 'Pushback', 'Enabled']),
      hologramEnabled: getScalar(root, ['Block', 'Hologram', 'Enabled']),
      hologramTemplate: getScalar(root, ['Block', 'Hologram', 'Template']),
      hologramYOffset: getScalar(root, ['Block', 'Hologram', 'Y_Offset']),
      effectModel: getScalar(root, ['Block', 'Effect', 'Model']),
      effectParticleName: getScalar(root, ['Block', 'Effect', 'Particle', 'Name']),
    },
    milestones: {
      repeatable: getScalar(root, ['Milestones', 'Repeatable']),
    },
    dataVersion: getScalar(root, '_dataver'),
    rewards: buildRewardsModel(root),
  };

  return model;
}

function buildItemProviderModel(root, path) {
  const node = getNode(root, path);
  if (!node) return null;
  return {
    type: getScalar(node, 'Type'),
    handler: getScalar(node, 'Handler'),
    itemId: getScalar(node, 'ItemId'),
    amount: getScalar(node, 'Amount'),
    tagValue: getScalar(node, ['Tag', 'Value']),
    tagDataVersion: getScalar(node, ['Tag', 'DataVersion']),
  };
}

function buildRewardsModel(root) {
  const list = getNode(root, ['Rewards', 'List']);
  if (!list || !(list instanceof YAMLMap)) return [];

  return list.items.map((pair) => {
    const key = String(pair.key.value ?? pair.key);
    const node = pair.value;
    return {
      key,
      type: getScalar(node, 'Type'),
      weight: Number(getScalar(node, 'Weight')) || 0,
      rarity: getScalar(node, 'Rarity'),
      broadcast: getScalar(node, 'Broadcast'),
      placeholderApply: getScalar(node, 'Placeholder_Apply'),
      name: getScalar(node, 'Name'),
      description: getSeqOfStrings(node, 'Description'),
      commands: getSeqOfStrings(node, 'Commands'),
      ignoredForPermissions: getSeqOfStrings(node, 'Ignored_For_Permissions'),
      requiredPermissions: getSeqOfStrings(node, 'Required_Permissions'),
      customPreview: getScalar(node, 'Custom_Preview'),
      winLimit: buildWinLimitModel(node),
      previewData: buildPreviewDataModel(node, ['PreviewData']),
      // ITEM rewards multi-parte (ej: swordespada_pascuas_1) usan ItemsData
      // como mapa de índices -> item, en vez de un único PreviewData.
      itemsData: buildItemsDataModel(node),
      // guardamos el path para poder ubicarlo rápido al editar
      _path: ['Rewards', 'List', key],
    };
  });
}

function buildWinLimitModel(node) {
  const wl = getNode(node, ['Win_Limit']);
  if (!wl) return null;
  const side = (name) => ({
    enabled: getScalar(node, ['Win_Limit', name, 'Enabled']),
    amount: getScalar(node, ['Win_Limit', name, 'Amount']),
    cooldown: getScalar(node, ['Win_Limit', name, 'Cooldown']),
    cooldownStep: getScalar(node, ['Win_Limit', name, 'CooldownStep']),
  });
  return { player: side('Player'), global: side('Global') };
}

function buildPreviewDataModel(node, path) {
  const pd = getNode(node, path);
  if (!pd) return null;
  return {
    type: getScalar(pd, 'Type'),
    handler: getScalar(pd, 'Handler'),
    itemId: getScalar(pd, 'ItemId'),
    amount: getScalar(pd, 'Amount'),
    tagValue: getScalar(pd, ['Tag', 'Value']),
    tagDataVersion: getScalar(pd, ['Tag', 'DataVersion']),
  };
}

function buildItemsDataModel(node) {
  const itemsData = getNode(node, ['ItemsData']);
  if (!itemsData || !(itemsData instanceof YAMLMap)) return null;
  return itemsData.items.map((pair) => ({
    index: String(pair.key.value ?? pair.key),
    type: getScalar(pair.value, 'Type'),
    handler: getScalar(pair.value, 'Handler'),
    itemId: getScalar(pair.value, 'ItemId'),
    amount: getScalar(pair.value, 'Amount'),
  }));
}

// ---- Helpers de lectura segura sobre nodos YAML ----

function getNode(root, path) {
  const p = Array.isArray(path) ? path : [path];
  try {
    return root.getIn(p, true);
  } catch {
    return undefined;
  }
}

function getScalar(root, path) {
  const node = getNode(root, path);
  if (node == null) return undefined;
  if (node instanceof Scalar) return node.value;
  return node;
}

function getSeqOfStrings(root, path) {
  const node = getNode(root, path);
  if (!node || !node.items) return [];
  return node.items.map((it) => (it instanceof Scalar ? it.value : String(it)));
}

// ---- Edición quirúrgica ----

/**
 * Actualiza el Weight de un reward específico dentro del Document,
 * preservando todo lo demás (comentarios, formato, otros rewards).
 */
export function setRewardWeight(doc, rewardKey, newWeight) {
  const path = ['Rewards', 'List', rewardKey, 'Weight'];
  setScalarPreservingStyle(doc, path, newWeight);
}

/**
 * Actualiza cualquier campo escalar de un reward (Name, Rarity, Broadcast, etc.)
 * `field` puede ser un string simple ('Name') o un array de path anidado
 * (['Win_Limit', 'Player', 'Enabled']).
 */
export function setRewardField(doc, rewardKey, field, value) {
  const fieldPath = Array.isArray(field) ? field : [field];
  const path = ['Rewards', 'List', rewardKey, ...fieldPath];
  setScalarPreservingStyle(doc, path, value);
}

/**
 * Actualiza un campo escalar en cualquier parte del documento (no solo rewards),
 * por ejemplo ['Block', 'Hologram', 'Y_Offset'] o ['Name'].
 */
export function setField(doc, path, value) {
  setScalarPreservingStyle(doc, path, value);
}

/**
 * Actualiza una secuencia de strings (Description, Commands, Ids, Positions, etc.)
 * en cualquier path del documento. Reemplaza el contenido preservando el nodo
 * seq si ya existe (para no perder anchors/comments del seq en sí).
 */
export function setStringSeq(doc, path, values) {
  const existing = doc.getIn(path, true);
  if (existing instanceof YAMLSeq) {
    existing.items = values.map((v) => doc.createNode(v));
  } else {
    doc.setIn(path, values);
  }
}

/**
 * Setea un valor escalar en el path dado. Si el nodo ya existe como Scalar,
 * reusa su Scalar (preserva tipo de comillas / estilo) y solo cambia `.value`.
 * Si no existe, lo crea con `doc.setIn`.
 */
function setScalarPreservingStyle(doc, path, value) {
  const existing = doc.getIn(path, true);
  if (existing instanceof Scalar) {
    existing.value = value;
  } else {
    doc.setIn(path, value);
  }
}

/**
 * Agrega un nuevo reward completo al final de Rewards.List, con la
 * estructura COMPLETA que usa ExcellentCrates (incluyendo PreviewData
 * y Win_Limit detallado), para que el ítem se vea y funcione en el
 * juego exactamente igual que un reward creado desde el editor in-game.
 */
export function addReward(doc, key, rewardData) {
  const list = doc.getIn(['Rewards', 'List'], true);
  const newNode = doc.createNode(rewardToPlainObject(rewardData));
  forceBlockStyleDeep(newNode);
  if (list instanceof YAMLMap) {
    // Si "List" empezó vacío en estilo flow (ej. `List: {}` del template de
    // caja nueva), la librería `yaml` conserva ese flow:true al agregar items,
    // lo que produce todo el pool en una sola línea estilo JSON en vez del
    // formato de bloque que realmente escribe el plugin (ver pascuas2026.yml).
    // Forzamos block style apenas deja de estar vacío.
    list.flow = false;
    list.set(key, newNode);
  } else {
    doc.setIn(['Rewards', 'List', key], newNode);
  }
}

/**
 * Recorre recursivamente un nodo recién creado con doc.createNode() y le da
 * el mismo "look" que el propio plugin usa al guardar (ver pascuas2026.yml):
 *  - Mapas/secuencias NO vacíos van en estilo bloque (createNode() a veces
 *    los colapsa a flow, ej. Win_Limit: { Player: {...} }).
 *  - Colecciones VACÍAS se dejan en flow, que es como se renderizan `[]`/`{}`
 *    inline (forzar flow:false en una vacía rompe el indentado: yaml emite
 *    "Ignored_For_Permissions:\n      []" en vez de "Ignored_For_Permissions: []").
 *  - Strings van con comillas simples ('...'), que es lo que usa el plugin
 *    (Name, Description, Commands, etc.) en vez de las dobles que createNode()
 *    elige por default.
 */
function forceBlockStyleDeep(node) {
  if (!node || typeof node !== 'object') return;
  if (node instanceof YAMLMap || node instanceof YAMLSeq) {
    if ((node.items || []).length > 0) {
      node.flow = false;
    }
    for (const item of node.items || []) {
      // Los items de un YAMLMap son { key, value } pairs: solo recorremos el
      // value para decidir comillas/estilo. Las keys (Type, Name, Weight...)
      // siempre van sin comillas en el plugin, así que no las tocamos.
      if (item && typeof item === 'object' && 'value' in item && 'key' in item) {
        forceBlockStyleDeep(item.value);
      } else {
        forceBlockStyleDeep(item);
      }
    }
  }
  // Nota sobre comillas: NO forzamos node.type acá. Los nodos nuevos salen
  // sin type explícito de doc.createNode(), y serializeCrateFile() les pasa
  // defaultStringType: 'QUOTE_SINGLE' al serializar — eso hace que la
  // librería use PLAIN cuando es seguro (Type: COMMAND) y comillas SIMPLES
  // (nunca dobles) cuando hacen falta, igual que el plugin real. Los nodos
  // que ya existían en el archivo original conservan su type de origen y no
  // se ven afectados por esa opción.
}

/**
 * Elimina un reward por su key.
 */
export function deleteReward(doc, key) {
  doc.deleteIn(['Rewards', 'List', key]);
}

/**
 * Renombra la key de un reward preservando su contenido y posición relativa.
 */
export function renameReward(doc, oldKey, newKey) {
  const list = doc.getIn(['Rewards', 'List'], true);
  if (!(list instanceof YAMLMap)) return;
  const idx = list.items.findIndex((p) => String(p.key.value ?? p.key) === oldKey);
  if (idx === -1) return;
  const pair = list.items[idx];
  pair.key = doc.createNode(newKey);
}

/**
 * Estructura COMPLETA de un reward tal como la genera el editor in-game
 * de ExcellentCrates. Incluye PreviewData (para que el ítem se vea bien
 * en el menú de preview de la crate) y Win_Limit con los 4 subcampos
 * reales (Enabled/Amount/Cooldown/CooldownStep) para Player y Global.
 */
function rewardToPlainObject(r) {
  const obj = {
    Type: r.type || 'COMMAND',
  };

  // Solo incluir PreviewData si el reward no es del tipo ITEM con ItemsData propio
  if (r.previewData || r.type !== 'ITEM') {
    obj.PreviewData = previewDataToPlainObject(r.previewData);
  }

  Object.assign(obj, {
    Weight: r.weight ?? 1,
    Rarity: r.rarity || 'common',
    Broadcast: r.broadcast ?? false,
    Placeholder_Apply: r.placeholderApply ?? false,
    Win_Limit: {
      Player: {
        Enabled: r.winLimit?.player?.enabled ?? false,
        Amount: r.winLimit?.player?.amount ?? -1,
        Cooldown: r.winLimit?.player?.cooldown ?? 0,
        CooldownStep: r.winLimit?.player?.cooldownStep ?? 1,
      },
      Global: {
        Enabled: r.winLimit?.global?.enabled ?? false,
        Amount: r.winLimit?.global?.amount ?? -1,
        Cooldown: r.winLimit?.global?.cooldown ?? 0,
        CooldownStep: r.winLimit?.global?.cooldownStep ?? 1,
      },
    },
    Ignored_For_Permissions: r.ignoredForPermissions?.length ? r.ignoredForPermissions : [],
    Required_Permissions: r.requiredPermissions?.length ? r.requiredPermissions : [],
    Name: r.name || '&eNuevo Premio',
    Description: r.description?.length ? r.description : ['&7Descripción'],
    Commands: r.commands?.length ? r.commands : [],
  });

  return obj;
}

function previewDataToPlainObject(pd) {
  if (!pd) {
    // Default: VANILLA paper, editable después desde la UI de PreviewData
    return { Type: 'VANILLA', Tag: { Value: '{count:1,id:"minecraft:paper"}', DataVersion: 4189 } };
  }
  if (pd.type === 'CUSTOM') {
    return {
      Type: 'CUSTOM',
      Handler: pd.handler || 'MMOItems',
      ItemId: pd.itemId || '',
      Amount: pd.amount ?? 1,
    };
  }
  return {
    Type: 'VANILLA',
    Tag: {
      Value: pd.tagValue || '{count:1,id:"minecraft:paper"}',
      DataVersion: pd.tagDataVersion ?? 4189,
    },
  };
}

/**
 * Reserializa el Document completo a texto YAML.
 * Con `keepSourceTokens`, las partes no tocadas mantienen su formato exacto.
 */
export function serializeCrateFile(doc) {
  return doc.toString({
    lineWidth: 0, // no forzar wrap de líneas largas (rompe los lore con colores)
    indentSeq: false, // ExcellentCrates/el editor in-game no indenta "- item" bajo su clave padre
    // Solo afecta nodos SIN type explícito (nodos nuevos creados por
    // addReward/etc). Los strings ya existentes conservan el estilo
    // original del archivo. Para los nuevos: plain cuando es seguro,
    // comillas simples (nunca dobles) cuando hacen falta — así matchea
    // el formato real que escribe el plugin (ver pascuas2026.yml).
    // Afecta solo a nodos SIN type explícito (nodos nuevos de addReward/etc,
    // ver forceBlockStyleDeep). El default de la librería ya prueba PLAIN
    // primero (Type: COMMAND queda sin comillas); cuando plain no alcanza
    // (ej. "&eNuevo Premio", que empieza con indicador reservado), singleQuote
    // hace que use comillas simples en vez de dobles — igual que el plugin.
    singleQuote: true,
  });
}

/**
 * Verifica que un documento sin modificar reserializa byte-a-byte igual
 * al texto original. Útil para detectar archivos con estilos YAML que
 * nuestra config de serialización todavía no replica bien, ANTES de
 * mostrarle al usuario un diff sucio.
 */
export function checkRoundTripFidelity(originalText) {
  const doc = parseDocument(originalText, { keepSourceTokens: true });
  const reserialized = serializeCrateFile(doc);
  return {
    identical: reserialized === originalText,
    original: originalText,
    reserialized,
  };
}
