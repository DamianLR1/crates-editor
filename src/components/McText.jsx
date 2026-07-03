import React from 'react';
import { parseMcTextWithGradients } from '../lib/mcText.js';

export default function McText({ text, className = '' }) {
  const runs = parseMcTextWithGradients(text || '');
  if (runs.length === 0) return null;

  return (
    <span className={className} style={{ fontFamily: "'Minecraft', var(--font-mono)" }}>
      {runs.map((r, i) => (
        <span
          key={i}
          style={{
            color: r.color,
            fontWeight: r.bold ? 700 : 400,
            fontStyle: r.italic ? 'italic' : 'normal',
            textDecoration: [r.underline && 'underline', r.strike && 'line-through']
              .filter(Boolean)
              .join(' ') || 'none',
            filter: r.obf ? 'blur(1.5px)' : 'none',
            textShadow: '1px 1px 0 rgba(0,0,0,0.5)',
          }}
        >
          {r.text}
        </span>
      ))}
    </span>
  );
}
