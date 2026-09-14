import React, { useEffect, useId, useMemo, useRef } from 'react';
import { parseMcTextWithGradients, stripMcCodes } from '../lib/mcText.js';
import { skinHash } from '../lib/mcAssets.js';

// Piezas que dibujan como Minecraft usando los assets del cliente (ver mcAssets.js).

const PIXEL = { imageRendering: 'pixelated' };

// Caras de un cubo isométrico en un lienzo de 32x32 (A arriba, B derecha, C centro, D izquierda)
const D = [2, 8];
const C = [16, 15];
const TOP_U = [14, -7];
const TOP_V = [14, 7];
const DOWN = [0, 16];
const FACES = {
  top: { origin: D, u: TOP_U, v: TOP_V, points: '16,1 30,8 16,15 2,8', shade: 0 },
  left: { origin: D, u: TOP_V, v: DOWN, points: '2,8 16,15 16,31 2,24', shade: 0.2 },
  right: { origin: C, u: TOP_U, v: DOWN, points: '16,15 30,8 30,24 16,31', shade: 0.4 },
};

// matrix() que lleva la región (sx, sy, span x span) de una textura a una cara
const faceMatrix = ({ origin, u, v }, span, sx = 0, sy = 0) => {
  const [a, b, c, d] = [u[0] / span, u[1] / span, v[0] / span, v[1] / span];
  return `matrix(${a} ${b} ${c} ${d} ${origin[0] - a * sx - c * sy} ${origin[1] - b * sx - d * sy})`;
};

/** Ítem como en el inventario: textura plana, modelo 3D (bloques, ítems de packs) o cabeza con su skin. */
export function McItem({ assets, material, cmd = null, itemModel = null, skin, size = 32, glint = false, dim = false, fallback = null }) {
  const model = assets?.item(material, { cmd, itemModel });
  if (!model) return fallback;

  let body;
  if (model.kind === 'head') {
    const hash = skinHash(skin);
    body = <HeadIso src={hash ? `https://textures.minecraft.net/texture/${hash}` : assets.steve} size={size} />;
  } else if (model.kind === 'model') {
    body = <ModelIso faces={model.faces} size={size} />;
  } else {
    const layers = [model.overlay, model.src].filter(Boolean).map((u) => `url(${u})`).join(', ');
    body = <span className="absolute inset-0" style={{ ...PIXEL, backgroundImage: layers, backgroundSize: `${size}px auto`, backgroundRepeat: 'no-repeat' }} />;
  }

  return (
    <span className="relative inline-block" style={{ width: size, height: size, opacity: dim ? 0.35 : 1 }}>
      {body}
      {glint && assets.glint && model.kind === 'flat' && (
        <span
          className="mc-glint absolute inset-0"
          style={{
            backgroundImage: `url(${assets.glint})`,
            WebkitMaskImage: `url(${model.src})`,
            maskImage: `url(${model.src})`,
            WebkitMaskSize: `${size}px auto`,
            maskSize: `${size}px auto`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }}
        />
      )}
    </span>
  );
}

/** Caras ya proyectadas (mcAssets.projectModel) en un slot de 16x16: uv -> pantalla con una afín. */
function ModelIso({ faces, size }) {
  const id = useId().replace(/:/g, '');
  const shades = [...new Set(faces.map((f) => f.b))].filter((b) => b < 1);
  const filter = (b) => `${id}b${Math.round(b * 1000)}`;
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} overflow="visible" className="absolute inset-0" aria-hidden="true">
      <defs>
        {shades.map((b) => (
          <filter key={b} id={filter(b)} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={`${b} 0 0 0 0 0 ${b} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0`} />
          </filter>
        ))}
      </defs>
      {faces.map(({ src, uv: [u1, v1, u2, v2], p0, pu, pv, b }, i) => {
        const [a, bb, c, d] = [pu[0] / (u2 - u1), pu[1] / (u2 - u1), pv[0] / (v2 - v1), pv[1] / (v2 - v1)];
        const [x, y, w, h] = [Math.min(u1, u2), Math.min(v1, v2), Math.abs(u2 - u1), Math.abs(v2 - v1)];
        return (
          <g key={i} transform={`matrix(${a} ${bb} ${c} ${d} ${p0[0] - a * u1 - c * v1} ${p0[1] - bb * u1 - d * v1})`} filter={b < 1 ? `url(#${filter(b)})` : undefined}>
            <svg x={x} y={y} width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`} overflow="hidden">
              <image href={src} width="16" height="16" preserveAspectRatio="xMidYMin slice" style={PIXEL} />
            </svg>
          </g>
        );
      })}
    </svg>
  );
}

// Regiones 8x8 de la cabeza en la skin (y la capa del sombrero, 32 px a la derecha)
const HEAD = { top: [8, 0], left: [0, 8], right: [8, 8] };

function HeadIso({ src, size }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className="absolute inset-0" aria-hidden="true">
      <defs>
        {Object.entries(FACES).map(([name, face]) => (
          <clipPath key={name} id={`${id}${name}`}><polygon points={face.points} /></clipPath>
        ))}
      </defs>
      {[0, 32].map((hat) => Object.entries(FACES).map(([name, face]) => (
        <g key={`${hat}${name}`} clipPath={`url(#${id}${name})`}>
          <image href={src} width="64" height="64" transform={faceMatrix(face, 8, HEAD[name][0] + hat, HEAD[name][1])} style={PIXEL} />
        </g>
      )))}
      {Object.values(FACES).map((face) => face.shade > 0 && <polygon key={face.points} points={face.points} fill="#000" opacity={face.shade} />)}
    </svg>
  );
}

// ---- Texto con la fuente del juego ----

const LINE = 11; // alto de línea en píxeles de fuente (el juego usa 9 + 1; +1 para los acentos de mayúsculas)
const TOP = 2;

const shadowOf = (hex) => `#${hex.slice(1).match(/../g).map((h) => Math.floor(parseInt(h, 16) / 4).toString(16).padStart(2, '0')).join('')}`;

/** Una línea de texto dibujada con los glifos de la fuente del juego (con sombra, como en los tooltips). */
export function McBitmapText({ text, font, scale = 2, defaultColor = '#FFFFFF', shadow = true }) {
  const ref = useRef(null);
  const runs = useMemo(() => parseMcTextWithGradients(text || '', defaultColor), [text, defaultColor]);
  useEffect(() => drawLine(ref.current, runs, font, scale, shadow), [runs, font, scale, shadow]);
  return <canvas ref={ref} className="block" style={PIXEL} role="img" aria-label={stripMcCodes(text || '')} />;
}

function drawLine(canvas, runs, font, scale, shadow) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;

  const glyphs = [];
  let x = 0;
  for (const run of runs) {
    for (const ch of run.text) {
      const bold = run.bold ? 1 : 0;
      if (font.spaces[ch] != null) { x += font.spaces[ch] + bold; continue; }
      const glyph = font.glyph(ch.codePointAt(0));
      const advance = (glyph ? glyph.advance : 6) + bold;
      glyphs.push({ glyph, ch, x, advance, run });
      x += advance;
    }
  }

  // glifos más altos que la línea (íconos del resource pack): el canvas crece sin mover el texto
  let above = 0;
  let below = 0;
  for (const { glyph } of glyphs) {
    if (!glyph?.sheet) continue;
    above = Math.max(above, -(TOP + glyph.sheet.top));
    below = Math.max(below, TOP + glyph.sheet.top + glyph.sheet.h + 1 - LINE);
  }
  const base = TOP + above;

  canvas.width = Math.max(1, Math.ceil((x + 1) * scale));
  canvas.height = Math.ceil((LINE + above + below) * scale);
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  canvas.style.margin = `${-above * scale}px 0 ${-below * scale}px`;
  ctx.imageSmoothingEnabled = false;
  const tint = document.createElement('canvas');
  const t = tint.getContext('2d');

  const paint = ({ glyph, ch, x: gx, advance, run }, offset, color) => {
    for (const bx of run.bold ? [0, 1] : [0]) {
      const px = (gx + offset + bx) * scale;
      const py = (base + offset) * scale;
      ctx.fillStyle = color;
      if (!glyph) {
        ctx.font = `${8 * scale}px monospace`;
        ctx.textBaseline = 'top';
        ctx.fillText(ch, px, py);
      } else if (!glyph.unihex && !glyph.sheet) {
        // glifo vacío de unifont: sólo avanza
      } else if (glyph.unihex) {
        const { grid, cols, left } = glyph.unihex;
        const px2 = scale / 2; // unifont: 16 px de alto dibujados en 8
        grid.forEach((row, y) => {
          for (let c = left; c < cols; c++) {
            if (row & (1 << (cols - 1 - c))) ctx.fillRect(px + (c - left) * px2, py + (y - 1) * px2, px2, px2);
          }
        });
      } else {
        const s = glyph.sheet;
        tint.width = Math.ceil(s.w * scale);
        tint.height = Math.ceil(s.h * scale);
        t.imageSmoothingEnabled = false;
        // como el juego: color del texto × textura. Las letras son blancas (quedan del color), los
        // glifos con imagen (emojis, megatags de Nexo) conservan sus colores con texto blanco
        const glyphImage = () => t.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, 0, 0, tint.width, tint.height);
        t.globalCompositeOperation = 'source-over';
        glyphImage();
        t.globalCompositeOperation = 'multiply';
        t.fillStyle = color;
        t.fillRect(0, 0, tint.width, tint.height);
        t.globalCompositeOperation = 'destination-in'; // multiply también pinta lo transparente: se recorta con el glifo
        glyphImage();
        ctx.drawImage(tint, px, py + s.top * scale);
      }
    }
    if (run.underline) ctx.fillRect((gx + offset - 1) * scale, (base + offset + 8) * scale, (advance + 1) * scale, scale);
    if (run.strike) ctx.fillRect((gx + offset - 1) * scale, (base + offset + 3.5) * scale, (advance + 1) * scale, scale);
  };

  if (shadow) glyphs.forEach((g) => paint(g, 1, shadowOf(g.run.color)));
  glyphs.forEach((g) => paint(g, 0, g.run.color));
}
