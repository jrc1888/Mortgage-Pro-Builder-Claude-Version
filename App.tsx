
import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import ScenarioBuilder from './components/ScenarioBuilder';
import { Home } from './components/Home';
import { Auth } from './components/Auth';
import { Modal } from './components/Modal';
import { SMSDemo } from './components/SMSDemo';
import { ClientUpdates } from './components/ClientUpdates';
import { Scenario, ScenarioDefaults } from './types';
import { DEFAULT_SCENARIO } from './constants';
import { scenarioTypeToTransactionType, migrateScenarioType } from './utils/scenarioTypeHelpers';
import { loadScenarios, saveScenario, deleteScenario, deleteClientFolder } from './services/supabase';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { User, MapPin, Check, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { NLPScenarioModal } from './components/NLPScenarioModal';
import { Session } from '@supabase/supabase-js';

// NEW IMPORTS FOR TOAST
import { ToastProvider } from './hooks/useToast';
import { ToastContainer } from './components/Toast';

type ViewType = 'home' | 'scenario-builder' | 'builder' | 'sms-demo' | 'client-updates';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Initialize view - check for starred app on first load
  const [view, setView] = useState<ViewType>(() => {
    if (typeof window !== 'undefined') {
      const starredApp = localStorage.getItem('mortgagepro_starred_app');
      if (starredApp === 'scenario-builder') {
        return 'scenario-builder';
      } else if (starredApp === 'sms-demo') {
        return 'sms-demo';
      } else if (starredApp === 'client-updates') {
        return 'client-updates';
      }
    }
    return 'home';
  });
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
  const [showAIModal, setShowAIModal] = useState(false);
  const [showTypeSelectionModal, setShowTypeSelectionModal] = useState(false);
  const [selectedScenarioType, setSelectedScenarioType] = useState<'purchase' | 'refinance'>('purchase');
  const [newScenarioData, setNewScenarioData] = useState({ clientName: '', address: '', transactionType: 'Purchase' as 'Purchase' | 'Refinance' });
  const [showDuplicateTypeModal, setShowDuplicateTypeModal] = useState(false);
  const [duplicateScenarioId, setDuplicateScenarioId] = useState<string | null>(null);
  const [duplicateScenarioType, setDuplicateScenarioType] = useState<'purchase' | 'refinance'>('purchase');

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

  // 2. Fetch Data when Session is ready (only for scenario builder)
  useEffect(() => {
    if (!loadingSession && session && (view === 'scenario-builder' || view === 'builder')) {
        fetchData();
    }
  }, [session, loadingSession, view]);

  // 3. Check for starred app on login and navigate accordingly (only if currently on home)
  useEffect(() => {
    if (!loadingSession && session && view === 'home') {
      const starredApp = localStorage.getItem('mortgagepro_starred_app');
      if (starredApp === 'scenario-builder') {
        setView('scenario-builder');
      } else if (starredApp === 'sms-demo') {
        setView('sms-demo');
      } else if (starredApp === 'client-updates') {
        setView('client-updates');
      }
    }
  }, [loadingSession, session, view]);

  const fetchData = async () => {
      setIsLoadingData(true);
      const { data } = await loadScenarios();
      // Migrate scenarios to ensure scenarioType is set (backward compatibility)
      const migratedScenarios = data.map(migrateScenarioType);
      setScenarios(migratedScenarios);
      
      // Save migrated scenarios back if any were updated (one-time migration)
      for (const scenario of migratedScenarios) {
        const original = data.find(s => s.id === scenario.id);
        if (original && (!original.scenarioType || original.scenarioType !== scenario.scenarioType)) {
          await saveScenario(scenario);
        }
      }
      
      setIsLoadingData(false);
  };

  // Auto-star single scenarios per client
  useEffect(() => {
    if (scenarios.length === 0) return;

    const autoStarSingleScenarios = async () => {
      // Group scenarios by client
      const clientGroups: Record<string, Scenario[]> = {};
      scenarios.forEach(s => {
        const clientName = s.clientName?.trim() || "Unassigned";
        if (!clientGroups[clientName]) {
          clientGroups[clientName] = [];
        }
        clientGroups[clientName].push(s);
      });

      // For each client with exactly one scenario, auto-star it if not already starred
      const updates: Promise<any>[] = [];
      Object.entries(clientGroups).forEach(([clientName, clientScenarios]) => {
        if (clientScenarios.length === 1) {
          const singleScenario = clientScenarios[0];
          if (!singleScenario.isPinned) {
            // Auto-star the single scenario
            const updated = { ...singleScenario, isPinned: true };
            setScenarios(prev => prev.map(s => s.id === singleScenario.id ? updated : s));
            updates.push(saveScenario(updated));
          }
        }
      });

      // Wait for all updates to complete
      if (updates.length > 0) {
        await Promise.all(updates);
      }
    };

    autoStarSingleScenarios();
  }, [scenarios.length]); // Only run when number of scenarios changes (to avoid infinite loops)

  const handleLogout = async () => {
      await supabase.auth.signOut();
      setScenarios([]); // Clear data from view
  };

  const handleUpdateDefaults = (newDefaults: ScenarioDefaults) => {
      setUserDefaults(newDefaults);
      localStorage.setItem('mortgage_defaults', JSON.stringify(newDefaults));
  };

  const handleOpenNewModal = (prefilledClientName?: string, scenarioType: 'purchase' | 'refinance' = 'purchase') => {
      const transactionType = scenarioType === 'purchase' ? 'Purchase' : 'Refinance';
      setNewScenarioData({ clientName: prefilledClientName || '', address: '', transactionType });
      setIsModalOpen(true);
  };
  
  // Store prefilled client name for use after type selection
  const [pendingClientName, setPendingClientName] = useState<string | undefined>(undefined);
  
  // Show scenario type selection modal first, then show creation modal
  const handleOpenNewWithType = (prefilledClientName?: string) => {
      // Store the client name for later use
      setPendingClientName(prefilledClientName);
      setSelectedScenarioType('purchase');
      setShowTypeSelectionModal(true);
  };

  const startNewScenario = async () => {
    if (!newScenarioData.clientName) return;

    const now = new Date().toISOString();
    const scenarioType = newScenarioData.transactionType === 'Purchase' ? 'purchase' : 'refinance';
    const scenario: Scenario = {
        ...DEFAULT_SCENARIO,
        ...userDefaults,
        downPaymentAmount: userDefaults.purchasePrice * (userDefaults.downPaymentPercent / 100),
        id: crypto.randomUUID(),
        dateCreated: now,
        lastUpdated: now,
        name: 'New Scenario',
        clientName: newScenarioData.clientName,
        scenarioType,
        transactionType: newScenarioData.transactionType,
        propertyAddress: newScenarioData.address,
        isAddressTBD: false
    };
    
    // Optimistic Update
    setScenarios(prev => [scenario, ...prev]);
    setActiveScenario(scenario);
    
    // Save to DB
    await saveScenario(scenario);

    setView('builder');
    setIsModalOpen(false);
  };

  const handleNavigate = (appId: string) => {
    if (appId === 'scenario-builder') {
      setView('scenario-builder');
    } else if (appId === 'sms-demo') {
      setView('sms-demo');
    } else if (appId === 'client-updates') {
      setView('client-updates');
    }
  };

  const handleNavigateHome = () => {
    setView('home');
  };

  const handleSelect = (scenario: Scenario) => {
    // Migrate scenario to ensure scenarioType is set (backward compatibility)
    const migratedScenario = migrateScenarioType(scenario);
    setActiveScenario(migratedScenario);
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

  const handlePin = async (id: string, isPinned: boolean) => {
    const scenarioToUpdate = scenarios.find(s => s.id === id);
    if (!scenarioToUpdate) return;
    
    // If pinning a scenario, unpin all others in the same client first (only one can be starred per client)
    if (isPinned) {
      // Unpin all other scenarios in the same client first
      const otherScenarios = scenarios.filter(s => 
        s.id !== id && 
        s.isPinned && 
        s.clientName === scenarioToUpdate.clientName
      );
      for (const other of otherScenarios) {
        const unpinned = { ...other, isPinned: false };
        await saveScenario(unpinned);
      }
      
      // Update state to unpin all others in the same client and pin the selected one
      setScenarios(prev => prev.map(s => {
        if (s.id === id) {
          return { ...s, isPinned: true };
        } else if (s.clientName === scenarioToUpdate.clientName && s.isPinned) {
          return { ...s, isPinned: false };
        }
        return s;
      }));
      
      // Update the specific scenario
      const updated = { ...scenarioToUpdate, isPinned: true };
      await saveScenario(updated);
    } else {
      // If unpinning, just update this scenario
      const updated = { ...scenarioToUpdate, isPinned: false };
      setScenarios(prev => prev.map(s => s.id === id ? updated : s));
      await saveScenario(updated);
    }
  };

  const handleDeleteClient = async (clientName: string) => {
      setScenarios(prev => prev.filter(s => s.clientName !== clientName));
      await deleteClientFolder(clientName);
  };

  const handleDuplicate = async (id: string) => {
    const original = scenarios.find(s => s.id === id);
    if (!original) return;
    
    // Show type selection modal for duplication
    setDuplicateScenarioId(id);
    // Default to the original scenario's type
    const originalType = original.scenarioType || (original.transactionType === 'Purchase' ? 'purchase' : 'refinance');
    setDuplicateScenarioType(originalType);
    setShowDuplicateTypeModal(true);
  };
  
  const confirmDuplicate = async () => {
    if (!duplicateScenarioId) return;
    
    const original = scenarios.find(s => s.id === duplicateScenarioId);
    if (!original) return;
    
    const now = new Date().toISOString();
    const transactionType = scenarioTypeToTransactionType(duplicateScenarioType);
    const copy: Scenario = {
        ...JSON.parse(JSON.stringify(original)), 
        id: crypto.randomUUID(),
        name: `Copy of ${original.name}`,
        dateCreated: now,
        lastUpdated: now,
        history: [],
        isPinned: false, // Don't copy the pinned status - only one scenario can be starred
        scenarioType: duplicateScenarioType,
        transactionType
    };

    setScenarios(prev => [copy, ...prev]);
    await saveScenario(copy);
    setShowDuplicateTypeModal(false);
    setDuplicateScenarioId(null);
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
        {view === 'home' ? (
          <Home 
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            userEmail={session?.user?.email}
          />
        ) : view === 'scenario-builder' ? (
          <Dashboard 
              scenarios={scenarios} 
              onCreateNew={handleOpenNewWithType} 
              onSelect={handleSelect}
              onSave={handleSave}
              onDelete={handleDelete}
              onDeleteClient={handleDeleteClient}
              onDuplicate={handleDuplicate}
              onPin={handlePin}
              initialClient={activeScenario?.clientName}
              userDefaults={userDefaults}
              onUpdateDefaults={handleUpdateDefaults}
              onLogout={handleLogout}
              onSync={() => fetchData()}
              isSyncing={isLoadingData}
              userEmail={session?.user?.email}
              onNavigateHome={handleNavigateHome}
          />
        ) : view === 'sms-demo' ? (
          <SMSDemo 
            onNavigateHome={handleNavigateHome}
            userEmail={session?.user?.email}
          />
        ) : view === 'client-updates' ? (
          <ClientUpdates 
            onNavigateHome={handleNavigateHome}
            userEmail={session?.user?.email}
          />
        ) : (
          <ScenarioBuilder 
              initialScenario={activeScenario} 
              onSave={handleSave}
              onBack={() => setView('scenario-builder')}
              validationThresholds={userDefaults.validationThresholds}
              onNavigateHome={handleNavigateHome}
          />
        )}

        {/* Scenario Type Selection Modal - Shows FIRST */}
        <Modal
          isOpen={showTypeSelectionModal}
          onClose={() => setShowTypeSelectionModal(false)}
          title="New Scenario"
          subtitle="Select the type of scenario you want to create"
          maxWidth="max-w-md"
        >
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-0.5">Scenario Type</label>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setSelectedScenarioType('purchase')}
                  className={`flex-1 py-3 px-4 text-sm font-bold uppercase rounded-md transition-all ${selectedScenarioType === 'purchase' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Purchase
                </button>
                <button
                  onClick={() => setSelectedScenarioType('refinance')}
                  className={`flex-1 py-3 px-4 text-sm font-bold uppercase rounded-md transition-all ${selectedScenarioType === 'refinance' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Refinance
                </button>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setShowTypeSelectionModal(false)}
                className="flex-1 h-10 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg font-bold transition-all text-xs uppercase tracking-wide"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowTypeSelectionModal(false);
                  handleOpenNewModal(pendingClientName, selectedScenarioType);
                  setPendingClientName(undefined);
                }}
                className="flex-1 h-10 rounded-lg font-bold shadow-lg transition-all text-xs uppercase tracking-wide flex items-center justify-center gap-2.5 bg-emerald-400 hover:bg-emerald-600 text-white shadow-emerald-900/20 px-4"
              >
                <span>Continue</span>
                <ArrowRight size={16} className="flex-shrink-0" />
              </button>
            </div>
          </div>
        </Modal>

        {/* Scenario Creation Modal */}
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
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newScenarioData.clientName) {
                                    e.preventDefault();
                                    startNewScenario();
                                }
                            }}
                            className="w-full pl-9 pr-4 h-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
                            placeholder="e.g. John Doe"
                        />
                        <datalist id="existing-clients">
                            {Array.from(new Set(scenarios.map(s => s.clientName).filter(Boolean))).slice(0, 20).map((name, idx) => (
                                <option key={idx} value={name} />
                            ))}
                        </datalist>
                    </div>
                </div>
                
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">
                       Property Address or Zip Code
                    </label>
                    <div className="relative group">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <MapPin size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input 
                            type="text" 
                            value={newScenarioData.address}
                            onChange={(e) => setNewScenarioData(prev => ({...prev, address: e.target.value}))}
                            className="w-full pl-9 pr-4 h-10 border rounded-lg text-sm placeholder-slate-400 focus:outline-none transition-all shadow-sm bg-white border-slate-200 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            placeholder="Enter zip code (e.g., 90210) or full address"
                        />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 italic">
                        At least a 5-digit zip code is required
                    </p>
                </div>

                <div className="pt-4 flex gap-3">
                    <button onClick={() => setIsModalOpen(false)} className="flex-1 h-10 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg font-bold transition-all text-xs uppercase tracking-wide">Cancel</button>
                    <button 
                        onClick={() => {
                            setIsModalOpen(false);
                            setShowAIModal(true);
                        }}
                        disabled={!newScenarioData.clientName}
                        className="flex-1 h-10 rounded-lg font-bold shadow-lg transition-all text-xs uppercase tracking-wide flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-purple-400 to-indigo-400 hover:from-purple-600 hover:to-indigo-600 disabled:from-purple-200 disabled:to-indigo-200 disabled:hover:from-purple-200 disabled:hover:to-indigo-200 text-white shadow-purple-900/20 px-4"
                    >
                        <Sparkles size={16} className="flex-shrink-0" />
                        <span>Create with AI</span>
                    </button>
                    <button 
                        onClick={startNewScenario} 
                        disabled={!newScenarioData.clientName} 
                        className="flex-1 h-10 rounded-lg font-bold shadow-lg transition-all text-xs uppercase tracking-wide flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none bg-emerald-400 hover:bg-emerald-600 disabled:bg-emerald-200 disabled:hover:bg-emerald-200 text-white shadow-emerald-900/20 px-4"
                    >
                        <span>Manually Create</span>
                        <ArrowRight size={16} className="flex-shrink-0" />
                    </button>
                </div>
            </div>
        </Modal>

        {/* Duplicate Scenario Type Selection Modal */}
        <Modal
          isOpen={showDuplicateTypeModal}
          onClose={() => {
            setShowDuplicateTypeModal(false);
            setDuplicateScenarioId(null);
          }}
          title="Duplicate Scenario"
          subtitle="Choose scenario type for the duplicate"
          maxWidth="max-w-md"
        >
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-0.5">Scenario Type</label>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setDuplicateScenarioType('purchase')}
                  className={`flex-1 py-3 px-4 text-sm font-bold uppercase rounded-md transition-all ${duplicateScenarioType === 'purchase' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Purchase
                </button>
                <button
                  onClick={() => setDuplicateScenarioType('refinance')}
                  className={`flex-1 py-3 px-4 text-sm font-bold uppercase rounded-md transition-all ${duplicateScenarioType === 'refinance' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Refinance
                </button>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                onClick={() => {
                  setShowDuplicateTypeModal(false);
                  setDuplicateScenarioId(null);
                }}
                className="flex-1 h-10 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg font-bold transition-all text-xs uppercase tracking-wide"
              >
                Cancel
              </button>
              <button
                onClick={confirmDuplicate}
                className="flex-1 h-10 rounded-lg font-bold shadow-lg transition-all text-xs uppercase tracking-wide flex items-center justify-center gap-2.5 bg-emerald-400 hover:bg-emerald-600 text-white shadow-emerald-900/20 px-4"
              >
                <span>Create Duplicate</span>
                <ArrowRight size={16} className="flex-shrink-0" />
              </button>
            </div>
          </div>
        </Modal>

        {/* AI Scenario Creation Modal */}
        <NLPScenarioModal
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
          onCreateScenario={async (data) => {
            // Create full scenario from AI-extracted data
            const now = new Date().toISOString();
            const transactionTypeFromData = data.transactionType || newScenarioData.transactionType || 'Purchase';
            const scenarioTypeFromData = (transactionTypeFromData === 'Refinance') ? 'refinance' : 'purchase';
            const scenario: Scenario = {
              ...DEFAULT_SCENARIO,
              ...userDefaults,
              ...data, // AI-extracted data takes precedence
              id: data.id || crypto.randomUUID(),
              dateCreated: data.dateCreated || now,
              lastUpdated: data.lastUpdated || now,
              name: data.name || 'New Scenario',
              clientName: data.clientName || newScenarioData.clientName || '',
              scenarioType: scenarioTypeFromData,
              transactionType: transactionTypeFromData,
              propertyAddress: data.propertyAddress || newScenarioData.address,
              isAddressTBD: data.isAddressTBD !== undefined ? data.isAddressTBD : false,
              // Ensure down payment amount and percent are always synced
              downPaymentAmount: (() => {
                const price = data.purchasePrice || userDefaults.purchasePrice;
                if (data.downPaymentAmount && price > 0) {
                  // If amount is provided, calculate percent from it
                  return data.downPaymentAmount;
                } else if (data.downPaymentPercent && price > 0) {
                  // If percent is provided, calculate amount from it
                  return (price * data.downPaymentPercent) / 100;
                }
                return userDefaults.purchasePrice * (userDefaults.downPaymentPercent / 100);
              })(),
              downPaymentPercent: Number((() => {
                const price = data.purchasePrice || userDefaults.purchasePrice;
                if (data.downPaymentAmount && price > 0) {
                  // If amount is provided, calculate percent from it
                  return ((data.downPaymentAmount / price) * 100).toFixed(2);
                } else if (data.downPaymentPercent) {
                  // If percent is provided, use it (rounded)
                  return Number(data.downPaymentPercent).toFixed(2);
                }
                return userDefaults.downPaymentPercent.toFixed(2);
              })())
            };
            
            // Optimistic Update
            setScenarios(prev => [scenario, ...prev]);
            setActiveScenario(scenario);
            
            // Save to DB
            await saveScenario(scenario);
            
            setView('builder');
            setShowAIModal(false);
            setIsModalOpen(false);
          }}
          defaultScenario={userDefaults ? { ...DEFAULT_SCENARIO, ...userDefaults } : DEFAULT_SCENARIO}
          defaultClientName={newScenarioData.clientName || undefined}
        />

        {/* TOAST CONTAINER - Shows notifications */}
        <ToastContainer />
      </div>
    </ToastProvider>
  );
};

export default App;
