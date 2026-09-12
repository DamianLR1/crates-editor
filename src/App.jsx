import React, { useState } from 'react';
import { CrateProvider, useCrate } from './store/CrateStore.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import TopBar from './components/TopBar.jsx';
import PoolHealthPanel from './components/PoolHealthPanel.jsx';
import RewardsTable from './components/RewardsTable.jsx';
import CrateMetaPanel from './components/CrateMetaPanel.jsx';
import Simulator from './components/Simulator.jsx';
import ConversionWarningsBanner from './components/ConversionWarningsBanner.jsx';
import RarityPanel from './components/RarityPanel.jsx';
import { Datalists } from './components/fields.jsx';

function AppContent() {
  const { model, fileName, error } = useCrate();
  const [view, setView] = useState('editor');

  if (!model) return <WelcomeScreen />;

  return (
    <div className="min-h-screen">
      <Datalists />
      <TopBar view={view} setView={setView} />
      <ConversionWarningsBanner />
      {error && (
        <div className="max-w-6xl mx-auto px-6 pt-4">
          <div className="bg-crimson-500/10 border border-crimson-500/30 rounded-lg px-4 py-2 text-crimson-400 text-xs">{error}</div>
        </div>
      )}
      {/* key: al cambiar de crate se remontan los paneles y sus borradores */}
      <main key={fileName} className="max-w-6xl mx-auto px-6 py-6">
        {view === 'editor' ? (
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-6">
              <RewardsTable />
            </div>
            <div className="space-y-6">
              <PoolHealthPanel />
              <RarityPanel />
              <CrateMetaPanel />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <Simulator />
            </div>
            <div className="space-y-6">
              <PoolHealthPanel />
              <RarityPanel />
            </div>
          </div>
        )}
      </main>
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
