import React, { useRef, useState } from 'react';
import { Box, Gift, Settings2, LayoutGrid, Dices, ArrowUpCircle, FolderOpen, FileUp, FilePlus2, Search } from 'lucide-react';
import { useCrate } from '../store/CrateStore.jsx';
import { V633 } from '../lib/crateFile.js';
import { VersionBadge } from './fields.jsx';

const NAV = [
  { id: 'rewards', label: 'Recompensas', icon: Gift },
  { id: 'settings', label: 'Configuración', icon: Settings2 },
  { id: 'previews', label: 'Previews', icon: LayoutGrid },
  { id: 'simulator', label: 'Simulador', icon: Dices },
  { id: 'convert', label: 'Convertir a 6.6.1', icon: ArrowUpCircle },
];

export default function Sidebar({ section, setSection }) {
  const { model, fileName, server, switchCrate, openServer, openFile, newBlankFile } = useCrate();
  const [query, setQuery] = useState('');
  const folderRef = useRef(null);
  const fileRef = useRef(null);

  const crates = server ? [...new Set([fileName, ...Object.keys(server.crates)])].filter(Boolean).sort() : [];
  const shown = crates.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-ink-700 bg-ink-950/70">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-ink-700">
        <Box className="w-5 h-5 text-gold-400" strokeWidth={1.5} />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-parch-100">Editor-ExcellentCrates</p>
          <p className="text-[10px] text-ink-500">Crates 6.3.3 · 6.6.1</p>
        </div>
      </div>

      <nav className="p-3 space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            aria-current={section === id ? 'page' : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              section === id ? 'bg-ink-800 text-parch-100' : 'text-ink-500 hover:text-parch-200 hover:bg-ink-900'
            }`}
          >
            <Icon className="w-4 h-4" strokeWidth={1.5} />
            <span className="flex-1 text-left">{label}</span>
            {id === 'convert' && model.format === V633 && <span className="w-1.5 h-1.5 rounded-full bg-gold-400" title="Esta caja está en 6.3.3" />}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-h-0 flex flex-col border-t border-ink-700">
        {server ? (
          <>
            <div className="px-3 pt-3 pb-2">
              <p className="px-1 mb-2 text-[10px] uppercase tracking-wider text-ink-500">Crates ({crates.length})</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-ink-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar crate..."
                  className="w-full bg-ink-900 border border-ink-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-parch-100 outline-none focus:border-gold-500"
                />
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
              {shown.map((name) => {
                const format = name === fileName ? model.format : server.formats[name];
                return (
                  <li key={name}>
                    <button
                      onClick={() => name !== fileName && switchCrate(name)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-mono-tab transition-colors ${
                        name === fileName ? 'bg-gold-500/10 text-gold-400' : 'text-parch-200 hover:bg-ink-900'
                      }`}
                    >
                      <span className="flex-1 truncate text-left">{name}</span>
                      {format && <VersionBadge format={format} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="p-4 text-xs text-ink-500 leading-relaxed">
            Abrí la carpeta <code className="text-parch-200">plugins/ExcellentCrates</code> para ver todas las crates, usar las rarezas
            reales y validar llaves, previews y animaciones.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 p-3 border-t border-ink-700">
        <SideAction icon={FolderOpen} label="Carpeta" onClick={() => folderRef.current.click()} />
        <SideAction icon={FileUp} label="Archivo" onClick={() => fileRef.current.click()} />
        <SideAction icon={FilePlus2} label="Nueva" onClick={() => newBlankFile(model.format)} />
        <input ref={folderRef} type="file" webkitdirectory="" multiple className="hidden" onChange={(e) => openServer(e.target.files)} />
        <input
          ref={fileRef}
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files[0];
            file?.text().then((text) => openFile(file.name, text));
            e.target.value = ''; // permite volver a abrir el mismo archivo
          }}
        />
      </div>
    </aside>
  );
}

function SideAction({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] text-ink-500 hover:bg-ink-900 hover:text-parch-200 transition-colors">
      <Icon className="w-4 h-4" strokeWidth={1.5} />
      {label}
    </button>
  );
}
