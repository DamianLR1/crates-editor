// mcText.js
// Convierte strings estilo Minecraft (legacy & codes, hex &#RRGGBB, y un subconjunto
// de MiniMessage: <gradient:..>, <c:#hex>, <bold>, <yellow>, etc.) en un array de
// "runs" { text, color, bold, italic, underline, strikethrough, obfuscated }
// listo para renderizar como <span> con estilos.

const LEGACY_COLORS = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', a: '#55FF55', b: '#55FFFF',
  c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF',
};

const NAMED_MINIMESSAGE_COLORS = {
  black: '#000000', dark_blue: '#0000AA', dark_green: '#00AA00',
  dark_aqua: '#00AAAA', dark_red: '#AA0000', dark_purple: '#AA00AA',
  gold: '#FFAA00', gray: '#AAAAAA', grey: '#AAAAAA',
  dark_gray: '#555555', dark_grey: '#555555', blue: '#5555FF',
  green: '#55FF55', aqua: '#55FFFF', red: '#FF5555',
  light_purple: '#FF55FF', yellow: '#FFFF55', white: '#FFFFFF',
};

/**
 * Parsea un string con formato mixto (legacy + MiniMessage) a runs de texto.
 * No pretende ser 100% completo (MiniMessage es enorme) pero cubre lo que
 * aparece típicamente en configs de ExcellentCrates: &-codes, hex legacy,
 * <gradient>, <c:#hex>, <bold>, colores nombrados, </tag> de cierre.
 */
export function parseMcText(input) {
  if (!input) return [];

  // Normalizar: reemplazar & codes por marcadores internos que el tokenizer entiende
  let str = String(input);

  const runs = [];
  let state = { color: '#FFFFFF', bold: false, italic: false, underline: false, strike: false, obf: false };
  const stack = [];

  let i = 0;
  let buffer = '';

  const flush = () => {
    if (buffer.length > 0) {
      runs.push({ text: buffer, ...state });
      buffer = '';
    }
  };

  while (i < str.length) {
    const ch = str[i];

    // Legacy & codes: &a, &l, &#RRGGBB
    if (ch === '&' && str[i + 1] === '#' && /^[0-9a-fA-F]{6}/.test(str.slice(i + 2, i + 8))) {
      flush();
      state = { ...state, color: '#' + str.slice(i + 2, i + 8).toUpperCase() };
      i += 8;
      continue;
    }
    if (ch === '&' && /[0-9a-fk-orA-FK-OR]/.test(str[i + 1] || '')) {
      flush();
      const code = str[i + 1].toLowerCase();
      if (LEGACY_COLORS[code]) {
        state = { color: LEGACY_COLORS[code], bold: false, italic: false, underline: false, strike: false, obf: false };
      } else if (code === 'l') state = { ...state, bold: true };
      else if (code === 'o') state = { ...state, italic: true };
      else if (code === 'n') state = { ...state, underline: true };
      else if (code === 'm') state = { ...state, strike: true };
      else if (code === 'k') state = { ...state, obf: true };
      else if (code === 'r') state = { color: '#FFFFFF', bold: false, italic: false, underline: false, strike: false, obf: false };
      i += 2;
      continue;
    }

    // §-codes (legacy alternativo, poco usado en YAML pero por si acaso)
    if (ch === '§' && /[0-9a-fk-orA-FK-OR]/.test(str[i + 1] || '')) {
      flush();
      const code = str[i + 1].toLowerCase();
      if (LEGACY_COLORS[code]) state = { color: LEGACY_COLORS[code], bold: false, italic: false, underline: false, strike: false, obf: false };
      i += 2;
      continue;
    }

    // MiniMessage tags: <...>
    if (ch === '<') {
      const end = str.indexOf('>', i);
      if (end !== -1) {
        const raw = str.slice(i + 1, end);
        flush();
        handleTag(raw, state, stack, (s) => (state = s));
        i = end + 1;
        continue;
      }
    }

    buffer += ch;
    i++;
  }
  flush();

  return runs;
}

function handleTag(raw, currentState, stack, setState) {
  const closing = raw.startsWith('/');
  const body = closing ? raw.slice(1) : raw;
  const [tagName, ...rest] = body.split(':');
  const arg = rest.join(':');
  const name = tagName.trim().toLowerCase();

  if (closing) {
    // pop hasta encontrar el tag correspondiente
    const idx = [...stack].reverse().findIndex((s) => s.tag === name);
    if (idx !== -1) {
      const realIdx = stack.length - 1 - idx;
      const restored = stack[realIdx].prevState;
      stack.length = realIdx;
      setState(restored);
    }
    return;
  }

  stack.push({ tag: name, prevState: currentState });

  if (name === 'bold' || name === 'b') setState({ ...currentState, bold: true });
  else if (name === 'italic' || name === 'i' || name === 'em') setState({ ...currentState, italic: true });
  else if (name === 'underlined' || name === 'u') setState({ ...currentState, underline: true });
  else if (name === 'strikethrough' || name === 'st') setState({ ...currentState, strike: true });
  else if (name === 'obfuscated' || name === 'obf') setState({ ...currentState, obf: true });
  else if (name === 'reset') setState({ color: '#FFFFFF', bold: false, italic: false, underline: false, strike: false, obf: false });
  else if (name === 'c' || name === 'color' || name === 'colour') {
    const hex = arg.startsWith('#') ? arg : NAMED_MINIMESSAGE_COLORS[arg] || '#FFFFFF';
    setState({ ...currentState, color: hex.toUpperCase() });
  } else if (name === 'gradient') {
    // Aproximación: usamos el primer color del gradient como color base del run.
    // Un gradiente real requeriría interpolar por caracter; lo dejamos como
    // mejora futura (ver TODO abajo) y priorizamos legibilidad ahora.
    const stops = arg.split(':').filter((s) => s.startsWith('#'));
    setState({ ...currentState, color: (stops[0] || '#FFFFFF').toUpperCase(), _gradient: stops });
  } else if (NAMED_MINIMESSAGE_COLORS[name]) {
    setState({ ...currentState, color: NAMED_MINIMESSAGE_COLORS[name] });
  }
  // tags desconocidos (ej: <hover:...>, <click:...>) se ignoran silenciosamente
}

/**
 * Variante que sí interpola gradientes caracter por caracter (usado para el
 * preview "de lujo" del ítem, más costoso que parseMcText plano).
 */
export function parseMcTextWithGradients(input) {
  const runs = parseMcText(input);
  const expanded = [];
  for (const run of runs) {
    if (run._gradient && run._gradient.length >= 2 && run.text.length > 0) {
      const colors = interpolateGradient(run._gradient, run.text.length);
      for (let i = 0; i < run.text.length; i++) {
        expanded.push({ ...run, text: run.text[i], color: colors[i] });
      }
    } else {
      expanded.push(run);
    }
  }
  return expanded;
}

function interpolateGradient(stops, steps) {
  if (steps <= 1) return [stops[0]];
  const segs = stops.length - 1;
  const result = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * segs;
    const segIdx = Math.min(Math.floor(t), segs - 1);
    const localT = t - segIdx;
    result.push(lerpColor(stops[segIdx], stops[segIdx + 1], localT));
  }
  return result;
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Quita todos los códigos de color/formato, dejando solo el texto plano */
export function stripMcCodes(input) {
  return parseMcText(input).map((r) => r.text).join('');
}
