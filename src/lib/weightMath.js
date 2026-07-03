// weightMath.js
// Motor matemático central: pesos <-> porcentajes, detección de residuos decimales,
// y sugerencias de rebalanceo. Replica la lógica documentada para ExcellentCrates:
// % de un item = (peso_item / suma_total_pesos) * 100

const EPSILON = 1e-9;

/** Suma de pesos de una lista de rewards activos (Weight > 0 cuentan, incluso si el reward está "disabled" a nivel UI se puede excluir aparte) */
export function sumWeights(rewards) {
  return rewards.reduce((acc, r) => acc + (Number(r.weight) || 0), 0);
}

/** Calcula el % real de cada reward dado el total actual */
export function computePercentages(rewards) {
  const total = sumWeights(rewards);
  return rewards.map((r) => ({
    ...r,
    percent: total > 0 ? (Number(r.weight) / total) * 100 : 0,
  }));
}

/** Dado un % deseado y un total objetivo, devuelve el peso necesario */
export function weightForPercent(percent, total) {
  return (percent / 100) * total;
}

/** Dado un peso y un total, devuelve el % */
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

/** Formatea un porcentaje para mostrar, recortando ceros innecesarios */
export function formatPercent(p, decimals = 2) {
  return `${round(p, decimals)}%`;
}

/**
 * Valida el pool completo y devuelve un reporte de salud:
 * - total actual vs objetivo
 * - residuo decimal
 * - items con peso 0 o negativo
 * - duplicados de key
 */
export function validatePool(rewards, targetTotal) {
  const total = round(sumWeights(rewards), 6);
  const residual = analyzeDecimalResidual(rewards);
  const zeroOrNegative = rewards.filter((r) => Number(r.weight) <= 0);
  const keys = rewards.map((r) => r.key);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);

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

  return { total, residual, issues, healthy: issues.every((i) => i.level !== 'error') };
}

/**
 * Simulador de apertura tipo Monte Carlo.
 * Usa el mismo algoritmo de "weighted random" estándar: acumula pesos,
 * tira un número aleatorio en [0, total) y busca en qué segmento cae.
 */
export function simulateOpenings(rewards, count = 10000, rng = Math.random) {
  const active = rewards.filter((r) => Number(r.weight) > 0);
  const total = sumWeights(active);
  if (total <= 0 || active.length === 0) {
    return { results: [], total: 0, count: 0 };
  }

  // Precomputar límites acumulados para búsqueda binaria eficiente
  const cumulative = [];
  let acc = 0;
  for (const r of active) {
    acc += Number(r.weight);
    cumulative.push(acc);
  }

  const counts = new Map(active.map((r) => [r.key, 0]));

  for (let i = 0; i < count; i++) {
    const roll = rng() * total;
    const idx = binarySearch(cumulative, roll);
    const key = active[idx].key;
    counts.set(key, counts.get(key) + 1);
  }

  const results = active.map((r) => {
    const hits = counts.get(r.key);
    return {
      key: r.key,
      name: r.name,
      weight: r.weight,
      theoreticalPercent: percentForWeight(r.weight, total),
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
