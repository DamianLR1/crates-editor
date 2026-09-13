// serverContext.js
// La carpeta plugins/ExcellentCrates abierta con <input webkitdirectory>.
// Aporta las rarezas reales del config.yml (sin ellas el % de una crate con
// varias rarezas sale mal), los ids que existen de verdad para avisar de
// referencias rotas, y las crates/llaves para convertir la carpeta entera.

import { parseDocument } from 'yaml';
import { mostCommonRarity } from './weightMath.js';
import { crateFormat, V633 } from './crateFile.js';

export async function readServerFolder(fileList) {
  // webkitRelativePath = "<carpeta elegida>/crates/gold.yml" -> "crates/gold.yml"
  const files = [...fileList].map((file) => ({ file, path: file.webkitRelativePath.split('/').slice(1).join('/') }));
  const idsIn = (re) => [...new Set(files.map(({ path }) => path.match(re)?.[1].toLowerCase()).filter(Boolean))].sort();
  const readAll = async (re) => {
    const out = {};
    for (const { file, path } of files) {
      const name = path.match(re)?.[1];
      if (name) out[name] = await file.text();
    }
    return out;
  };

  const crates = await readAll(/^crates\/([^/]+\.ya?ml)$/i);
  if (Object.keys(crates).length === 0) {
    throw new Error('No encontré crates/*.yml. Elegí la carpeta plugins/ExcellentCrates completa.');
  }
  const keys = await readAll(/^keys\/([^/]+\.ya?ml)$/i);

  const server = {
    crates,
    keys,
    formats: Object.fromEntries(Object.entries(crates).map(([name, text]) => [name, safeFormat(text)])),
    keyIds: Object.keys(keys).map((name) => name.replace(/\.ya?ml$/i, '').toLowerCase()).sort(),
    previewIds: idsIn(/^previews\/([^/]+)\.ya?ml$/i),
    animationIds: idsIn(/^openings\/[^/]+\/([^/]+)\.ya?ml$/i),
    hologramIds: [],
    rarities: null,
  };

  const config = files.find(({ path }) => path === 'config.yml');
  if (config) {
    const cfg = parseDocument(await config.file.text(), { version: '1.1' }).toJS() ?? {};
    server.hologramIds = Object.keys(cfg.Crate?.Holograms?.TemplateList ?? {}).map((id) => id.toLowerCase());
    const rarities = Object.entries(cfg.Rewards?.Rarities ?? {});
    // Rarity.read: Weight, o Chance en configs viejos
    if (rarities.length) {
      server.rarities = Object.fromEntries(
        rarities.map(([id, r]) => [id.toLowerCase(), { name: r?.Name ?? id, weight: Number(r?.Weight ?? r?.Chance ?? 0) }]),
      );
    }
  }
  return server;
}

function safeFormat(text) {
  try {
    return crateFormat(text);
  } catch {
    return null;
  }
}

/** Problemas que el plugin no avisa al editar el YAML a mano. */
export function inspectCrate(model, server, rarityWeights) {
  const issues = [];
  const warn = (msg) => issues.push({ level: 'warning', msg });
  const fallback = mostCommonRarity(rarityWeights);
  const rewardKeys = new Set(model.rewards.map((r) => r.key));

  for (const r of model.rewards) {
    if (!Object.hasOwn(rarityWeights, String(r.rarity ?? '').toLowerCase())) {
      warn(`"${r.key}": la rareza "${r.rarity}" no existe; el plugin usa "${fallback}".`);
    }
    if (r.key !== r.key.toLowerCase()) warn(`"${r.key}": el plugin pasa los IDs a minúsculas al guardar.`);
    if (r.type === 'ITEM' ? r.itemsData.length === 0 : r.commands.length === 0) {
      warn(`"${r.key}": no entrega nada (${r.type === 'ITEM' ? 'sin ItemsData' : 'sin Commands'}).`);
    }
  }
  // Crate.getReward(id) busca en minúsculas contra la key tal cual está en el YAML
  for (const m of model.milestones.list) {
    if (!rewardKeys.has(String(m.rewardId ?? '').toLowerCase())) {
      warn(`La meta de ${m.openings} aperturas apunta a un reward que no existe ("${m.rewardId}").`);
    }
  }

  if (model.format === V633) {
    if (model.key.required && model.key.ids.length === 0) warn('Llave requerida pero no hay IDs de llave.');
  } else {
    if (!model.costOptions.some((o) => o.enabled && o.entries.length)) warn('Sin opciones de costo activas: la caja se abre gratis.');
    for (const o of model.costOptions) {
      for (const e of o.entries) {
        if (e.type !== 'key' && e.type !== 'currency') warn(`Costo "${o.id}": tipo "${e.type}" desconocido.`);
        else if (e.amount <= 0) warn(`Costo "${o.id}": el monto ${e.amount} no es válido (el plugin lo ignora).`);
        else if (e.type === 'key' ? !e.key : !e.currency) warn(`Costo "${o.id}": entrada sin ${e.type === 'key' ? 'llave' : 'moneda'}.`);
      }
    }
  }

  if (server) {
    const missing = (ids, id) => ids.length > 0 && !ids.includes(String(id ?? '').toLowerCase());
    for (const id of model.keyIds) if (id && missing(server.keyIds, id)) warn(`La llave "${id}" no existe en keys/.`);
    if (model.preview.enabled && missing(server.previewIds, model.preview.id)) {
      warn(`El preview "${model.preview.id}" no existe en previews/.`);
    }
    if (model.animation.enabled && missing(server.animationIds, model.animation.id)) {
      warn(`La animación "${model.animation.id}" no existe en openings/ (abre sin animación).`);
    }
    if (model.block.hologramEnabled && missing(server.hologramIds, model.block.hologramTemplate)) {
      warn(`El template de holograma "${model.block.hologramTemplate}" no existe en config.yml.`);
    }
  }
  return issues;
}
