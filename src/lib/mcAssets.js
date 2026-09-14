// mcAssets.js
// Texturas, modelos y fuente de Minecraft leídos del .jar del cliente del
// usuario (o de resource packs .zip). Son assets de Mojang: no se incluyen en el
// repo ni se publican; se leen en el navegador y se guardan en IndexedDB para no
// pedir el archivo cada vez.

const PREFIX = 'assets/minecraft/';
const KEEP = new RegExp(`^${PREFIX}(${[
  'textures/(item|block|font)/[^/]+\\.png',
  'models/(item|block)/[^/]+\\.json',
  'items/[^/]+\\.json',
  'font/include/(default|space)\\.json',
  'font/unifont[^/]*\\.zip',
  'textures/gui/container/generic_54\\.png',
  'textures/misc/enchanted_glint_item\\.png',
  'textures/entity/player/wide/steve\\.png',
].join('|')})$`);

/**
 * Lector de .zip/.jar mínimo: directorio central + DecompressionStream
 * ('deflate-raw', nativo en navegadores y Node). Devuelve Map nombre -> bytes.
 */
export async function readZip(buffer, keep = () => true) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('El archivo no es un .jar/.zip válido.');

  const names = new TextDecoder();
  const total = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const jobs = [];
  for (let n = 0; n < total && view.getUint32(p, true) === 0x02014b50; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = names.decode(new Uint8Array(buffer, p + 46, nameLength));
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    if (!keep(name) || (method !== 0 && method !== 8)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = new Uint8Array(buffer, start, size);
    jobs.push(method === 0 ? [name, raw.slice()] : inflate(raw).then((data) => [name, data]));
  }
  return new Map(await Promise.all(jobs));
}

async function inflate(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Lee el .jar, resource packs (después: pisan las texturas del jar) y el
 * unifont.zip del juego (.minecraft/assets/objects/..., un .hex en la raíz).
 */
export async function extractAssets(fileList) {
  const files = [...fileList].sort((a, b) => Number(!/\.jar$/i.test(a.name)) - Number(!/\.jar$/i.test(b.name)));
  const merged = new Map();
  for (const file of files) {
    const entries = await readZip(await file.arrayBuffer(), (n) => KEEP.test(n) || /^[^/]+\.hex$/.test(n));
    for (const [name, data] of entries) merged.set(name.startsWith(PREFIX) ? name.slice(PREFIX.length) : `font/${name}`, data);
  }
  // en algunas versiones unifont viene como un .zip adentro del .jar: se guarda ya descomprimido
  for (const [name, data] of merged) {
    if (!name.endsWith('.zip')) continue;
    merged.delete(name);
    const inner = await readZip(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), (n) => n.endsWith('.hex'));
    for (const [hexName, hex] of inner) merged.set(`font/${hexName}`, hex);
  }
  return merged;
}

// ---- Caché en IndexedDB ----

const DB = 'editor-excellentcrates';
const STORE = 'assets';
const KEY = 'minecraft';

function run(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

export async function loadCachedAssets() {
  try {
    const saved = await run('readonly', (store) => store.get(KEY));
    return saved ? createAssets(new Map(Object.entries(saved.files)), saved.label) : null;
  } catch {
    return null; // sin IndexedDB (modo privado, tests): se pide el archivo de nuevo
  }
}

export const saveAssets = (files, label) => run('readwrite', (store) => store.put({ files: Object.fromEntries(files), label }, KEY));
export const clearCachedAssets = () => run('readwrite', (store) => store.delete(KEY));

// ---- Acceso ----

export function createAssets(files, label = '') {
  const urls = new Map();
  const jsons = new Map();
  const items = new Map();
  const decoder = new TextDecoder();

  const url = (path) => {
    if (!files.has(path)) return null;
    if (!urls.has(path)) urls.set(path, URL.createObjectURL(new Blob([files.get(path)], { type: 'image/png' })));
    return urls.get(path);
  };
  const json = (path) => {
    if (!jsons.has(path)) {
      let value = null;
      try { value = files.has(path) ? JSON.parse(decoder.decode(files.get(path))) : null; } catch { /* JSON roto en un pack */ }
      jsons.set(path, value);
    }
    return jsons.get(path);
  };
  const texture = (ref) => url(`textures/${String(ref).replace(/^minecraft:/, '')}.png`);

  return {
    label,
    count: files.size,
    files,
    json,
    texture,
    gui: url('textures/gui/container/generic_54.png'),
    glint: url('textures/misc/enchanted_glint_item.png'),
    steve: url('textures/entity/player/wide/steve.png'),
    item(material) {
      const id = String(material ?? '').toLowerCase().replace(/^minecraft:/, '');
      if (!items.has(id)) items.set(id, resolveItem({ json, texture }, id));
      return items.get(id);
    },
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}

/**
 * Cómo se dibuja un ítem en el inventario, siguiendo los modelos del juego:
 *  - { kind: 'flat', src, overlay }  ítems con layer0 (paneles, flechas, puertas...)
 *  - { kind: 'cube', top, left, right }  bloques cúbicos, en isométrico
 *  - { kind: 'head' }  cabeza de jugador (textura de la skin)
 *  - null  sin textura (cofres y demás modelos especiales): la UI usa un ícono genérico
 */
export function resolveItem({ json, texture }, id) {
  if (id === 'player_head') return { kind: 'head' };

  // 1.21.4+: items/<id>.json apunta al modelo; antes, models/item/<id>.json
  let model = json(`models/item/${id}.json`) ? `item/${id}` : null;
  const definition = json(`items/${id}.json`);
  if (definition) model = JSON.stringify(definition).match(/"model":"(?:minecraft:)?([^"]+)"/)?.[1] ?? model;
  if (!model) {
    const flat = texture(`item/${id}`) ?? texture(`block/${id}`);
    return flat ? { kind: 'flat', src: flat } : null;
  }

  const textures = {};
  const chain = [];
  for (let path = model, depth = 0; path && depth < 10; depth++) {
    const m = json(`models/${path}.json`);
    if (!m) break;
    chain.push(path);
    for (const [key, value] of Object.entries(m.textures ?? {})) if (!(key in textures)) textures[key] = value;
    path = m.parent?.replace(/^minecraft:/, '');
  }
  const tex = (name, depth = 0) => {
    const value = textures[name];
    if (typeof value !== 'string') return null;
    return value.startsWith('#') ? (depth < 6 ? tex(value.slice(1), depth + 1) : null) : texture(value);
  };

  if (textures.layer0) return { kind: 'flat', src: tex('layer0'), overlay: tex('layer1') };
  // En la GUI un bloque se ve rotado 225°: arriba, el este a la izquierda y el norte a la derecha
  if (chain.includes('block/cube')) return { kind: 'cube', top: tex('up'), left: tex('east'), right: tex('north') };
  const flat = ['all', 'side', 'texture', 'cross', 'plant', 'front', 'top'].map((k) => tex(k)).find(Boolean);
  return flat ? { kind: 'flat', src: flat } : null;
}

/** Hash de textura de una skin a partir de SkinURL (hash o URL completa). */
export const skinHash = (value) => (value ? String(value).split('/').pop() : null);

// ---- Fuente (sólo navegador: necesita canvas para medir los glifos) ----

/**
 * Fuente default del juego: providers bitmap de font/include/default.json,
 * espacios de space.json y, para lo demás (p. ej. versalitas ᴄᴀᴊᴀ), unifont.
 * Cada glifo: { advance, draw(ctx, x, y, scale) } en píxeles de fuente.
 */
export async function loadFont(assets) {
  const def = assets.json('font/include/default.json');
  if (!def || typeof document === 'undefined') return null;
  const spaces = assets.json('font/include/space.json')?.providers?.find((p) => p.type === 'space')?.advances ?? { ' ': 4 };
  const glyphs = new Map();

  for (const provider of def.providers ?? []) {
    if (provider.type !== 'bitmap') continue;
    const src = assets.texture(provider.file.replace(/\.png$/, ''));
    if (!src) continue;
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const alpha = ctx.getImageData(0, 0, img.width, img.height).data;
    const rows = provider.chars.map((row) => [...row]);
    const cellW = img.width / Math.max(...rows.map((r) => r.length));
    const cellH = img.height / rows.length;
    const scale = (provider.height ?? 8) / cellH;
    const top = 7 - (provider.ascent ?? 7);
    rows.forEach((row, ry) => row.forEach((char, rx) => {
      const cp = char.codePointAt(0);
      if (!cp || glyphs.has(cp)) return; // el primer provider que lo tiene gana, como en el juego
      let width = 0;
      for (let x = cellW - 1; x >= 0 && !width; x--) {
        for (let y = 0; y < cellH; y++) {
          if (alpha[((ry * cellH + y) * img.width + rx * cellW + x) * 4 + 3]) { width = x + 1; break; }
        }
      }
      glyphs.set(cp, {
        advance: Math.floor(0.5 + width * scale) + 1, // BitmapProvider: ancho + 1 de separación
        sheet: { img, sx: rx * cellW, sy: ry * cellH, sw: cellW, sh: cellH, w: cellW * scale, h: cellH * scale, top },
      });
    }));
  }

  // unifont (lo que no está en los bitmaps: versalitas ᴄᴀᴊᴀ, flechas, emojis...): líneas
  // "XXXX:bits" de 16 filas; se arman recién cuando se usan (son ~57 mil glifos)
  const hex = new Map();
  for (const [name, data] of assets.files) {
    if (!name.startsWith('font/') || !name.endsWith('.hex')) continue;
    for (const line of new TextDecoder().decode(data).split('\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) hex.set(parseInt(line.slice(0, colon), 16), line.slice(colon + 1).trim());
    }
  }
  const glyph = (cp) => {
    if (!glyphs.has(cp)) glyphs.set(cp, hex.has(cp) ? unihexGlyph(hex.get(cp)) : null);
    return glyphs.get(cp);
  };
  return { glyph, spaces };
}

function unihexGlyph(bits) {
  const cols = bits.length / 4; // 8 o 16 columnas
  const grid = Array.from({ length: 16 }, (_, y) => parseInt(bits.slice((y * cols) / 4, ((y + 1) * cols) / 4), 16));
  let left = cols;
  let right = -1;
  for (const row of grid) {
    for (let x = 0; x < cols; x++) if (row & (1 << (cols - 1 - x))) { left = Math.min(left, x); right = Math.max(right, x); }
  }
  // se dibuja a la mitad de tamaño (16 px de alto -> 8 de fuente)
  return right < 0 ? { advance: 4, unihex: null } : { advance: Math.floor((right - left + 1) / 2) + 1, unihex: { grid, cols, left } };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
