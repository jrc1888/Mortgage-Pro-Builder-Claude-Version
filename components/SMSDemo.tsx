import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { SharedHeader } from './SharedHeader';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'system';
  timestamp: Date;
}

interface ProcessingStep {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  icon: React.ReactNode;
  details?: string;
  rawData?: any;
  expanded?: boolean;
}

interface Props {
  onNavigateHome: () => void;
  userEmail?: string | null;
}

export const SMSDemo: React.FC<Props> = ({ onNavigateHome, userEmail }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Welcome! Send me a property listing URL (Zillow, Redfin, UtahRealEstate.com) and I\'ll analyze it for you! 🏡',
      sender: 'system',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-scroll to bottom of processing steps
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [processingSteps]);

  const addStep = (label: string, status: ProcessingStep['status'] = 'processing', details?: string, rawData?: any) => {
    const id = crypto.randomUUID();
    let icon: React.ReactNode;
    
    switch (status) {
      case 'processing':
        icon = <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />;
        break;
      case 'success':
        icon = <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        break;
      case 'error':
        icon = <XCircle className="w-4 h-4 text-red-500" />;
        break;
      default:
        icon = <AlertCircle className="w-4 h-4 text-slate-400" />;
    }

    const step: ProcessingStep = {
      id,
      label,
      status,
      icon,
      details,
      rawData,
      expanded: false
    };

    setProcessingSteps(prev => [...prev, step]);
    return id;
  };

  const updateStep = (id: string, updates: Partial<ProcessingStep>) => {
    setProcessingSteps(prev => prev.map(step => 
      step.id === id ? { ...step, ...updates } : step
    ));
  };

  const toggleStepExpansion = (id: string) => {
    setProcessingSteps(prev => prev.map(step => 
      step.id === id ? { ...step, expanded: !step.expanded } : step
    ));
  };

  const detectURL = (text: string): string | null => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const match = text.match(urlRegex);
    return match ? match[0] : null;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const calculateMortgagePayment = (
    price: number,
    downPaymentPercent: number,
    interestRate: number,
    loanTermMonths: number = 360,
    propertyTaxYearly: number,
    insuranceYearly: number,
    hoaMonthly: number,
    creditScore: number = 740
  ) => {
    // Calculate loan amount
    const downPaymentAmount = price * (downPaymentPercent / 100);
    const loanAmount = price - downPaymentAmount;

    // Calculate monthly P&I using standard mortgage formula
    const monthlyRate = (interestRate / 100) / 12;
    const numPayments = loanTermMonths;
    const monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                      (Math.pow(1 + monthlyRate, numPayments) - 1);

    // Property tax (monthly)
    const monthlyTax = propertyTaxYearly / 12;

    // Insurance (monthly)
    const monthlyInsurance = insuranceYearly / 12;

    // PMI calculation (if down payment < 20%)
    let monthlyPMI = 0;
    const ltv = (loanAmount / price) * 100;
    if (ltv > 80) {
      // Simplified PMI calculation
      let pmiRate = 0;
      if (ltv > 95) pmiRate = 0.0095;
      else if (ltv > 90) pmiRate = 0.0075;
      else if (ltv > 85) pmiRate = 0.0048;
      else pmiRate = 0.0028;
      
      monthlyPMI = (loanAmount * pmiRate) / 12;
    }

    // HOA
    const monthlyHOA = hoaMonthly || 0;

    // Total monthly payment
    const totalPayment = monthlyPI + monthlyTax + monthlyInsurance + monthlyPMI + monthlyHOA;

    return {
      principalAndInterest: monthlyPI,
      propertyTax: monthlyTax,
      insurance: monthlyInsurance,
      pmi: monthlyPMI,
      hoa: monthlyHOA,
      total: totalPayment
    };
  };

  const handleSend = async () => {
    if (!inputText.trim() || isProcessing) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      text: inputText.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);
    setProcessingSteps([]);

    try {
      // Step 1: Detect URL
      const step1Id = addStep('Analyzing message', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const url = detectURL(inputText);
      if (!url) {
        updateStep(step1Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: 'No URL detected in message'
        });
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          text: 'I couldn\'t find a property listing URL in your message. Please send me a link from Zillow, Redfin, or UtahRealEstate.com!',
          sender: 'system',
          timestamp: new Date()
        }]);
        setIsProcessing(false);
        return;
      }

      updateStep(step1Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `Found URL: ${url}`
      });

      // Step 2: Call OpenAI API
      const step2Id = addStep('Calling OpenAI', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await fetch('/api/sms-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        updateStep(step2Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: errorData.error || 'Failed to call OpenAI API',
          rawData: errorData
        });
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          text: 'Sorry, I encountered an error processing the property listing. Please try again.',
          sender: 'system',
          timestamp: new Date()
        }]);
        setIsProcessing(false);
        return;
      }

      const data = await response.json();
      updateStep(step2Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: 'Property data extracted successfully',
        rawData: data.propertyData
      });

      // Step 3: Parse JSON response
      const step3Id = addStep('Processing property data', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const propertyData = data.propertyData;
      if (!propertyData) {
        updateStep(step3Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: 'No property data returned'
        });
        setIsProcessing(false);
        return;
      }

      updateStep(step3Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `Address: ${propertyData.address}`,
        rawData: propertyData
      });

      // Step 4: Enrich data with estimates
      const step4Id = addStep('Enriching data with estimates', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const enrichedData = { ...propertyData };
      const estimates: string[] = [];

      if (propertyData.propertyTax === null || propertyData.propertyTax === undefined) {
        enrichedData.propertyTax = propertyData.price * 0.0058 / 12; // Utah avg monthly
        estimates.push('Property Tax');
      }

      // Estimate insurance with age adjustment
      const age = new Date().getFullYear() - (propertyData.yearBuilt || 2020);
      let insuranceRate = 0.003; // Base 0.3% annually
      if (age > 20) insuranceRate = 0.0035; // Older homes cost more to insure
      if (age < 5) insuranceRate = 0.0025; // Newer homes cost less

      enrichedData.insurance = propertyData.price * insuranceRate / 12;
      estimates.push('Insurance');

      updateStep(step4Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `Estimated: ${estimates.join(', ')}`,
        rawData: enrichedData
      });

      // Step 5: Load mock client pre-qualification
      const step5Id = addStep('Loading client pre-qualification', 'processing');
      await new Promise(resolve => setTimeout(resolve, 300));

      const clientData = {
        downPaymentPercent: 10,
        maxMonthlyPayment: 3100,
        interestRate: 6.875
      };

      updateStep(step5Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `10% down, $${clientData.maxMonthlyPayment}/mo max, ${clientData.interestRate}% rate`,
        rawData: clientData
      });

      // Step 6: Calculate mortgage payment
      const step6Id = addStep('Calculating payment', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const payment = calculateMortgagePayment(
        enrichedData.price,
        clientData.downPaymentPercent,
        clientData.interestRate,
        360, // 30 years
        enrichedData.propertyTax * 12, // Convert monthly to yearly
        enrichedData.insurance * 12, // Convert monthly to yearly
        enrichedData.hoa || 0,
        740 // Credit score
      );

      updateStep(step6Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `Total payment: ${formatCurrency(payment.total)}/month`,
        rawData: payment
      });

      // Step 7: Check affordability
      const step7Id = addStep('Checking affordability', 'processing');
      await new Promise(resolve => setTimeout(resolve, 300));

      const overage = payment.total - clientData.maxMonthlyPayment;
      const isAffordable = payment.total <= clientData.maxMonthlyPayment;

      updateStep(step7Id, { 
        status: isAffordable ? 'success' : 'error', 
        icon: isAffordable 
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <AlertCircle className="w-4 h-4 text-amber-500" />,
        details: isAffordable 
          ? `Under budget by ${formatCurrency(Math.abs(overage))}`
          : `Over budget by ${formatCurrency(overage)}`,
        rawData: { isAffordable, overage, maxPayment: clientData.maxMonthlyPayment, actualPayment: payment.total }
      });

      // Step 8: Generate formatted SMS response
      const step8Id = addStep('Generating response', 'processing');
      await new Promise(resolve => setTimeout(resolve, 400));

      let responseText = `🏡 Found it! ${enrichedData.address}\n\n`;
      responseText += `📋 Property Details:\n`;
      responseText += `- Price: ${formatCurrency(enrichedData.price)}\n`;
      responseText += `- ${enrichedData.beds} bed, ${enrichedData.baths} bath\n`;
      responseText += `- ${enrichedData.sqft?.toLocaleString()} sq ft\n`;
      responseText += `- Built: ${enrichedData.yearBuilt}\n`;
      responseText += `- HOA: ${enrichedData.hoa ? formatCurrency(enrichedData.hoa) + '/mo' : 'None detected ✓'}\n\n`;
      
      responseText += `💰 Your Payment (10% down):\n`;
      responseText += `- P&I: ${formatCurrency(payment.principalAndInterest)}\n`;
      responseText += `- Property Tax: ${formatCurrency(payment.propertyTax)}/mo ${estimates.includes('Property Tax') ? '(est)*' : ''}\n`;
      responseText += `- Insurance: ${formatCurrency(payment.insurance)}/mo (est)*\n`;
      if (payment.pmi > 0) {
        responseText += `- PMI: ${formatCurrency(payment.pmi)}/mo\n`;
      }
      if (payment.hoa > 0) {
        responseText += `- HOA: ${formatCurrency(payment.hoa)}/mo\n`;
      }
      responseText += `━━━━━━━━━━━━━━━━\n`;
      responseText += `TOTAL: ${formatCurrency(payment.total)}/month\n\n`;
      
      if (estimates.length > 0) {
        responseText += `*Estimated based on Utah averages\n\n`;
      }

      if (isAffordable) {
        responseText += `✅ This fits your budget of ${formatCurrency(clientData.maxMonthlyPayment)}/mo!\n`;
        responseText += `You have ${formatCurrency(Math.abs(overage))}/mo cushion.`;
      } else {
        responseText += `⚠️ This is ${formatCurrency(overage)} OVER your budget of ${formatCurrency(clientData.maxMonthlyPayment)}/mo\n\n`;
        responseText += `But I found ways to make it work!\n`;
        responseText += `Reply OPTIONS to see solutions`;
      }

      updateStep(step8Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: 'Response generated',
        rawData: { responseText }
      });

      // Step 9: Display response in chat
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: responseText,
        sender: 'system',
        timestamp: new Date()
      }]);

    } catch (error) {
      console.error('Error processing message:', error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'system',
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col">
      <SharedHeader 
        onNavigateHome={onNavigateHome} 
        title="SMS Demo Interface"
        userEmail={userEmail}
        variant="dark"
      />

      {/* Split Screen Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Backend Processing Log */}
        <div className="w-1/2 border-r border-slate-200 bg-white flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-900">Backend Processing Log</h2>
            <p className="text-sm text-slate-600 mt-1">Real-time processing steps</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {processingSteps.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Processing steps will appear here</p>
              </div>
            ) : (
              processingSteps.map((step) => (
                <div
                  key={step.id}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-4 transition-all hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{step.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 text-sm">{step.label}</h3>
                        {step.rawData && (
                          <button
                            onClick={() => toggleStepExpansion(step.id)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {step.expanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                      {step.details && (
                        <p className="text-xs text-slate-600 mt-1">{step.details}</p>
                      )}
                      {step.expanded && step.rawData && (
                        <div className="mt-3 p-3 bg-slate-100 rounded border border-slate-200">
                          <pre className="text-xs text-slate-700 overflow-x-auto">
                            {JSON.stringify(step.rawData, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={stepsEndRef} />
          </div>
        </div>

        {/* Right Side: SMS Chat Interface */}
        <div className="w-1/2 bg-slate-50 flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 bg-white">
            <h2 className="text-lg font-bold text-slate-900">SMS Chat Interface</h2>
            <p className="text-sm text-slate-600 mt-1">Send property listing URLs to analyze</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.sender === 'user'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white text-slate-900 border border-slate-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                  <p
                    className={`text-xs mt-1 ${
                      message.sender === 'user' ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message or paste a property URL..."
                className="flex-1 px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                disabled={isProcessing}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isProcessing}
                className="px-6 py-3 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

