import React, { useState } from 'react';
import { Modal } from './Modal';
import { Mic, Sparkles, Loader2, X } from 'lucide-react';
import { parseNaturalLanguage, ParsedScenarioData } from '../services/nlpParser';
import { Scenario } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreateScenario: (data: Partial<Scenario>) => void;
  defaultScenario: Scenario;
}

export const NLPScenarioModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onCreateScenario,
  defaultScenario
}) => {
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedScenarioData | null>(null);
  const [isListening, setIsListening] = useState(false);

  const handleParse = async () => {
    if (!input.trim()) return;

    setParsing(true);
    try {
      const result = await parseNaturalLanguage(input, '');
      setParsedData(result);
    } catch (error) {
      console.error('Parse error:', error);
      setParsedData({
        confidence: 0,
        clarifications: ['An error occurred. Please try again.']
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
    if (!parsedData) return;

    // Calculate down payment amount if we have percentage and price
    let downPaymentAmount = parsedData.downPaymentAmount;
    if (!downPaymentAmount && parsedData.downPaymentPercent && parsedData.purchasePrice) {
      downPaymentAmount = (parsedData.purchasePrice * parsedData.downPaymentPercent) / 100;
    }

    const scenarioData: Partial<Scenario> = {
      ...defaultScenario,
      id: Math.random().toString(36).substring(7),
      name: `${parsedData.clientName || 'New Client'} - ${new Date().toLocaleDateString()}`,
      clientName: parsedData.clientName || defaultScenario.clientName,
      propertyAddress: parsedData.propertyAddress || defaultScenario.propertyAddress,
      isAddressTBD: !parsedData.propertyAddress,
      purchasePrice: parsedData.purchasePrice || defaultScenario.purchasePrice,
      downPaymentPercent: parsedData.downPaymentPercent || defaultScenario.downPaymentPercent,
      downPaymentAmount: downPaymentAmount || defaultScenario.downPaymentAmount,
      loanType: parsedData.loanType || defaultScenario.loanType,
      interestRate: parsedData.interestRate || defaultScenario.interestRate,
      creditScore: parsedData.creditScore || defaultScenario.creditScore,
      propertyTaxYearly: parsedData.propertyTaxYearly || defaultScenario.propertyTaxYearly,
      hoaMonthly: parsedData.hoaMonthly || defaultScenario.hoaMonthly,
      dateCreated: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    onCreateScenario(scenarioData);
    onClose();
    
    // Reset state
    setInput('');
    setParsedData(null);
  };

  const handleCancel = () => {
    setInput('');
    setParsedData(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Create Scenario with AI">
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-100">
          <p className="text-sm text-slate-700">
            <strong className="text-indigo-700">✨ Describe your scenario naturally</strong> and AI will extract the details!
          </p>
          <p className="text-xs text-slate-600 mt-2">
            Try: "500k house, 10% down, FHA for John Smith at 6.5% rate, credit 680"
          </p>
        </div>

        {/* Input Area */}
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="Example: Jane buying $750,000 home with 20% down, conventional loan, 7% interest..."
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
          className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
        >
          {parsing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Parsing with AI...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Parse with AI
            </>
          )}
        </button>

        {/* Parsed Results */}
        {parsedData && (
          <div className="bg-white p-5 rounded-xl border-2 border-slate-200 shadow-sm space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-lg">Extracted Data</h4>
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

            {/* Show extracted fields */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {parsedData.clientName && (
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <span className="text-slate-500 text-xs block mb-1">Client Name</span>
                  <span className="font-semibold text-slate-900">{parsedData.clientName}</span>
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

            {/* Clarifications */}
            {parsedData.clarifications && parsedData.clarifications.length > 0 && (
              <div className="bg-amber-50 p-4 rounded-lg border-2 border-amber-200">
                <p className="text-xs font-bold text-amber-900 mb-2">📝 Additional info needed:</p>
                <ul className="text-xs text-amber-800 space-y-1">
                  {parsedData.clarifications.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-600">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-700 mt-2 italic">
                  Don't worry - you can fill these in after creating the scenario!
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-green-700 transition-all shadow-md hover:shadow-lg"
              >
                Create Scenario ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
