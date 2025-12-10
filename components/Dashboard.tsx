
import React, { useState, useMemo } from 'react';
import { Plus, Folder, Trash2, Calendar, MapPin, BarChart2, Copy, Search, ArrowRight, Home, ArrowDownAZ, ArrowUpZA, AlertTriangle, Settings, Save, LogOut, Target, Briefcase, FolderOpen, ArrowDown, ArrowUp } from 'lucide-react';
import { Scenario, ScenarioDefaults } from '../types';
import { FormattedNumberInput, LiveDecimalInput } from './CommonInputs';
import { Modal } from './Modal';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface Props {
  scenarios: Scenario[];
  onCreateNew: (clientName?: string) => void;
  onSelect: (scenario: Scenario) => void;
  onDelete: (id: string) => void;
  onDeleteClient: (clientName: string) => void;
  onDuplicate: (id: string) => void;
  initialClient?: string;
  userDefaults?: ScenarioDefaults;
  onUpdateDefaults?: (defaults: ScenarioDefaults) => void;
  onLogout: () => void;
  onSync: () => void;
  isSyncing: boolean;
  userEmail?: string | null;
}

const Dashboard: React.FC<Props> = ({ scenarios, onCreateNew, onSelect, onDelete, onDeleteClient, onDuplicate, initialClient, userDefaults, onUpdateDefaults, onLogout, onSync, isSyncing, userEmail }) => {
  const [isComparing, setIsComparing] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(initialClient || null);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);

  // Sidebar Search & Sort State
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarSort, setSidebarSort] = useState<'name' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Modal States
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; type: 'folder' | 'scenario'; id: string; name: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [localDefaults, setLocalDefaults] = useState<ScenarioDefaults | null>(null);

  // Group Scenarios by Client
  const clientGroups = useMemo<Record<string, Scenario[]>>(() => {
    const groups: Record<string, Scenario[]> = {};
    scenarios.forEach(s => {
        const name = s.clientName?.trim() || "Unassigned";
        if (!groups[name]) groups[name] = [];
        groups[name].push(s);
    });
    return groups;
  }, [scenarios]);

  const getLastUpdate = (client: string) => {
      const list = clientGroups[client] || [];
      if (list.length === 0) return 0;
      return Math.max(...list.map(s => new Date(s.lastUpdated).getTime()));
  };

  // Sidebar Filtered & Sorted Clients
  const sidebarClients = useMemo(() => {
    let clients = Object.keys(clientGroups);
    if (sidebarSearch) {
        clients = clients.filter(c => c.toLowerCase().includes(sidebarSearch.toLowerCase()));
    }
    clients.sort((a, b) => {
        if (sidebarSort === 'name') {
            return sortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
        }
        const dateA = getLastUpdate(a);
        const dateB = getLastUpdate(b);
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    });
    return clients;
  }, [clientGroups, sidebarSearch, sidebarSort, sortDirection]);

  const toggleSort = (type: 'name' | 'date') => {
      if (sidebarSort === type) {
          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
          setSidebarSort(type);
          setSortDirection(type === 'name' ? 'asc' : 'desc');
      }
  };

  const handleClientClick = (clientName: string) => {
    setSelectedClient(clientName);
    setIsComparing(false);
    setSelectedForComparison([]); 
  };

  const handleGoHome = () => {
      setSelectedClient(null);
      setIsComparing(false);
      setSelectedForComparison([]);
  };

  const requestDeleteFolder = () => {
      if (selectedClient) {
          setDeleteConfirmation({
              isOpen: true,
              type: 'folder',
              id: selectedClient,
              name: selectedClient
          });
      }
  };

  const requestDeleteScenario = (id: string, name: string) => {
      setDeleteConfirmation({
          isOpen: true,
          type: 'scenario',
          id: id,
          name: name
      });
  }

  const confirmDelete = () => {
      if (!deleteConfirmation) return;

      if (deleteConfirmation.type === 'folder') {
          onDeleteClient(deleteConfirmation.id);
          handleGoHome();
      } else {
          onDelete(deleteConfirmation.id);
      }
      setDeleteConfirmation(null);
  };

  const openSettings = () => {
      if (userDefaults) {
          setLocalDefaults({ ...userDefaults });
          setShowSettings(true);
      }
  };

  const saveSettings = () => {
      if (localDefaults && onUpdateDefaults) {
          onUpdateDefaults(localDefaults);
          setShowSettings(false);
      }
  };

  const renderScenarioList = () => {
      const list = clientGroups[selectedClient!] || [];
      const sortedList = [...list].sort((a,b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

      return (
          <div className="animate-fadeIn p-8 max-w-[1600px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {sortedList.map((scenario) => {
                    const isSelected = selectedForComparison.includes(scenario.id);
                    
                    const ltv = scenario.purchasePrice > 0 
                        ? (1 - (scenario.downPaymentAmount / scenario.purchasePrice)) * 100 
                        : 0;

                    return (
                        <div 
                            key={scenario.id} 
                            className={`group bg-white rounded-xl border border-slate-300 shadow-md hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 transition-all cursor-pointer overflow-hidden flex flex-col relative ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : ''}`}
                            onClick={() => onSelect(scenario)}
                        >
                            <div className="p-6 flex-1">
                                <div className="flex flex-col gap-2 mb-4">
                                    <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">
                                        <span className="font-normal text-slate-500 text-xs block mb-1 uppercase tracking-wider">{scenario.clientName}</span>
                                        {scenario.name || "Untitled Scenario"}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${
                                            scenario.loanType === 'FHA' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                            scenario.loanType === 'VA' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                            'bg-emerald-50 text-emerald-700 border-emerald-100'
                                        }`}>
                                            {scenario.loanType}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="space-y-3 text-sm text-slate-500 mb-4 pt-4 border-t border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <MapPin size={14} className="text-slate-300 shrink-0" />
                                        <span className="truncate text-xs font-medium">{scenario.isAddressTBD ? "Address TBD" : (scenario.propertyAddress || "No Address")}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar size={14} className="text-slate-300 shrink-0" />
                                        <span className="text-xs font-medium">
                                            {new Date(scenario.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 grid grid-cols-3 gap-2">
                                    <div>
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Price</span>
                                        <span className="font-bold text-slate-900 truncate">${scenario.purchasePrice.toLocaleString()}</span>
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">LTV</span>
                                        <span className="font-bold text-slate-900">{parseFloat(ltv.toFixed(2))}%</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rate</span>
                                        <span className="font-bold text-slate-900">{scenario.interestRate}%</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-between items-center group-hover:bg-indigo-50/50 transition-colors">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                    Open Scenario <ArrowRight size={12} />
                                </span>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDuplicate(scenario.id); }}
                                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                        title="Duplicate"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); requestDeleteScenario(scenario.id, scenario.name); }}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
          </div>
      );
  };
  
  const renderEmptyState = () => (
      <div className="flex flex-col h-full bg-slate-50">
          <header className="bg-slate-950 border-b border-slate-800 h-28 px-8 flex items-center justify-between shrink-0 relative z-20 overflow-hidden group">
                {/* Decorative Background Icon */}
                <div className="absolute right-32 top-1/2 -translate-y-1/2 text-slate-900/80 pointer-events-none transform group-hover:scale-105 transition-transform duration-1000">
                    <Target size={240} strokeWidth={0.5} />
                </div>

                <div className="flex items-center gap-6 relative z-10 h-full max-w-4xl flex-1">
                    <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-black/50 shrink-0">
                        <Home size={32} className="text-indigo-400" />
                    </div>
                    
                    <div className="flex flex-col justify-center h-full">
                        <h2 className="text-5xl font-black text-white tracking-tight leading-none shadow-sm pb-1">Dashboard</h2>
                    </div>
                </div>
          </header>

          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fadeIn opacity-100">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 text-slate-200 shadow-sm border border-slate-100">
                  <Folder size={48} strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Client Folder Organizer</h3>
              <p className="text-slate-400 font-medium max-w-md">Select a client folder from the sidebar to manage scenarios, or create a new client profile to get started.</p>
              <button 
                 onClick={() => onCreateNew()}
                 className="mt-8 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-emerald-900/20 transition-transform transform hover:-translate-y-0.5 flex items-center gap-2 text-sm uppercase tracking-wide border border-emerald-500/50"
              >
                 <Plus size={18} /> Create First Client
              </button>
          </div>

          <footer className="bg-white border-t border-slate-200 py-3 px-8 flex justify-between items-center shrink-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">MortgagePro © 2025</p>
              <p className="text-[10px] text-slate-300 font-medium">v1.0.5</p>
          </footer>
      </div>
  );

  return (
    <div className="h-full flex bg-slate-50 overflow-hidden relative">
        {/* Dark Sidebar */}
        <div className="w-72 bg-slate-950 border-r border-slate-900 flex flex-col h-full shrink-0 z-20 shadow-xl relative">
          
          {/* Sidebar Header */}
          <div className="p-5 border-b border-slate-900 space-y-5">
               <div className="flex items-center justify-between text-white font-bold text-xl mb-2 tracking-tight">
                   <div className="flex items-center gap-3">
                       <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/50">
                           <BarChart2 size={18} className="text-white" />
                       </div>
                       MortgagePro
                   </div>
                   {isSyncing && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>}
               </div>

              <div className="relative">
                  <Search size={14} className="absolute left-3 top-3.5 text-slate-500" />
                  <input 
                      type="text" 
                      placeholder="Search clients..." 
                      value={sidebarSearch}
                      onChange={(e) => setSidebarSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 outline-none focus:border-indigo-500 focus:bg-slate-900 transition-all placeholder-slate-600 font-medium"
                  />
              </div>

              <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button 
                      onClick={() => toggleSort('date')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${sidebarSort === 'date' ? 'bg-slate-800 text-white shadow ring-1 ring-slate-700' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                  >
                      {sidebarSort === 'date' && sortDirection === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                      Recent
                  </button>
                  <button 
                      onClick={() => toggleSort('name')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${sidebarSort === 'name' ? 'bg-slate-800 text-white shadow ring-1 ring-slate-700' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                  >
                      {sidebarSort === 'name' && sortDirection === 'desc' ? <ArrowUpZA size={12} /> : <ArrowDownAZ size={12} />}
                      Name
                  </button>
              </div>
          </div>

          {/* Client List */}
          <div className="flex-1 overflow-y-auto p-3 scrollbar-hide space-y-1">
              {sidebarClients.map((client) => {
                  const lastUpdateTs = getLastUpdate(client);
                  const dateStr = lastUpdateTs > 0 ? new Date(lastUpdateTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                  const isSelected = selectedClient === client;
                  
                  return (
                  <button
                      key={client}
                      onClick={() => handleClientClick(client)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group border mb-2 text-left ${
                          isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20'
                          : 'bg-slate-900/40 border-slate-800/60 text-slate-300 hover:bg-slate-800 hover:border-slate-700 hover:text-white hover:shadow-md'
                      }`}
                  >
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-indigo-500/50 text-white' : 'bg-slate-950 border border-slate-800 text-slate-500 group-hover:text-indigo-400 group-hover:border-indigo-500/30'
                      }`}>
                         <Folder size={16} fill={isSelected ? "currentColor" : "none"} />
                      </div>

                      <div className="flex flex-col flex-1 overflow-hidden">
                          <span className={`truncate text-sm font-bold tracking-tight ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                              {client}
                          </span>
                          {dateStr && (
                             <span className={`text-[10px] font-medium truncate mt-0.5 ${
                                 isSelected ? 'text-indigo-200' : 'text-slate-500 group-hover:text-slate-400'
                             }`}>
                                 Updated {dateStr}
                             </span>
                          )}
                      </div>
                      
                      <span className={`text-[10px] font-bold h-5 min-w-[1.25rem] px-1 rounded flex items-center justify-center transition-colors shrink-0 ${
                          isSelected 
                          ? 'bg-indigo-700 text-indigo-100' 
                          : 'bg-slate-950 text-slate-500 border border-slate-800 group-hover:border-slate-600 group-hover:text-slate-300'
                      }`}>
                          {clientGroups[client].length}
                      </span>
                  </button>
              )})}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-900 bg-slate-950 mt-auto sticky bottom-0 z-30 flex flex-col gap-2">
              <button 
                onClick={() => onCreateNew()}
                className="w-full flex items-center justify-center gap-2 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg shadow-emerald-900/20 transition-all font-bold text-xs uppercase tracking-wide border border-emerald-500/50"
              >
                 <Plus size={16} /> New Client
              </button>
              
              <div className="flex gap-2">
                  <button 
                      onClick={openSettings}
                      className="flex-1 h-10 flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 text-slate-400 rounded-lg hover:bg-slate-800 hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider"
                    >
                        <Settings size={16} /> Defaults
                    </button>
                    {isSupabaseConfigured() && (
                        <button 
                            onClick={onLogout}
                            className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-slate-800 text-red-400 rounded-lg hover:bg-red-900/20 hover:text-red-300 hover:border-red-900/30 transition-all"
                            title="Sign Out"
                        >
                            <LogOut size={16} />
                        </button>
                    )}
              </div>
          </div>
        </div>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
            {selectedClient ? (
                <>
                    {/* Dark Header Strip */}
                    <header className="bg-slate-950 border-b border-slate-800 h-28 px-8 flex items-center justify-between shrink-0 relative z-20 overflow-hidden group">
                         {/* Decorative Background Icon */}
                         <div className="absolute right-32 top-1/2 -translate-y-1/2 text-slate-900/80 pointer-events-none transform group-hover:scale-105 transition-transform duration-1000">
                             <FolderOpen size={240} strokeWidth={0.5} />
                         </div>

                         <div className="flex items-center gap-6 relative z-10 h-full max-w-4xl flex-1">
                             {/* Large Icon Box */}
                             <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-black/50 shrink-0">
                                 <Briefcase size={32} className="text-indigo-400" />
                             </div>
                             
                             <div className="flex flex-col justify-center h-full overflow-hidden">
                                 <h2 className="text-5xl font-black text-white tracking-tight leading-none shadow-sm truncate pb-1">{selectedClient}</h2>
                             </div>
                         </div>

                         <div className="flex items-center gap-4 relative z-10 shrink-0 ml-4 pl-8 border-l border-slate-800/50">
                             <button 
                                onClick={requestDeleteFolder}
                                className="flex items-center gap-2 px-4 py-3 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors text-xs font-bold uppercase tracking-wide group/del"
                             >
                                 <Trash2 size={16} className="text-slate-600 group-hover/del:text-red-500 transition-colors" />
                                 <span className="hidden xl:inline">Delete</span>
                             </button>
                             
                             <button 
                                onClick={() => onCreateNew(selectedClient!)}
                                className="flex items-center gap-3 px-6 py-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 shadow-lg shadow-emerald-900/40 hover:shadow-emerald-900/60 transition-all font-bold text-xs uppercase tracking-wide border border-emerald-500/50 transform hover:-translate-y-0.5"
                            >
                                <Plus size={18} strokeWidth={3} /> New Scenario
                            </button>
                         </div>
                    </header>

                    {/* Scrollable Grid */}
                    <div className="flex-1 overflow-y-auto scrollbar-custom">
                         {isComparing ? (
                            <div className="p-8 text-center text-slate-400 italic">Comparison View</div>
                        ) : renderScenarioList()}
                    </div>

                    {/* Footer */}
                    <footer className="bg-white border-t border-slate-200 py-3 px-8 flex justify-between items-center shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">MortgagePro © 2025</p>
                        <p className="text-[10px] text-slate-300 font-medium">v1.0.5</p>
                    </footer>
                </>
            ) : (
                renderEmptyState()
            )}
             
             {/* Delete Confirmation Modal */}
             <Modal
                isOpen={!!deleteConfirmation}
                onClose={() => setDeleteConfirmation(null)}
                title={deleteConfirmation?.type === 'folder' ? 'Delete Folder?' : 'Delete Scenario?'}
                maxWidth="max-w-sm"
             >
                <div className="flex flex-col items-center text-center">
                    <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 border border-red-100">
                        <AlertTriangle size={28} />
                    </div>
                    <p className="text-sm text-slate-500 mb-6">
                        Are you sure you want to delete <strong className="text-slate-900">{deleteConfirmation?.name}</strong>? This action cannot be undone.
                    </p>
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={() => setDeleteConfirmation(null)}
                            className="flex-1 h-10 border border-slate-200 text-slate-600 font-bold rounded-lg hover:bg-slate-50 transition-colors text-xs uppercase tracking-wide"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="flex-1 h-10 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg shadow-red-100 transition-colors text-xs uppercase tracking-wide"
                        >
                            Delete
                        </button>
                    </div>
                </div>
             </Modal>
             
             {/* Settings Modal */}
             <Modal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                title="App Settings"
                subtitle="Configure system defaults"
             >
                {localDefaults && (
                    <div className="space-y-6">
                        {/* User Email Display */}
                        {userEmail && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Signed in as</label>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                        {userEmail.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">{userEmail}</span>
                                </div>
                            </div>
                        )}
                        
                        <div className="pt-2">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Default Assumptions</h4>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Purchase Price</label>
                                    <div className="flex items-center w-full bg-white border border-slate-200 rounded-lg h-10 overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                        <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-500 text-sm font-semibold min-w-[2.5rem]">$</div>
                                        <FormattedNumberInput 
                                            value={localDefaults.purchasePrice} 
                                            onChangeValue={(val) => setLocalDefaults({...localDefaults, purchasePrice: val})} 
                                            className="h-full px-3 text-sm text-slate-900 font-medium" 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Down Payment</label>
                                        <div className="flex items-center w-full bg-white border border-slate-200 rounded-lg h-10 overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                            <LiveDecimalInput 
                                                value={localDefaults.downPaymentPercent} 
                                                onChange={(val) => setLocalDefaults({...localDefaults, downPaymentPercent: val})} 
                                                step="1" precision={2} 
                                                className="h-full pl-3 text-right text-sm text-slate-900 font-medium" 
                                            />
                                            <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-l border-slate-200 text-slate-500 text-sm font-semibold min-w-[2.5rem]">%</div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Interest Rate</label>
                                        <div className="flex items-center w-full bg-white border border-slate-200 rounded-lg h-10 overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                            <LiveDecimalInput 
                                                value={localDefaults.interestRate} 
                                                onChange={(val) => setLocalDefaults({...localDefaults, interestRate: val})} 
                                                step="0.125" precision={3} 
                                                className="h-full pl-3 text-right text-sm text-slate-900 font-medium" 
                                            />
                                            <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-l border-slate-200 text-slate-500 text-sm font-semibold min-w-[2.5rem]">%</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Yearly Tax</label>
                                        <div className="flex items-center w-full bg-white border border-slate-200 rounded-lg h-10 overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                            <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-500 text-sm font-semibold min-w-[2.5rem]">$</div>
                                            <FormattedNumberInput 
                                                value={localDefaults.propertyTaxYearly} 
                                                onChangeValue={(val) => setLocalDefaults({...localDefaults, propertyTaxYearly: val})} 
                                                className="h-full px-3 text-sm text-slate-900 font-medium" 
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Yearly Insurance</label>
                                        <div className="flex items-center w-full bg-white border border-slate-200 rounded-lg h-10 overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                            <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-500 text-sm font-semibold min-w-[2.5rem]">$</div>
                                            <FormattedNumberInput 
                                                value={localDefaults.homeInsuranceYearly} 
                                                onChangeValue={(val) => setLocalDefaults({...localDefaults, homeInsuranceYearly: val})} 
                                                className="h-full px-3 text-sm text-slate-900 font-medium" 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                     <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Monthly HOA</label>
                                        <div className="flex items-center w-full bg-white border border-slate-200 rounded-lg h-10 overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                            <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-500 text-sm font-semibold min-w-[2.5rem]">$</div>
                                            <FormattedNumberInput 
                                                value={localDefaults.hoaMonthly} 
                                                onChangeValue={(val) => setLocalDefaults({...localDefaults, hoaMonthly: val})} 
                                                className="h-full px-3 text-sm text-slate-900 font-medium" 
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">Default Credit Score</label>
                                        <input 
                                            type="number" 
                                            value={localDefaults.creditScore} 
                                            onChange={(e) => setLocalDefaults({...localDefaults, creditScore: parseInt(e.target.value) || 740})} 
                                            className="w-full px-3 h-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={saveSettings} className="w-full h-11 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-200 text-xs uppercase tracking-wide">
                                <Save size={16} /> Save Changes
                            </button>
                        </div>
                    </div>
                )}
             </Modal>
        </div>
    </div>
  );
};

export default Dashboard;
