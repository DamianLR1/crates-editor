import React, { useRef, useState } from 'react';
import { ArrowRightLeft, FolderDown } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { importCrate, TARGETS } from '../lib/importCrate.js';
import { Button, saveFiles } from './fields.jsx';

const selectCls = 'bg-ink-800 border border-ink-600 rounded-lg px-2 py-1 text-xs text-parch-100 outline-none focus:border-gold-500';

/** Inicio: crates de CrazyCrates o SpecializedCrates -> ExcellentCrates en la versión elegida, con sus llaves. */
export default function ImportPanel() {
  const { openImported } = useCrate();
  const [target, setTarget] = useState('6.3.3');
  const [virtualKeys, setVirtualKeys] = useState(false);
  const [results, setResults] = useState(null);
  const [saved, setSaved] = useState(null);
  const inputRef = useRef(null);

  const convert = async (fileList) => {
    const files = [...(fileList ?? [])]; // copia: el input se vacía enseguida
    if (!files.length) return;
    setSaved(null);
    setResults(await Promise.all(files.map(async (file) => {
      try {
        return { fileName: file.name, ...importCrate(file.name, await file.text(), target, { virtualKeys }) };
      } catch (e) {
        return { fileName: file.name, error: e.message || String(e) };
      }
    })));
  };
  const ok = results?.filter((r) => !r.error) ?? [];
  const save = async () => {
    const result = await saveFiles(ok.flatMap((r) => r.files));
    if (result) setSaved(result);
  };

  return (
    <div className="mt-10 w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-500">
        <ArrowRightLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
        Convertir desde CrazyCrates o SpecializedCrates a ExcellentCrates
        <select
          value={target}
          onChange={(e) => { setTarget(e.target.value); setResults(null); }}
          className={selectCls}
          aria-label="Versión de ExcellentCrates"
        >
          {TARGETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select
          value={virtualKeys ? 'virtual' : 'fisica'}
          onChange={(e) => { setVirtualKeys(e.target.value === 'virtual'); setResults(null); }}
          className={selectCls}
          aria-label="Tipo de llaves"
          title="Físicas: un ítem que se usa en el bloque. Virtuales: se dan por comando y quedan guardadas en el jugador."
        >
          <option value="fisica">con llaves físicas</option>
          <option value="virtual">con llaves virtuales</option>
        </select>
        <button onClick={() => inputRef.current.click()} className="underline hover:text-gold-400 transition-colors">
          Elegir archivos…
        </button>
      </div>
      <input
        ref={inputRef}
        data-testid="import-input"
        type="file"
        accept=".yml,.yaml,.crate"
        multiple
        className="hidden"
        onChange={(e) => { convert(e.target.files); e.target.value = ''; }}
      />

      {results && (
        <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-parch-200">
              {ok.length} de {results.length} crate(s) convertida(s) a {target}, con llaves {virtualKeys ? 'virtuales' : 'físicas'}: {ok.length * 2} archivos en crates/ y keys/.
            </p>
            {ok.length > 0 && (
              <Button icon={FolderDown} onClick={save}>{window.showDirectoryPicker ? 'Guardar en una carpeta…' : 'Descargar archivos'}</Button>
            )}
          </div>
          {saved && <p className={`mt-2 ${saved.ok ? 'text-emerald-400' : 'text-crimson-400'}`}>{saved.msg}</p>}
          <ul className="mt-3 divide-y divide-ink-800">
            {results.map((r) => (
              <li key={r.fileName} className="py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono-tab text-parch-100">{r.fileName}</span>
                  {r.error ? (
                    <span className="text-crimson-400">{r.error}</span>
                  ) : (
                    <>
                      <span className="text-ink-500">
                        → crates/{r.id}.yml + keys/{r.id}.yml · {r.rewards} reward(s) · {r.source}
                      </span>
                      {r.editable && (
                        <button className="ml-auto underline hover:text-gold-400" onClick={() => openImported(r)}>Abrir en el editor</button>
                      )}
                    </>
                  )}
                </div>
                {r.warnings?.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-gold-400">{r.warnings.length} aviso(s)</summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-500">
                      {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-ink-500 leading-relaxed">
            {target === '5.3.3'
              ? 'El editor trabaja con 6.3.3 y 6.6.1: las crates de 5.3.3 se guardan, no se abren acá. Copiá crates/ y keys/ a plugins/ExcellentCrates con el server apagado.'
              : 'Al abrir una crate en el editor, su llave no se guarda sola: usá Guardar para llevarte también keys/.'}
          </p>
        </div>
      )}
    </div>
  );
}
