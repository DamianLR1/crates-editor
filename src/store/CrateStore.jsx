import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  loadCrateFile,
  serializeCrateFile,
  setRewardWeight,
  setRewardField,
  setField,
  setStringSeq,
  addReward,
  deleteReward,
  renameReward,
} from '../lib/crateFile.js';
import { parseSpecializedCrate, buildExcellentCratesYaml } from '../lib/specializedConverter.js';
import { validatePool, DEFAULT_RARITY_WEIGHTS } from '../lib/weightMath.js';

const RARITY_WEIGHTS_STORAGE_KEY = 'crateforge.rarityWeights';

function loadStoredRarityWeights() {
  try {
    const raw = localStorage.getItem(RARITY_WEIGHTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RARITY_WEIGHTS };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { ...DEFAULT_RARITY_WEIGHTS };
  } catch {
    return { ...DEFAULT_RARITY_WEIGHTS };
  }
}

const CrateContext = createContext(null);

export function CrateProvider({ children }) {
  const [fileName, setFileName] = useState(null);
  const [doc, setDoc] = useState(null);
  const [model, setModel] = useState(null);
  const [targetTotal, setTargetTotal] = useState(1000);
  const [history, setHistory] = useState([]); // para undo simple
  const [error, setError] = useState(null);
  const [conversionWarnings, setConversionWarnings] = useState(null); // null = no hubo conversión

  // Rewards.Rarities.<id>.Weight vive en el config.yml GLOBAL del server
  // (no en el archivo de la crate individual), así que no lo leemos de ningún
  // YAML — es configuración del editor, persistida localmente. Ver
  // weightMath.js para el porqué esto afecta el % real de cada reward.
  const [rarityWeights, setRarityWeightsState] = useState(() => loadStoredRarityWeights());

  const setRarityWeight = useCallback((id, weight) => {
    setRarityWeightsState((prev) => {
      const next = { ...prev, [String(id).toLowerCase()]: Number(weight) || 0 };
      try { localStorage.setItem(RARITY_WEIGHTS_STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const resetRarityWeights = useCallback(() => {
    const next = { ...DEFAULT_RARITY_WEIGHTS };
    setRarityWeightsState(next);
    try { localStorage.setItem(RARITY_WEIGHTS_STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }, []);

  const openFile = useCallback((name, text) => {
    try {
      const { doc: newDoc, model: newModel } = loadCrateFile(text);
      setFileName(name);
      setDoc(newDoc);
      setModel(newModel);
      setHistory([]);
      setError(null);
      setConversionWarnings(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  /**
   * Convierte un archivo de SpecializedCrates (formato "Almas.crate") a un
   * config.yml de ExcellentCrates equivalente y lo abre en el editor.
   * Ver src/lib/specializedConverter.js para el detalle de mapeo chance→Weight.
   */
  const convertSpecializedFile = useCallback((name, text) => {
    try {
      const parsed = parseSpecializedCrate(text);
      const yaml = buildExcellentCratesYaml(parsed);
      const { doc: newDoc, model: newModel } = loadCrateFile(yaml);
      const outName = name.replace(/\.(crate|ya?ml)$/i, '') + '.yml';
      setFileName(outName);
      setDoc(newDoc);
      setModel(newModel);
      setTargetTotal(parsed.suggestedTargetTotal || 1000);
      setHistory([]);
      setError(null);
      setConversionWarnings({
        sourceName: name,
        rewardCount: parsed.rewards.length,
        items: parsed.warnings,
      });
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  const dismissConversionWarnings = useCallback(() => setConversionWarnings(null), []);

  const newBlankFile = useCallback(() => {
    const blankYaml = `Name: '&eNueva Caja'
Description:
- '&7Descripcion de la caja'
ItemStackable: false
Permission_Required: false
Preview:
  Enabled: true
  Id: nueva_caja
Animation:
  Enabled: true
  Id: nueva_caja
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
    Template: nueva_caja
    Y_Offset: 0.0
  Effect:
    Model: simple
    Particle:
      Name: EGG_CRACK
Milestones:
  Repeatable: false
Rewards:
  List: {}
`;
    openFile('nueva_caja.yml', blankYaml);
  }, [openFile]);

  const refreshModelFromDoc = useCallback((newDoc) => {
    const { model: newModel } = loadCrateFile(serializeCrateFile(newDoc));
    setModel(newModel);
  }, []);

  const pushHistory = useCallback(() => {
    if (!doc) return;
    setHistory((h) => [...h.slice(-19), serializeCrateFile(doc)]);
  }, [doc]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      const { doc: restoredDoc, model: restoredModel } = loadCrateFile(last);
      setDoc(restoredDoc);
      setModel(restoredModel);
      return h.slice(0, -1);
    });
  }, []);

  const updateWeight = useCallback((rewardKey, newWeight) => {
    if (!doc) return;
    pushHistory();
    setRewardWeight(doc, rewardKey, newWeight);
    refreshModelFromDoc(doc);
  }, [doc, pushHistory, refreshModelFromDoc]);

  /** field puede ser 'Name' o ['Win_Limit', 'Player', 'Enabled'] */
  const updateField = useCallback((rewardKey, field, value) => {
    if (!doc) return;
    pushHistory();
    setRewardField(doc, rewardKey, field, value);
    refreshModelFromDoc(doc);
  }, [doc, pushHistory, refreshModelFromDoc]);

  /** Actualiza un campo escalar en cualquier parte del doc (nivel crate, no reward) */
  const updateCrateField = useCallback((path, value) => {
    if (!doc) return;
    pushHistory();
    setField(doc, path, value);
    refreshModelFromDoc(doc);
  }, [doc, pushHistory, refreshModelFromDoc]);

  /** Actualiza una secuencia de strings a nivel crate (Positions, Ids, Description) */
  const updateCrateStringSeq = useCallback((path, values) => {
    if (!doc) return;
    pushHistory();
    setStringSeq(doc, path, values);
    refreshModelFromDoc(doc);
  }, [doc, pushHistory, refreshModelFromDoc]);

  const createReward = useCallback((key, data) => {
    if (!doc) return;
    pushHistory();
    addReward(doc, key, data);
    refreshModelFromDoc(doc);
  }, [doc, pushHistory, refreshModelFromDoc]);

  const removeReward = useCallback((key) => {
    if (!doc) return;
    pushHistory();
    deleteReward(doc, key);
    refreshModelFromDoc(doc);
  }, [doc, pushHistory, refreshModelFromDoc]);

  const renameRewardKey = useCallback((oldKey, newKey) => {
    if (!doc) return;
    pushHistory();
    renameReward(doc, oldKey, newKey);
    refreshModelFromDoc(doc);
  }, [doc, pushHistory, refreshModelFromDoc]);

  const exportYaml = useCallback(() => {
    if (!doc) return '';
    return serializeCrateFile(doc);
  }, [doc]);

  const validation = useMemo(() => {
    if (!model) return null;
    return validatePool(model.rewards, targetTotal);
  }, [model, targetTotal]);

  const value = {
    fileName,
    doc,
    model,
    error,
    targetTotal,
    setTargetTotal,
    validation,
    rarityWeights,
    setRarityWeight,
    resetRarityWeights,
    canUndo: history.length > 0,
    openFile,
    newBlankFile,
    convertSpecializedFile,
    conversionWarnings,
    dismissConversionWarnings,
    updateWeight,
    updateField,
    updateCrateField,
    updateCrateStringSeq,
    createReward,
    removeReward,
    renameRewardKey,
    exportYaml,
    undo,
  };

  return <CrateContext.Provider value={value}>{children}</CrateContext.Provider>;
}

export function useCrate() {
  const ctx = useContext(CrateContext);
  if (!ctx) throw new Error('useCrate debe usarse dentro de <CrateProvider>');
  return ctx;
}
