// weightMath.js
// Motor matemático central: pesos <-> porcentajes, detección de residuos decimales,
// y sugerencias de rebalanceo.
//
// ALGORITMO REAL DE EXCELLENTCRATES (auditado contra el source Java v6.6.1 y
// contra la wiki oficial: https://nightexpressdev.com/excellentcrates/rewards/rarity-weights/):
//
// Es un sorteo de DOS NIVELES, no un simple weight/total plano:
//
//   1) Se sortea una Rarity entre las que efectivamente tienen rewards en la
//      crate, ponderada por el Weight de cada Rarity (Rewards.Rarities.<id>.Weight
//      en el config.yml GLOBAL del plugin — no vive en el archivo de la crate).
//      rarityChance = rarity.weight / suma_de_weights_de_las_rarezas_presentes
//
//   2) Dentro de esa Rarity ganadora, se sortea el Reward ponderado por su
//      propio Weight, pero solo contra la suma de pesos de rewards de ESA
//      MISMA rareza (no contra todos los rewards del pool).
//      rewardChanceDentroDeSuRareza = reward.weight / suma_weights_de_su_rareza
//
//   % final del reward = rewardChanceDentroDeSuRareza * rarityChance
//
// Si la crate usa una sola Rarity, el sistema colapsa matemáticamente a
// weight / total (rarityChance = 1 siempre), que es el caso simple documentado
// por el propio plugin. Retrocompatible 100% con crates de una sola rareza.
//
// Defaults reales de Rarity.Weight si el config global no las define
// explícitamente (confirmado en el source, RarityManager): common=70, rare=25,
// mythic=5. Cualquier rareza no reconocida en `rarityWeights` cae a este mapa;
// si tampoco está ahí, se le asigna weight=1 para no romper el cálculo (mejor
// que dividir por cero o descartar el reward).

const EPSILON = 1e-9;

export const DEFAULT_RARITY_WEIGHTS = {
  common: 70,
  rare: 25,
  mythic: 5,
};

/** Normaliza el id de rareza igual que el plugin (Rarity.getId() -> lowercase) */
function rarityId(r) {
  return String(r?.rarity || 'common').trim().toLowerCase() || 'common';
}

function weightOfRarity(id, rarityWeights) {
  if (rarityWeights && Object.prototype.hasOwnProperty.call(rarityWeights, id)) {
    return Number(rarityWeights[id]) || 0;
  }
  if (Object.prototype.hasOwnProperty.call(DEFAULT_RARITY_WEIGHTS, id)) {
    return DEFAULT_RARITY_WEIGHTS[id];
  }
  return 1; // rareza desconocida sin config: fallback neutro, no debería pasar en la práctica
}

/** Suma de pesos de una lista de rewards activos */
export function sumWeights(rewards) {
  return rewards.reduce((acc, r) => acc + (Number(r.weight) || 0), 0);
}

/**
 * Agrupa rewards por Rarity y calcula, para cada rareza presente en la crate,
 * su propio "chance de ser elegida" (rarityChance) según su Weight relativo
 * a las demás rarezas QUE APARECEN en esta crate (no todas las rarezas
 * globales del server — Crate.getRarities() ya filtra así en el plugin real).
 */
function groupByRarity(rewards, rarityWeights) {
  const groups = new Map(); // id -> { id, weight, rewards: [] }
  for (const r of rewards) {
    const id = rarityId(r);
    if (!groups.has(id)) {
      groups.set(id, { id, weight: weightOfRarity(id, rarityWeights), rewards: [] });
    }
    groups.get(id).rewards.push(r);
  }
  const totalRarityWeight = [...groups.values()].reduce((acc, g) => acc + g.weight, 0);
  for (const g of groups.values()) {
    g.rarityChance = totalRarityWeight > 0 ? g.weight / totalRarityWeight : 0;
    g.sumWeights = sumWeights(g.rewards);
  }
  return groups;
}

/**
 * Calcula el % real de cada reward con el sistema de dos niveles.
 * `rarityWeights` es opcional: { common: 70, rare: 25, ... } tal como vive en
 * Rewards.Rarities del config.yml global. Si no se pasa, usa los defaults del
 * plugin. Con una sola rareza en la crate, da exactamente weight/total (igual
 * que antes de este fix).
 */
export function computePercentages(rewards, rarityWeights) {
  const groups = groupByRarity(rewards, rarityWeights);
  return rewards.map((r) => {
    const id = rarityId(r);
    const g = groups.get(id);
    const withinRarity = g.sumWeights > 0 ? (Number(r.weight) || 0) / g.sumWeights : 0;
    return {
      ...r,
      percent: withinRarity * g.rarityChance * 100,
      rarityChance: g.rarityChance * 100,
    };
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

  const fractionalSum = decimals.reduce((acc, w) => {
    const frac = w - Math.floor(w);
    return acc + frac;
  }, 0);

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
  const fixedSum = sumWeights(fixedRewards);
  return round(targetTotal - fixedSum, 6);
}

/**
 * Sugiere una redistribución de N items con el mismo peso decimal problemático,
 * probando cuántos de ellos hay que "mover" a un peso entero cercano para
 * que la suma de partes decimales cierre en entero.
 * Devuelve candidatos ordenados por menor impacto (menos items movidos).
 */
export function suggestResidualFix(rewards, targetTotal) {
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
    // Buscamos cuántos items de este grupo "mover" (bajarlos a peso entero, floor)
    // para neutralizar la fracción total. moved * frac debe acercarse a un entero.
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

/**
 * Formatea un porcentaje para mostrar. Default de 4 decimales: el cálculo
 * interno (computePercentages) nunca estuvo truncado, pero acá se mostraba
 * fijo a 2 decimales — por eso se veía "menos preciso" que el % real del
 * plugin (que no tiene ningún límite, es un double completo). round() ya
 * recorta ceros de sobra al convertir a string (21 sigue siendo "21", no
 * "21.0000"), así que subir el default no ensucia los casos simples.
 */
export function formatPercent(p, decimals = 6) {
  return `${round(p, decimals)}%`;
}

/**
 * Valida el pool completo y devuelve un reporte de salud:
 * - total actual vs objetivo (dentro de la Rarity, si aplica)
 * - residuo decimal
 * - items con peso 0 o negativo
 * - duplicados de key
 * - aviso informativo si la crate mezcla 2+ rarezas (el % ya no es weight/total plano)
 */
export function validatePool(rewards, targetTotal) {
  const total = round(sumWeights(rewards), 6);
  const residual = analyzeDecimalResidual(rewards);
  const zeroOrNegative = rewards.filter((r) => Number(r.weight) <= 0);
  const keys = rewards.map((r) => r.key);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
  const rarities = [...new Set(rewards.map((r) => String(r?.rarity || 'common').trim().toLowerCase() || 'common'))];
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
      msg: `${zeroOrNegative.length} reward(s) con peso 0 o negativo (serán ignorados por ExcellentCrates).`,
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
      msg: `Esta crate mezcla ${rarities.length} rarezas (${rarities.join(', ')}). El % real ya no es weight/total plano — depende también del Weight de cada Rarity en el config.yml global. Ajustalo en el panel de Rarezas si el % no te cierra.`,
    });
  }

  return { total, residual, issues, usesMultipleRarities, rarities, healthy: issues.every((i) => i.level !== 'error') };
}

/**
 * Simulador de apertura tipo Monte Carlo, replicando el sorteo real de dos
 * pasos del plugin (Crate.rollReward): primero sortea una Rarity por su
 * Weight, después sortea el Reward dentro de esa Rarity por su Weight.
 * Matemáticamente equivalente a samplear directo con las probabilidades de
 * computePercentages(), pero simulado paso a paso para que el resultado
 * observado converja de la misma forma que in-game.
 */
export function simulateOpenings(rewards, count = 10000, rng = Math.random, rarityWeights) {
  const active = rewards.filter((r) => Number(r.weight) > 0);
  if (active.length === 0) {
    return { results: [], total: 0, count: 0 };
  }

  const groups = groupByRarity(active, rarityWeights);
  const groupList = [...groups.values()].filter((g) => g.weight > 0 && g.sumWeights > 0);
  const totalRarityWeight = groupList.reduce((acc, g) => acc + g.weight, 0);
  const total = sumWeights(active);

  if (groupList.length === 0 || totalRarityWeight <= 0) {
    return { results: [], total: 0, count: 0 };
  }

  // Límites acumulados para el sorteo de Rarity (paso 1)
  let acc = 0;
  const rarityCumulative = groupList.map((g) => (acc += g.weight));
  // Límites acumulados por reward, DENTRO de cada rareza (paso 2)
  const rewardCumulativeByGroup = groupList.map((g) => {
    let a = 0;
    return g.rewards.map((r) => (a += Number(r.weight)));
  });

  const counts = new Map(active.map((r) => [r.key, 0]));

  for (let i = 0; i < count; i++) {
    const rarityRoll = rng() * totalRarityWeight;
    const gIdx = binarySearch(rarityCumulative, rarityRoll);
    const group = groupList[gIdx];
    const cumulative = rewardCumulativeByGroup[gIdx];
    const rewardRoll = rng() * group.sumWeights;
    const rIdx = binarySearch(cumulative, rewardRoll);
    const key = group.rewards[rIdx].key;
    counts.set(key, counts.get(key) + 1);
  }

  const percents = computePercentages(active, rarityWeights);
  const percentByKey = new Map(percents.map((r) => [r.key, r.percent]));

  const results = active.map((r) => {
    const hits = counts.get(r.key);
    return {
      key: r.key,
      name: r.name,
      weight: r.weight,
      rarity: rarityId(r),
      theoreticalPercent: percentByKey.get(r.key) ?? 0,
      hits,
      observedPercent: (hits / count) * 100,
    };
  });

  return { results, total, count };
}

function binarySearch(cumulative, target) {
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cumulative[mid] <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}
