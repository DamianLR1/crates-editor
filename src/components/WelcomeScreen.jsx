import React, { useRef, useState } from 'react';
import { UploadCloud, FilePlus2, Box, ArrowRightLeft, FolderOpen } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { V633, V661 } from '../lib/crateFile.js';
import { Button, VersionBadge } from './fields.jsx';

export default function WelcomeScreen() {
  const { openFile, newBlankFile, convertForeignCrate, openServer, server, switchCrate, error } = useCrate();
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  const foreignRef = useRef(null);

  const readWith = (fn) => (files) => {
    const file = files?.[0];
    file?.text().then((text) => fn(file.name, text));
  };
  const openYaml = readWith(openFile);
  const openForeign = readWith(convertForeignCrate);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <Box className="w-9 h-9 text-gold-400" strokeWidth={1.5} />
          <h1 className="text-4xl font-semibold tracking-tight text-parch-100">
            Editor-<span className="text-gold-400">ExcellentCrates</span>
          </h1>
        </div>
        <p className="text-ink-500 text-sm max-w-lg mx-auto leading-relaxed">
          Editá crates de ExcellentCrates 6.3.3 y 6.6.1 sin romper el YAML: probabilidades reales, validación contra
          tu server y conversión de 6.3.3 a 6.6.1.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        <ActionCard
          highlight
          icon={FolderOpen}
          title="Abrir carpeta del plugin"
          desc="plugins/ExcellentCrates: todas las crates, rarezas reales y validación."
          onClick={() => folderRef.current.click()}
        />
        <ActionCard
          active={dragOver}
          icon={UploadCloud}
          title="Abrir un archivo .yml"
          desc="Hacé click o soltalo acá."
          onClick={() => fileRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); openYaml(e.dataTransfer.files); }}
        />
        <div className="flex flex-col rounded-2xl border border-ink-700 bg-ink-900 p-5">
          <FilePlus2 className="w-6 h-6 mb-3 text-gold-400" strokeWidth={1.5} />
          <p className="text-sm font-medium text-parch-100">Caja nueva</p>
          <p className="mt-1 text-xs text-ink-500 leading-relaxed">Plantilla lista para completar.</p>
          <div className="mt-auto pt-4 flex gap-2">
            <Button variant="primary" onClick={() => newBlankFile(V661)}>6.6.1</Button>
            <Button onClick={() => newBlankFile(V633)}>6.3.3</Button>
          </div>
        </div>
      </div>

      <input id="folder-input" ref={folderRef} type="file" webkitdirectory="" multiple className="hidden" onChange={(e) => openServer(e.target.files)} />
      <input id="file-input" ref={fileRef} type="file" accept=".yml,.yaml" className="hidden" onChange={(e) => openYaml(e.target.files)} />
      <input ref={foreignRef} type="file" accept=".yml,.yaml,.crate" className="hidden" onChange={(e) => openForeign(e.target.files)} />

      {error && (
        <div className="mt-6 w-full max-w-3xl rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-4 py-3 text-sm text-crimson-400">
          {error}
        </div>
      )}

      {server && (
        <div className="mt-8 w-full max-w-3xl">
          <p className="mb-2 text-xs text-ink-500">{Object.keys(server.crates).length} crates en la carpeta — elegí una:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.keys(server.crates).sort().map((name) => (
              <button
                key={name}
                onClick={() => switchCrate(name)}
                className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-left text-xs font-mono-tab text-parch-200 hover:bg-ink-800 transition-colors"
              >
                <span className="flex-1 truncate">{name}</span>
                {server.formats[name] && <VersionBadge format={server.formats[name]} />}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => foreignRef.current.click()}
        className="mt-10 inline-flex items-center gap-2 text-xs text-ink-500 hover:text-gold-400 transition-colors"
      >
        <ArrowRightLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
        Convertir desde CrazyCrates o SpecializedCrates
      </button>
    </div>
  );
}

function ActionCard({ icon: Icon, title, desc, highlight = false, active = false, ...props }) {
  return (
    <button
      {...props}
      className={`rounded-2xl border p-5 text-left transition-colors ${
        active ? 'border-gold-400 bg-gold-400/10'
          : highlight ? 'border-gold-500/40 bg-gold-500/5 hover:bg-gold-500/10'
            : 'border-ink-700 bg-ink-900 hover:border-ink-500'
      }`}
    >
      <Icon className="w-6 h-6 mb-3 text-gold-400" strokeWidth={1.5} />
      <p className="text-sm font-medium text-parch-100">{title}</p>
      <p className="mt-1 text-xs text-ink-500 leading-relaxed">{desc}</p>
    </button>
  );
}
