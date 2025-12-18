import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { Mic, Sparkles, Loader2, X, Edit2, AlertTriangle } from 'lucide-react';
import { parseNaturalLanguage, ParsedScenarioData } from '../services/nlpParser';
import { Scenario, LoanType } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreateScenario: (data: Partial<Scenario>) => void;
  defaultScenario: Scenario;
  defaultClientName?: string; // Pre-populate client name if available
}

export const NLPScenarioModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onCreateScenario,
  defaultScenario,
  defaultClientName
}) => {
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedScenarioData | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<ParsedScenarioData | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Pre-populate input with client name when modal opens and focus textarea
  useEffect(() => {
    if (isOpen) {
      if (defaultClientName && !input.trim()) {
        // If client name is provided and input is empty, pre-populate
        setInput(defaultClientName + ', ');
      }
      // Focus textarea when modal opens
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, defaultClientName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleParse = async () => {
    if (!input.trim()) return;

    setParsing(true);
    setIsEditing(false);
    try {
      const result = await parseNaturalLanguage(input, '');
      
      // Detect transaction type from input if not already extracted
      if (!result.transactionType) {
        const inputLower = input.toLowerCase();
        if (inputLower.includes('refinance') || inputLower.includes('refi') || inputLower.includes('cash out')) {
          result.transactionType = 'Refinance';
        } else if (inputLower.includes('buy') || inputLower.includes('purchase') || inputLower.includes('buying')) {
          result.transactionType = 'Purchase';
        }
      }
      
      // Apply smart defaults based on loan type
      if (result.loanType) {
        // Smart down payment suggestions
        if (result.purchasePrice && !result.downPaymentPercent && !result.downPaymentAmount) {
          const suggestedPercent = result.loanType === 'FHA' ? 3.5 : 
                                   result.loanType === 'VA' ? 0 : 
                                   result.loanType === 'Conventional' ? 20 : 10;
          result.downPaymentPercent = suggestedPercent;
          result.clarifications = [
            ...(result.clarifications || []),
            `Suggested ${suggestedPercent}% down payment based on ${result.loanType} type. You can edit this.`
          ];
        }
        
        // Smart credit score suggestions
        if (!result.creditScore) {
          const suggestedScore = result.loanType === 'FHA' ? 640 : 
                                 result.loanType === 'VA' ? 620 : 
                                 result.loanType === 'Conventional' ? 740 : 680;
          result.clarifications = [
            ...(result.clarifications || []),
            `Typical credit score for ${result.loanType}: ${suggestedScore}+. You can edit this.`
          ];
        }
        
        // Smart interest rate suggestions (if not provided)
        if (!result.interestRate) {
          result.clarifications = [
            ...(result.clarifications || []),
            `Current ${result.loanType} rates typically range from 6.5% - 7.5%. You can edit this.`
          ];
        }
      }
      
      setParsedData(result);
      setEditedData({ ...result });
    } catch (error) {
      console.error('Parse error:', error);
      setParsedData({
        confidence: 0,
        clarifications: ['An error occurred. Please try again. Try simpler phrasing like "300k house fha john smith".']
      });
    } finally {
      setParsing(false);
    }
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice input not supported in this browser. Try Chrome.');
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.start();
  };

  const handleCreate = () => {
    const dataToUse = isEditing && editedData ? editedData : parsedData;
    if (!dataToUse) return;

    // Calculate down payment amount if we have percentage and price
    let downPaymentAmount = dataToUse.downPaymentAmount;
    let downPaymentPercent = dataToUse.downPaymentPercent;
    
    // Ensure both values are properly synced - prioritize amount if both are provided
    if (dataToUse.purchasePrice && dataToUse.purchasePrice > 0) {
      if (downPaymentAmount && !downPaymentPercent) {
        // If amount is provided but not percent, calculate percent from amount
        downPaymentPercent = Number(((downPaymentAmount / dataToUse.purchasePrice) * 100).toFixed(2));
      } else if (downPaymentPercent && !downPaymentAmount) {
        // If percent is provided but not amount, calculate amount from percent (round percent first)
        downPaymentPercent = Number(Number(downPaymentPercent).toFixed(2));
        downPaymentAmount = Number(((dataToUse.purchasePrice * downPaymentPercent) / 100).toFixed(2));
      } else if (downPaymentAmount && downPaymentPercent) {
        // If both are provided, recalculate percent from amount to ensure accuracy
        downPaymentPercent = Number(((downPaymentAmount / dataToUse.purchasePrice) * 100).toFixed(2));
      }
    }

    // Use default client name if AI didn't extract one
    const clientName = dataToUse.clientName || defaultClientName || defaultScenario.clientName;

    const scenarioData: Partial<Scenario> = {
      ...defaultScenario,
      id: crypto.randomUUID(), // Use proper UUID instead of random string
      name: `${clientName} - ${new Date().toLocaleDateString()}`,
      clientName: clientName,
      transactionType: dataToUse.transactionType || defaultScenario.transactionType || 'Purchase', // Use AI-extracted transactionType if available
      propertyAddress: dataToUse.propertyAddress || defaultScenario.propertyAddress,
      isAddressTBD: !dataToUse.propertyAddress,
      purchasePrice: dataToUse.purchasePrice || defaultScenario.purchasePrice,
      downPaymentPercent: downPaymentPercent ? Number(downPaymentPercent.toFixed(2)) : Number(defaultScenario.downPaymentPercent.toFixed(2)),
      downPaymentAmount: downPaymentAmount ? Number(downPaymentAmount.toFixed(2)) : Number(defaultScenario.downPaymentAmount.toFixed(2)),
      loanType: dataToUse.loanType || defaultScenario.loanType,
      interestRate: dataToUse.interestRate || defaultScenario.interestRate,
      creditScore: dataToUse.creditScore || defaultScenario.creditScore,
      propertyTaxYearly: dataToUse.propertyTaxYearly || defaultScenario.propertyTaxYearly,
      hoaMonthly: dataToUse.hoaMonthly || defaultScenario.hoaMonthly,
      dateCreated: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    onCreateScenario(scenarioData);
    onClose();
    
    // Reset state
    setInput('');
    setParsedData(null);
    setEditedData(null);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setInput('');
    setParsedData(null);
    setEditedData(null);
    setIsEditing(false);
    onClose();
  };

  // Reset input when modal closes, but preserve defaultClientName if provided
  useEffect(() => {
    if (!isOpen) {
      setParsedData(null);
      setEditedData(null);
      setIsEditing(false);
      // Reset input but keep defaultClientName if it was there
      if (defaultClientName) {
        setInput(defaultClientName + ', ');
      } else {
        setInput('');
      }
    }
  }, [isOpen, defaultClientName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Create Scenario with AI">
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-100">
          <p className="text-sm text-slate-700">
            <strong className="text-indigo-700">✨ Describe your scenario naturally</strong> and AI will extract the details!
          </p>
          <p className="text-xs text-slate-600 mt-2">
            {defaultClientName ? (
              <>Client: <strong>{defaultClientName}</strong> • Examples: "300k house, 10% down, FHA, 6.5% rate" or "refinance 500k property, cash out 50k"</>
            ) : (
              <>Try: "Jane Doe buying $500k house, 10% down, FHA loan, 6.5% rate, credit 680"</>
            )}
            <br />
            <span className="text-slate-500 mt-1 block">💡 Tip: Press Cmd/Ctrl + Enter to parse quickly</span>
          </p>
        </div>

        {/* Input Area */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (!parsing && input.trim()) {
                  handleParse();
                }
              }
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder={defaultClientName 
              ? `Example: 300k house, 10% down, FHA, 6.5% rate, credit 680...`
              : `Example: Jane Doe buying $750,000 home with 20% down, conventional loan, 7% interest...`}
            className="w-full h-32 p-4 pr-12 border-2 border-slate-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
          
          {/* Voice Button */}
          <button
            onClick={handleVoiceInput}
            disabled={isListening}
            className={`absolute bottom-3 right-3 p-2.5 rounded-lg transition-all ${
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-105'
            }`}
            title={isListening ? 'Listening...' : 'Voice input (Chrome only)'}
          >
            <Mic size={18} />
          </button>
        </div>

        {/* Parse Button */}
        <button
          onClick={handleParse}
          disabled={!input.trim() || parsing}
          className="w-full flex items-center justify-center gap-2.5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl px-4"
        >
          {parsing ? (
            <>
              <Loader2 size={18} className="animate-spin flex-shrink-0" />
              <span>Parsing with AI...</span>
            </>
          ) : (
            <>
              <Sparkles size={18} className="flex-shrink-0" />
              <span>Parse with AI</span>
            </>
          )}
        </button>

        {/* Parsed Results */}
        {parsedData && (
          <div className="bg-white p-5 rounded-xl border-2 border-slate-200 shadow-sm space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-lg">Extracted Data</h4>
                {!isEditing && (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setEditedData({ ...parsedData });
                    }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                    title="Edit extracted data"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                parsedData.confidence > 80 
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : parsedData.confidence > 60
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-red-100 text-red-700 border border-red-200'
              }`}>
                {parsedData.confidence}% Confidence
              </span>
            </div>

            {/* Low Confidence Warning */}
            {parsedData.confidence < 60 && parsedData.confidence > 0 && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-900 mb-1">Low Confidence Extraction</p>
                  <p className="text-xs text-amber-800">
                    Some fields may be missing or incorrect. Please review and edit before creating the scenario.
                  </p>
                </div>
              </div>
            )}

            {/* Show extracted fields - editable or read-only */}
            {isEditing && editedData ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Editable Fields */}
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                  <label className="text-slate-500 text-xs block mb-1">Client Name</label>
                  <input
                    type="text"
                    value={editedData.clientName || ''}
                    onChange={(e) => setEditedData({ ...editedData, clientName: e.target.value })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter name"
                  />
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                  <label className="text-slate-500 text-xs block mb-1">Transaction Type</label>
                  <select
                    value={editedData.transactionType || 'Purchase'}
                    onChange={(e) => setEditedData({ ...editedData, transactionType: e.target.value as 'Purchase' | 'Refinance' })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Purchase">Purchase</option>
                    <option value="Refinance">Refinance</option>
                  </select>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                  <label className="text-slate-500 text-xs block mb-1">Purchase Price</label>
                  <input
                    type="number"
                    value={editedData.purchasePrice || ''}
                    onChange={(e) => setEditedData({ ...editedData, purchasePrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter price"
                  />
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                  <label className="text-slate-500 text-xs block mb-1">Down Payment %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editedData.downPaymentPercent || ''}
                    onChange={(e) => setEditedData({ ...editedData, downPaymentPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter %"
                  />
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                  <label className="text-slate-500 text-xs block mb-1">Loan Type</label>
                  <select
                    value={editedData.loanType || ''}
                    onChange={(e) => setEditedData({ ...editedData, loanType: e.target.value as LoanType })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select...</option>
                    <option value="Conventional">Conventional</option>
                    <option value="FHA">FHA</option>
                    <option value="VA">VA</option>
                    <option value="Jumbo">Jumbo</option>
                  </select>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                  <label className="text-slate-500 text-xs block mb-1">Interest Rate %</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editedData.interestRate || ''}
                    onChange={(e) => setEditedData({ ...editedData, interestRate: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter rate"
                  />
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                  <label className="text-slate-500 text-xs block mb-1">Credit Score</label>
                  <input
                    type="number"
                    value={editedData.creditScore || ''}
                    onChange={(e) => setEditedData({ ...editedData, creditScore: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter score"
                  />
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200 col-span-2">
                  <label className="text-slate-500 text-xs block mb-1">Property Address</label>
                  <input
                    type="text"
                    value={editedData.propertyAddress || ''}
                    onChange={(e) => setEditedData({ ...editedData, propertyAddress: e.target.value })}
                    className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter address"
                  />
                </div>
                <div className="col-span-2 flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedData(null);
                    }}
                    className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200 transition-colors text-xs"
                  >
                    Cancel Edit
                  </button>
                  <button
                    onClick={() => {
                      setParsedData({ ...editedData });
                      setIsEditing(false);
                    }}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors text-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {parsedData.clientName && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 text-xs block mb-1">Client Name</span>
                    <span className="font-semibold text-slate-900">{parsedData.clientName}</span>
                  </div>
                )}
                {parsedData.transactionType && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 text-xs block mb-1">Transaction Type</span>
                    <span className={`font-semibold ${
                      parsedData.transactionType === 'Refinance' ? 'text-purple-700' : 'text-slate-900'
                    }`}>
                      {parsedData.transactionType}
                    </span>
                  </div>
                )}
                {parsedData.purchasePrice && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 text-xs block mb-1">Purchase Price</span>
                    <span className="font-semibold text-slate-900">${parsedData.purchasePrice.toLocaleString()}</span>
                  </div>
                )}
                {parsedData.downPaymentPercent && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 text-xs block mb-1">Down Payment</span>
                    <span className="font-semibold text-slate-900">{parsedData.downPaymentPercent}%</span>
                  </div>
                )}
                {parsedData.loanType && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 text-xs block mb-1">Loan Type</span>
                    <span className="font-semibold text-slate-900">{parsedData.loanType}</span>
                  </div>
                )}
                {parsedData.interestRate && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 text-xs block mb-1">Interest Rate</span>
                    <span className="font-semibold text-slate-900">{parsedData.interestRate}%</span>
                  </div>
                )}
                {parsedData.creditScore && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 text-xs block mb-1">Credit Score</span>
                    <span className="font-semibold text-slate-900">{parsedData.creditScore}</span>
                  </div>
                )}
                {parsedData.propertyAddress && (
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 col-span-2">
                    <span className="text-slate-500 text-xs block mb-1">Property Address</span>
                    <span className="font-semibold text-slate-900">{parsedData.propertyAddress}</span>
                  </div>
                )}
              </div>
            )}

            {/* Clarifications */}
            {parsedData.clarifications && parsedData.clarifications.length > 0 && (
              <div className="bg-amber-50 p-4 rounded-lg border-2 border-amber-200">
                <p className="text-xs font-bold text-amber-900 mb-2">📝 Additional info:</p>
                <ul className="text-xs text-amber-800 space-y-1">
                  {parsedData.clarifications.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-600">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {!isEditing && (
                  <p className="text-xs text-amber-700 mt-2 italic">
                    Don't worry - you can edit these fields or fill them in after creating the scenario!
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200 transition-colors px-4"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={parsedData.confidence === 0}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg px-4 flex items-center justify-center gap-2"
              >
                <span>Create Scenario</span>
                <span className="text-lg">✓</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
