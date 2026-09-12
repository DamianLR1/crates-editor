// weightMath.js
// Pesos <-> porcentajes, residuos decimales y simulación.
//
// Sorteo real del plugin (Crate.rollReward, fork 6.3.3), en DOS niveles:
//   1) Rareza, ponderada por Rewards.Rarities.<id>.Weight del config.yml
//      GLOBAL, solo entre las rarezas que tienen rewards sorteables en la crate.
//   2) Reward dentro de esa rareza, ponderado por su Weight.
//   % final = (weight / suma_de_su_rareza) * (peso_rareza / suma_rarezas_presentes)
// Con una sola rareza colapsa a weight / total.
//
// Detalles que replica:
//   - Weight <= 0 no es sorteable (AbstractReward.isRollable) y no cuenta.
//   - Una rareza que no existe en el config cae a la "más común", la de mayor
//     Weight (RewardFactory.read -> CrateManager.getMostCommonRarity).
// Win_Limit y permisos filtran por jugador: eso no se puede simular acá.

const EPSILON = 1e-9;

// Defaults del plugin cuando el config no define rarezas (CrateManager.loadRarities).
export const DEFAULT_RARITY_WEIGHTS = {
  common: 70,
  rare: 25,
  mythic: 5,
};

export function mostCommonRarity(rarityWeights = DEFAULT_RARITY_WEIGHTS) {
  return Object.entries(rarityWeights).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? 'common';
}

/** Rareza efectiva de un reward, con el mismo fallback que el plugin. */
export function rarityOf(r, rarityWeights = DEFAULT_RARITY_WEIGHTS) {
  const id = String(r?.rarity ?? '').trim().toLowerCase();
  return Object.hasOwn(rarityWeights, id) ? id : mostCommonRarity(rarityWeights);
}

/** Suma de pesos de una lista de rewards */
export function sumWeights(rewards) {
  return rewards.reduce((acc, r) => acc + (Number(r.weight) || 0), 0);
}

/** Agrupa los rewards sorteables por rareza efectiva y calcula el chance de cada rareza. */
function groupByRarity(rewards, rarityWeights = DEFAULT_RARITY_WEIGHTS) {
  const groups = new Map();
  for (const r of rewards) {
    if (!(Number(r.weight) > 0)) continue;
    const id = rarityOf(r, rarityWeights);
    if (!groups.has(id)) groups.set(id, { id, weight: Number(rarityWeights[id]) || 0, rewards: [], sumWeights: 0 });
    const g = groups.get(id);
    g.rewards.push(r);
    g.sumWeights += Number(r.weight);
  }
  const totalRarityWeight = [...groups.values()].reduce((acc, g) => acc + g.weight, 0);
  for (const g of groups.values()) {
    g.rarityChance = totalRarityWeight > 0 ? g.weight / totalRarityWeight : 0;
  }
  return groups;
}

/** % real de cada reward (sorteo de dos niveles). */
export function computePercentages(rewards, rarityWeights) {
  const groups = groupByRarity(rewards, rarityWeights);
  return rewards.map((r) => {
    const g = Number(r.weight) > 0 ? groups.get(rarityOf(r, rarityWeights)) : null;
    const percent = g && g.sumWeights > 0 ? (Number(r.weight) / g.sumWeights) * g.rarityChance * 100 : 0;
    return { ...r, percent, rarityChance: g ? g.rarityChance * 100 : 0 };
  });
}

/** Dado un % deseado y un total objetivo, devuelve el peso necesario (caso de una sola rareza) */
export function weightForPercent(percent, total) {
  return (percent / 100) * total;
}

/** Dado un peso y un total, devuelve el % (caso de una sola rareza / dentro de su grupo) */
export function percentForWeight(weight, total) {
  if (total === 0) return 0;
  return (weight / total) * 100;
}

/**
 * Analiza la "parte decimal residual" del conjunto de pesos.
 * Si la suma de las partes decimales de todos los pesos no es un entero,
 * el total del pool nunca podrá cerrar en un número redondo usando
 * rellenos con pesos enteros.
 */
export function analyzeDecimalResidual(rewards) {
  const decimals = rewards
    .map((r) => Number(r.weight) || 0)
    .filter((w) => Math.abs(w - Math.round(w)) > EPSILON);

  const fractionalSum = decimals.reduce((acc, w) => acc + (w - Math.floor(w)), 0);

  const residual = fractionalSum - Math.floor(fractionalSum + EPSILON);
  const isClean = Math.abs(residual) < EPSILON || Math.abs(residual - 1) < EPSILON;

  return {
    decimalItemsCount: decimals.length,
    fractionalSum: round(fractionalSum, 4),
    residual: round(isClean ? 0 : residual, 4),
    isClean,
  };
}

/**
 * Calcula cuánto peso queda disponible para "rellenos" dado un total objetivo
 * y una lista de rewards fijos (llaves, armaduras, especiales, etc.)
 */
export function calcFillerBudget(fixedRewards, targetTotal) {
  return round(targetTotal - sumWeights(fixedRewards), 6);
}

/**
 * Sugiere una redistribución de N items con el mismo peso decimal problemático,
 * probando cuántos de ellos hay que "mover" a un peso entero cercano para
 * que la suma de partes decimales cierre en entero.
 * Devuelve candidatos ordenados por menor impacto (menos items movidos).
 */
export function suggestResidualFix(rewards) {
  const groups = new Map(); // peso decimal -> count
  rewards.forEach((r) => {
    const w = Number(r.weight) || 0;
    if (Math.abs(w - Math.round(w)) > EPSILON) {
      const key = w.toFixed(4);
      groups.set(key, (groups.get(key) || 0) + 1);
    }
  });

  if (groups.size === 0) {
    return { alreadyClean: true, suggestions: [] };
  }

  const suggestions = [];
  for (const [weightStr, count] of groups.entries()) {
    const w = parseFloat(weightStr);
    const frac = w - Math.floor(w);
    for (let moved = 1; moved <= count; moved++) {
      const removedFrac = moved * frac;
      if (Math.abs(removedFrac - Math.round(removedFrac)) < EPSILON) {
        suggestions.push({
          originalWeight: w,
          groupCount: count,
          itemsToAdjust: moved,
          newWeight: Math.floor(w),
          fracRemoved: round(removedFrac, 4),
        });
        break; // el primero (menor cantidad) es el de menor impacto
      }
    }
  }

  return { alreadyClean: false, suggestions };
}

/** Redondea a n decimales sin errores de punto flotante */
export function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Formatea un porcentaje. El plugin usa double completo, por eso 6 decimales. */
export function formatPercent(p, decimals = 6) {
  return `${round(p, decimals)}%`;
}

/**
 * Reporte de salud del pool: total vs objetivo, residuo decimal, pesos <= 0,
 * keys duplicadas y aviso si la crate mezcla 2+ rarezas.
 */
export function validatePool(rewards, targetTotal, rarityWeights) {
  const total = round(sumWeights(rewards), 6);
  const residual = analyzeDecimalResidual(rewards);
  const zeroOrNegative = rewards.filter((r) => Number(r.weight) <= 0);
  const keys = rewards.map((r) => r.key);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
  const rarities = [...new Set(rewards.filter((r) => Number(r.weight) > 0).map((r) => rarityOf(r, rarityWeights)))];
  const usesMultipleRarities = rarities.length > 1;

  const issues = [];
  if (targetTotal != null && Math.abs(total - targetTotal) > EPSILON) {
    issues.push({
      level: 'warning',
      msg: `El total actual (${total}) no coincide con el objetivo (${targetTotal}). Diferencia: ${round(targetTotal - total, 4)}.`,
    });
  }
  if (!residual.isClean) {
    issues.push({
      level: 'error',
      msg: `Residuo decimal detectado (${residual.residual}). Con los pesos decimales actuales, el total nunca cerrará en un número redondo usando solo rellenos enteros.`,
    });
  }
  if (zeroOrNegative.length > 0) {
    issues.push({
      level: 'warning',
      msg: `${zeroOrNegative.length} reward(s) con peso 0 o negativo (el plugin no los sortea).`,
    });
  }
  if (duplicates.length > 0) {
    issues.push({
      level: 'error',
      msg: `Keys duplicadas en el YAML: ${[...new Set(duplicates)].join(', ')}. YAML solo conserva la última.`,
    });
  }
  if (usesMultipleRarities) {
    issues.push({
      level: 'info',
      msg: `Esta crate mezcla ${rarities.length} rarezas (${rarities.join(', ')}). El % real depende también del Weight de cada rareza en el config.yml global (panel de Rarezas).`,
    });
  }

  return { total, residual, issues, usesMultipleRarities, rarities, healthy: issues.every((i) => i.level !== 'error') };
}

/** Devuelve `rng => reward` que sortea igual que el plugin, o null si no hay nada sorteable. */
export function buildRoller(rewards, rarityWeights) {
  const groups = [...groupByRarity(rewards, rarityWeights).values()].filter((g) => g.weight > 0);
  const total = groups.reduce((acc, g) => acc + g.weight, 0);
  if (total <= 0) return null;
  return (rng = Math.random) => {
    const g = pickByWeight(groups, (x) => x.weight, total, rng);
    return pickByWeight(g.rewards, (r) => Number(r.weight), g.sumWeights, rng);
  };
}

function pickByWeight(items, weightOf, total, rng) {
  let x = rng() * total;
  for (const it of items) {
    x -= weightOf(it);
    if (x < 0) return it;
  }
  return items[items.length - 1];
}

/** Monte Carlo: tira `count` aperturas y compara % teórico vs observado. */
export function simulateOpenings(rewards, count = 10000, rng = Math.random, rarityWeights) {
  const roll = buildRoller(rewards, rarityWeights);
  if (!roll) return { results: [], total: 0, count: 0 };

  const hits = new Map();
  for (let i = 0; i < count; i++) {
    const key = roll(rng).key;
    hits.set(key, (hits.get(key) || 0) + 1);
  }

  const results = computePercentages(rewards, rarityWeights)
    .filter((r) => Number(r.weight) > 0)
    .map((r) => ({
      key: r.key,
      name: r.displayName ?? r.name,
      weight: r.weight,
      rarity: rarityOf(r, rarityWeights),
      theoreticalPercent: r.percent,
      hits: hits.get(r.key) || 0,
      observedPercent: ((hits.get(r.key) || 0) / count) * 100,
    }));

  return { results, total: sumWeights(results), count };
}
