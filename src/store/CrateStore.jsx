import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  parseYaml,
  V661,
} from '../lib/crateFile.js';
import { convertCrate } from '../lib/convert661.js';
import { parseSpecializedCrate, buildExcellentCratesYaml } from '../lib/specializedConverter.js';
import { validatePool, DEFAULT_RARITY_WEIGHTS } from '../lib/weightMath.js';
import { readServerFolder, inspectCrate } from '../lib/serverContext.js';
import { loadCachedAssets, extractAssets, createAssets, saveAssets, clearCachedAssets, loadFont } from '../lib/mcAssets.js';

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

// Caja nueva en 6.3.3. La de 6.6.1 sale de convertirla (así no hay dos plantillas).
// ItemProvider: sin él el ítem de la caja sale como barrera. _dataver: sin él el
// plugin hace un backup y "migra" el archivo al cargarlo.
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
  const [conversionWarnings, setConversionWarnings] = useState(null); // { title, items, note }
  const [server, setServer] = useState(null); // carpeta plugins/ExcellentCrates abierta
  const [preview, setPreview] = useState(null); // menú de preview abierto: { name, text }
  const [previewHistory, setPreviewHistory] = useState([]);

  // Texturas y fuente de Minecraft del .jar del usuario (ver mcAssets.js)
  const [mcAssets, setMcAssets] = useState(null);
  const [mcFont, setMcFont] = useState(null);
  const [mcStatus, setMcStatus] = useState(null); // 'loading' | mensaje de error
  const assetsRef = useRef(null);
  const applyAssets = useCallback((next) => {
    assetsRef.current?.dispose();
    assetsRef.current = next;
    setMcAssets(next);
  }, []);

  useEffect(() => {
    loadCachedAssets().then((cached) => cached && applyAssets(cached));
  }, [applyAssets]);

  useEffect(() => {
    setMcFont(null);
    if (mcAssets) loadFont(mcAssets).then(setMcFont).catch(() => setMcFont(null));
  }, [mcAssets]);

  /** add: suma los archivos a lo ya cargado (p. ej. la unifont después del .jar) en vez de reemplazarlo. */
  const loadMcAssets = useCallback(async (fileList, add = false) => {
    const picked = [...(fileList ?? [])]; // copia: el input se vacía apenas se eligen los archivos
    if (!picked.length) return;
    setMcStatus('loading');
    try {
      const current = add ? assetsRef.current : null;
      const files = new Map(current?.files ?? []);
      for (const [path, data] of await extractAssets(picked)) files.set(path, data);
      if (![...files.keys()].some((k) => k.startsWith('textures/'))) {
        throw new Error('No encontré texturas de Minecraft. Elegí el .jar del cliente (.minecraft/versions/<versión>/<versión>.jar) o un resource pack .zip.');
      }
      const names = picked.map((f) => (/^[0-9a-f]{40}$/.test(f.name) ? 'unifont' : f.name)); // los objetos del juego tienen nombre hash
      const label = [current?.label, ...names].filter(Boolean).join(' + ');
      await saveAssets(files, label).catch(() => {}); // sin IndexedDB igual sirven en esta sesión
      applyAssets(createAssets(files, label));
      setMcStatus(null);
    } catch (e) {
      setMcStatus(e.message || String(e));
    }
  }, [applyAssets]);

  const clearMcAssets = useCallback(() => {
    clearCachedAssets().catch(() => {});
    applyAssets(null);
  }, [applyAssets]);

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

  const open = useCallback((name, src, notice = null) => {
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
    setConversionWarnings(notice);
  }, []);

  /** SpecializedCrates (.crate/.yml) -> crate de ExcellentCrates 6.3.3. Ver specializedConverter.js. */
  const convertSpecializedFile = useCallback((name, src) => {
    try {
      const parsed = parseSpecializedCrate(src);
      setTargetTotal(parsed.suggestedTargetTotal || 1000);
      open(name.replace(/\.(crate|ya?ml)$/i, '') + '.yml', buildExcellentCratesYaml(parsed), {
        title: `Convertido desde ${name} (SpecializedCrates): ${parsed.rewards.length} reward(s), pesos 1:1 desde el chance original.`,
        items: parsed.warnings,
        note: 'Los rewards con nbt-tags quedan como preview vanilla; si usabas ítems custom, cargalos a mano.',
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

  // Crates de la carpeta con lo editado de la actual incluido.
  const currentCrates = useCallback(
    () => (server && fileName && text != null ? { ...server.crates, [fileName]: text } : server?.crates ?? {}),
    [server, fileName, text],
  );

  const switchCrate = useCallback((name) => {
    if (!server) return;
    // guarda lo editado de la crate actual para no perderlo al volver a ella
    const crates = currentCrates();
    setServer({ ...server, crates });
    open(name, crates[name]);
  }, [server, currentCrates, open]);

  // Volver a la pantalla de inicio. Con la carpeta abierta lo editado queda guardado en ella.
  const goHome = useCallback(() => {
    if (!server && history.length > 0 && !window.confirm('Esta caja tiene cambios que quizás no exportaste. ¿Volver al inicio igual?')) return;
    if (server) setServer({ ...server, crates: currentCrates() });
    setText(null);
    setFileName(null);
    setHistory([]);
    setConversionWarnings(null);
    setPreview(null);
    setError(null);
  }, [server, history, currentCrates]);

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

  const openPreview = useCallback((name, src) => {
    try {
      parseYaml(src);
    } catch (e) {
      setError(e.message || String(e));
      return;
    }
    setPreview({ name, text: src });
    setPreviewHistory([]);
    setError(null);
  }, []);

  // Lo editado del preview queda también en la carpeta abierta (para volver a él o cambiar de crate).
  const applyPreview = useCallback((name, next) => {
    setPreview({ name, text: next });
    setServer((s) => (s ? { ...s, previews: { ...s.previews, [name]: next } } : s));
  }, []);

  const editPreview = useCallback((fn) => {
    if (!preview) return;
    let next;
    try {
      next = editCrateText(preview.text, fn);
      parseYaml(next);
    } catch (e) {
      setError(e.message || String(e));
      return;
    }
    if (next === preview.text) return;
    setPreviewHistory((h) => [...h.slice(-49), preview.text]);
    applyPreview(preview.name, next);
    setError(null);
  }, [preview, applyPreview]);

  const undoPreview = useCallback(() => {
    if (!preview || previewHistory.length === 0) return;
    applyPreview(preview.name, previewHistory[previewHistory.length - 1]);
    setPreviewHistory(previewHistory.slice(0, -1));
  }, [preview, previewHistory, applyPreview]);

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
    currentCrates,
    canUndo: history.length > 0,
    undo,
    openFile: open,
    openConverted: (name, src, warnings) => open(name, src, {
      title: `Convertida a 6.6.1${warnings.length ? `: ${warnings.length} aviso(s) para revisar` : ' sin avisos'}. Exportala para usarla en el server.`,
      items: warnings,
    }),
    newBlankFile: (format = V661) => open('nueva_caja.yml', format === V661 ? convertCrate(BLANK_CRATE).text : BLANK_CRATE),
    convertSpecializedFile,
    conversionWarnings,
    dismissConversionWarnings: () => setConversionWarnings(null),
    updateWeight: (key, weight) => edit((d) => setRewardWeight(d, key, weight)),
    /** field puede ser 'Name' o ['Limits', 'Enabled'] */
    updateField: (key, field, v) => edit((d) => setRewardField(d, key, field, v)),
    setRewardNode: (key, field, obj) => edit((d) => setNode(d, ['Rewards', 'List', key, field], obj)),
    updateCrateField: (path, v) => edit((d) => setField(d, path, v)),
    updateCrateStringSeq: (path, values) => edit((d) => setStringSeq(d, path, values)),
    setCrateNode: (path, obj) => edit((d) => setNode(d, path, obj)),
    deleteCrateField: (path) => edit((d) => deleteField(d, path)),
    addMilestone: (rewardId, openings) => edit((d) => addMilestone(d, rewardId, openings)),
    createReward: (key, data) => edit((d) => addReward(d, key, data, model?.format)),
    removeReward: (key) => edit((d) => deleteReward(d, key)),
    renameRewardKey: (oldKey, newKey) => edit((d) => renameReward(d, oldKey, newKey)),
    exportYaml: () => text ?? '',
    goHome,
    mcAssets,
    mcFont,
    mcStatus,
    loadMcAssets,
    clearMcAssets,
    preview,
    openPreview,
    closePreview: () => setPreview(null),
    canUndoPreview: previewHistory.length > 0,
    undoPreview,
    previewEdit: {
      set: (path, v) => editPreview((d) => setField(d, path, v)),
      seq: (path, values) => editPreview((d) => setStringSeq(d, path, values)),
      node: (path, obj) => editPreview((d) => setNode(d, path, obj)),
      del: (path) => editPreview((d) => deleteField(d, path)),
    },
  };

  return <CrateContext.Provider value={value}>{children}</CrateContext.Provider>;
}

export function useCrate() {
  const ctx = useContext(CrateContext);
  if (!ctx) throw new Error('useCrate debe usarse dentro de <CrateProvider>');
  return ctx;
}
