import React, { useState } from 'react';
import { Gift, Scale, Layers, AlertTriangle } from 'lucide-react';
import { CrateProvider, useCrate } from './store/CrateStore.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import PoolHealthPanel from './components/PoolHealthPanel.jsx';
import RewardsTable from './components/RewardsTable.jsx';
import CrateMetaPanel from './components/CrateMetaPanel.jsx';
import Simulator from './components/Simulator.jsx';
import ConverterPanel from './components/ConverterPanel.jsx';
import PreviewEditor from './components/PreviewEditor.jsx';
import ConversionWarningsBanner from './components/ConversionWarningsBanner.jsx';
import RarityPanel from './components/RarityPanel.jsx';
import { Datalists } from './components/fields.jsx';

const SIDE_LAYOUT = 'grid gap-6 items-start xl:grid-cols-[minmax(0,1fr)_340px]';

function AppContent() {
  const { model, fileName, error } = useCrate();
  const [section, setSection] = useState('rewards');

  if (!model) return <WelcomeScreen />;

  return (
    <div className="flex min-h-screen">
      <Datalists />
      <Sidebar section={section} setSection={setSection} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <ConversionWarningsBanner />
        {error && (
          <div className="px-6 pt-4">
            <div className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-4 py-2 text-xs text-crimson-400">{error}</div>
          </div>
        )}
        {/* key: al cambiar de crate se remontan los paneles y sus borradores */}
        <main key={fileName} className="flex-1 p-6 space-y-6">
          {section === 'rewards' && (
            <>
              <StatsRow />
              <div className={SIDE_LAYOUT}>
                <RewardsTable />
                <div className="space-y-6">
                  <PoolHealthPanel />
                  <RarityPanel />
                </div>
              </div>
            </>
          )}
          {section === 'settings' && <div className="max-w-5xl"><CrateMetaPanel /></div>}
          {section === 'previews' && <PreviewEditor />}
          {section === 'simulator' && (
            <div className={SIDE_LAYOUT}>
              <Simulator />
              <RarityPanel />
            </div>
          )}
          {section === 'convert' && <ConverterPanel />}
        </main>
      </div>
    </div>
  );
}

function StatsRow() {
  const { model, validation } = useCrate();
  const warnings = validation.issues.filter((i) => i.level !== 'info').length;
  const stats = [
    { label: 'Recompensas', value: model.rewards.length, icon: Gift },
    { label: 'Peso total', value: validation.total, icon: Scale },
    { label: 'Rarezas en uso', value: validation.rarities.length, icon: Layers },
    { label: 'Avisos', value: warnings, icon: AlertTriangle, tone: warnings ? 'text-gold-400' : 'text-emerald-400' },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map(({ label, value, icon: Icon, tone = 'text-parch-100' }) => (
        <div key={label} className="flex items-center gap-4 rounded-xl border border-ink-700 bg-ink-900 px-5 py-4">
          <Icon className="w-5 h-5 text-ink-500" strokeWidth={1.5} />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500">{label}</p>
            <p className={`text-xl font-semibold font-mono-tab ${tone}`}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <CrateProvider>
      <AppContent />
    </CrateProvider>
  );
}
