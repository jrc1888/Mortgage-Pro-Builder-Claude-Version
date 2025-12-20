import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Save, RotateCcw, Calculator, Building, DollarSign, Percent, Clock, MapPin, History, CheckCircle, FileText, Briefcase, RefreshCw, Hash, AlertTriangle, AlertCircle, Check, Printer, FileBadge, User, Download, X, Power, TrendingUp, Wallet, CreditCard, ChevronDown, Info, ChevronUp, ArrowLeftRight, ChevronRight, Mail, Loader2 } from 'lucide-react';
import { Scenario, LoanType, CalculatedResults, HistoryEntry, ClosingCostItem } from '../types';
import { calculateScenario, calculateLendersTitleInsurance } from '../services/loanMath';
import { DEFAULT_CLOSING_COSTS } from '../constants';
import { FormattedNumberInput, LiveDecimalInput, CustomCheckbox } from './CommonInputs';
import { Modal } from './Modal';
import { generatePreApprovalFromScenario, generatePreApprovalPDFPreview } from '../services/preApprovalPDF';
import { generateSubmissionPDFPreview, downloadSubmissionPDF } from '../services/submissionPDF';
import { useToast } from '../hooks/useToast';
import { useDebounce } from '../hooks/useDebounce';
import { validateScenario, ValidationError, ValidationThresholds, DEFAULT_VALIDATION_THRESHOLDS } from '../services/validation';
import { ValidationBanner } from './ValidationBanner';

interface Props {
  initialScenario: Scenario;
  onSave: (scenario: Scenario) => void;
  onBack: () => void;
  validationThresholds?: ValidationThresholds;
}

// --- Aesthetics ---
// Increased padding x from px-3 to px-4 for spaciousness
const inputGroupClass = "flex items-center w-full bg-white border border-slate-200 rounded-lg shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all overflow-hidden h-10 group";
const symbolClass = "flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-400 text-sm font-semibold text-center min-w-[2.5rem] group-focus-within:bg-indigo-50 group-focus-within:text-indigo-600 group-focus-within:border-indigo-100 transition-colors";
const symbolRightClass = "flex items-center justify-center h-full px-3 bg-slate-50 border-l border-slate-200 text-slate-400 text-sm font-semibold text-center min-w-[2.5rem] group-focus-within:bg-indigo-50 group-focus-within:text-indigo-600 group-focus-within:border-indigo-100 transition-colors";
const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5";

// --- Compact Type Toggle Input (Used for Lender Credit Header) ---
const CompactTypeToggleInput: React.FC<{
    value: number;
    onChange: (val: number) => void;
    isFixed: boolean;
    onToggle: () => void;
}> = ({ value, onChange, isFixed, onToggle }) => {
    return (
        <div className={inputGroupClass}>
            <button
                onClick={onToggle}
                className="h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                title="Toggle Unit"
            >
                <ArrowLeftRight size={14} />
            </button>
            
            {isFixed ? (
                <FormattedNumberInput
                    value={value || 0}
                    onChangeValue={onChange}
                    className="w-full h-full px-4 text-right text-sm text-slate-900 font-medium"
                />
            ) : (
                <LiveDecimalInput 
                    value={value || 0}
                    onChange={onChange}
                    precision={3}
                    className="w-full h-full px-4 text-right text-sm text-slate-900 font-medium"
                    placeholder="0.00"
                />
            )}
            {!isFixed && <div className={symbolRightClass}>%</div>}
            {isFixed && <div className={symbolRightClass}>$</div>}
        </div>
    );
};

const ScenarioBuilder: React.FC<Props> = ({ initialScenario, onSave, onBack, validationThresholds = DEFAULT_VALIDATION_THRESHOLDS }) => {
  // Backward compatibility: ensure transactionType exists
  const scenarioWithDefaults = {
    ...initialScenario,
    transactionType: (initialScenario.transactionType || 'Purchase') as 'Purchase' | 'Refinance'
  };
  const [scenario, setScenario] = useState<Scenario>(scenarioWithDefaults);
  const [results, setResults] = useState<CalculatedResults>(calculateScenario(scenarioWithDefaults));
  const [activeTab, setActiveTab] = useState<'loan' | 'costs' | 'advanced' | 'income'>('loan');
  
  // NEW: Toast, Debounce, and Validation
  const { addToast } = useToast();
  const debouncedScenario = useDebounce(scenario, 300);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  
  // Modals
  const [showLogModal, setShowLogModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPreApprovalModal, setShowPreApprovalModal] = useState(false);
  const [showPreApprovalOptionsModal, setShowPreApprovalOptionsModal] = useState(false);
  const [preApprovalPdfUrl, setPreApprovalPdfUrl] = useState<string | null>(null);
  const [preApprovalFilename, setPreApprovalFilename] = useState<string>('');
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissionPdfUrl, setSubmissionPdfUrl] = useState<string | null>(null);
  const [submissionFilename, setSubmissionFilename] = useState<string>('');
  const [submissionMissingInfo, setSubmissionMissingInfo] = useState<any[]>([]);
  const [generatingSubmission, setGeneratingSubmission] = useState(false);
  
  const [logNote, setLogNote] = useState('');
  const [currentChanges, setCurrentChanges] = useState<string[]>([]);
  
  // Notes textarea ref for auto-grow
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Ensure new closing cost items exist if loaded from old data
  useEffect(() => {
    let updatedCosts = [...scenario.closingCosts];
    let changed = false;

    // 1. Remove Deprecated Items
    const deprecatedIds = ['origination', 'lender-credit'];
    const hasDeprecated = updatedCosts.some(c => deprecatedIds.includes(c.id));
    if (hasDeprecated) {
        updatedCosts = updatedCosts.filter(c => !deprecatedIds.includes(c.id));
        changed = true;
    }

    // 2. Add New Required Items
    const hasHOATransfer = updatedCosts.some(c => c && c.id === 'hoa-transfer');
    const hasHOAPrepay = updatedCosts.some(c => c && c.id === 'hoa-prepay');
    const hasDiscountPoints = updatedCosts.some(c => c && c.id === 'discount-points');
    const hasBuyersAgentCommission = updatedCosts.some(c => c && c.id === 'buyers-agent-commission');
    const hasMisc1 = updatedCosts.some(c => c && c.id === 'misc-1');
    const hasMisc2 = updatedCosts.some(c => c && c.id === 'misc-2');
    const hasMisc3 = updatedCosts.some(c => c && c.id === 'misc-3');
    const hasMisc4 = updatedCosts.some(c => c && c.id === 'misc-4');
    
    // Remove misc-5 if it exists (deprecated)
    const hasMisc5 = updatedCosts.some(c => c && c.id === 'misc-5');
    if (hasMisc5) {
        updatedCosts = updatedCosts.filter(c => !c || c.id !== 'misc-5');
        changed = true;
    }
    
    if (!hasHOATransfer) {
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'hoa-transfer');
        if (def) updatedCosts.push(def);
        changed = true;
    }
    if (!hasHOAPrepay) {
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'hoa-prepay');
        if (def) updatedCosts.push(def);
        changed = true;
    }
    if (!hasDiscountPoints) {
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'discount-points');
        if (def) updatedCosts.push(def);
        changed = true;
    }
    if (!hasBuyersAgentCommission) {
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'buyers-agent-commission');
        if (def) updatedCosts.push(def);
        changed = true;
    }
    // Add Misc fees (only misc-1 through misc-4)
    if (!hasMisc1) { 
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'misc-1');
        if (def) { updatedCosts.push(def); changed = true; }
    }
    if (!hasMisc2) { 
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'misc-2');
        if (def) { updatedCosts.push(def); changed = true; }
    }
    if (!hasMisc3) { 
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'misc-3');
        if (def) { updatedCosts.push(def); changed = true; }
    }
    if (!hasMisc4) { 
        const def = DEFAULT_CLOSING_COSTS.find(c => c.id === 'misc-4');
        if (def) { updatedCosts.push(def); changed = true; }
    }

    
    // 3. Ensure Income/Debt Objects exist
    if (!scenario.income) {
        setScenario(prev => ({...prev, income: { borrower1: 0, borrower2: 0, rental: 0, other: 0 }}));
        changed = false;
    }
    if (!scenario.debts) {
         setScenario(prev => ({...prev, debts: { monthlyTotal: 0 }}));
         changed = false;
    }

    if (changed) {
        setScenario(prev => ({ ...prev, closingCosts: updatedCosts }));
    }
  }, [scenario.closingCosts.length, scenario.income, scenario.debts]);

  // Simple Auto-Save - Works perfectly, no complications
  useEffect(() => {
    const timer = setTimeout(() => {
        const now = new Date().toISOString();
        const updated = { ...scenario, lastUpdated: now };
        onSave(updated);
    }, 500);
    return () => clearTimeout(timer);
  }, [scenario]); // Only scenario dependency - clean and simple!

  // Recalculate results when debounced scenario changes (with validation)
  useEffect(() => {
    const res = calculateScenario(debouncedScenario);
    setResults(res);
    
    // Run validation with custom thresholds
    const errors = validateScenario(debouncedScenario, res, undefined, undefined, validationThresholds);
    setValidationErrors(errors);
  }, [debouncedScenario, validationThresholds]);

  // Auto-resize notes textarea
  useEffect(() => {
    const textarea = notesTextareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight to show all content
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [scenario.notes]);

  // Group closing costs by category
  const costGroups = useMemo(() => {
      // Ensure closingCosts exists and is an array
      if (!scenario.closingCosts || !Array.isArray(scenario.closingCosts)) {
          return [];
      }
      
      // Filter out HOA items if monthly HOA is 0, and filter out any undefined/null items
      const visibleCosts = scenario.closingCosts.filter(item => {
          // Safety check: ensure item exists and has an id
          if (!item || !item.id) return false;
          
          if (item.id === 'hoa-transfer' || item.id === 'hoa-prepay') {
              return scenario.hoaMonthly > 0;
          }
          return true;
      });

      const groups: Record<string, ClosingCostItem[]> = {};
      visibleCosts.forEach(item => {
          // Additional safety check
          if (!item || !item.id) return;
          
          const cat = item.category || 'Other Fees';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(item);
      });
      // Defined order
      const orderedKeys = ['Lender Fees', 'Third Party Fees', 'Title & Government', 'Escrows/Prepaids', 'Other Fees'];
      return orderedKeys.filter(k => groups[k]).map(k => ({ category: k, items: groups[k] }));
  }, [scenario.closingCosts, scenario.hoaMonthly]);

  // Helper to prevent number inputs from changing on scroll
  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur();
  };

  const handleInputChange = <K extends keyof Scenario>(field: K, value: any) => {
    setScenario(prev => {
        if (field === 'purchasePrice') {
            const price = Number(value);
            const roundedPercent = Number(prev.downPaymentPercent.toFixed(2));
            return {
                ...prev,
                purchasePrice: price,
                downPaymentAmount: Number((price * (roundedPercent / 100)).toFixed(2))
            };
        }
        if (field === 'downPaymentPercent') {
            const percent = Number(value);
            const roundedPercent = Number(percent.toFixed(2));
            const calculatedAmount = prev.purchasePrice * (roundedPercent / 100);
            return {
                ...prev,
                downPaymentPercent: roundedPercent,
                downPaymentAmount: Number(calculatedAmount.toFixed(2))
            };
        }
        if (field === 'downPaymentAmount') {
             const amt = Number(value);
             const calculatedPercent = prev.purchasePrice > 0 ? (amt / prev.purchasePrice) * 100 : 0;
             const roundedPercent = Number(calculatedPercent.toFixed(2));
             return {
                 ...prev,
                 downPaymentAmount: amt,
                 downPaymentPercent: roundedPercent
             };
        }
        if (field === 'loanType') {
            let newUfmip = 0;
            if (value === LoanType.FHA) newUfmip = 1.75;
            if (value === LoanType.VA) newUfmip = 2.15;
            
            const isGov = value === LoanType.FHA || value === LoanType.VA;
            
            return { 
                ...prev, 
                [field]: value, 
                ufmipRate: newUfmip,
                interestOnly: isGov ? false : prev.interestOnly
            };
        }
        
        if (field === 'isAddressTBD' && value === true) {
             return { ...prev, [field]: value, propertyAddress: '', faDate: undefined, settlementDate: undefined };
        }

        return { ...prev, [field]: value };
    });
  };

  const handleNumberChange = (field: keyof Scenario, valStr: string) => {
    if (valStr.trim() === '') {
        handleInputChange(field, 0);
    } else {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            handleInputChange(field, val);
        }
    }
  };

  const handleMIChange = (type: 'dollars' | 'rate', value: number) => {
     setScenario(prev => {
         if (type === 'dollars') {
             return { ...prev, manualMI: value };
         } else {
             const dollars = (results.totalLoanAmount * (value / 100)) / 12;
             return { ...prev, manualMI: dollars };
         }
     });
  };

  const handleDPAChange = (type: 'amount' | 'percent', value: number, isDPA2: boolean = false) => {
     setScenario(prev => {
         const dpaKey = isDPA2 ? 'dpa2' : 'dpa';
         const currentDPA = isDPA2 ? (prev.dpa2 || { active: false, amount: 0, percent: 0, rate: 7.5, termMonths: 120, payment: 0, isDeferred: false }) : prev.dpa;
         
         if (type === 'amount') {
             const percent = prev.purchasePrice > 0 ? (value / prev.purchasePrice) * 100 : 0;
             const updated = { ...currentDPA, amount: value, percent };
             return isDPA2 
                 ? { ...prev, dpa2: updated }
                 : { ...prev, dpa: updated };
         } else {
             const amount = prev.purchasePrice * (value / 100);
             const updated = { ...currentDPA, amount, percent: value };
             return isDPA2 
                 ? { ...prev, dpa2: updated }
                 : { ...prev, dpa: updated };
         }
     });
  };

  const updateCost = (id: string, val: number) => {
    const newCosts = scenario.closingCosts.map(c => c.id === id ? { ...c, amount: isNaN(val) ? 0 : val } : c);
    setScenario(prev => ({ ...prev, closingCosts: newCosts }));
  };
  
  const updateCostDays = (id: string, valStr: string) => {
    const days = valStr.trim() === '' ? 0 : parseFloat(valStr);
    const newCosts = scenario.closingCosts.map(c => c.id === id ? { ...c, days: isNaN(days) ? 0 : days } : c);
    setScenario(prev => ({ ...prev, closingCosts: newCosts }));
  }

  const updateCostMonths = (id: string, valStr: string) => {
    const months = valStr.trim() === '' ? 0 : parseFloat(valStr);
    const newCosts = scenario.closingCosts.map(c => c.id === id ? { ...c, months: isNaN(months) ? 0 : months } : c);
    setScenario(prev => ({ ...prev, closingCosts: newCosts }));
  }

  const toggleCostFixed = (id: string) => {
    const cost = scenario.closingCosts.find(c => c.id === id);
    if (!cost) return;

    let newAmount = 0;
    if (cost.isFixed) {
        // Fixed -> Percent
        if (results.totalLoanAmount > 0) {
            newAmount = (cost.amount / results.totalLoanAmount) * 100;
        }
    } else {
        // Percent -> Fixed
        newAmount = results.totalLoanAmount * (cost.amount / 100);
    }

    const newCosts = scenario.closingCosts.map(c => c.id === id ? { ...c, isFixed: !c.isFixed, amount: Number(newAmount.toFixed(4)) } : c);
    setScenario(prev => ({ ...prev, closingCosts: newCosts }));
  };


  const toggleLenderCreditMode = () => {
      const isCurrentlyFixed = scenario.lenderCreditsMode === 'fixed';
      let newAmount = 0;
      
      if (isCurrentlyFixed) {
          if (results.totalLoanAmount > 0) {
             newAmount = (scenario.lenderCredits / results.totalLoanAmount) * 100;
          }
      } else {
          newAmount = results.totalLoanAmount * (scenario.lenderCredits / 100);
      }
      
      setScenario(prev => ({
          ...prev,
          lenderCreditsMode: isCurrentlyFixed ? 'percent' : 'fixed',
          lenderCredits: Number(newAmount.toFixed(4))
      }));
  };

  // Auto-update scenario name when down payment or loan type changes
  useEffect(() => {
    if (scenario.name && scenario.name.trim() !== '' && scenario.name.trim() !== 'New Scenario') {
      // Check if name matches the auto-generated pattern
      const namePattern = /^(Conv|FHA|VA|JUMBO) - \d+\.\d+% Down$/;
      if (namePattern.test(scenario.name)) {
        const typeLabel = scenario.loanType === LoanType.CONVENTIONAL ? 'Conv' : scenario.loanType;
        const newName = `${typeLabel} - ${Number(scenario.downPaymentPercent).toFixed(2)}% Down`;
        if (newName !== scenario.name) {
          setScenario(prev => ({ ...prev, name: newName }));
        }
      }
    }
  }, [scenario.downPaymentPercent, scenario.loanType]);

  // --- Auto-Naming & Exit Logic ---
  const handleExit = () => {
    let finalScenario = { ...scenario };
    if (!finalScenario.name || finalScenario.name.trim() === 'New Scenario' || finalScenario.name.trim() === '') {
        const typeLabel = finalScenario.loanType === LoanType.CONVENTIONAL ? 'Conv' : finalScenario.loanType;
        finalScenario.name = `${typeLabel} - ${Number(finalScenario.downPaymentPercent).toFixed(2)}% Down`;
        setScenario(finalScenario);
        onSave(finalScenario);
    }
    onBack();
  };
  
  // --- Logging & History Logic ---
  const prepareLog = () => {
      const lastEntry = scenario.history.length > 0 ? scenario.history[scenario.history.length - 1] : null;
      const changes: string[] = [];

      if (!lastEntry) {
          changes.push("Initial scenario creation");
      } else {
          const old = lastEntry.snapshot;
          const curr = scenario;

          if (old.purchasePrice !== curr.purchasePrice) changes.push(`Price: ${formatMoney(old.purchasePrice)} -> ${formatMoney(curr.purchasePrice)}`);
          if (old.interestRate !== curr.interestRate) changes.push(`Rate: ${old.interestRate}% -> ${curr.interestRate}%`);
          if (changes.length === 0) changes.push("Minor adjustments");
      }

      setCurrentChanges(changes);
      setLogNote('');
      setShowLogModal(true);
  };

  const commitLog = () => {
      const newEntry: HistoryEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          note: logNote,
          changes: currentChanges,
          snapshot: JSON.parse(JSON.stringify(scenario)) 
      };

      setScenario(prev => ({
          ...prev,
          history: [...prev.history, newEntry]
      }));
      setShowLogModal(false);
      
      // Show success toast
      addToast({ type: 'success', message: 'Version saved successfully!' });
  };

  const restoreSnapshot = (entry: HistoryEntry) => {
      if(confirm("Restore this version? Current unsaved changes will be lost.")) {
          setScenario(entry.snapshot);
          setShowHistoryModal(false);
      }
  };

  const formatMoney = (n: number) => Math.ceil(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const formatTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // Calculation variables for Sidebar view
  const netClosingCosts = results.netClosingCosts;
  const outstandingBalance = results.cashToClose; 
  const isRefund = outstandingBalance < 0;

  // Max Seller Concessions %
  const maxConcessionsPercent = results.maxConcessionsAllowed > 0 && scenario.purchasePrice > 0
    ? (results.maxConcessionsAllowed / scenario.purchasePrice) * 100
    : 0;
  
  const isConcessionLimitExceeded = results.sellerConcessionsPercent > maxConcessionsPercent;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* Header - Dark Theme - Desktop Only on Mobile */}
      <header className="desktop-only scenario-header-desktop bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0 z-30 shadow-md relative print:hidden h-32">
        <div className="flex items-center gap-6 flex-1">
          <button onClick={handleExit} className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors border border-slate-800">
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-10 w-full max-w-6xl">
              {/* Client Name */}
              <div className="min-w-[280px]">
                   <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Borrower</label>
                   <div className="text-4xl font-black text-indigo-400 tracking-tight truncate">{scenario.clientName || "Client Name"}</div>
              </div>

              {/* Divider */}
              <div className="h-12 w-px bg-slate-800"></div>

              {/* Scenario Name Input */}
              <div className="flex-1">
                   <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1">Scenario Name</label>
                   <input 
                        value={scenario.name} 
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="bg-transparent border-none p-0 text-4xl font-black text-emerald-400 placeholder-slate-600 w-full outline-none focus:ring-0"
                        placeholder="Scenario Name"
                    />
              </div>

               {/* Divider */}
               <div className="h-12 w-px bg-slate-800"></div>

               {/* Property, Price & Date */}
               <div className="min-w-[260px] ml-4 text-right">
                    <div className="flex flex-col items-end gap-1 mb-1">
                        <div className="flex items-center justify-end gap-1.5 text-sm text-indigo-400 font-medium">
                            <MapPin size={14} />
                            <span className="truncate max-w-[220px]">{scenario.isAddressTBD ? "TBD" : (scenario.propertyAddress || "No Address")}</span>
                        </div>
                        <div className="text-xl font-bold text-white">
                            {formatMoney(scenario.purchasePrice)}
                        </div>
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
                        Updated {formatTime(scenario.lastUpdated)}
                    </div>
               </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pl-8 border-l border-slate-800 ml-8">
             <button 
                onClick={() => setShowPreApprovalOptionsModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 text-slate-300 bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors text-xs font-bold uppercase tracking-wide border border-slate-700"
            >
                <FileBadge size={16} /> Pre-Approval
            </button>
             <button 
                onClick={async () => {
                    setGeneratingSubmission(true);
                    setShowSubmissionModal(true);
                    try {
                        const { pdfUrl, filename, missingInfo } = await generateSubmissionPDFPreview(scenario, results);
                        setSubmissionPdfUrl(pdfUrl);
                        setSubmissionFilename(filename);
                        setSubmissionMissingInfo(missingInfo);
                    } catch (error) {
                        console.error('Error generating submission PDF:', error);
                        addToast({ 
                            type: 'error', 
                            message: error instanceof Error ? error.message : 'Failed to generate submission email' 
                        });
                        setShowSubmissionModal(false);
                    } finally {
                        setGeneratingSubmission(false);
                    }
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 text-indigo-300 bg-indigo-900/30 hover:bg-indigo-900/50 rounded-lg transition-colors text-xs font-bold uppercase tracking-wide border border-indigo-500/30"
            >
                <FileText size={16} /> Submission Email
            </button>
            <button 
                onClick={() => setShowHistoryModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="History"
            >
                <History size={20} />
            </button>
            <button 
                onClick={prepareLog}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 transition-all transform hover:-translate-y-0.5 text-xs font-bold uppercase tracking-wide"
            >
                <CheckCircle size={16} /> Log Update
            </button>
        </div>
      </header>

      {/* Main Content Grid - 3 Column Layout */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row print:hidden">
        
        {/* Left Panel: Inputs */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          <div className="max-w-3xl mx-auto space-y-4 pb-8">
            
            {/* Tabs */}
            <div className="flex bg-white rounded-xl p-1.5 shadow-sm border border-slate-200 mb-6 sticky top-0 z-20">
                <button onClick={() => setActiveTab('loan')} className={`flex-1 py-2 px-4 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'loan' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>Loan</button>
                <button onClick={() => setActiveTab('costs')} className={`flex-1 py-2 px-4 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'costs' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>Costs</button>
                <button onClick={() => setActiveTab('advanced')} className={`flex-1 py-2 px-4 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'advanced' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>Assistance</button>
                <button onClick={() => setActiveTab('income')} className={`flex-1 py-2 px-4 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'income' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>Income</button>
            </div>

            {/* Loan Tab Content */}
            {activeTab === 'loan' && (
                <>
                    {/* Validation Banner */}
                    <ValidationBanner errors={validationErrors} />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide border-b border-slate-100 pb-2">
                            <Building size={16} className="text-slate-400" /> Property Profile
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Transaction Type</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button 
                                        onClick={() => handleInputChange('transactionType', 'Purchase')}
                                        className={`flex-1 py-2 px-4 text-xs font-bold uppercase rounded-md transition-all ${scenario.transactionType === 'Purchase' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Purchase
                                    </button>
                                    <button 
                                        onClick={() => handleInputChange('transactionType', 'Refinance')}
                                        className={`flex-1 py-2 px-4 text-xs font-bold uppercase rounded-md transition-all ${scenario.transactionType === 'Refinance' ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Refinance
                                    </button>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className={labelClass}>Address</label>
                                    <CustomCheckbox checked={scenario.isAddressTBD} onChange={(checked) => handleInputChange('isAddressTBD', checked)} label="TBD" />
                                </div>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>
                                        <MapPin size={16} className={`${scenario.isAddressTBD ? 'text-slate-300' : 'text-slate-400'}`} />
                                    </div>
                                    <input type="text" value={scenario.isAddressTBD ? "To Be Determined" : scenario.propertyAddress} disabled={scenario.isAddressTBD} onChange={(e) => handleInputChange('propertyAddress', e.target.value)} className={`w-full px-4 py-2 text-sm outline-none bg-transparent font-medium ${scenario.isAddressTBD ? 'text-slate-400 italic cursor-not-allowed' : 'text-slate-900'}`} />
                                </div>
                            </div>
                            
                            {!scenario.isAddressTBD && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>F&A Date</label>
                                        <div className={inputGroupClass}>
                                            <input 
                                                type="date" 
                                                value={scenario.faDate ? scenario.faDate.split('T')[0] : ''} 
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        const date = new Date(e.target.value + 'T00:00:00');
                                                        handleInputChange('faDate', date.toISOString());
                                                    } else {
                                                        handleInputChange('faDate', undefined);
                                                    }
                                                }} 
                                                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900" 
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Settlement Date</label>
                                        <div className={inputGroupClass}>
                                            <input 
                                                type="date" 
                                                value={scenario.settlementDate ? scenario.settlementDate.split('T')[0] : ''} 
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        const date = new Date(e.target.value + 'T00:00:00');
                                                        handleInputChange('settlementDate', date.toISOString());
                                                    } else {
                                                        handleInputChange('settlementDate', undefined);
                                                    }
                                                }} 
                                                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900" 
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <div>
                                <label className={labelClass}>{scenario.transactionType === 'Purchase' ? 'Purchase Price' : 'Property Value'}</label>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>$</div>
                                    <FormattedNumberInput value={scenario.purchasePrice || 0} onChangeValue={(val) => handleInputChange('purchasePrice', val)} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                </div>
                            </div>

                            {scenario.transactionType === 'Purchase' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Down Pmt ($)</label>
                                        <div className={inputGroupClass}>
                                            <div className={symbolClass}>$</div>
                                            <FormattedNumberInput value={scenario.downPaymentAmount || 0} onChangeValue={(val) => handleInputChange('downPaymentAmount', val)} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Down Pmt (%)</label>
                                        <div className={inputGroupClass}>
                                            <LiveDecimalInput value={scenario.downPaymentPercent} onChange={(val) => handleInputChange('downPaymentPercent', val)} step="0.01" precision={2} className="h-full pl-4 pr-4 text-sm text-slate-900 font-medium text-right" />
                                            <div className={symbolRightClass}>%</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Cash Out ($)</label>
                                        <div className={inputGroupClass}>
                                            <div className={symbolClass}>$</div>
                                            <FormattedNumberInput value={scenario.downPaymentAmount || 0} onChangeValue={(val) => handleInputChange('downPaymentAmount', val)} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Loan Amount</label>
                                        <div className={inputGroupClass}>
                                            <div className={symbolClass}>$</div>
                                            <FormattedNumberInput value={(scenario.purchasePrice || 0) - (scenario.downPaymentAmount || 0)} onChangeValue={(val) => {
                                                const newDownPayment = (scenario.purchasePrice || 0) - val;
                                                handleInputChange('downPaymentAmount', newDownPayment);
                                            }} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <div>
                                <label className={labelClass}>Property Taxes (Yearly)</label>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>$</div>
                                    <FormattedNumberInput value={scenario.propertyTaxYearly || 0} onChangeValue={(val) => handleInputChange('propertyTaxYearly', val)} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                </div>
                            </div>
                             <div>
                                <label className={labelClass}>Insurance (Yearly)</label>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>$</div>
                                    <FormattedNumberInput value={scenario.homeInsuranceYearly || 0} onChangeValue={(val) => handleInputChange('homeInsuranceYearly', val)} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>HOA (Monthly)</label>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>$</div>
                                    <FormattedNumberInput value={scenario.hoaMonthly || 0} onChangeValue={(val) => handleInputChange('hoaMonthly', val)} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-fit">
                         <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide border-b border-slate-100 pb-2">
                            <Calculator size={16} className="text-slate-400" /> Loan Details
                        </h3>
                        
                        {/* Loan Type Toggle */}
                        <div className="mb-3">
                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Loan Type</label>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                {Object.values(LoanType).map((type) => (
                                    <button key={type} onClick={() => handleInputChange('loanType', type)} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${scenario.loanType === type ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}>
                                        {type === LoanType.CONVENTIONAL ? 'Conv' : type === LoanType.JUMBO ? 'Jumbo' : type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Occupancy Type Toggle */}
                        <div className="mb-3">
                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Occupancy Type</label>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                {(['Primary Residence', 'Second Home', 'Investment Property'] as const).map((type) => (
                                    <button 
                                        key={type} 
                                        onClick={() => handleInputChange('occupancyType', type)} 
                                        className={`flex-1 py-2 px-2 text-[9px] font-bold uppercase rounded-md transition-all ${(scenario.occupancyType || 'Primary Residence') === type ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {type === 'Primary Residence' ? 'Primary' : type === 'Second Home' ? '2nd Home' : 'Investment'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Number of Units Toggle */}
                        <div className="mb-3">
                            <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Number of Units</label>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                {([1, 2, 3, 4] as const).map((units) => (
                                    <button 
                                        key={units} 
                                        onClick={() => handleInputChange('numberOfUnits', units)} 
                                        className={`flex-1 py-2 px-2 text-sm font-bold rounded-md transition-all ${(scenario.numberOfUnits || 1) === units ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {units}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Interest Rate</label>
                                    <div className={inputGroupClass}>
                                        <LiveDecimalInput value={scenario.interestRate} onChange={(val) => handleInputChange('interestRate', val)} step="0.001" precision={3} className="h-full pl-4 pr-4 text-sm text-slate-900 text-right font-medium" />
                                        <div className={symbolRightClass}>%</div>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Term (Months)</label>
                                    <div className={inputGroupClass}>
                                        <input type="number" value={scenario.loanTermMonths || ''} onChange={(e) => handleNumberChange('loanTermMonths', e.target.value)} onWheel={handleWheel} className="w-full px-4 py-2 text-sm outline-none bg-transparent text-slate-900 font-medium" />
                                    </div>
                                </div>
                            </div>
                            
                            {(scenario.loanType === LoanType.CONVENTIONAL || scenario.loanType === LoanType.JUMBO) && (
                                <div className={`p-4 rounded-lg border transition-all ${scenario.interestOnly ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                                    <CustomCheckbox checked={scenario.interestOnly} onChange={(checked) => handleInputChange('interestOnly', checked)} label="Interest Only Loan" warning="Payment covers interest only." />
                                </div>
                            )}

                             {scenario.loanType === LoanType.FHA && (
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">FHA Details</p>
                                        <span className="text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">{results.ltv > 95 ? "LTV > 95%" : "LTV ≤ 95%"}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm text-slate-600 mb-2">
                                        <span>UFMIP (1.75%)</span>
                                        <span className="font-mono font-medium text-slate-900">{formatMoney(results.financedMIP)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm text-slate-600">
                                        <span className="flex items-center gap-1">Monthly MIP <span className="text-[10px] text-slate-400 font-bold">({results.miRatePercent.toFixed(2)}%)</span></span>
                                        <span className="font-mono font-medium text-slate-900">{formatMoney(results.monthlyMI)}</span>
                                    </div>
                                </div>
                            )}
                            
                            {scenario.loanType === LoanType.VA && (
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3">VA Details</p>
                                    <label className={labelClass}>Funding Fee %</label>
                                    <div className={`${inputGroupClass} mb-4`}>
                                         <input type="number" step="0.01" value={scenario.ufmipRate || ''} onChange={(e) => handleNumberChange('ufmipRate', e.target.value)} onWheel={handleWheel} className="w-full pl-4 pr-4 text-sm text-right outline-none bg-transparent font-medium" />
                                         <div className={symbolRightClass}>%</div>
                                    </div>
                                     <div className="flex justify-between items-center text-sm text-slate-600">
                                        <span>Financed Fee</span>
                                        <span className="font-mono font-medium text-slate-900">{formatMoney(results.financedMIP)}</span>
                                    </div>
                                </div>
                            )}

                             {scenario.loanType === LoanType.CONVENTIONAL && (
                                <div>
                                    <label className={labelClass}>Manual MI Override</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className={inputGroupClass}>
                                                <div className={symbolClass}>$</div>
                                                <FormattedNumberInput 
                                                    value={results.monthlyMI} 
                                                    onChangeValue={(val) => handleMIChange('dollars', val)} 
                                                    className="h-full px-4 text-sm text-slate-900 font-medium" 
                                                />
                                            </div>
                                            <span className="text-[9px] text-slate-400 mt-1 block font-bold uppercase tracking-wider ml-0.5">Monthly</span>
                                        </div>
                                        <div>
                                            <div className={inputGroupClass}>
                                                <LiveDecimalInput 
                                                    value={results.miRatePercent} 
                                                    onChange={(val) => handleMIChange('rate', val)} 
                                                    step="0.01" 
                                                    precision={3} 
                                                    className="h-full pl-4 pr-4 text-sm text-slate-900 text-right font-medium" 
                                                />
                                                <div className={symbolRightClass}>%</div>
                                            </div>
                                            <span className="text-[9px] text-slate-400 mt-1 block font-bold uppercase tracking-wider ml-0.5">Annual Rate</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* NEW: Total Loan Amount Footer */}
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <div className="flex justify-between items-end">
                                <div>
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Base Loan Amount</span>
                                    <span className="text-xs font-medium text-slate-500 font-mono">{formatMoney(results.baseLoanAmount)}</span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Total Loan Amount</span>
                                    <span className="text-xl font-bold text-slate-900 tracking-tight">{formatMoney(results.totalLoanAmount)}</span>
                                </div>
                            </div>
                            {results.financedMIP > 0 && (
                                <div className="text-right text-[10px] text-slate-400 mt-1 font-medium">
                                    Includes {formatMoney(results.financedMIP)} Financed Fee
                                </div>
                            )}
                         </div>
                    </div>
                </div>
                </>
            )}
            
             {/* Costs Tab Content */}
             {activeTab === 'costs' && (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-fadeIn">
                    <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
                        <DollarSign size={16} className="text-slate-400" /> Closing Costs & Credits
                    </h3>
                    
                    {/* Header Grid */}
                    <div className={`mb-8 grid grid-cols-1 md:grid-cols-4 gap-4 ${scenario.transactionType === 'Refinance' ? 'md:grid-cols-2' : ''}`}>
                        {/* Earnest Money - Only show for Purchase */}
                        {scenario.transactionType === 'Purchase' && (
                            <div className="col-span-1 bg-emerald-50/50 p-4 rounded-lg border border-emerald-100/60 h-28 flex flex-col justify-between">
                                 <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-widest ml-0.5">Earnest Money</label>
                                 <div className="flex items-center w-full bg-white border border-emerald-200 rounded-lg shadow-sm h-10 overflow-hidden mt-auto">
                                    <div className="flex items-center justify-center h-full px-3 bg-emerald-50 border-r border-emerald-100 text-emerald-600 text-xs font-bold">$</div>
                                    <FormattedNumberInput value={scenario.earnestMoney || 0} onChangeValue={(val) => handleInputChange('earnestMoney', val)} className="h-full px-4 text-sm text-emerald-900 font-medium" />
                                </div>
                            </div>
                        )}

                        {/* Seller Concessions - Only show for Purchase */}
                        {scenario.transactionType === 'Purchase' && (
                            <div className="col-span-1 md:col-span-2 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100/60 h-28 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <label className="block text-[10px] font-bold text-indigo-800 uppercase tracking-widest ml-0.5">Seller Concessions</label>
                                <button onClick={() => setScenario(prev => ({ ...prev, showSellerConcessions: !prev.showSellerConcessions }))} className={`w-8 h-4 rounded-full flex items-center transition-colors px-1 ${scenario.showSellerConcessions ? 'bg-indigo-600' : 'bg-slate-300'}`} title="Toggle">
                                    <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm transform transition-transform ${scenario.showSellerConcessions ? 'translate-x-3.5' : ''}`}></div>
                                </button>
                            </div>
                            
                            {scenario.showSellerConcessions ? (
                                <div className="flex gap-4 items-end mt-auto">
                                     <div className="flex items-center w-40 bg-white border border-indigo-200 rounded-lg shadow-sm h-10 overflow-hidden shrink-0">
                                        <div className="flex items-center justify-center h-full px-3 bg-indigo-50 border-r border-indigo-100 text-indigo-600 text-xs font-bold">$</div>
                                        <FormattedNumberInput value={scenario.sellerConcessions || 0} onChangeValue={(val) => handleInputChange('sellerConcessions', val)} className="h-full px-4 text-sm text-indigo-900 font-medium" />
                                    </div>
                                    <div className="flex-1 pb-1">
                                        <div className="flex justify-between items-end mb-1">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isConcessionLimitExceeded ? 'text-red-600' : 'text-indigo-400'}`}>
                                                {results.sellerConcessionsPercent.toFixed(2)}% Used
                                            </span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isConcessionLimitExceeded ? 'text-red-600' : 'text-indigo-300'}`}>
                                                Max {maxConcessionsPercent.toFixed(1)}% / {formatMoney(results.maxConcessionsAllowed)}
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full bg-indigo-200/50 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${isConcessionLimitExceeded ? 'bg-red-500' : 'bg-indigo-500'}`} 
                                                style={{ width: `${Math.min((results.sellerConcessionsPercent / maxConcessionsPercent) * 100, 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-10 mt-auto w-full bg-slate-200/20 rounded-lg border border-transparent flex items-center justify-center text-xs text-slate-400 italic font-medium">Disabled</div>
                            )}
                            </div>
                        )}

                        {/* Lender Credit */}
                        <div className="col-span-1 bg-slate-100/50 p-4 rounded-lg border border-slate-200 h-28 flex flex-col justify-between">
                            <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-0.5">Lender Credit</label>
                                <button onClick={() => setScenario(prev => ({ ...prev, showLenderCredits: !prev.showLenderCredits }))} className={`w-8 h-4 rounded-full flex items-center transition-colors px-1 ${scenario.showLenderCredits ? 'bg-indigo-600' : 'bg-slate-300'}`} title="Toggle">
                                    <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm transform transition-transform ${scenario.showLenderCredits ? 'translate-x-3.5' : ''}`}></div>
                                </button>
                            </div>

                            <div className="h-10 mt-auto flex items-center">
                                {scenario.showLenderCredits ? (
                                    <CompactTypeToggleInput 
                                        value={scenario.lenderCredits}
                                        onChange={(val) => setScenario(prev => ({ ...prev, lenderCredits: val }))}
                                        isFixed={scenario.lenderCreditsMode === 'fixed'}
                                        onToggle={toggleLenderCreditMode}
                                    />
                                ) : (
                                    <div className="h-full w-full bg-slate-200/20 rounded-lg border border-transparent flex items-center justify-center text-xs text-slate-400 italic font-medium">Disabled</div>
                                )}
                            </div>
                        </div>
                    </div>

                     {/* Warnings */}
                    {results.warnings?.excessConcessions && (
                        <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-3">
                            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Excess Concessions Warning</p>
                                {results.unusedCredits > 0 && (
                                    <p className="text-xs text-amber-700 mt-1">
                                        You have {formatMoney(results.unusedCredits)} in unused credits that exceeds total closing costs.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Closing Costs List */}
                    <div className="space-y-8">
                        {costGroups.map((group) => (
                            <div key={group.category} className="border border-slate-200 rounded-lg overflow-hidden">
                                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{group.category}</h4>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {group.items.filter(cost => cost && cost.id).map((cost) => (
                                        <div key={cost.id} className="flex items-center gap-4 py-3 px-4 hover:bg-slate-50 transition-colors group">
                                            {/* Editable name for misc fees (misc-1 through misc-4) */}
                                            {(cost.id === 'misc-1' || cost.id === 'misc-2' || cost.id === 'misc-3' || cost.id === 'misc-4') ? (
                                                <input
                                                    type="text"
                                                    value={cost.name}
                                                    onChange={(e) => {
                                                        setScenario(prev => ({
                                                            ...prev,
                                                            closingCosts: prev.closingCosts.map(item =>
                                                                item.id === cost.id ? { ...item, name: e.target.value } : item
                                                            )
                                                        }));
                                                    }}
                                                    className="flex-1 text-sm font-medium text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none px-1 py-0.5 transition-colors"
                                                    placeholder={`Other Fee ${cost.id.slice(-1)}`}
                                                />
                                            ) : (
                                                <label className="flex-1 text-sm font-medium text-slate-700 group-hover:text-slate-900">{cost.name}</label>
                                            )}
                                            
                                            {/* Cost Render Logic */}
                                            {cost.id === 'prepaid-interest' ? (
                                                <div className="flex items-center gap-3">
                                                     <div className={`flex items-center w-24 h-10 bg-white border border-slate-200 rounded-lg overflow-hidden ${scenario.settlementDate ? 'opacity-60 cursor-not-allowed bg-slate-50' : 'focus-within:ring-1 focus-within:ring-indigo-500'}`}>
                                                        <input 
                                                            type="number" 
                                                            value={scenario.settlementDate ? results.prepaidInterestDays : (cost.days ?? 0)} 
                                                            onChange={(e) => {
                                                                if (!scenario.settlementDate) {
                                                                    updateCostDays(cost.id, e.target.value);
                                                                }
                                                            }} 
                                                            onWheel={handleWheel} 
                                                            disabled={!!scenario.settlementDate}
                                                            className={`w-full pl-3 pr-5 text-right text-sm outline-none bg-transparent font-medium ${scenario.settlementDate ? 'cursor-not-allowed text-slate-500' : ''}`} 
                                                        />
                                                        <span className="px-3 text-slate-400 text-xs font-bold bg-slate-50 h-full flex items-center border-l border-slate-200">d</span>
                                                     </div>
                                                     <div className="min-w-[5rem] text-right font-mono text-sm text-slate-600 font-medium">
                                                         {formatMoney(scenario.settlementDate ? results.prepaidInterest : ((results.totalLoanAmount * (scenario.interestRate / 100) / 365) * (cost.days || 0)))}
                                                     </div>
                                                </div>
                                            ) : (cost.id === 'prepaid-insurance' || cost.id === 'tax-reserves' || cost.id === 'insurance-reserves' || cost.id === 'hoa-prepay') ? (
                                                <div className="flex items-center gap-3">
                                                     <div className="flex items-center w-24 h-10 bg-white border border-slate-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500">
                                                        <input type="number" value={cost.months ?? 0} onChange={(e) => updateCostMonths(cost.id, e.target.value)} onWheel={handleWheel} className="w-full pl-3 pr-5 text-right text-sm outline-none bg-transparent font-medium" />
                                                        <span className="px-3 text-slate-400 text-xs font-bold bg-slate-50 h-full flex items-center border-l border-slate-200">mo</span>
                                                     </div>
                                                     <div className="min-w-[5rem] text-right font-mono text-sm text-slate-600 font-medium">
                                                          {cost.id === 'prepaid-insurance' && formatMoney((scenario.homeInsuranceYearly/12) * (cost.months || 0))}
                                                          {cost.id === 'tax-reserves' && formatMoney((scenario.propertyTaxYearly/12) * (cost.months || 0))}
                                                          {cost.id === 'insurance-reserves' && formatMoney((scenario.homeInsuranceYearly/12) * (cost.months || 0))}
                                                          {cost.id === 'hoa-prepay' && formatMoney(scenario.hoaMonthly * (cost.months || 0))}
                                                     </div>
                                                </div>
                                            ) : cost.id === 'title-insurance' ? (
                                                // Lenders Title Insurance - calculated based on loan amount, but editable with calculated hint
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center w-48 h-10 bg-white border border-slate-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
                                                        <div className="flex items-center justify-center h-full px-2 bg-slate-50 border-r border-slate-200 text-slate-300 text-[9px] font-normal min-w-[3.5rem]">
                                                            {Math.round(calculateLendersTitleInsurance(results.totalLoanAmount)).toLocaleString()}
                                                        </div>
                                                        <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-400 text-xs font-bold min-w-[2.5rem]">$</div>
                                                        <FormattedNumberInput 
                                                            value={cost.amount || calculateLendersTitleInsurance(results.totalLoanAmount)} 
                                                            onChangeValue={(val) => updateCost(cost.id, val)} 
                                                            className="w-full px-3 pr-5 text-right text-sm text-slate-900 font-medium" 
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center w-48 h-10 bg-white border border-slate-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
                                                        {/* Discount points, Buyer's Agent Commission, and Other Fees can toggle between $ and %} */}
                                                        {(cost.id === 'discount-points' || cost.id === 'buyers-agent-commission' || (cost.category === 'Other Fees' && cost.id !== 'hoa-transfer' && cost.id !== 'hoa-prepay')) ? (
                                                            <>
                                                                {cost.isFixed ? (
                                                                    <>
                                                                        <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-400 text-xs font-bold min-w-[2.5rem]">$</div>
                                                                        <FormattedNumberInput 
                                                                            value={cost.amount} 
                                                                            onChangeValue={(val) => updateCost(cost.id, val)} 
                                                                            className="w-full px-3 pr-5 text-right text-sm text-slate-900 font-medium" 
                                                                        />
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <LiveDecimalInput 
                                                                            value={cost.amount} 
                                                                            onChange={(val) => updateCost(cost.id, val)} 
                                                                            className="w-full pl-3 pr-5 text-right text-sm outline-none bg-transparent font-medium"
                                                                            precision={3}
                                                                        />
                                                                         <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-l border-slate-200 text-slate-400 text-xs font-bold min-w-[2.5rem]">%</div>
                                                                    </>
                                                                )}
                                                                <button 
                                                                    onClick={() => toggleCostFixed(cost.id)}
                                                                    className="h-full px-2 border-l border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                                    title="Toggle Unit"
                                                                >
                                                                    <ArrowLeftRight size={14} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            /* All other fields are fixed dollar amounts only (including title fees - editable but fixed $) */
                                                            <>
                                                                <div className="flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-400 text-xs font-bold min-w-[2.5rem]">$</div>
                                                                <FormattedNumberInput 
                                                                    value={cost.amount} 
                                                                    onChangeValue={(val) => updateCost(cost.id, val)} 
                                                                    className="w-full px-3 pr-5 text-right text-sm text-slate-900 font-medium" 
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* NEW: Costs Summary Footer */}
                    <div className="mt-8 bg-slate-50 rounded-xl p-6 border border-slate-200">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Closing Costs Summary</h4>
                        <div className="space-y-3">
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-slate-600 font-medium">Total Closing Costs</span>
                                 <span className="font-bold text-slate-900">{formatMoney(results.totalClosingCosts)}</span>
                             </div>
                             {(results.sellerConcessionsAmount > 0 || results.lenderCreditsAmount > 0) && (
                                 <div className="flex justify-between items-center text-sm">
                                     <span className="text-emerald-600 font-medium">Total Credits (Seller & Lender)</span>
                                     <span className="font-bold text-emerald-600">-{formatMoney(results.sellerConcessionsAmount + results.lenderCreditsAmount)}</span>
                                 </div>
                             )}
                             <div className="pt-3 border-t border-slate-200 flex justify-between items-end">
                                 <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Net Closing Costs</span>
                                 <span className="text-2xl font-black text-slate-900 tracking-tight">{formatMoney(results.netClosingCosts)}</span>
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Assistance Tab Content */}
            {activeTab === 'advanced' && (
                <div className="space-y-6 animate-fadeIn">
                     <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                         <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-3">
                             <h3 className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wide">
                                <TrendingUp size={16} className="text-slate-400" /> Temporary Buydown
                            </h3>
                            <CustomCheckbox checked={scenario.buydown.active} onChange={(c) => setScenario(prev => ({ ...prev, buydown: { ...prev.buydown, active: c } }))} label="Enable Buydown" />
                        </div>

                        <div className={`space-y-5 transition-all ${!scenario.buydown.active ? 'opacity-50 pointer-events-none' : ''}`}>
                             <div>
                                <label className={labelClass}>Buydown Type</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    {['2-1', '1-0', '1-1', '3-2-1'].map((type) => (
                                        <button key={type} onClick={() => setScenario(prev => ({ ...prev, buydown: { ...prev.buydown, type: type as any } }))} className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${scenario.buydown.type === type ? 'bg-white shadow text-indigo-700 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}>
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {scenario.buydown.active && results.buydownSchedule && (
                                <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                                     <table className="w-full text-sm">
                                         <thead>
                                             <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                                                 <th className="py-2 px-4">Year</th>
                                                 <th className="py-2 px-4">Rate</th>
                                                 <th className="py-2 px-4 text-right">Payment</th>
                                                 <th className="py-2 px-4 text-right">Subsidy</th>
                                             </tr>
                                         </thead>
                                         <tbody className="divide-y divide-slate-100">
                                             {results.buydownSchedule.map((row) => (
                                                 <tr key={row.year}>
                                                     <td className="py-2 px-4 font-medium text-slate-700">Year {row.year}</td>
                                                     <td className="py-2 px-4 font-bold text-indigo-600">{row.rate.toFixed(3)}%</td>
                                                     <td className="py-2 px-4 text-right font-medium text-slate-900">{formatMoney(row.fullPayment)}</td>
                                                     <td className="py-2 px-4 text-right font-mono text-emerald-600">{formatMoney(row.subsidy)}/mo</td>
                                                 </tr>
                                             ))}
                                         </tbody>
                                         <tfoot className="bg-emerald-50/50 border-t border-emerald-100">
                                             <tr>
                                                 <td colSpan={3} className="py-2 px-4 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Total Subsidy Cost</td>
                                                 <td className="py-2 px-4 text-right font-bold text-emerald-700">{formatMoney(results.buydownCost)}</td>
                                             </tr>
                                         </tfoot>
                                     </table>
                                </div>
                            )}
                        </div>
                     </div>

                     <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-3">
                             <h3 className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wide">
                                <Wallet size={16} className="text-slate-400" /> Down Payment Assistance
                            </h3>
                            <CustomCheckbox 
                                checked={scenario.dpa.active} 
                                onChange={(c) => {
                                    setScenario(prev => {
                                        // If disabling first DPA, also disable second DPA
                                        const updated = { ...prev, dpa: { ...prev.dpa, active: c } };
                                        if (!c && prev.dpa2?.active) {
                                            updated.dpa2 = undefined;
                                        }
                                        return updated;
                                    });
                                }} 
                                label="Enable DPA" 
                            />
                        </div>

                         <div className={`space-y-5 transition-all ${!scenario.dpa.active ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Assistance Amount ($)</label>
                                    <div className={inputGroupClass}>
                                        <div className={symbolClass}>$</div>
                                        <FormattedNumberInput value={scenario.dpa.amount || 0} onChangeValue={(val) => handleDPAChange('amount', val)} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Assistance Amount (%)</label>
                                    <div className={inputGroupClass}>
                                        <LiveDecimalInput value={scenario.dpa.percent || 0} onChange={(val) => handleDPAChange('percent', val)} className="h-full pl-4 pr-4 text-right text-sm text-slate-900 font-medium" />
                                        <div className={symbolRightClass}>%</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Interest Rate</label>
                                    <div className={inputGroupClass}>
                                        <LiveDecimalInput value={scenario.dpa.rate || 0} onChange={(val) => setScenario(prev => ({...prev, dpa: {...prev.dpa, rate: val}}))} step="0.125" precision={3} className="h-full pl-4 pr-4 text-right text-sm text-slate-900 font-medium" />
                                        <div className={symbolRightClass}>%</div>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Term (Months)</label>
                                    <div className={inputGroupClass}>
                                        <input type="number" value={scenario.dpa.termMonths || ''} onChange={(e) => setScenario(prev => ({...prev, dpa: {...prev.dpa, termMonths: parseFloat(e.target.value)}}))} onWheel={handleWheel} className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                 <CustomCheckbox checked={scenario.dpa.isDeferred} onChange={(c) => setScenario(prev => ({...prev, dpa: {...prev.dpa, isDeferred: c}}))} label="Deferred Payment (Silent Second)" />
                                 {!scenario.dpa.isDeferred && (
                                     <div className="mt-3 flex justify-between items-center text-sm">
                                         <span className="text-slate-500 font-medium">Monthly DPA Payment</span>
                                         <span className="font-mono font-bold text-slate-900">{formatMoney(results.monthlyDPAPayment)}</span>
                                     </div>
                                 )}
                            </div>
                         </div>
                         
                         {/* Second DPA Section */}
                         <div className={`pt-6 border-t border-slate-200 ${!scenario.dpa.active ? 'opacity-50' : ''}`}>
                            <div className="flex justify-between items-start mb-4">
                                <h4 className="text-slate-700 font-semibold text-xs uppercase tracking-wide">Second DPA</h4>
                                <div 
                                    onClick={(e) => {
                                        if (!scenario.dpa.active) {
                                            e.stopPropagation();
                                            return;
                                        }
                                    }}
                                    className={!scenario.dpa.active ? 'cursor-not-allowed' : ''}
                                >
                                    <CustomCheckbox 
                                        checked={scenario.dpa2?.active || false} 
                                        onChange={(c) => {
                                            if (!scenario.dpa.active) return; // Prevent enabling if first DPA is not active
                                            setScenario(prev => ({ 
                                                ...prev, 
                                                dpa2: c ? {
                                                    active: true,
                                                    amount: 0,
                                                    percent: 0,
                                                    rate: 7.5,
                                                    termMonths: 120,
                                                    payment: 0,
                                                    isDeferred: false
                                                } : undefined
                                            }));
                                        }} 
                                        label="Enable Second DPA" 
                                    />
                                </div>
                            </div>
                            {!scenario.dpa.active && (
                                <p className="text-[9px] text-slate-400 mb-3 italic">Enable first DPA to use second DPA</p>
                            )}
                            
                            <div className={`space-y-4 transition-all ${!scenario.dpa2?.active || !scenario.dpa.active ? 'opacity-40 pointer-events-none max-h-0 overflow-hidden' : 'max-h-[500px]'}`}>
                                {scenario.dpa2?.active && (
                                    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 mb-4">
                                        <p className="text-xs text-amber-900 font-semibold flex items-start gap-2">
                                            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                            <span>⚠️ Using a second DPA - please verify program guidelines allow stacking multiple DPA programs</span>
                                        </p>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Assistance Amount ($)</label>
                                        <div className={inputGroupClass}>
                                            <div className={symbolClass}>$</div>
                                            <FormattedNumberInput 
                                                value={scenario.dpa2?.amount || 0} 
                                                onChangeValue={(val) => handleDPAChange('amount', val, true)} 
                                                className="h-full px-4 text-sm text-slate-900 font-medium" 
                                            />
                                        </div>
                                        {scenario.dpa2?.active && (
                                            <p className="text-[9px] text-amber-600 mt-1 ml-0.5 italic">Second DPA active - check guidelines</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className={labelClass}>Assistance Amount (%)</label>
                                        <div className={inputGroupClass}>
                                            <LiveDecimalInput 
                                                value={scenario.dpa2?.percent || 0} 
                                                onChange={(val) => handleDPAChange('percent', val, true)} 
                                                className="h-full pl-4 pr-4 text-right text-sm text-slate-900 font-medium" 
                                            />
                                            <div className={symbolRightClass}>%</div>
                                        </div>
                                        {scenario.dpa2?.active && (
                                            <p className="text-[9px] text-amber-600 mt-1 ml-0.5 italic">Second DPA active - check guidelines</p>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Interest Rate</label>
                                        <div className={inputGroupClass}>
                                            <LiveDecimalInput 
                                                value={scenario.dpa2?.rate || 0} 
                                                onChange={(val) => setScenario(prev => ({
                                                    ...prev, 
                                                    dpa2: prev.dpa2 ? {...prev.dpa2, rate: val} : undefined
                                                }))} 
                                                step="0.125" 
                                                precision={3} 
                                                className="h-full pl-4 pr-4 text-right text-sm text-slate-900 font-medium" 
                                            />
                                            <div className={symbolRightClass}>%</div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Term (Months)</label>
                                        <div className={inputGroupClass}>
                                            <input 
                                                type="number" 
                                                value={scenario.dpa2?.termMonths || ''} 
                                                onChange={(e) => setScenario(prev => ({
                                                    ...prev, 
                                                    dpa2: prev.dpa2 ? {...prev.dpa2, termMonths: parseFloat(e.target.value)} : undefined
                                                }))} 
                                                onWheel={handleWheel} 
                                                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium" 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <CustomCheckbox 
                                        checked={scenario.dpa2?.isDeferred || false} 
                                        onChange={(c) => setScenario(prev => ({
                                            ...prev, 
                                            dpa2: prev.dpa2 ? {...prev.dpa2, isDeferred: c} : undefined
                                        }))} 
                                        label="Deferred Payment (Silent Second)" 
                                    />
                                    {scenario.dpa2 && !scenario.dpa2.isDeferred && (
                                        <div className="mt-3 flex justify-between items-center text-sm">
                                            <span className="text-slate-500 font-medium">Monthly DPA2 Payment</span>
                                            <span className="font-mono font-bold text-slate-900">
                                                {results.monthlyDPA2Payment ? formatMoney(results.monthlyDPA2Payment) : '$0'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                         </div>
                     </div>
                </div>
            )}
            
             {/* Income Tab Content */}
             {activeTab === 'income' && (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-fadeIn">
                     <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
                        <Briefcase size={16} className="text-slate-400" /> Income & Eligibility
                    </h3>
                    
                    {/* DSCR Loan Toggle (Investment Properties Only) */}
                    {scenario.occupancyType === 'Investment Property' && (
                        <div className="mb-6 p-4 rounded-lg border-2 bg-indigo-50 border-indigo-200">
                            <CustomCheckbox 
                                checked={scenario.isDSCRLoan || false} 
                                onChange={(checked) => handleInputChange('isDSCRLoan', checked)} 
                                label="DSCR Loan" 
                                warning="Borrower income and debt information will be ignored. Only rental income and DSCR ratio will be used for qualification." 
                            />
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                             <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2">Monthly Income</h4>
                             {!scenario.isDSCRLoan && (
                                 <>
                                     <div>
                                        <label className={labelClass}>Borrower 1 Income</label>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>$</div>
                                    <FormattedNumberInput value={scenario.income?.borrower1 || 0} onChangeValue={(val) => setScenario(prev => ({...prev, income: {...prev.income, borrower1: val}}))} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Borrower 2 Income</label>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>$</div>
                                    <FormattedNumberInput value={scenario.income?.borrower2 || 0} onChangeValue={(val) => setScenario(prev => ({...prev, income: {...prev.income, borrower2: val}}))} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                </div>
                            </div>
                                 </>
                             )}
                             {scenario.isDSCRLoan && (
                                 <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                     <p className="text-[10px] text-slate-500 italic">Borrower income not used for DSCR loans</p>
                                 </div>
                             )}
                            <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <label className={labelClass}>Rental Income / ADU</label>
                                    {scenario.isDSCRLoan ? (
                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                            DSCR: {results.dscr?.ratio.toFixed(2) || '0.00'}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                            Used: {formatMoney(results.income.effectiveRental)} <span className="text-emerald-500">(75%)</span>
                                        </span>
                                    )}
                                </div>
                                <div className={inputGroupClass}>
                                    <div className={symbolClass}>$</div>
                                    <FormattedNumberInput value={scenario.income?.rental || 0} onChangeValue={(val) => setScenario(prev => ({...prev, income: {...prev.income, rental: val}}))} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1 italic">
                                    {scenario.isDSCRLoan 
                                        ? 'Gross monthly rental income used for DSCR calculation only.' 
                                        : scenario.occupancyType === 'Investment Property' 
                                        ? '75% used for DTI calculation. Gross amount used for DSCR.' 
                                        : '75% vacancy factor applied automatically'}
                                </p>
                            </div>
                         </div>

                         <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Monthly Debts</h4>
                             {!scenario.isDSCRLoan && (
                                 <>
                                     <div>
                                        <label className={labelClass}>Total Monthly Liabilities</label>
                                        <div className={inputGroupClass}>
                                            <div className={symbolClass}>$</div>
                                            <FormattedNumberInput value={scenario.debts?.monthlyTotal || 0} onChangeValue={(val) => setScenario(prev => ({...prev, debts: {...prev.debts, monthlyTotal: val}}))} className="h-full px-4 text-sm text-slate-900 font-medium" />
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">Credit cards, auto loans, student loans, etc.</p>
                                    </div>
                                    
                                    {(() => {
                                        // Check if we should show DTI (skip if no borrower income but rental income exists)
                                        const hasBorrowerIncome = (scenario.income?.borrower1 || 0) > 0 || 
                                                                 (scenario.income?.borrower2 || 0) > 0 || 
                                                                 (scenario.income?.other || 0) > 0;
                                        const hasRentalIncome = (scenario.income?.rental || 0) > 0;
                                        const shouldShowDTI = hasBorrowerIncome || !hasRentalIncome;
                                        
                                        if (!shouldShowDTI) return null;
                                        
                                        const frontEndWarning = validationThresholds.dtiFrontEndWarning || 47;
                                        const backEndMax = validationThresholds.dtiBackEndMax || 50;
                                        
                                        return (
                                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-6">
                                                <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">DTI Ratios</h5>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">Front-End (Housing)</span>
                                                        <span className={`font-bold ${results.dti.frontEnd > frontEndWarning ? 'text-red-600' : 'text-slate-900'}`}>{results.dti.frontEnd.toFixed(2)}%</span>
                                                    </div>
                                                     <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">Back-End (Total)</span>
                                                        <span className={`font-bold ${results.dti.backEnd > backEndMax ? 'text-red-600' : 'text-slate-900'}`}>{results.dti.backEnd.toFixed(2)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                 </>
                             )}
                             {scenario.isDSCRLoan && (
                                 <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                     <p className="text-[10px] text-slate-500 italic">Debt information not used for DSCR loans</p>
                                 </div>
                             )}
                         </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide">
                            <Calculator size={16} className="text-slate-400" /> Qualification Breakdown
                        </h3>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <div className={`p-5 rounded-xl border ${results.mathBreakdown.convPass ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                                <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${results.mathBreakdown.convPass ? 'text-emerald-800' : 'text-red-800'}`}>Conventional Analysis</h4>
                                <div className="space-y-1.5 font-mono text-xs text-slate-600">
                                    {results.mathBreakdown.conv.map((line, i) => (
                                        <div key={i} className="flex gap-2">
                                            <span className="opacity-50 select-none">•</span>
                                            <span>{line}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                             <div className={`p-5 rounded-xl border ${results.mathBreakdown.fhaPass ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                                <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${results.mathBreakdown.fhaPass ? 'text-emerald-800' : 'text-red-800'}`}>FHA Analysis</h4>
                                <div className="space-y-1.5 font-mono text-xs text-slate-600">
                                    {results.mathBreakdown.fha.map((line, i) => (
                                        <div key={i} className="flex gap-2">
                                             <span className="opacity-50 select-none">•</span>
                                            <span>{line}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
             )}

          </div>
        </div>
        
        {/* Middle Panel: Results & Breakdown */}
        <div className="w-full lg:w-[380px] bg-white border-l border-slate-200 overflow-y-auto print:w-full print:border-none">
            <div className="p-4 space-y-4">
                
                {/* Total Payment Hero */}
                <div>
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Monthly Payment</h2>
                    <div className="flex justify-between items-end">
                        <div className="text-5xl font-black text-emerald-600 tracking-tight leading-none">
                            {formatMoney(scenario.occupancyType === 'Primary Residence' && (scenario.income?.rental || 0) > 0 
                                ? results.totalMonthlyPayment - (scenario.income?.rental || 0)
                                : results.totalMonthlyPayment)}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 mb-1.5">
                             {scenario.occupancyType === 'Investment Property' && results.dscr ? (
                                 <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-slate-50 border-2 ${results.dscr.passes ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                                     <span className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">DSCR</span>
                                     <span className={`text-2xl font-black ${results.dscr.passes ? 'text-emerald-600' : 'text-red-600'}`}>
                                         {results.dscr.ratio.toFixed(2)}
                                     </span>
                                     <span className={`text-[9px] font-bold uppercase ${results.dscr.passes ? 'text-emerald-600' : 'text-red-600'}`}>
                                         {results.dscr.passes ? 'Pass' : 'Fail'}
                                     </span>
                                 </div>
                             ) : !scenario.isDSCRLoan ? (() => {
                                 // Check if we should show DTI (skip if no borrower income but rental income exists)
                                 const hasBorrowerIncome = (scenario.income?.borrower1 || 0) > 0 || 
                                                          (scenario.income?.borrower2 || 0) > 0 || 
                                                          (scenario.income?.other || 0) > 0;
                                 const hasRentalIncome = (scenario.income?.rental || 0) > 0;
                                 const shouldShowDTI = hasBorrowerIncome || !hasRentalIncome;
                                 
                                 if (!shouldShowDTI) return null;
                                 
                                 // Determine if DTI should show warnings (only if borrower income exists)
                                 const frontEndWarning = validationThresholds.dtiFrontEndWarning || 47;
                                 const backEndMax = validationThresholds.dtiBackEndMax || 50;
                                 
                                 return (
                                     <>
                                         <div className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded bg-slate-50 border ${results.dti.frontEnd > frontEndWarning ? 'text-red-600 border-red-100' : 'text-emerald-600 border-emerald-100'}`}>
                                             <span className="text-slate-400 uppercase text-[9px] font-semibold">FE</span>
                                             <span>{results.dti.frontEnd.toFixed(1)}%</span>
                                         </div>
                                         <div className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded bg-slate-50 border ${results.dti.backEnd > backEndMax ? 'text-red-600 border-red-100' : 'text-emerald-600 border-emerald-100'}`}>
                                             <span className="text-slate-400 uppercase text-[9px] font-semibold">BE</span>
                                             <span>{results.dti.backEnd.toFixed(1)}%</span>
                                         </div>
                                     </>
                                 );
                             })() : null}
                        </div>
                    </div>
                    {(scenario.buydown.active || (scenario.occupancyType === 'Primary Residence' && (scenario.income?.rental || 0) > 0)) && (
                         <div className="text-sm font-medium text-slate-400 mt-1 line-through decoration-slate-300">
                             {formatMoney(results.totalMonthlyPayment)}
                         </div>
                    )}

                     {/* Total Loan Amount & LTV Display */}
                    <div className="mt-3 pt-3 border-t border-slate-100/50 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Loan Amount</span>
                            <span className="text-sm font-bold text-slate-600 font-mono">{formatMoney(results.totalLoanAmount)}</span>
                        </div>
                        {/* Prominent LTV display for both Purchase and Refinance */}
                        <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Loan-to-Value (LTV)</span>
                                <span className="text-lg font-black text-indigo-600">
                                    {results.ltv.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Monthly Breakdown List */}
                <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Monthly Breakdown</h3>
                    <div className="space-y-2 text-base">
                        <div className="flex justify-between items-center text-slate-600">
                            <span>Principal & Interest</span>
                            <span className="font-bold text-slate-900">{formatMoney(results.monthlyPrincipalAndInterest)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                            <span>Property Taxes</span>
                            <span className="font-bold text-slate-900">{formatMoney(results.monthlyTax)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                            <span>Home Insurance</span>
                            <span className="font-bold text-slate-900">{formatMoney(results.monthlyInsurance)}</span>
                        </div>
                         <div className="flex justify-between items-center text-slate-600">
                            <span>Mortgage Insurance</span>
                            <span className="font-bold text-slate-900">{formatMoney(results.monthlyMI)}</span>
                        </div>
                         <div className="flex justify-between items-center text-slate-600">
                            <span>HOA Dues</span>
                            <span className="font-bold text-slate-900">{formatMoney(results.monthlyHOA)}</span>
                        </div>
                         {scenario.dpa.active && !scenario.dpa.isDeferred && (
                             <div className="flex justify-between items-center text-indigo-600 border-t border-indigo-50 pt-2 mt-2">
                                <span>DPA Loan (1st)</span>
                                <span className="font-bold">{formatMoney(results.monthlyDPAPayment)}</span>
                            </div>
                        )}
                         {scenario.dpa2?.active && !scenario.dpa2.isDeferred && (
                             <div className="flex justify-between items-center text-indigo-600 border-t border-indigo-50 pt-2 mt-2">
                                <span>DPA Loan (2nd)</span>
                                <span className="font-bold">{formatMoney(results.monthlyDPA2Payment)}</span>
                            </div>
                        )}
                         {scenario.buydown.active && (
                             <div className="flex justify-between items-center text-emerald-600 border-t border-emerald-50 pt-2 mt-2">
                                <span>Buydown Subsidy (Yr 1)</span>
                                <span className="font-bold">-{formatMoney(results.baseMonthlyPayment - results.totalMonthlyPayment)}</span>
                            </div>
                        )}
                         {scenario.occupancyType === 'Primary Residence' && (scenario.income?.rental || 0) > 0 && (
                             <div className="flex justify-between items-center text-emerald-600 border-t border-emerald-50 pt-2 mt-2">
                                <span>ADU Income Credit</span>
                                <span className="font-bold">-{formatMoney(scenario.income?.rental || 0)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Cash To Close Card */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm mt-4">
                     <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{scenario.transactionType === 'Purchase' ? 'Cash to Close Statement' : 'Cash Required Statement'}</h3>
                     <div className="space-y-2 mb-3 text-sm">
                         {scenario.transactionType === 'Purchase' ? (
                             <>
                                 <div className="flex justify-between text-slate-600">
                                     <span>Down Payment</span>
                                     <span className="font-bold text-slate-900">{formatMoney(results.downPaymentRequired)}</span>
                                 </div>
                                  <div className="flex justify-between text-slate-600">
                                     <span>Closing Costs (Net)</span>
                                     <span className="font-bold text-slate-900">{formatMoney(results.netClosingCosts)}</span>
                                 </div>
                                 {scenario.dpa.active && (
                                     <div className="flex justify-between text-emerald-600">
                                         <span>DPA Funding</span>
                                         <span className="font-bold">-{formatMoney(scenario.dpa.amount)}</span>
                                     </div>
                                 )}
                                 
                                 {/* Subtotal before Earnest Money */}
                                 <div className="border-t border-slate-300 pt-2 mt-2 flex justify-between items-center">
                                     <span className="text-xs font-bold text-slate-600 uppercase">Subtotal</span>
                                     <span className="text-lg font-bold text-slate-900">
                                         {formatMoney(results.downPaymentRequired + results.netClosingCosts - (scenario.dpa.active ? scenario.dpa.amount : 0))}
                                     </span>
                                 </div>
                                 
                                 {/* Earnest Money Deduction */}
                                 <div className="mb-4">
                                     <div className="flex justify-between text-emerald-600 text-sm">
                                         <span>Earnest Money</span>
                                         <span className="font-bold">-{formatMoney(results.earnestMoney)}</span>
                                     </div>
                                 </div>
                             </>
                         ) : (
                             <>
                                 <div className="flex justify-between text-slate-600">
                                     <span>Cash Out</span>
                                     <span className="font-bold text-slate-900">{formatMoney(results.downPaymentRequired)}</span>
                                 </div>
                                  <div className="flex justify-between text-slate-600">
                                     <span>Closing Costs (Net)</span>
                                     <span className="font-bold text-slate-900">{formatMoney(results.netClosingCosts)}</span>
                                 </div>
                             </>
                         )}
                     </div>
                     
                     <div className="border-t border-slate-200 pt-3 flex justify-between items-end">
                         <span className="text-xs font-bold text-slate-500 uppercase">{scenario.transactionType === 'Purchase' ? 'Cash Required' : 'Cash to Close'}</span>
                         <span className={`text-3xl font-black tracking-tight ${results.cashToClose < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                             {formatMoney(results.cashToClose)}
                         </span>
                     </div>
                     {results.cashToClose < 0 && (
                         <div className="text-right text-[10px] font-bold text-emerald-600 mt-1 uppercase tracking-wider">Refund to Borrower</div>
                     )}
                </div>

            </div>
        </div>

        {/* Right Panel: Notes */}
        <div className="w-full lg:w-[320px] bg-slate-50 border-l border-slate-200 overflow-y-auto print:hidden">
            <div className="p-4">
                <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Notes
                </h3>
                <textarea 
                    ref={notesTextareaRef}
                    value={scenario.notes || ''}
                    onChange={(e) => {
                        handleInputChange('notes', e.target.value);
                        // Auto-save will be triggered by handleInputChange
                    }}
                    placeholder="Add notes about this scenario...

• Client preferences
• Property details
• Follow-up items
• Special considerations"
                    className="w-full min-h-[150px] p-4 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all overflow-hidden"
                    style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
                />
                <p className="text-[10px] text-slate-400 mt-2 italic">Auto-saves as you type</p>
            </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-8 flex justify-between items-center shrink-0">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">MortgagePro © 2025</p>
          <p className="text-[10px] text-slate-300 font-medium">v1.0.5</p>
      </footer>

      {/* --- Modals --- */}
      
      {/* History Modal */}
      <Modal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} title="Scenario History" maxWidth="max-w-xl">
           <div className="space-y-4">
               {scenario.history.length === 0 ? (
                   <p className="text-center text-slate-400 italic py-8">No history recorded yet.</p>
               ) : (
                   scenario.history.slice().reverse().map((entry) => (
                       <div key={entry.id} className="border border-slate-100 rounded-lg p-4 hover:bg-slate-50 transition-colors flex justify-between items-start group">
                           <div>
                               <div className="flex items-center gap-2 mb-1">
                                   <Clock size={14} className="text-indigo-500" />
                                   <span className="text-xs font-bold text-slate-700">{formatTime(entry.timestamp)}</span>
                               </div>
                               <p className="text-sm font-medium text-slate-900 mb-2">{entry.note || "Update"}</p>
                               <ul className="text-xs text-slate-500 space-y-0.5 list-disc pl-4">
                                   {entry.changes.map((change, idx) => (
                                       <li key={idx}>{change}</li>
                                   ))}
                               </ul>
                           </div>
                           <button onClick={() => restoreSnapshot(entry)} className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-white border border-slate-200 shadow-sm rounded text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-all">
                               Restore
                           </button>
                       </div>
                   ))
               )}
           </div>
      </Modal>

      {/* Log Update Modal */}
      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title="Log Update" maxWidth="max-w-md">
           <div className="space-y-4">
               <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                   <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Detected Changes</h4>
                   <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                       {currentChanges.map((c, i) => <li key={i}>{c}</li>)}
                   </ul>
               </div>
               <div>
                   <label className="block text-xs font-bold text-slate-700 mb-1.5">Note (Optional)</label>
                   <textarea 
                        value={logNote}
                        onChange={(e) => setLogNote(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-1 focus:ring-indigo-500 outline-none min-h-[80px]"
                        placeholder="e.g. Updated interest rate based on today's pricing..."
                   ></textarea>
               </div>
               <button onClick={commitLog} className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-colors text-xs uppercase tracking-wide">
                   Save Version
               </button>
           </div>
      </Modal>

       {/* Pre-Approval Options Modal */}
       <Modal isOpen={showPreApprovalOptionsModal} onClose={() => setShowPreApprovalOptionsModal(false)} title="Pre-Approval Letter Options">
          <div className="space-y-6">
              <p className="text-sm text-slate-600">Choose how to generate the pre-approval letter:</p>
              
              {/* Option 1: TBD */}
              <button 
                  onClick={async () => {
                      try {
                          const data = {
                              buyer1: scenario.clientName,
                              buyer2: '',
                              purchasePrice: 'TBD' as const,
                              loanAmount: 'TBD' as const,
                              downPayment: `${scenario.downPaymentPercent}%`,
                              loanType: scenario.loanType,
                              letterDate: new Date(),
                              status: 'Pre-Approval' as const,
                              validDays: 60,
                              notes: ''
                          };
                          const { pdfUrl, filename } = await generatePreApprovalPDFPreview(data);
                          setPreApprovalPdfUrl(pdfUrl);
                          setPreApprovalFilename(filename);
                          setShowPreApprovalOptionsModal(false);
                          setShowPreApprovalModal(true);
                      } catch (error) {
                          console.error('Error generating PDF preview:', error);
                          alert('Error generating pre-approval letter. Please try again.');
                      }
                  }}
                  className="w-full p-6 bg-white border-2 border-slate-200 rounded-xl hover:border-indigo-500 hover:shadow-lg transition-all text-left group"
              >
                  <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center shrink-0 transition-colors">
                          <svg className="w-6 h-6 text-slate-600 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                      </div>
                      <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">Purchase Price TBD</h3>
                          <p className="text-sm text-slate-600 mb-3">
                              Generate letter without specific purchase price or loan amount. 
                              Shows "TBD" with down payment percentage ({scenario.downPaymentPercent}%) from scenario.
                          </p>
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                              <span className="bg-slate-100 px-2 py-1 rounded">Purchase Price: TBD</span>
                              <span className="bg-slate-100 px-2 py-1 rounded">Loan Amount: TBD</span>
                              <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Down Payment: {scenario.downPaymentPercent}%</span>
                          </div>
                      </div>
                  </div>
              </button>

              {/* Option 2: Use Scenario Values */}
              <button 
                  onClick={async () => {
                      try {
                          const data = {
                              buyer1: scenario.clientName,
                              buyer2: '',
                              purchasePrice: scenario.purchasePrice,
                              loanAmount: scenario.purchasePrice - scenario.downPaymentAmount,
                              downPayment: `${scenario.downPaymentPercent}%`,
                              loanType: scenario.loanType,
                              letterDate: new Date(),
                              status: 'Pre-Approval' as const,
                              validDays: 60,
                              notes: ''
                          };
                          const { pdfUrl, filename } = await generatePreApprovalPDFPreview(data);
                          setPreApprovalPdfUrl(pdfUrl);
                          setPreApprovalFilename(filename);
                          setShowPreApprovalOptionsModal(false);
                          setShowPreApprovalModal(true);
                      } catch (error) {
                          console.error('Error generating PDF preview:', error);
                          alert('Error generating pre-approval letter. Please try again.');
                      }
                  }}
                  className="w-full p-6 bg-white border-2 border-slate-200 rounded-xl hover:border-indigo-500 hover:shadow-lg transition-all text-left group"
              >
                  <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center shrink-0 transition-colors">
                          <svg className="w-6 h-6 text-slate-600 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                      </div>
                      <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">Use Scenario Values</h3>
                          <p className="text-sm text-slate-600 mb-3">
                              Generate letter with exact values from current scenario. 
                              Shows specific purchase price and loan amount.
                          </p>
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                              <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Purchase: {formatMoney(scenario.purchasePrice)}</span>
                              <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Loan: {formatMoney(scenario.purchasePrice - scenario.downPaymentAmount)}</span>
                              <span className="bg-slate-100 px-2 py-1 rounded">Down: {scenario.downPaymentPercent}%</span>
                          </div>
                      </div>
                  </div>
              </button>
          </div>
       </Modal>

       {/* Submission Email Modal */}
       <Modal 
         isOpen={showSubmissionModal} 
         onClose={() => {
           setShowSubmissionModal(false);
           if (submissionPdfUrl) {
             URL.revokeObjectURL(submissionPdfUrl);
             setSubmissionPdfUrl(null);
           }
           setSubmissionMissingInfo([]);
         }} 
         title="Submission Email PDF" 
         maxWidth="max-w-6xl" 
         noPadding={false}
       >
         {generatingSubmission ? (
           <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-4">
             <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
             <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Generating Submission Email...</p>
             <p className="text-xs text-slate-500 mt-2">AI is analyzing scenario and structuring content</p>
           </div>
         ) : submissionPdfUrl ? (
           <div className="space-y-4">
             {submissionMissingInfo.length > 0 && (
               <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
                 <h4 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
                   <AlertTriangle size={16} />
                   Missing Information Detected
                 </h4>
                 <div className="space-y-2 max-h-40 overflow-y-auto">
                   {submissionMissingInfo
                     .filter(item => item.priority === 'critical')
                     .map((item, idx) => (
                       <div key={idx} className="text-xs text-amber-800">
                         <span className="font-bold">• {item.item}:</span> {item.question}
                       </div>
                     ))}
                   {submissionMissingInfo.filter(item => item.priority === 'critical').length === 0 && (
                     <p className="text-xs text-amber-700 italic">No critical missing information detected</p>
                   )}
                 </div>
                 {submissionMissingInfo.length > submissionMissingInfo.filter(item => item.priority === 'critical').length && (
                   <p className="text-xs text-amber-700 mt-2 italic">
                     + {submissionMissingInfo.length - submissionMissingInfo.filter(item => item.priority === 'critical').length} additional items (see PDF)
                   </p>
                 )}
               </div>
             )}
             
             <div className="flex gap-3">
               <button
                 onClick={() => {
                   const link = document.createElement('a');
                   link.href = submissionPdfUrl;
                   link.download = submissionFilename;
                   document.body.appendChild(link);
                   link.click();
                   document.body.removeChild(link);
                 }}
                 className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors text-xs uppercase tracking-wide"
               >
                 <Download size={16} />
                 Download PDF
               </button>
               <button
                 onClick={() => {
                   setShowSubmissionModal(false);
                   if (submissionPdfUrl) {
                     URL.revokeObjectURL(submissionPdfUrl);
                     setSubmissionPdfUrl(null);
                   }
                 }}
                 className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors text-xs uppercase tracking-wide"
               >
                 Close
               </button>
             </div>
             
             <div className="border border-slate-200 rounded-lg overflow-hidden" style={{ height: '600px' }}>
               <iframe
                 src={submissionPdfUrl}
                 className="w-full h-full"
                 title="Submission Email Preview"
               />
             </div>
           </div>
         ) : null}
       </Modal>

       {/* Pre-Approval Preview Modal */}
       <Modal isOpen={showPreApprovalModal} onClose={() => {
         setShowPreApprovalModal(false);
         if (preApprovalPdfUrl) {
           URL.revokeObjectURL(preApprovalPdfUrl);
           setPreApprovalPdfUrl(null);
         }
       }} title="Pre-Approval Letter Preview" maxWidth="max-w-6xl" noPadding>
          <div className="flex flex-col h-[85vh]">
              <div className="flex-1 bg-slate-100 overflow-hidden">
                  {preApprovalPdfUrl && (
                    <iframe
                      src={preApprovalPdfUrl}
                      className="w-full h-full border-0"
                      title="Pre-Approval Letter Preview"
                    />
                  )}
              </div>
              
              {/* Footer with Download Action */}
              <div className="bg-white border-t border-slate-200 p-4 flex justify-end gap-3 shrink-0">
                   <button 
                        onClick={() => {
                          setShowPreApprovalModal(false);
                          if (preApprovalPdfUrl) {
                            URL.revokeObjectURL(preApprovalPdfUrl);
                            setPreApprovalPdfUrl(null);
                          }
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs uppercase hover:bg-slate-50 transition-colors"
                   >
                       Close
                   </button>
                   <button 
                        onClick={() => {
                          if (preApprovalPdfUrl) {
                            const link = document.createElement('a');
                            link.href = preApprovalPdfUrl;
                            link.download = preApprovalFilename;
                            link.click();
                          }
                        }}
                        className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold text-xs uppercase hover:bg-indigo-500 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                   >
                       <Download size={16} /> Download PDF
                   </button>
              </div>
          </div>
       </Modal>

    </div>
  );
};

export default ScenarioBuilder;