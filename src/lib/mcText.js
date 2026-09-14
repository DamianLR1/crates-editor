// mcText.js
// Texto con formato como lo arma nightcore (TextRoot/TextParser): códigos legacy & y §
// (incluido el hex de Bukkit §x§R§R§G§G§B§B), #RRGGBB y &#RRGGBB sueltos, y tags estilo
// MiniMessage (<gradient:..>, <#hex>, <c:..>, <b>, <!i>, colores con nombre...).
// Devuelve "runs" { text, color, bold, italic, underline, strike, obf } para dibujar.

// Esquema "custom" de nightcore (plugins/nightcore/color_schemes.yml, Selected: custom).
// Los códigos legacy también pasan por acá: &7 es <gray> (#A1A1A1), no el gris vanilla.
const SCHEME = {
  black: '#000000', white: '#FFFFFF',
  gray: '#A1A1A1', soft_gray: '#B4B4B4', dark_gray: '#6C6C62',
  red: '#E63232', soft_red: '#E64B4B', dark_red: '#963232',
  green: '#32E632', soft_green: '#78E650', dark_green: '#327832',
  blue: '#3278E6', soft_blue: '#32AAE6', dark_blue: '#323296',
  yellow: '#E6E632', soft_yellow: '#FAF0A0', dark_yellow: '#B4B432',
  orange: '#E67832', soft_orange: '#E6AA32', gold: '#E6AA32',
  aqua: '#32E6E6', soft_aqua: '#96E6E6', dark_aqua: '#327878',
  purple: '#7832E6', soft_purple: '#965AE6', light_purple: '#E39FFF', dark_purple: '#4B3296',
  pink: '#E63278', soft_pink: '#E65A96',
  cyan: '#31EACE', dgray: '#6C6C62', lgray: '#D4D9D8', light_gray: '#D4D9D8',
  lgreen: '#91F251', light_green: '#91F251', lyellow: '#FFEEA2', light_yellow: '#FFEEA2',
  lorange: '#FDBA5E', light_orange: '#FDBA5E', lred: '#FD5E5E', light_red: '#FD5E5E',
  lblue: '#5E9DFD', light_blue: '#5E9DFD', lcyan: '#5EDEFD', light_cyan: '#5EDEFD',
  lpurple: '#E39FFF', lpink: '#FD8DDB', light_pink: '#FD8DDB',
};

// ParserUtils.legacyToNamedWrapper: cada código abre un tag (sin cerrar los anteriores,
// así que &l&a queda en negrita y verde)
const LEGACY = {
  0: 'black', 1: 'dark_blue', 2: 'dark_green', 3: 'dark_aqua', 4: 'dark_red', 5: 'dark_purple', 6: 'gold', 7: 'gray',
  8: 'dark_gray', 9: 'blue', a: 'green', b: 'aqua', c: 'red', d: 'light_purple', e: 'yellow', f: 'white',
  k: 'obf', l: 'b', m: 'st', n: 'u', o: 'i', r: 'r',
};

const DECORATIONS = {
  b: 'bold', bold: 'bold', i: 'italic', italic: 'italic', em: 'italic', u: 'underline', underlined: 'underline',
  st: 'strike', strikethrough: 'strike', obf: 'obf', obfuscated: 'obf',
};

const colorOf = (value) => {
  const v = String(value ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v.toUpperCase() : SCHEME[v] ?? null;
};

/** Pasa todo a tags, en el mismo orden que nightcore (LegacyColors + wrapHexCodesAsTags). */
const toTags = (str) => str
  .replace(/§x((?:§[0-9a-f]){6})/gi, (_, hex) => `#${hex.replace(/§/g, '')}`)
  .replace(/§([0-9a-fk-orx])/gi, (_, code) => `&${code.toLowerCase()}`)
  .replace(/&#([0-9a-f]{6})/gi, '<#$1>')
  .replace(/(?<![<:])#([0-9a-f]{6})(?!>)/gi, '<#$1>')
  .replace(/&([0-9a-fk-or])/gi, (_, code) => `<${LEGACY[code.toLowerCase()]}>`);

export function parseMcText(input, defaultColor = '#FFFFFF') {
  if (!input) return [];
  const str = toTags(String(input));
  const base = { color: defaultColor, bold: false, italic: false, underline: false, strike: false, obf: false };
  const runs = [];
  const stack = [];
  let state = base;
  let last = 0;
  const push = (text) => text && runs.push({ text, ...state });

  for (const m of str.matchAll(/<(\/?)([^<>]+)>/g)) {
    push(str.slice(last, m.index));
    last = m.index + m[0].length;
    const body = m[2];
    const colon = body.indexOf(':');
    const name = (colon < 0 ? body : body.slice(0, colon)).trim().toLowerCase();
    const arg = colon < 0 ? '' : body.slice(colon + 1);

    if (m[1]) { // cierre: vuelve al estado previo a su apertura
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at >= 0) { state = stack[at].prev; stack.length = at; }
      continue;
    }
    if (name === 'r' || name === 'reset') { state = base; stack.length = 0; continue; }

    let next = null;
    const negated = name.startsWith('!') && DECORATIONS[name.slice(1)];
    if (DECORATIONS[name]) next = { ...state, [DECORATIONS[name]]: true };
    else if (negated) next = { ...state, [negated]: false };
    else if (name === 'gradient') {
      const stops = arg.split(':').map(colorOf).filter(Boolean);
      if (stops.length) next = { ...state, color: stops[0], _gradient: stops.length > 1 ? { stops } : undefined };
    } else {
      const color = colorOf(name.startsWith('#') ? name : ['c', 'color', 'colour'].includes(name) ? arg : name);
      if (color) next = { ...state, color, _gradient: undefined };
    }
    // tags desconocidos (<hover>, <click>, <font>, <shift> de Nexo...) no se dibujan
    if (next) { stack.push({ name, prev: state }); state = next; }
  }
  push(str.slice(last));
  return runs;
}

/** Como parseMcText, pero con los gradientes ya interpolados letra por letra (a lo largo de todo el tag). */
export function parseMcTextWithGradients(input, defaultColor) {
  const runs = parseMcText(input, defaultColor);
  const total = new Map();
  for (const run of runs) if (run._gradient) total.set(run._gradient, (total.get(run._gradient) ?? 0) + [...run.text].length);
  const done = new Map();
  return runs.flatMap((run) => {
    if (!run._gradient) return [run];
    const colors = interpolateGradient(run._gradient.stops, total.get(run._gradient));
    const start = done.get(run._gradient) ?? 0;
    const chars = [...run.text];
    done.set(run._gradient, start + chars.length);
    return chars.map((ch, i) => ({ ...run, text: ch, color: colors[start + i] }));
  });
}

function interpolateGradient(stops, steps) {
  if (steps <= 1) return [stops[0]];
  const segs = stops.length - 1;
  const result = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * segs;
    const segIdx = Math.min(Math.floor(t), segs - 1);
    result.push(lerpColor(stops[segIdx], stops[segIdx + 1], t - segIdx));
  }
  return result;
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const mix = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${mix(a.r, b.r)}${mix(a.g, b.g)}${mix(a.b, b.b)}`.toUpperCase();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** Quita todos los códigos de color/formato, dejando solo el texto plano */
export function stripMcCodes(input) {
  return parseMcText(input).map((r) => r.text).join('');
}
