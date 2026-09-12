import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  loadCrateFile,
  editCrateText,
  setRewardWeight,
  setRewardField,
  setField,
  setStringSeq,
  setNode,
  deleteField,
  addReward,
  deleteReward,
  renameReward,
  addMilestone,
} from '../lib/crateFile.js';
import { parseSpecializedCrate, buildExcellentCratesYaml } from '../lib/specializedConverter.js';
import { validatePool, DEFAULT_RARITY_WEIGHTS } from '../lib/weightMath.js';
import { readServerFolder, inspectCrate } from '../lib/serverContext.js';

const RARITY_WEIGHTS_STORAGE_KEY = 'crateforge.rarityWeights';

function loadStoredRarityWeights() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RARITY_WEIGHTS_STORAGE_KEY));
    return parsed && typeof parsed === 'object' ? parsed : { ...DEFAULT_RARITY_WEIGHTS };
  } catch {
    return { ...DEFAULT_RARITY_WEIGHTS };
  }
}

function storeRarityWeights(weights) {
  try { localStorage.setItem(RARITY_WEIGHTS_STORAGE_KEY, JSON.stringify(weights)); } catch { /* noop */ }
}

const weightsOf = (rarities) => Object.fromEntries(Object.entries(rarities).map(([id, r]) => [id, r.weight]));

// Caja nueva: ItemProvider (sin él el ítem de la caja sale como barrera) y
// _dataver (sin él el plugin hace un backup y "migra" el archivo al cargarlo).
const BLANK_CRATE = `Name: '&eNueva Caja'
Description:
- '&7Descripcion de la caja'
ItemProvider:
  Type: VANILLA
  Tag:
    Value: '{count:1,id:"minecraft:chest"}'
    DataVersion: 4189
ItemStackable: false
Permission_Required: false
Preview:
  Enabled: true
  Id: default
Animation:
  Enabled: true
  Id: roulette
Opening:
  Cooldown: 0
Key:
  Required: true
  Ids:
  - nueva_caja
Block:
  Positions: []
  Pushback:
    Enabled: false
  Hologram:
    Enabled: false
    Template: default
    Y_Offset: 0.0
  Effect:
    Model: simple
    Particle:
      Name: EGG_CRACK
Milestones:
  Repeatable: false
_dataver: 600
Rewards:
  List: {}
`;

const CrateContext = createContext(null);

export function CrateProvider({ children }) {
  const [fileName, setFileName] = useState(null);
  const [text, setText] = useState(null); // el YAML es la única fuente de verdad
  const [history, setHistory] = useState([]); // textos anteriores, para deshacer
  const [error, setError] = useState(null);
  const [targetTotal, setTargetTotal] = useState(1000);
  const [conversionWarnings, setConversionWarnings] = useState(null); // null = no hubo conversión
  const [server, setServer] = useState(null); // carpeta plugins/ExcellentCrates abierta

  // Rewards.Rarities vive en el config.yml GLOBAL: se carga de la carpeta del
  // server o se configura a mano (persistido localmente).
  const [rarityWeights, setRarityWeightsState] = useState(loadStoredRarityWeights);

  const model = useMemo(() => (text == null ? null : loadCrateFile(text).model), [text]);

  const setRarityWeights = useCallback((next) => {
    setRarityWeightsState(next);
    storeRarityWeights(next);
  }, []);

  const setRarityWeight = useCallback((id, weight) => {
    setRarityWeightsState((prev) => {
      const next = { ...prev, [String(id).toLowerCase()]: Number(weight) || 0 };
      storeRarityWeights(next);
      return next;
    });
  }, []);

  const resetRarityWeights = useCallback(() => {
    setRarityWeights(server?.rarities ? weightsOf(server.rarities) : { ...DEFAULT_RARITY_WEIGHTS });
  }, [server, setRarityWeights]);

  const open = useCallback((name, src, warnings = null) => {
    try {
      loadCrateFile(src);
    } catch (e) {
      setError(e.message || String(e));
      return;
    }
    setFileName(name);
    setText(src);
    setHistory([]);
    setError(null);
    setConversionWarnings(warnings);
  }, []);

  /** SpecializedCrates (.crate/.yml) -> crate de ExcellentCrates. Ver specializedConverter.js. */
  const convertSpecializedFile = useCallback((name, src) => {
    try {
      const parsed = parseSpecializedCrate(src);
      setTargetTotal(parsed.suggestedTargetTotal || 1000);
      open(name.replace(/\.(crate|ya?ml)$/i, '') + '.yml', buildExcellentCratesYaml(parsed), {
        sourceName: name,
        rewardCount: parsed.rewards.length,
        items: parsed.warnings,
      });
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [open]);

  const openServer = useCallback(async (files) => {
    try {
      const s = await readServerFolder(files);
      setServer(s);
      if (s.rarities) setRarityWeights(weightsOf(s.rarities));
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [setRarityWeights]);

  const switchCrate = useCallback((name) => {
    if (!server) return;
    // guarda lo editado de la crate actual para no perderlo al volver a ella
    const crates = fileName && text != null ? { ...server.crates, [fileName]: text } : server.crates;
    setServer({ ...server, crates });
    open(name, crates[name]);
  }, [server, fileName, text, open]);

  const edit = useCallback((fn) => {
    if (text == null) return;
    let next;
    try {
      next = editCrateText(text, fn);
      loadCrateFile(next); // si el resultado no parsea no se aplica: mejor un error que perder el archivo
    } catch (e) {
      setError(e.message || String(e));
      return;
    }
    if (next === text) return;
    setHistory((h) => [...h.slice(-49), text]);
    setText(next);
    setError(null);
  }, [text]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setText(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }, [history]);

  const validation = useMemo(() => {
    if (!model) return null;
    const pool = validatePool(model.rewards, targetTotal, rarityWeights);
    const issues = [...pool.issues, ...inspectCrate(model, server, rarityWeights)];
    return { ...pool, issues, healthy: issues.every((i) => i.level !== 'error') };
  }, [model, targetTotal, rarityWeights, server]);

  const value = {
    fileName,
    model,
    error,
    targetTotal,
    setTargetTotal,
    validation,
    rarityWeights,
    rarityNames: server?.rarities ? Object.fromEntries(Object.entries(server.rarities).map(([id, r]) => [id, r.name])) : null,
    setRarityWeight,
    resetRarityWeights,
    server,
    openServer,
    switchCrate,
    canUndo: history.length > 0,
    undo,
    openFile: open,
    newBlankFile: () => open('nueva_caja.yml', BLANK_CRATE),
    convertSpecializedFile,
    conversionWarnings,
    dismissConversionWarnings: () => setConversionWarnings(null),
    updateWeight: (key, weight) => edit((d) => setRewardWeight(d, key, weight)),
    /** field puede ser 'Name' o ['Win_Limit', 'Player', 'Enabled'] */
    updateField: (key, field, v) => edit((d) => setRewardField(d, key, field, v)),
    setRewardNode: (key, field, obj) => edit((d) => setNode(d, ['Rewards', 'List', key, field], obj)),
    updateCrateField: (path, v) => edit((d) => setField(d, path, v)),
    updateCrateStringSeq: (path, values) => edit((d) => setStringSeq(d, path, values)),
    deleteCrateField: (path) => edit((d) => deleteField(d, path)),
    addMilestone: (rewardId, openings) => edit((d) => addMilestone(d, rewardId, openings)),
    createReward: (key, data) => edit((d) => addReward(d, key, data)),
    removeReward: (key) => edit((d) => deleteReward(d, key)),
    renameRewardKey: (oldKey, newKey) => edit((d) => renameReward(d, oldKey, newKey)),
    exportYaml: () => text ?? '',
  };

  return <CrateContext.Provider value={value}>{children}</CrateContext.Provider>;
}

export function useCrate() {
  const ctx = useContext(CrateContext);
  if (!ctx) throw new Error('useCrate debe usarse dentro de <CrateProvider>');
  return ctx;
}
