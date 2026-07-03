import React, { useCallback, useState } from 'react';
import { UploadCloud, FilePlus2, Box, ArrowRightLeft } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';

export default function WelcomeScreen() {
  const { openFile, newBlankFile, convertSpecializedFile, error } = useCrate();
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback((files) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => openFile(file.name, e.target.result);
    reader.readAsText(file);
  }, [openFile]);

  const handleSpecializedFile = useCallback((files) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => convertSpecializedFile(file.name, e.target.result);
    reader.readAsText(file);
  }, [convertSpecializedFile]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <Box className="w-9 h-9 text-gold-400" strokeWidth={1.5} />
          <h1 className="text-4xl font-semibold tracking-tight text-parch-100">
            Crate<span className="text-gold-400">Forge</span>
          </h1>
        </div>
        <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed">
          Editor visual para configuraciones de ExcellentCrates. Pesos, porcentajes
          exactos y simulación de aperturas — sin romper el formato de tu YAML.
        </p>
      </div>

      <div
        className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer
          ${dragOver ? 'border-gold-400 bg-gold-400/5' : 'border-ink-600 hover:border-ink-500'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => document.getElementById('file-input').click()}
      >
        <UploadCloud className="w-8 h-8 mx-auto mb-3 text-ink-500" strokeWidth={1.5} />
        <p className="text-parch-200 font-medium mb-1">Soltá tu archivo .yml acá</p>
        <p className="text-ink-500 text-sm">o hacé click para elegirlo</p>
        <input
          id="file-input"
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <div className="mt-4 w-full max-w-xl bg-crimson-500/10 border border-crimson-500/30 rounded-lg px-4 py-3 text-crimson-400 text-sm">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <div className="h-px w-16 bg-ink-700" />
        <span className="text-ink-500 text-xs uppercase tracking-wider">o</span>
        <div className="h-px w-16 bg-ink-700" />
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={newBlankFile}
          className="inline-flex items-center gap-2 text-sm text-parch-200 hover:text-gold-400 transition-colors"
        >
          <FilePlus2 className="w-4 h-4" strokeWidth={1.5} />
          Empezar una caja desde cero
        </button>

        <span className="text-ink-600 hidden sm:inline">·</span>

        <button
          onClick={() => document.getElementById('specialized-file-input').click()}
          className="inline-flex items-center gap-2 text-sm text-parch-200 hover:text-gold-400 transition-colors"
        >
          <ArrowRightLeft className="w-4 h-4" strokeWidth={1.5} />
          Convertir desde SpecializedCrates
        </button>
        <input
          id="specialized-file-input"
          type="file"
          accept=".yml,.yaml,.crate"
          className="hidden"
          onChange={(e) => handleSpecializedFile(e.target.files)}
        />
      </div>
    </div>
  );
}
