import React, { useState } from 'react';
import { ArrowUpCircle, FolderDown, FileDown, Eye, CheckCircle2, AlertTriangle, BookOpen, FolderTree } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { V633, crateFormat } from '../lib/crateFile.js';
import { convertCrate, convertKey } from '../lib/convert661.js';
import { Button, Card, downloadText } from './fields.jsx';

const CHANGES = [
  ['Ítems (ItemProvider, PreviewData, ItemsData, ItemData)', 'Type + Tag / Handler + ItemId', 'Provider + Data'],
  ['Llaves', 'Key.Required + Key.Ids', 'CostOptions con entradas "key"'],
  ['Costo en moneda', 'Opening.Cost', 'Entradas "currency" dentro de cada opción'],
  ['Cooldown de apertura', 'Opening.Cooldown', 'OpeningCooldown + OpeningLimits'],
  ['Límites de premios', 'Win_Limit.Player / Global', 'Limits (un Enabled, modo DAILY/CUSTOM)'],
  ['Placeholders', 'Placeholder_Apply en todos', 'Sólo rewards ITEM; los comandos siempre usan PAPI'],
  ['Nuevo', '—', 'Block.Effect.Enabled y Post-Open.Commands'],
];

const PLUGIN_BUGS = [
  'El cooldown de apertura se perdía (6.6.1 lo guarda en 0): acá se conserva.',
  'Las opciones de costo quedaban con Enabled = Key.Required y la moneda separada de la llave (se podía abrir pagando sólo plata, o gratis): acá cada llave lleva también el costo, como en 6.3.3.',
  'Win_Limit a medianoche (-2) quedaba DAILY con 0, es decir sin cooldown: acá queda DAILY con 1.',
];

export default function ConverterPanel() {
  const { model, fileName, exportYaml, server, currentCrates, openConverted } = useCrate();
  const [single, setSingle] = useState(null);
  const [showYaml, setShowYaml] = useState(false);
  const [folder, setFolder] = useState(null);
  const [saveState, setSaveState] = useState(null);
  const legacy = model.format === V633;

  const convertThis = () => {
    try {
      setSingle(convertCrate(exportYaml()));
    } catch (e) {
      setSingle({ error: e.message });
    }
  };

  const convertFolder = () => {
    const run = (dir, name, text, fn) => {
      try {
        const legacyFile = dir === 'keys' || crateFormat(text) === V633;
        return { dir, name, legacy: legacyFile, ...fn(text) };
      } catch (e) {
        return { dir, name, error: e.message };
      }
    };
    setSaveState(null);
    setFolder([
      ...Object.entries(currentCrates()).sort().map(([name, text]) => run('crates', name, text, convertCrate)),
      ...Object.entries(server.keys).sort().map(([name, text]) => run('keys', name, text, convertKey)),
    ]);
  };

  const saveFolder = async () => {
    const files = folder.filter((f) => !f.error);
    if (!window.showDirectoryPicker) {
      // navegadores sin File System Access API: un archivo por descarga
      files.forEach((f) => downloadText(`${f.dir}-${f.name}`, f.text));
      setSaveState({ ok: true, msg: `Descargados ${files.length} archivos (prefijo crates-/keys-).` });
      return;
    }
    try {
      const root = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const f of files) {
        const dir = await root.getDirectoryHandle(f.dir, { create: true });
        const writable = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
        await writable.write(f.text);
        await writable.close();
      }
      setSaveState({ ok: true, msg: `Guardados ${files.length} archivos en "${root.name}" (crates/ y keys/).` });
    } catch (e) {
      if (e.name !== 'AbortError') setSaveState({ ok: false, msg: e.message });
    }
  };

  const folderWarnings = folder?.reduce((n, f) => n + (f.warnings?.length ?? 0), 0) ?? 0;
  const folderErrors = folder?.filter((f) => f.error).length ?? 0;

  return (
    <div className="max-w-5xl space-y-6">
      <Card title="Convertir esta caja a 6.6.1" icon={ArrowUpCircle}>
        {legacy ? (
          <>
            <p className="text-sm text-ink-500 leading-relaxed">
              <span className="text-parch-200">{fileName}</span> está en formato 6.3.3. La conversión reescribe el archivo con
              las claves de 6.6.1 y te avisa de cualquier cosa que cambie de comportamiento. No toca el original hasta que la abras o la descargues.
            </p>
            <div className="mt-4">
              <Button variant="primary" icon={ArrowUpCircle} onClick={convertThis}>Convertir {fileName}</Button>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Esta caja ya está en formato 6.6.1.
          </p>
        )}

        {single?.error && <p className="mt-4 text-sm text-crimson-400">{single.error}</p>}
        {single?.text && (
          <div className="mt-5 space-y-3">
            <WarningList items={single.warnings} />
            <div className="flex flex-wrap gap-2">
              <Button variant="success" icon={ArrowUpCircle} onClick={() => openConverted(fileName, single.text, single.warnings)}>Abrir en el editor</Button>
              <Button icon={FileDown} onClick={() => downloadText(fileName, single.text)}>Descargar</Button>
              <Button variant="ghost" icon={Eye} onClick={() => setShowYaml((v) => !v)}>{showYaml ? 'Ocultar' : 'Ver'} YAML</Button>
            </div>
            {showYaml && (
              <pre className="max-h-96 overflow-auto rounded-lg bg-ink-950 border border-ink-700 p-4 text-xs font-mono text-parch-200">{single.text}</pre>
            )}
          </div>
        )}
      </Card>

      {server && (
        <Card title="Convertir la carpeta completa" icon={FolderTree}>
          <p className="text-sm text-ink-500 leading-relaxed">
            Convierte las {Object.keys(currentCrates()).length} crates (con lo que editaste) y las {Object.keys(server.keys).length} llaves.
            Guardalo en una carpeta nueva (ej. <code>ExcellentCrates-6.6.1</code>) y copiá <code>crates/</code> y <code>keys/</code> al server con el plugin apagado.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={FolderTree} onClick={convertFolder}>Convertir carpeta</Button>
            {folder && (
              <Button icon={FolderDown} onClick={saveFolder} disabled={folder.length === folderErrors}>
                {window.showDirectoryPicker ? 'Guardar en una carpeta…' : 'Descargar archivos'}
              </Button>
            )}
          </div>
          {saveState && <p className={`mt-3 text-xs ${saveState.ok ? 'text-emerald-400' : 'text-crimson-400'}`}>{saveState.msg}</p>}

          {folder && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-ink-500">
                {folder.length} archivo(s) · {folderWarnings} aviso(s){folderErrors ? ` · ${folderErrors} con error` : ''}
              </p>
              <ul className="divide-y divide-ink-800 rounded-lg border border-ink-700">
                {folder.map((f) => (
                  <li key={`${f.dir}/${f.name}`} className="px-4 py-2.5">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex-1 truncate font-mono-tab text-parch-200">{f.dir}/{f.name}</span>
                      {f.error ? (
                        <span className="text-crimson-400">error</span>
                      ) : (
                        <span className={f.legacy ? 'text-gold-400' : 'text-ink-500'}>{f.legacy ? 'convertida' : 'ya estaba en 6.6.1'}</span>
                      )}
                    </div>
                    {f.error && <p className="mt-1 text-[11px] text-crimson-400">{f.error}</p>}
                    {f.warnings?.map((w, i) => <p key={i} className="mt-1 text-[11px] text-gold-400/90">• {w}</p>)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card title="Qué cambia de 6.3.3 a 6.6.1" icon={BookOpen}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-ink-500">
                <th className="pb-2 pr-4 font-normal">Qué</th>
                <th className="pb-2 pr-4 font-normal">6.3.3</th>
                <th className="pb-2 font-normal">6.6.1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {CHANGES.map(([what, before, after]) => (
                <tr key={what}>
                  <td className="py-2 pr-4 text-parch-200">{what}</td>
                  <td className="py-2 pr-4 font-mono text-ink-500">{before}</td>
                  <td className="py-2 font-mono text-emerald-400">{after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 mb-2 text-xs font-medium text-parch-200">Qué corrige respecto de la migración automática de 6.6.1</p>
        <ul className="space-y-1.5 text-xs text-ink-500">
          {PLUGIN_BUGS.map((b) => <li key={b}>• {b}</li>)}
        </ul>
        <p className="mt-4 text-xs text-ink-500">
          También hay una versión por consola: <code className="text-parch-200">npm run convert -- &lt;carpeta 6.3.3&gt; &lt;carpeta salida&gt;</code>
        </p>
      </Card>
    </div>
  );
}

function WarningList({ items }) {
  if (!items.length) {
    return <p className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Sin avisos: se comporta igual que en 6.3.3.</p>;
  }
  return (
    <ul className="space-y-1.5 rounded-lg border border-gold-500/30 bg-gold-400/5 px-4 py-3">
      {items.map((w, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-gold-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
          <span className="leading-relaxed">{w}</span>
        </li>
      ))}
    </ul>
  );
}
