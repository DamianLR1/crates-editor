import React, { useState } from 'react';
import { Undo2, Download, FileCode2, Copy, X } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import McText from './McText.jsx';
import { Button, VersionBadge, downloadText } from './fields.jsx';

export default function TopBar() {
  const { model, fileName, exportYaml, undo, canUndo } = useCrate();
  const [showSource, setShowSource] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-4 px-6 py-3 border-b border-ink-700 bg-ink-950/85 backdrop-blur">
        <div className="min-w-0 flex-1">
          <McText text={model.name || fileName} className="block truncate text-base font-semibold" />
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-500 font-mono-tab">
            <span className="truncate">{fileName}</span>
            <VersionBadge format={model.format} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" icon={Undo2} onClick={undo} disabled={!canUndo} title="Deshacer último cambio" />
          <Button icon={FileCode2} onClick={() => setShowSource(true)}>Ver YAML</Button>
          <Button variant="primary" icon={Download} onClick={() => downloadText(fileName || 'crate.yml', exportYaml())}>
            Exportar
          </Button>
        </div>
      </header>

      {showSource && <SourceModal onClose={() => setShowSource(false)} />}
    </>
  );
}

function SourceModal({ onClose }) {
  const { exportYaml, fileName } = useCrate();
  const text = exportYaml();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex w-full max-w-4xl max-h-[85vh] flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ink-700">
          <h3 className="text-sm font-medium text-parch-200 truncate">{fileName}</h3>
          <div className="flex items-center gap-2">
            <Button icon={Copy} onClick={() => navigator.clipboard?.writeText(text)}>Copiar</Button>
            <Button variant="ghost" icon={X} onClick={onClose}>Cerrar</Button>
          </div>
        </div>
        <pre className="overflow-auto p-5 text-xs font-mono text-parch-200 leading-relaxed">{text}</pre>
      </div>
    </div>
  );
}
