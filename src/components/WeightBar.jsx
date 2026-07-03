import React from 'react';

const RARITY_COLORS = {
  common: '#8a9a8c',
  uncommon: '#4ade80',
  rare: '#5b9bff',
  epic: '#b060ff',
  legendary: '#e8b64a',
  mythic: '#f2637a',
};

export default function WeightBar({ percent, rarity = 'common', maxPercent = 40 }) {
  const color = RARITY_COLORS[rarity?.toLowerCase()] || RARITY_COLORS.common;
  const widthPct = Math.min(100, (percent / maxPercent) * 100);

  return (
    <div className="w-full h-1.5 bg-ink-700 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${widthPct}%`, backgroundColor: color }}
      />
    </div>
  );
}
