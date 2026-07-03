import React, { useState } from 'react';
import { Box, Undo2, Download, FileCode2, Eye, Table2 } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';

export default function TopBar({ view, setView }) {
  const { fileName, exportYaml, undo, canUndo } = useCrate();
  const [showSource, setShowSource] = useState(false);

  const handleDownload = () => {
    const text = exportYaml();
    const blob = new Blob([text], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'crate.yml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="border-b border-ink-700 bg-ink-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <Box className="w-5 h-5 text-gold-400" strokeWidth={1.5} />
            <span className="font-semibold text-parch-100 text-sm">CrateForge</span>
          </div>

          <div className="h-5 w-px bg-ink-700 shrink-0" />

          <span className="text-xs text-ink-500 font-mono-tab truncate">{fileName}</span>

          <nav className="ml-4 flex items-center gap-1 bg-ink-900 rounded-lg p-0.5">
            <ViewTab icon={Table2} label="Editor" active={view === 'editor'} onClick={() => setView('editor')} />
            <ViewTab icon={Eye} label="Simulador" active={view === 'sim'} onClick={() => setView('sim')} />
          </nav>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-parch-200 disabled:opacity-30 disabled:hover:text-ink-500 transition-colors px-2 py-1.5"
              title="Deshacer último cambio"
            >
              <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setShowSource(true)}
              className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-parch-200 transition-colors px-2.5 py-1.5"
            >
              <FileCode2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Ver YAML
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 bg-gold-500/15 hover:bg-gold-500/25 border border-gold-500/40 text-gold-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2} />
              Exportar
            </button>
          </div>
        </div>
      </div>

      {showSource && <SourceModal onClose={() => setShowSource(false)} />}
    </>
  );
}

function ViewTab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
        ${active ? 'bg-ink-700 text-parch-100' : 'text-ink-500 hover:text-parch-200'}`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
}

function SourceModal({ onClose }) {
  const { exportYaml } = useCrate();
  const text = exportYaml();

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-ink-900 border border-ink-700 rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-700">
          <h3 className="text-sm font-medium text-parch-200">YAML resultante</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-parch-200 text-xs">Cerrar</button>
        </div>
        <pre className="overflow-auto p-5 text-xs font-mono text-parch-200 leading-relaxed">{text}</pre>
      </div>
    </div>
  );
}
