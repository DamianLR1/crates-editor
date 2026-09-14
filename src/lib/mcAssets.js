// mcAssets.js
// Texturas, modelos y fuente de Minecraft leídos del .jar del cliente del
// usuario y de resource packs .zip (el del server, con sus ítems custom). Son
// assets de Mojang/del pack: no se incluyen en el repo ni se publican; se leen en
// el navegador y se guardan en IndexedDB para no pedir el archivo cada vez.

const PREFIX = 'assets/minecraft/';
// Del namespace minecraft sólo lo que usa el menú; de los demás (packs), todo lo de ítems y fuentes
const KEEP = new RegExp(`^assets/(?:minecraft/(?:${[
  'textures/(?:item|block|font)/.+\\.png',
  'models/(?:item|block)/.+\\.json',
  'items/.+\\.json',
  'font/.+\\.json',
  'font/unifont[^/]*\\.zip',
  'textures/gui/container/generic_54\\.png',
  'textures/misc/enchanted_glint_item\\.png',
  'textures/entity/player/wide/steve\\.png',
].join('|')})|(?!minecraft/)[^/]+/(?:textures/.+\\.png|models/.+\\.json|items/.+\\.json|font/.+\\.json))$`);

/** Ruta interna de un recurso "ns:path" (minecraft sin prefijo, como estaba en caché). */
export function refPath(ref, dir, ext) {
  const s = String(ref);
  const colon = s.indexOf(':');
  const ns = colon < 0 ? 'minecraft' : s.slice(0, colon);
  return `${ns === 'minecraft' ? '' : `assets/${ns}/`}${dir}/${colon < 0 ? s : s.slice(colon + 1)}${ext}`;
}

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
 * Lee el .jar, resource packs (después: pisan lo del jar) y el unifont.zip del
 * juego (.minecraft/assets/objects/..., un .hex en la raíz).
 * ponytail: no aplica los overlays del pack (carpetas por versión); los packs de hoy los usan para shaders.
 */
export async function extractAssets(fileList) {
  const zips = await Promise.all([...fileList].map(async (file) => {
    const entries = await readZip(await file.arrayBuffer(), (n) => KEEP.test(n) || /^[^/]+\.hex$/.test(n) || n === ROOT);
    return { entries, base: entries.has(ROOT) || /\.jar$/i.test(file.name) };
  }));
  // la base del juego (.jar del cliente o la copia que guarda Nexo en pack/.assetCache) primero: los packs la pisan
  zips.sort((a, b) => Number(b.base) - Number(a.base));
  const merged = new Map();
  for (const { entries } of zips) {
    for (const [name, data] of entries) {
      if (name !== ROOT) merged.set(name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name.startsWith('assets/') ? name : `font/${name}`, data);
    }
  }
  // en algunas versiones unifont viene como un .zip adentro del .jar: se guarda ya descomprimido
  for (const [name, data] of merged) {
    if (!name.endsWith('.zip')) continue;
    merged.delete(name);
    const inner = await readZip(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), (n) => n.endsWith('.hex'));
    for (const [hexName, hex] of inner) merged.set(`font/${hexName}`, hex);
  }
  return { files: merged, base: zips.some((z) => z.base) };
}

const ROOT = 'assets/.mcassetsroot'; // marca de los assets vanilla

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

export const loadCached = (key) => run('readonly', (store) => store.get(key)).catch(() => null);
export const saveCached = (key, value) => run('readwrite', (store) => store.put(value, key));
export const clearCached = (key) => run('readwrite', (store) => store.delete(key));
export const saveAssets = (files, label) => saveCached(KEY, { files: Object.fromEntries(files), label });
export const clearCachedAssets = () => clearCached(KEY);

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
  const texture = (ref) => url(refPath(ref, 'textures', '.png'));

  return {
    label,
    count: files.size,
    files,
    json,
    texture,
    gui: url('textures/gui/container/generic_54.png'),
    glint: url('textures/misc/enchanted_glint_item.png'),
    steve: url('textures/entity/player/wide/steve.png'),
    /** extra: { cmd, itemModel } del SNBT, para los ítems custom del resource pack */
    item(material, extra = {}) {
      const id = String(material ?? '').toLowerCase().replace(/^minecraft:/, '');
      const key = `${id}|${extra.cmd ?? ''}|${extra.itemModel ?? ''}`;
      if (!items.has(key)) items.set(key, resolveItem({ json, texture }, id, extra));
      return items.get(key);
    },
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}

const HEAD = { kind: 'head' };
const NOTHING = { kind: 'model', faces: [] };

/**
 * Elige el modelo de una definición items/<id>.json (1.21.4+). Sólo evalúa lo que
 * cambia la textura en un menú: custom_model_data (range_dispatch); de las demás
 * propiedades (select, condition...) usa el caso por defecto.
 */
function pickModel(node, cmd) {
  for (let depth = 0; node && depth < 20; depth++) {
    const type = String(node.type ?? '').replace(/^minecraft:/, '');
    if (type === 'model') return node.model;
    if (type === 'empty') return NOTHING;
    if (type === 'special') return String(node.model?.type).replace(/^minecraft:/, '') === 'head' && (node.model.kind ?? 'player') === 'player' ? HEAD : null;
    if (type === 'range_dispatch') {
      const byCmd = String(node.property).replace(/^minecraft:/, '') === 'custom_model_data' && cmd != null;
      const hit = byCmd ? (node.entries ?? []).filter((e) => e.threshold <= cmd).sort((a, b) => a.threshold - b.threshold).pop() : null;
      node = hit?.model ?? node.fallback;
    } else if (type === 'select') node = node.fallback ?? node.cases?.[0]?.model;
    else if (type === 'condition') node = node.on_false;
    else if (type === 'composite') node = node.models?.[0];
    else return null;
  }
  return null;
}

/**
 * Cómo se dibuja un ítem en el inventario, siguiendo los modelos del juego:
 *  - { kind: 'flat', src, overlay }  ítems con layer0 (paneles, flechas, puertas...)
 *  - { kind: 'model', faces }  modelos con elements (bloques, ítems 3D de packs) ya proyectados
 *  - { kind: 'head' }  cabeza de jugador (textura de la skin)
 *  - null  sin textura (cofres y demás modelos especiales): la UI usa un ícono genérico
 */
export function resolveItem({ json, texture }, id, { cmd = null, itemModel = null } = {}) {
  if (id === 'player_head' && cmd == null && !itemModel) return HEAD;

  // 1.21.4+: items/<id>.json (o el del componente item_model) elige el modelo; antes, models/item/<id>.json
  const definition = json(refPath(itemModel ?? id, 'items', '.json'));
  const model = definition ? pickModel(definition.model, cmd) : json(`models/item/${id}.json`) && `item/${id}`;
  if (model && typeof model === 'object') return model;
  if (!model) {
    const flat = texture(`item/${id}`) ?? texture(`block/${id}`);
    return flat ? { kind: 'flat', src: flat } : null;
  }

  const textures = {};
  let elements = null;
  let gui = null;
  let light = null;
  for (let ref = model, depth = 0; ref && depth < 10; depth++) {
    const m = json(refPath(ref, 'models', '.json'));
    if (!m) break;
    for (const [key, value] of Object.entries(m.textures ?? {})) if (!(key in textures)) textures[key] = value;
    elements ??= m.elements ?? null;
    gui ??= m.display?.gui ?? null;
    light ??= m.gui_light ?? null;
    ref = m.parent;
  }
  const tex = (ref, depth = 0) => {
    if (typeof ref !== 'string') return null;
    if (!ref.startsWith('#')) return texture(ref);
    return depth < 6 ? tex(textures[ref.slice(1)], depth + 1) : null;
  };

  if (elements) return { kind: 'model', faces: projectModel(elements, gui, light, tex) };
  if (textures.layer0) return { kind: 'flat', src: tex('#layer0'), overlay: tex('#layer1') };
  const flat = ['all', 'side', 'texture', 'cross', 'plant', 'front', 'top'].map((k) => tex(`#${k}`)).find(Boolean);
  return flat ? { kind: 'flat', src: flat } : null;
}

// Por cara: esquina de arriba a la izquierda de la textura, eje u y eje v (con su largo) y uv por defecto
const FACE_GEOMETRY = {
  north: (f, t) => [[t[0], t[1], f[2]], [f[0] - t[0], 0, 0], [0, f[1] - t[1], 0], [16 - t[0], 16 - t[1], 16 - f[0], 16 - f[1]]],
  south: (f, t) => [[f[0], t[1], t[2]], [t[0] - f[0], 0, 0], [0, f[1] - t[1], 0], [f[0], 16 - t[1], t[0], 16 - f[1]]],
  west: (f, t) => [[f[0], t[1], f[2]], [0, 0, t[2] - f[2]], [0, f[1] - t[1], 0], [f[2], 16 - t[1], t[2], 16 - f[1]]],
  east: (f, t) => [[t[0], t[1], t[2]], [0, 0, f[2] - t[2]], [0, f[1] - t[1], 0], [16 - t[2], 16 - t[1], 16 - f[2], 16 - f[1]]],
  up: (f, t) => [[f[0], t[1], f[2]], [t[0] - f[0], 0, 0], [0, 0, t[2] - f[2]], [f[0], f[2], t[0], t[2]]],
  down: (f, t) => [[f[0], f[1], t[2]], [t[0] - f[0], 0, 0], [0, 0, f[2] - t[2]], [f[0], 16 - t[2], t[0], 16 - f[2]]],
};

function rotate([x, y, z], axis, degrees) {
  const c = Math.cos((degrees * Math.PI) / 180);
  const s = Math.sin((degrees * Math.PI) / 180);
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const r4 = (n) => Math.round(n * 1e4) / 1e4 + 0;

/**
 * Proyección ortográfica de las caras de un modelo como en el inventario: rotación de
 * cada element, display.gui (translate · rotate XYZ · scale, como ItemTransform) y
 * pintor de atrás hacia adelante. Cada cara es un paralelogramo: la textura se lleva
 * con una transformación afín (p0 + u·pu + v·pv). La luz imita la de los ítems 3D.
 * ponytail: ignora la rotación de uv por cara y la intersección de caras (orden por profundidad media).
 */
function projectModel(elements, gui, light, tex) {
  const [rx, ry, rz] = gui?.rotation ?? [0, 0, 0];
  const [tx, ty, tz] = gui?.translation ?? [0, 0, 0];
  const [sx, sy, sz] = gui?.scale ?? [1, 1, 1];
  const faces = [];
  for (const element of elements) {
    const { from, to, rotation: er } = element;
    if (!from || !to) continue;
    const view = (p) => {
      let v = er ? add(rotate(sub(p, er.origin ?? [8, 8, 8]), er.axis, er.angle ?? 0), er.origin ?? [8, 8, 8]) : p;
      v = [(v[0] - 8) * sx, (v[1] - 8) * sy, (v[2] - 8) * sz];
      v = rotate(rotate(rotate(v, 'z', rz), 'y', ry), 'x', rx);
      return add(v, [tx, ty, tz]);
    };
    for (const [dir, face] of Object.entries(element.faces ?? {})) {
      if (!FACE_GEOMETRY[dir]) continue;
      const [origin, u, v, defaultUv] = FACE_GEOMETRY[dir](from, to);
      const uv = face.uv ?? defaultUv;
      const src = tex(face.texture);
      if (!src || uv[2] === uv[0] || uv[3] === uv[1]) continue;
      const o = view(origin);
      const pu = sub(view(add(origin, u)), o);
      const pv = sub(view(add(origin, v)), o);
      const n = [pv[1] * pu[2] - pv[2] * pu[1], pv[2] * pu[0] - pv[0] * pu[2], pv[0] * pu[1] - pv[1] * pu[0]];
      const len = Math.hypot(...n);
      if (!len || n[2] / len < 1e-6) continue; // de canto o de espaldas
      const [nx, ny, nz] = n.map((c) => c / len);
      faces.push({
        src,
        uv,
        p0: [r4(8 + o[0]), r4(8 - o[1])],
        pu: [r4(pu[0]), r4(-pu[1])],
        pv: [r4(pv[0]), r4(-pv[1])],
        b: light === 'front' ? 1 : r4(Math.min(1, 0.6 + 0.4 * Math.max(0, ny) + 0.3 * Math.max(0, nz) - 0.1 * nx)),
        depth: o[2] + (pu[2] + pv[2]) / 2,
      });
    }
  }
  return faces.sort((a, b) => a.depth - b.depth).map(({ depth: _depth, ...face }) => face);
}

/** Hash de textura de una skin a partir de SkinURL (hash o URL completa). */
export const skinHash = (value) => (value ? String(value).split('/').pop() : null);

// ---- Fuente (sólo navegador: necesita canvas para medir los glifos) ----

/**
 * Fuente default: font/default.json (con los glifos propios del resource pack) y la
 * base del juego (bitmaps de include/default, espacios de include/space) y, para lo
 * demás (p. ej. versalitas ᴄᴀᴊᴀ), unifont. Cada glifo: { advance, sheet | unihex }.
 */
export async function loadFont(assets) {
  const providers = [];
  const seen = new Set();
  const include = (id) => {
    const path = refPath(id, 'font', '.json');
    if (seen.has(path)) return;
    seen.add(path);
    for (const p of assets.json(path)?.providers ?? []) {
      if (String(p.type).replace(/^minecraft:/, '') === 'reference') include(p.id);
      else providers.push(p);
    }
  };
  // el default.json del jar ya incluye la base, pero el de un pack lo pisa al mezclar archivos
  ['default', 'include/space', 'include/default'].forEach(include);
  const bitmaps = providers.filter((p) => p.type === 'bitmap' && p.file && p.chars);
  if (typeof document === 'undefined') return null;

  const spaces = {};
  for (const p of providers) if (p.type === 'space') for (const [ch, advance] of Object.entries(p.advances ?? {})) spaces[ch] ??= advance;
  spaces[' '] ??= 4;

  const images = await Promise.all(bitmaps.map((p) => {
    const src = assets.texture(p.file.replace(/\.png$/, ''));
    return src ? loadImage(src).catch(() => null) : null;
  }));
  const glyphs = new Map();
  bitmaps.forEach((provider, index) => {
    const img = images[index];
    if (!img) return;
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
  });

  // unifont (lo que no está en los bitmaps: versalitas ᴄᴀᴊᴀ, flechas, emojis...): líneas
  // "XXXX:bits" de 16 filas; se arman recién cuando se usan. La del juego si la agregaron;
  // si no, la parte que trae el editor (GNU Unifont 16.0.01, SIL OFL 1.1: unifont-LICENSE.txt)
  const hexTexts = [...assets.files].filter(([name]) => name.startsWith('font/') && name.endsWith('.hex')).map(([, data]) => new TextDecoder().decode(data));
  if (!hexTexts.length) hexTexts.push((await import('./unifont-subset.hex?raw')).default);
  const hex = new Map();
  for (const text of hexTexts) {
    for (const line of text.split('\n')) {
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
