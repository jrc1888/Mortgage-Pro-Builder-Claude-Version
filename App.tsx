
import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ScenarioBuilder from './components/ScenarioBuilder';
import { Auth } from './components/Auth';
import { Modal } from './components/Modal';
import { Scenario, ScenarioDefaults } from './types';
import { DEFAULT_SCENARIO } from './constants';
import { loadScenarios, saveScenario, deleteScenario, deleteClientFolder } from './services/supabase';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { User, MapPin, Check, ArrowRight, Loader2 } from 'lucide-react';
import { Session } from '@supabase/supabase-js';

// NEW IMPORTS FOR TOAST
import { ToastProvider } from './hooks/useToast';
import { ToastContainer } from './components/Toast';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [view, setView] = useState<'dashboard' | 'builder'>('dashboard');
  const [activeScenario, setActiveScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // User Defaults (Local Storage for Settings) - These remain local per device preference usually, 
  // or could be moved to a 'profiles' table in Supabase later.
  const [userDefaults, setUserDefaults] = useState<ScenarioDefaults>(() => {
      const saved = localStorage.getItem('mortgage_defaults');
      const baseDefaults = {
          purchasePrice: DEFAULT_SCENARIO.purchasePrice,
          downPaymentPercent: DEFAULT_SCENARIO.downPaymentPercent,
          interestRate: DEFAULT_SCENARIO.interestRate,
          loanTermMonths: DEFAULT_SCENARIO.loanTermMonths,
          propertyTaxYearly: DEFAULT_SCENARIO.propertyTaxYearly,
          homeInsuranceYearly: DEFAULT_SCENARIO.homeInsuranceYearly,
          hoaMonthly: DEFAULT_SCENARIO.hoaMonthly,
          loanType: DEFAULT_SCENARIO.loanType,
          creditScore: DEFAULT_SCENARIO.creditScore,
      };
      return saved ? { ...baseDefaults, ...JSON.parse(saved) } : baseDefaults;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newScenarioData, setNewScenarioData] = useState({ clientName: '', address: '', isTBD: true, transactionType: 'Purchase' as 'Purchase' | 'Refinance' });

  // 1. Handle Session State
  useEffect(() => {
    if (!isSupabaseConfigured()) {
        setLoadingSession(false);
        return; // Fallback to local mode implicitly if keys missing
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Fetch Data when Session is ready
  useEffect(() => {
    if (!loadingSession) {
        fetchData();
    }
  }, [session, loadingSession]);

  const fetchData = async () => {
      setIsLoadingData(true);
      const { data } = await loadScenarios();
      // Backward compatibility: ensure transactionType exists for old scenarios
      const scenariosWithDefaults = data.map(s => ({
        ...s,
        transactionType: s.transactionType || 'Purchase'
      }));
      setScenarios(scenariosWithDefaults);
      setIsLoadingData(false);
  };

  const handleLogout = async () => {
      await supabase.auth.signOut();
      setScenarios([]); // Clear data from view
  };

  const handleUpdateDefaults = (newDefaults: ScenarioDefaults) => {
      setUserDefaults(newDefaults);
      localStorage.setItem('mortgage_defaults', JSON.stringify(newDefaults));
  };

  const handleOpenNewModal = (prefilledClientName?: string) => {
      setNewScenarioData({ clientName: prefilledClientName || '', address: '', isTBD: true, transactionType: 'Purchase' });
      setIsModalOpen(true);
  };

  const startNewScenario = async () => {
    if (!newScenarioData.clientName) return;

    const now = new Date().toISOString();
    const scenario: Scenario = {
        ...DEFAULT_SCENARIO,
        ...userDefaults,
        downPaymentAmount: userDefaults.purchasePrice * (userDefaults.downPaymentPercent / 100),
        id: crypto.randomUUID(),
        dateCreated: now,
        lastUpdated: now,
        name: 'New Scenario',
        clientName: newScenarioData.clientName,
        transactionType: newScenarioData.transactionType,
        propertyAddress: newScenarioData.isTBD ? '' : newScenarioData.address,
        isAddressTBD: newScenarioData.isTBD
    };
    
    // Optimistic Update
    setScenarios(prev => [scenario, ...prev]);
    setActiveScenario(scenario);
    
    // Save to DB
    await saveScenario(scenario);

    setView('builder');
    setIsModalOpen(false);
  };

  const handleSelect = (scenario: Scenario) => {
    // Ensure transactionType exists for backward compatibility
    const scenarioWithDefaults = {
      ...scenario,
      transactionType: scenario.transactionType || 'Purchase'
    };
    setActiveScenario(scenarioWithDefaults);
    setView('builder');
  };

  const handleSave = async (updatedScenario: Scenario) => {
    // Optimistic Update
    setScenarios(prev => {
        const exists = prev.find(s => s.id === updatedScenario.id);
        return exists 
            ? prev.map(s => s.id === updatedScenario.id ? updatedScenario : s) 
            : [updatedScenario, ...prev];
    });

    await saveScenario(updatedScenario);
  };

  const handleDelete = async (id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
    await deleteScenario(id);
  };

  const handleDeleteClient = async (clientName: string) => {
      setScenarios(prev => prev.filter(s => s.clientName !== clientName));
      await deleteClientFolder(clientName);
  };

  const handleDuplicate = async (id: string) => {
    const original = scenarios.find(s => s.id === id);
    if (!original) return;
    const now = new Date().toISOString();
    const copy: Scenario = {
        ...JSON.parse(JSON.stringify(original)), 
        id: crypto.randomUUID(),
        name: `Copy of ${original.name}`,
        dateCreated: now,
        lastUpdated: now,
        history: [] 
    };

    setScenarios(prev => [copy, ...prev]);
    await saveScenario(copy);
  };

  // --- Renders ---

  if (loadingSession) {
      return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center"><Loader2 className="text-indigo-500 animate-spin" size={32} /></div>;
  }

  // If Supabase is configured but no session, show Auth
  // If Supabase is NOT configured, we skip Auth and go to Local Mode (App)
  if (isSupabaseConfigured() && !session) {
      return <Auth />;
  }
  
  return (
    // WRAP EVERYTHING IN TOAST PROVIDER
    <ToastProvider>
      <div className="font-sans text-slate-900 relative bg-slate-50 h-screen w-screen overflow-hidden">
        {view === 'dashboard' ? (
          <Dashboard 
              scenarios={scenarios} 
              onCreateNew={handleOpenNewModal} 
              onSelect={handleSelect}
              onDelete={handleDelete}
              onDeleteClient={handleDeleteClient}
              onDuplicate={handleDuplicate}
              initialClient={activeScenario?.clientName}
              userDefaults={userDefaults}
              onUpdateDefaults={handleUpdateDefaults}
              onLogout={handleLogout}
              onSync={() => fetchData()}
              isSyncing={isLoadingData}
              userEmail={session?.user?.email}
          />
        ) : (
          <ScenarioBuilder 
              initialScenario={activeScenario} 
              onSave={handleSave}
              onBack={() => setView('dashboard')}
              validationThresholds={userDefaults.validationThresholds}
          />
        )}

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Start New Scenario"
          subtitle="Enter client details to begin analysis"
          maxWidth="max-w-md"
        >
            <div className="space-y-6">
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Borrower Name</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <User size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input 
                            id="clientNameInput"
                            type="text" 
                            list="existing-clients"
                            autoFocus
                            value={newScenarioData.clientName}
                            onChange={(e) => setNewScenarioData(prev => ({...prev, clientName: e.target.value}))}
                            className="w-full pl-9 pr-4 h-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                </div>
                
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-0.5">Transaction Type</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                        <button 
                            onClick={() => setNewScenarioData(prev => ({...prev, transactionType: 'Purchase'}))}
                            className={`flex-1 py-2 px-4 text-xs font-bold uppercase rounded-md transition-all ${newScenarioData.transactionType === 'Purchase' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Purchase
                        </button>
                        <button 
                            onClick={() => setNewScenarioData(prev => ({...prev, transactionType: 'Refinance'}))}
                            className={`flex-1 py-2 px-4 text-xs font-bold uppercase rounded-md transition-all ${newScenarioData.transactionType === 'Refinance' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Refinance
                        </button>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1.5 ml-0.5">
                       <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Property Address</label>
                       <label className="flex items-center gap-2 cursor-pointer group select-none">
                           <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${newScenarioData.isTBD ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white group-hover:border-slate-400'}`}>
                               {newScenarioData.isTBD && <Check size={10} className="text-white" strokeWidth={3} />}
                           </div>
                           <input 
                              type="checkbox" 
                              className="hidden"
                              checked={newScenarioData.isTBD}
                              onChange={(e) => setNewScenarioData(prev => ({...prev, isTBD: e.target.checked}))}
                           />
                           <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${newScenarioData.isTBD ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>TBD</span>
                       </label>
                    </div>
                    
                    <div className="relative group">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <MapPin size={16} className={`transition-colors ${newScenarioData.isTBD ? 'text-slate-300' : 'text-slate-400 group-focus-within:text-indigo-500'}`} />
                        </div>
                        <input 
                            type="text" 
                            value={newScenarioData.isTBD ? '' : newScenarioData.address}
                            disabled={newScenarioData.isTBD}
                            onChange={(e) => setNewScenarioData(prev => ({...prev, address: e.target.value}))}
                            className={`w-full pl-9 pr-4 h-10 border rounded-lg text-sm placeholder-slate-400 focus:outline-none transition-all shadow-sm ${newScenarioData.isTBD ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed placeholder-slate-300' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'}`}
                            placeholder={newScenarioData.isTBD ? "No Address Required" : "123 Main St, City, State"}
                        />
                    </div>
                </div>

                <div className="pt-4 flex gap-3">
                    <button onClick={() => setIsModalOpen(false)} className="flex-1 h-10 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg font-bold transition-all text-xs uppercase tracking-wide">Cancel</button>
                    <button onClick={startNewScenario} disabled={!newScenarioData.clientName} className="flex-1 h-10 rounded-lg font-bold shadow-lg transition-all text-xs uppercase tracking-wide flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20">Create Scenario <ArrowRight size={14} /></button>
                </div>
            </div>
        </Modal>

        {/* TOAST CONTAINER - Shows notifications */}
        <ToastContainer />
      </div>
    </ToastProvider>
  );
};

export default App;
