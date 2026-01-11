import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Edit2, Copy, Check } from 'lucide-react';
import { SharedHeader } from './SharedHeader';
import { LiveDecimalInput, FormattedNumberInput } from './CommonInputs';

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

interface BorrowerQualification {
  borrowerName: string;
  creditScore: number;
  totalIncome: number;
  monthlyDebts: number;
  downPaymentPercent: number;
  interestRate: number;
  loanType: 'Conventional' | 'FHA' | 'VA';
  loanTermMonths: number;
  maxFrontEndDTI: number;
  maxBackEndDTI: number;
  maxMonthlyPayment: number;
  maxLoanAmount: number;
  maxPurchasePrice: number;
}

interface Props {
  onNavigateHome: () => void;
  userEmail?: string | null;
}

export const SMSDemo: React.FC<Props> = ({ onNavigateHome, userEmail }) => {
  // Borrower qualification data (editable)
  const [borrowerQualification, setBorrowerQualification] = useState<BorrowerQualification>({
    borrowerName: 'John & Sarah Smith',
    creditScore: 740,
    totalIncome: 8500, // Monthly
    monthlyDebts: 450,
    downPaymentPercent: 10,
    interestRate: 6.875,
    loanType: 'Conventional',
    loanTermMonths: 360,
    maxFrontEndDTI: 46.99,
    maxBackEndDTI: 49.99,
    maxMonthlyPayment: 3100, // Will be calculated
    maxLoanAmount: 450000, // Will be calculated
    maxPurchasePrice: 500000 // Will be calculated
  });

  // Calculate max payment from DTI ratios
  const calculateMaxPayment = (income: number, debts: number, frontEndDTI: number, backEndDTI: number): number => {
    const frontEndMax = income * (frontEndDTI / 100);
    const backEndMax = (income * (backEndDTI / 100)) - debts;
    return Math.min(frontEndMax, backEndMax);
  };

  // Calculate max loan and price from max payment
  const calculateMaxLoanAndPrice = (
    maxPayment: number,
    downPaymentPercent: number,
    interestRate: number,
    loanTermMonths: number,
    estimatedTaxRate: number = 0.0058, // Utah average
    estimatedInsuranceRate: number = 0.003,
    estimatedPMIRate: number = 0.005 // Average PMI for 10% down
  ): { maxLoan: number; maxPrice: number } => {
    if (maxPayment <= 0) return { maxLoan: 0, maxPrice: 0 };

    // Estimate monthly costs per $1000 of loan
    const monthlyRate = (interestRate / 100) / 12;
    const pmiRate = downPaymentPercent < 20 ? estimatedPMIRate : 0;
    
    // P&I per $1000
    const piPer1000 = 1000 * (monthlyRate * Math.pow(1 + monthlyRate, loanTermMonths)) / 
                      (Math.pow(1 + monthlyRate, loanTermMonths) - 1);
    
    // Tax per $1000 (annual / 12)
    const taxPer1000 = (1000 * estimatedTaxRate) / 12;
    
    // Insurance per $1000 (annual / 12)
    const insurancePer1000 = (1000 * estimatedInsuranceRate) / 12;
    
    // PMI per $1000 (if applicable)
    const pmiPer1000 = pmiRate > 0 ? (1000 * pmiRate) / 12 : 0;
    
    // Total payment per $1000
    const totalPer1000 = piPer1000 + taxPer1000 + insurancePer1000 + pmiPer1000;
    
    // Max loan amount
    const maxLoan = (maxPayment / totalPer1000) * 1000;
    
    // Max price = max loan / (1 - downPaymentPercent/100)
    const maxPrice = maxLoan / (1 - downPaymentPercent / 100);
    
    return { maxLoan: Math.round(maxLoan), maxPrice: Math.round(maxPrice) };
  };

  // Update calculated fields when inputs change
  useEffect(() => {
    const maxPayment = calculateMaxPayment(
      borrowerQualification.totalIncome,
      borrowerQualification.monthlyDebts,
      borrowerQualification.maxFrontEndDTI,
      borrowerQualification.maxBackEndDTI
    );

    const { maxLoan, maxPrice } = calculateMaxLoanAndPrice(
      maxPayment,
      borrowerQualification.downPaymentPercent,
      borrowerQualification.interestRate,
      borrowerQualification.loanTermMonths
    );

    setBorrowerQualification(prev => ({
      ...prev,
      maxMonthlyPayment: Math.round(maxPayment),
      maxLoanAmount: maxLoan,
      maxPurchasePrice: maxPrice
    }));
  }, [
    borrowerQualification.totalIncome,
    borrowerQualification.monthlyDebts,
    borrowerQualification.maxFrontEndDTI,
    borrowerQualification.maxBackEndDTI,
    borrowerQualification.downPaymentPercent,
    borrowerQualification.interestRate,
    borrowerQualification.loanTermMonths
  ]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Welcome! Send me:\n• A property listing URL (Zillow, Redfin, etc.)\n• An MLS number (e.g., "MLS #123456")\n• A property address\n\nI\'ll analyze it against your qualification! 🏡',
      sender: 'system',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [processingHistory, setProcessingHistory] = useState<Array<{ 
    userInput: string; 
    systemResponse?: string; 
    steps: ProcessingStep[]; 
    timestamp: Date 
  }>>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ type: 'mls' | 'address'; value: string } | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  
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

  const copyBackendLogToClipboard = async () => {
    try {
      let logText = '=== BACKEND PROCESSING LOG ===\n\n';
      
      // Add history items
      processingHistory.forEach((historyItem, historyIdx) => {
        logText += `\n${'='.repeat(80)}\n`;
        logText += `SEARCH SESSION #${historyIdx + 1} - ${formatTime(historyItem.timestamp)}\n`;
        logText += `${'='.repeat(80)}\n\n`;
        
        // User Input
        logText += `👤 USER INPUT:\n`;
        logText += `${historyItem.userInput}\n\n`;
        
        // Processing Steps
        logText += `📋 PROCESSING STEPS:\n`;
        logText += `${'-'.repeat(80)}\n`;
        historyItem.steps.forEach((step, stepIdx) => {
          logText += `\n[${stepIdx + 1}] ${step.label}\n`;
          logText += `Status: ${step.status.toUpperCase()}\n`;
          if (step.details) {
            logText += `Details:\n${step.details}\n`;
          }
          if (step.rawData) {
            logText += `Raw Data:\n${JSON.stringify(step.rawData, null, 2)}\n`;
          }
          logText += `\n`;
        });
        
        // System Response
        if (historyItem.systemResponse) {
          logText += `\n💬 SYSTEM RESPONSE:\n`;
          logText += `${'-'.repeat(80)}\n`;
          logText += `${historyItem.systemResponse}\n\n`;
        }
        
        logText += `\n${'='.repeat(80)}\n\n`;
      });
      
      // Add current processing steps
      if (processingSteps.length > 0) {
        logText += `\n${'='.repeat(80)}\n`;
        logText += `CURRENT PROCESSING (IN PROGRESS)\n`;
        logText += `${'='.repeat(80)}\n\n`;
        
        processingSteps.forEach((step, stepIdx) => {
          logText += `\n[${stepIdx + 1}] ${step.label}\n`;
          logText += `Status: ${step.status.toUpperCase()}\n`;
          if (step.details) {
            logText += `Details:\n${step.details}\n`;
          }
          if (step.rawData) {
            logText += `Raw Data:\n${JSON.stringify(step.rawData, null, 2)}\n`;
          }
          logText += `\n`;
        });
      }
      
      // Copy to clipboard
      await navigator.clipboard.writeText(logText);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: create a temporary textarea element
      let fallbackLogText = '=== BACKEND PROCESSING LOG ===\n\n';
      
      processingHistory.forEach((historyItem, historyIdx) => {
        fallbackLogText += `\n${'='.repeat(80)}\n`;
        fallbackLogText += `SEARCH SESSION #${historyIdx + 1} - ${formatTime(historyItem.timestamp)}\n`;
        fallbackLogText += `${'='.repeat(80)}\n\n`;
        fallbackLogText += `👤 USER INPUT:\n${historyItem.userInput}\n\n`;
        fallbackLogText += `📋 PROCESSING STEPS:\n${'-'.repeat(80)}\n`;
        historyItem.steps.forEach((step, stepIdx) => {
          fallbackLogText += `\n[${stepIdx + 1}] ${step.label}\nStatus: ${step.status.toUpperCase()}\n`;
          if (step.details) fallbackLogText += `Details:\n${step.details}\n`;
          if (step.rawData) fallbackLogText += `Raw Data:\n${JSON.stringify(step.rawData, null, 2)}\n`;
          fallbackLogText += `\n`;
        });
        if (historyItem.systemResponse) {
          fallbackLogText += `\n💬 SYSTEM RESPONSE:\n${'-'.repeat(80)}\n${historyItem.systemResponse}\n\n`;
        }
        fallbackLogText += `\n${'='.repeat(80)}\n\n`;
      });
      
      if (processingSteps.length > 0) {
        fallbackLogText += `\n${'='.repeat(80)}\nCURRENT PROCESSING (IN PROGRESS)\n${'='.repeat(80)}\n\n`;
        processingSteps.forEach((step, stepIdx) => {
          fallbackLogText += `\n[${stepIdx + 1}] ${step.label}\nStatus: ${step.status.toUpperCase()}\n`;
          if (step.details) fallbackLogText += `Details:\n${step.details}\n`;
          if (step.rawData) fallbackLogText += `Raw Data:\n${JSON.stringify(step.rawData, null, 2)}\n`;
          fallbackLogText += `\n`;
        });
      }
      
      const textArea = document.createElement('textarea');
      textArea.value = fallbackLogText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedToClipboard(true);
        setTimeout(() => setCopiedToClipboard(false), 2000);
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError);
      }
      document.body.removeChild(textArea);
    }
  };

  const detectURL = (text: string): string | null => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const match = text.match(urlRegex);
    return match ? match[0] : null;
  };

  const detectMLS = (text: string): string | null => {
    // Match MLS numbers (common patterns: MLS#, MLS, #123456, etc.)
    const mlsPattern = /(?:mls|mls#|mls\s*#?)\s*:?\s*([0-9]{6,10})/i;
    const match = text.match(mlsPattern);
    return match ? match[1] : null;
  };

  const detectAddress = (text: string): string | null => {
    // More lenient address detection - look for patterns that might be addresses
    // Pattern 1: Full address with street suffix and zip
    const fullPattern = /(\d+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir|Place|Pl)[\s,]*[A-Za-z\s,]+(?:[A-Z]{2})?[\s,]*\d{5}(?:-\d{4})?)/i;
    let match = text.match(fullPattern);
    if (match) return match[0].trim();
    
    // Pattern 2: Street number + street name + city/state (more lenient)
    // Matches: "626 w cottle farmington utah" or "123 Main St Salt Lake City UT"
    const lenientPattern = /(\d+\s+[A-Za-z0-9\s,.-]{3,}(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir|Place|Pl))?\s+[A-Za-z\s,]{2,}(?:[A-Z]{2})?)/i;
    match = text.match(lenientPattern);
    if (match) {
      const potentialAddress = match[0].trim();
      // Only return if it looks like an address (has number, has city/state-like words)
      if (potentialAddress.length > 10 && /\d/.test(potentialAddress)) {
        return potentialAddress;
      }
    }
    
    return null;
  };

  const normalizeAddressWithOpenAI = async (addressText: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/normalize-address', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: addressText })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.normalizedAddress || null;
    } catch (error) {
      console.error('Error normalizing address:', error);
      return null;
    }
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
    const messageText = inputText.trim();
    setInputText('');
    setIsProcessing(true);
    
    // Track system response for this query
    let systemResponseText: string | undefined = undefined;
    
    // Save current steps to history before clearing (for any previous incomplete searches)
    if (processingSteps.length > 0) {
      setProcessingHistory(prev => [...prev, {
        userInput: 'Previous search (incomplete)',
        systemResponse: systemResponseText,
        steps: [...processingSteps],
        timestamp: new Date()
      }]);
    }
    // Clear current steps for new search
    setProcessingSteps([]);

    try {
      // Add user input as a step at the beginning
      const userInputStepId = addStep('👤 USER INPUT', 'success', `User message: "${messageText}"`);
      // Step 1: Detect URL, MLS, or Address
      const step1Id = addStep('🔍 Analyzing message', 'processing', `Detecting URL, MLS number, or address in message...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const url = detectURL(messageText);
      const mlsNumber = detectMLS(messageText);
      let address = detectAddress(messageText);
      
      // Check if user is confirming a pending MLS/address
      const isConfirmation = /^(yes|y|confirm|correct|that's it|that's the one)$/i.test(messageText);
      
      // If no URL or MLS, but message looks like it might be an address, try to normalize it
      if (!url && !mlsNumber && !address && !pendingConfirmation && !isConfirmation) {
        // Check if message looks address-like (has numbers and multiple words)
        const looksLikeAddress = /\d/.test(messageText) && messageText.split(/\s+/).length >= 3;
        if (looksLikeAddress) {
          updateStep(step1Id, { 
            status: 'processing', 
            icon: <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />,
            details: 'Normalizing address...'
          });
          
          const normalizedAddress = await normalizeAddressWithOpenAI(messageText);
          if (normalizedAddress) {
            address = normalizedAddress;
            updateStep(step1Id, { 
              status: 'success', 
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
              details: `Normalized: ${normalizedAddress}`
            });
          }
        }
      }
      
      // Determine what to process
      let mlsToProcess = mlsNumber;
      let addressToProcess = address;
      let propertyUrl = url;
      
      if (pendingConfirmation && isConfirmation) {
        // User confirmed - process the address (MLS numbers are converted to addresses first)
        addressToProcess = pendingConfirmation.value;
        setPendingConfirmation(null);
        // Don't create placeholder URL - we'll use Google Search directly
        propertyUrl = undefined;
      } else if (mlsNumber && !url && !pendingConfirmation) {
        // First time detecting MLS - find the address first
        updateStep(step1Id, { 
          status: 'processing', 
          icon: <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />,
          details: `Finding address for MLS #${mlsNumber}...`
        });
        
        try {
          const mlsResponse = await fetch('/api/find-address-from-mls', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mlsNumber })
          });

          if (!mlsResponse.ok) {
            const errorData = await mlsResponse.json();
            updateStep(step1Id, { 
              status: 'error', 
              icon: <XCircle className="w-4 h-4 text-red-500" />,
              details: errorData.error || 'Could not find address for this MLS number'
            });
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              text: `I couldn't find a property address for MLS #${mlsNumber}. Please try providing the full property address or a listing URL instead.`,
              sender: 'system',
              timestamp: new Date()
            }]);
            setIsProcessing(false);
            return;
          }

          const mlsData = await mlsResponse.json();
          const foundAddress = mlsData.address;

          updateStep(step1Id, { 
            status: 'success', 
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
            details: `Found address: ${foundAddress}`
          });
          
          // Store both MLS and address for processing
          setPendingConfirmation({ type: 'address', value: foundAddress });
          
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            text: `I found MLS #${mlsNumber} at ${foundAddress}. Is this the property you're interested in? Please reply "yes" or "confirm" to proceed.`,
            sender: 'system',
            timestamp: new Date()
          }]);
          setIsProcessing(false);
          return;
        } catch (error) {
          console.error('Error finding address from MLS:', error);
          updateStep(step1Id, { 
            status: 'error', 
            icon: <XCircle className="w-4 h-4 text-red-500" />,
            details: 'Error searching for MLS address'
          });
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            text: `Sorry, I encountered an error while searching for MLS #${mlsNumber}. Please try again or provide the property address directly.`,
            sender: 'system',
            timestamp: new Date()
          }]);
          setIsProcessing(false);
          return;
        }
      } else if (address && !url && !pendingConfirmation) {
        // First time detecting address - normalize it first, then ask for confirmation
        updateStep(step1Id, { 
          status: 'processing', 
          icon: <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />,
          details: 'Normalizing address...'
        });
        
        try {
          const normalizedAddress = await normalizeAddressWithOpenAI(address);
          if (normalizedAddress) {
            updateStep(step1Id, { 
              status: 'success', 
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
              details: `Normalized: ${normalizedAddress}`
            });
            
            setPendingConfirmation({ type: 'address', value: normalizedAddress });
            
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              text: `I found ${normalizedAddress}. Is this the property you're interested in? Please reply "yes" or "confirm" to proceed.`,
              sender: 'system',
              timestamp: new Date()
            }]);
          } else {
            // If normalization fails, still ask for confirmation with original
            updateStep(step1Id, { 
              status: 'success', 
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
              details: `Detected: ${address}`
            });
            
            setPendingConfirmation({ type: 'address', value: address });
            
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              text: `I found ${address}. Is this the property you're interested in? Please reply "yes" or "confirm" to proceed.`,
              sender: 'system',
              timestamp: new Date()
            }]);
          }
        } catch (error) {
          console.error('Error normalizing address:', error);
          // If normalization fails, still ask for confirmation with original
          updateStep(step1Id, { 
            status: 'success', 
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
            details: `Detected: ${address}`
          });
          
          setPendingConfirmation({ type: 'address', value: address });
          
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            text: `I found ${address}. Is this the property you're interested in? Please reply "yes" or "confirm" to proceed.`,
            sender: 'system',
            timestamp: new Date()
          }]);
        }
        setIsProcessing(false);
        return;
      } else if (!url && !mlsNumber && !address && !pendingConfirmation) {
        // No detection and no pending confirmation
        updateStep(step1Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: 'No URL, MLS number, or address detected'
        });
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          text: 'I couldn\'t find a property listing URL, MLS number, or address in your message. Please send me:\n• A link from Zillow, Redfin, or UtahRealEstate.com\n• An MLS number (e.g., "MLS #123456")\n• A property address',
          sender: 'system',
          timestamp: new Date()
        }]);
        setIsProcessing(false);
        return;
      }
      
      // Determine if we have a real URL or just an address
      const hasRealUrl = url && (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('search.property.com');

      updateStep(step1Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: hasRealUrl ? `Found URL: ${url}` : (mlsToProcess ? `Found MLS: #${mlsToProcess}` : `Found Address: ${addressToProcess}`)
      });

      // Add detailed step for what we're searching for
      const searchDetails = hasRealUrl 
        ? `URL: ${url}`
        : mlsToProcess
          ? `MLS Number: ${mlsToProcess}`
          : `Address: ${addressToProcess}`;
      
      addStep('🔍 Search Details', 'processing', searchDetails);
      
      const step2Id = hasRealUrl ? addStep('📥 Fetching page content', 'processing', `Attempting direct fetch from: ${url}`) : null;
      if (hasRealUrl) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Step 3: Call API
      const step3Id = addStep('🤖 Calling API', 'processing', `Sending request to /api/sms-process${addressToProcess ? ` with address: ${addressToProcess}` : ''}${hasRealUrl ? ` with URL: ${url}` : ''}`);
      await new Promise(resolve => setTimeout(resolve, 500));

      const apiRequestStart = Date.now();
      const response = await fetch('/api/sms-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: hasRealUrl ? url : undefined, // Only send real URLs, not placeholder URLs
          address: addressToProcess || undefined
        })
      });
      const apiRequestDuration = Date.now() - apiRequestStart;

      const data = await response.json();
      
      // Add API response details
      updateStep(step3Id, { 
        status: response.ok && data.success ? 'success' : 'error',
        details: `API Response received in ${apiRequestDuration}ms\nStatus: ${response.status} ${response.statusText}\nSuccess: ${data.success ? 'Yes' : 'No'}${data.ingestion ? `\nSource: ${data.ingestion.source}\nSearch Provider: ${data.ingestion.searchProviderUsed || 'none'}\nQuery Used: ${data.ingestion.searchQueryUsed || 'N/A'}\nResults Used: ${data.ingestion.numSearchResultsUsed || 'N/A'}` : ''}`,
        rawData: { responseTime: apiRequestDuration, status: response.status, data }
      });

      // Handle API errors (even if response is 200, check for success flag)
      if (!response.ok || !data.success) {
        const errorMessage = data.error || 'Failed to process property listing';
        const errorDetails = data.details || data.suggestion || '';
        
        if (step2Id) {
          updateStep(step2Id, { 
            status: data.ingestion?.source === 'google_search_fallback' ? 'error' : 'success', 
            icon: data.ingestion?.source === 'google_search_fallback' 
              ? <AlertCircle className="w-4 h-4 text-amber-500" />
              : <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
            details: data.ingestion?.source === 'google_search_fallback' 
              ? 'Direct fetch blocked, using Google Search'
              : 'Page content fetched successfully',
            rawData: data.ingestion
          });
        }

        updateStep(step3Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: `${errorMessage}\n\nDetails: ${errorDetails}\n\nFull API Response:\n${JSON.stringify(data, null, 2)}`,
          rawData: { error: errorMessage, details: errorDetails, fullResponse: data }
        });

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          text: errorDetails 
            ? `${errorMessage}\n\n${errorDetails}`
            : errorMessage,
          sender: 'system',
          timestamp: new Date()
        }]);
        setIsProcessing(false);
        return;
      }

      // Update step 2 with ingestion info (only if we had a real URL)
      if (step2Id) {
        let fetchDetails = hasRealUrl 
          ? `Direct fetch attempted from: ${url}\n`
          : '';
        
        if (data.ingestion?.source === 'google_search_fallback') {
          fetchDetails += `❌ Direct fetch blocked (403/401/429 or empty)\n`;
          fetchDetails += `✅ Fallback: Using Google Search\n`;
          if (data.ingestion.searchQueryUsed) {
            fetchDetails += `Search Query: "${data.ingestion.searchQueryUsed}"\n`;
          }
          if (data.ingestion.numSearchResultsUsed) {
            fetchDetails += `Search Results Found: ${data.ingestion.numSearchResultsUsed}\n`;
          }
        } else {
          fetchDetails += `✅ Direct fetch successful\n`;
          fetchDetails += `Content length: ${data.ingestion?.raw_text?.length || 0} characters\n`;
        }
        
        updateStep(step2Id, { 
          status: data.ingestion?.source === 'google_search_fallback' ? 'error' : 'success', 
          icon: data.ingestion?.source === 'google_search_fallback' 
            ? <AlertCircle className="w-4 h-4 text-amber-500" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
          details: fetchDetails,
          rawData: data.ingestion
        });
      }

      // Add detailed step for extraction with all available information
      let extractionDetails = `\n📊 EXTRACTION DETAILS:\n`;
      extractionDetails += `─────────────────────────────────────\n`;
      
      if (data.ingestion?.extractionDetails) {
        const details = data.ingestion.extractionDetails;
        const extractionLog = details.extractionLog || [];
        const aggregationDetails = details.aggregationDetails || {};
        
        extractionDetails += `\n🔍 Extraction Sources (${extractionLog.length} total):\n`;
        extractionLog.forEach((log: any, idx: number) => {
          extractionDetails += `\n  ${idx + 1}. ${log.source.toUpperCase()}\n`;
          extractionDetails += `     URL: ${log.url}\n`;
          extractionDetails += `     Extracted Address: ${log.extracted.address || '❌ NOT FOUND'}\n`;
          extractionDetails += `     Price: ${log.extracted.price ? `$${log.extracted.price.toLocaleString()}` : '❌ NOT FOUND'}\n`;
          extractionDetails += `     Beds: ${log.extracted.beds || '❌ NOT FOUND'} | Baths: ${log.extracted.baths || '❌ NOT FOUND'} | Sqft: ${log.extracted.sqft ? log.extracted.sqft.toLocaleString() : '❌ NOT FOUND'}\n`;
          extractionDetails += `     HOA: ${log.extracted.hoa !== null && log.extracted.hoa !== undefined ? `$${log.extracted.hoa}/mo` : '❌ NOT FOUND'} | Year Built: ${log.extracted.yearBuilt || '❌ NOT FOUND'}\n`;
          if (log.extracted.confidence) {
            extractionDetails += `     Confidence: ${JSON.stringify(log.extracted.confidence)}\n`;
          }
        });
        
        extractionDetails += `\n\n🔄 AGGREGATION PROCESS:\n`;
        extractionDetails += `  Total Sources: ${aggregationDetails.totalSources || extractionLog.length}\n`;
        extractionDetails += `  Matched Address: ${aggregationDetails.matchedSources || extractionLog.length}\n`;
        if (aggregationDetails.filteredSources > 0) {
          extractionDetails += `  ⚠️  FILTERED OUT: ${aggregationDetails.filteredSources} results with non-matching addresses\n`;
        }
        if (aggregationDetails.targetAddress) {
          extractionDetails += `  Target Address: ${aggregationDetails.targetAddress}\n`;
        }
        
        if (aggregationDetails.fieldVotes) {
          extractionDetails += `\n  Field Votes (Majority Selection):\n`;
          Object.entries(aggregationDetails.fieldVotes).forEach(([field, votes]: [string, any]) => {
            if (votes && Object.keys(votes).length > 0) {
              extractionDetails += `    ${field}: ${JSON.stringify(votes)}\n`;
            }
          });
        }
      }
      
      extractionDetails += `\n\n✅ FINAL AGGREGATED RESULT:\n`;
      extractionDetails += `─────────────────────────────────────\n`;
      extractionDetails += `Address: ${data.listing?.address || '❌ NOT FOUND'}\n`;
      extractionDetails += `Price: ${data.listing?.price ? `$${data.listing.price.toLocaleString()}` : '❌ NOT FOUND'}\n`;
      extractionDetails += `Beds: ${data.listing?.beds || '❌ NOT FOUND'} | Baths: ${data.listing?.baths || '❌ NOT FOUND'} | Sqft: ${data.listing?.sqft ? data.listing.sqft.toLocaleString() : '❌ NOT FOUND'}\n`;
      extractionDetails += `HOA: ${data.listing?.hoa !== null && data.listing?.hoa !== undefined ? `$${data.listing.hoa}/mo` : '❌ NOT FOUND'} | Year Built: ${data.listing?.yearBuilt || '❌ NOT FOUND'}\n`;
      if (data.listing?.missingFields && data.listing.missingFields.length > 0) {
        extractionDetails += `\n⚠️  Missing Fields: ${data.listing.missingFields.join(', ')}\n`;
      }
      if (data.listing?.confidence) {
        extractionDetails += `\nConfidence Scores: ${JSON.stringify(data.listing.confidence, null, 2)}\n`;
      }
      if (data.listing?.extractionNotes) {
        extractionDetails += `\nExtraction Notes: ${data.listing.extractionNotes}\n`;
      }
      
      // Add ingestion notes if available
      if (data.ingestion?.notes) {
        extractionDetails += `\n\n📝 Ingestion Notes:\n${data.ingestion.notes}\n`;
      }
      
      updateStep(step3Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: extractionDetails,
        rawData: { 
          propertyData: data.listing,
          extractionDetails: data.ingestion?.extractionDetails,
          ingestion: data.ingestion,
          fullApiResponse: data
        }
      });

      // Step 4: Parse JSON response
      const step4Id = addStep('Processing property data', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const propertyData = data.listing;
      if (!propertyData) {
        updateStep(step4Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: 'No property data returned'
        });
        setIsProcessing(false);
        return;
      }

      updateStep(step4Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `Address: ${propertyData.address}`,
        rawData: propertyData
      });

      // Step 5: Enrich data with estimates
      const step5Id = addStep('Enriching data with estimates', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const enrichedData = { ...propertyData };
      const estimates: string[] = [];

      // Handle null values - use estimates only if we have a price
      if (propertyData.price === null || propertyData.price === undefined) {
        // Can't estimate without price
        enrichedData.price = null;
      }

      // Property Tax: Use provided value, or estimate if missing
      // Note: propertyTax from API is ANNUAL, we need to convert to monthly
      if (propertyData.propertyTax === null || propertyData.propertyTax === undefined) {
        if (enrichedData.price) {
          // Utah average: 0.58% of home value annually
          enrichedData.propertyTax = (enrichedData.price * 0.0058) / 12; // Convert annual to monthly
          estimates.push('Property Tax');
        } else {
          enrichedData.propertyTax = null;
        }
      } else {
        // Property tax is provided as ANNUAL from API, convert to monthly
        enrichedData.propertyTax = propertyData.propertyTax / 12;
      }

      // Insurance: ALWAYS use standardized formula (0.25% annually = 0.0025)
      // This ensures consistency regardless of property age or source
      if (enrichedData.price) {
        // STANDARDIZED INSURANCE FORMULA: monthlyInsurance = (price × 0.0025) ÷ 12
        const insuranceRate = 0.0025; // Always 0.25% annually
        enrichedData.insurance = (enrichedData.price * insuranceRate) / 12; // Convert annual to monthly
        estimates.push('Insurance'); // Insurance is always estimated
      } else {
        enrichedData.insurance = null;
      }

      // HOA: Standardize null to 0 (assume no HOA rather than Unknown)
      if (enrichedData.hoa === null || enrichedData.hoa === undefined) {
        enrichedData.hoa = 0; // Assume no HOA instead of null/Unknown
      }

      // Add data provenance tracking for debugging
      const dataProvenance = {
        price: propertyData.price !== null && propertyData.price !== undefined ? 'extracted' : 'missing',
        propertyTax: propertyData.propertyTax !== null && propertyData.propertyTax !== undefined ? 'extracted' : 'estimated',
        insurance: 'estimated', // Always estimated
        hoa: propertyData.hoa !== null && propertyData.hoa !== undefined ? 'extracted' : 'assumed_zero',
        yearBuilt: propertyData.yearBuilt !== null && propertyData.yearBuilt !== undefined ? 'extracted' : 'missing'
      };
      
      enrichedData._dataProvenance = dataProvenance;

      // Verification logging
      console.log('Property data after enrichment:', {
        address: enrichedData.address,
        propertyTaxSource: dataProvenance.propertyTax,
        propertyTaxMonthly: enrichedData.propertyTax,
        insuranceMonthly: enrichedData.insurance,
        hoaSource: dataProvenance.hoa,
        hoaValue: enrichedData.hoa
      });

      updateStep(step5Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `Estimated: ${estimates.join(', ')}`,
        rawData: enrichedData
      });

      // Step 6: Load borrower qualification data
      const step6Id = addStep('Loading borrower qualification', 'processing');
      await new Promise(resolve => setTimeout(resolve, 300));

      updateStep(step6Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `${borrowerQualification.downPaymentPercent}% down, $${borrowerQualification.maxMonthlyPayment}/mo max, ${borrowerQualification.interestRate}% rate`,
        rawData: borrowerQualification
      });

      // Step 7: Calculate mortgage payment
      const step7Id = addStep('Calculating payment', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Can't calculate payment without price
      if (!enrichedData.price) {
        updateStep(step7Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: 'Cannot calculate payment: property price is missing',
          rawData: { error: 'Missing price data' }
        });
        
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          text: 'Sorry, I couldn\'t find the property price in the listing. Without the price, I can\'t calculate the mortgage payment. Please try a different listing URL or check if the listing is publicly available.',
          sender: 'system',
          timestamp: new Date()
        }]);
        setIsProcessing(false);
        return;
      }

      const payment = calculateMortgagePayment(
        enrichedData.price,
        borrowerQualification.downPaymentPercent,
        borrowerQualification.interestRate,
        borrowerQualification.loanTermMonths,
        (enrichedData.propertyTax || 0) * 12, // Convert monthly to yearly (use 0 if null)
        (enrichedData.insurance || 0) * 12, // Convert monthly to yearly (use 0 if null)
        enrichedData.hoa || 0,
        borrowerQualification.creditScore
      );

      updateStep(step7Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: `Total payment: ${formatCurrency(payment.total)}/month`,
        rawData: payment
      });

      // Step 8: Compare to qualification limits
      const step8Id = addStep('Comparing to qualification limits', 'processing');
      await new Promise(resolve => setTimeout(resolve, 300));

      const overage = payment.total - borrowerQualification.maxMonthlyPayment;
      const isAffordable = payment.total <= borrowerQualification.maxMonthlyPayment;
      const priceWithinLimit = enrichedData.price ? enrichedData.price <= borrowerQualification.maxPurchasePrice : true;
      const loanAmount = enrichedData.price ? enrichedData.price * (1 - borrowerQualification.downPaymentPercent / 100) : 0;
      const loanWithinLimit = loanAmount <= borrowerQualification.maxLoanAmount;

      const comparisonDetails = [
        `Payment: ${formatCurrency(payment.total)} vs Max: ${formatCurrency(borrowerQualification.maxMonthlyPayment)}`,
        `Price: ${enrichedData.price ? formatCurrency(enrichedData.price) : 'Unknown'} vs Max: ${formatCurrency(borrowerQualification.maxPurchasePrice)}`,
        `Loan: ${formatCurrency(loanAmount)} vs Max: ${formatCurrency(borrowerQualification.maxLoanAmount)}`
      ].join('\n');

      updateStep(step8Id, { 
        status: isAffordable && priceWithinLimit && loanWithinLimit ? 'success' : 'error', 
        icon: isAffordable && priceWithinLimit && loanWithinLimit
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <AlertCircle className="w-4 h-4 text-amber-500" />,
        details: isAffordable 
          ? `Under budget by ${formatCurrency(Math.abs(overage))}`
          : `Over budget by ${formatCurrency(overage)}`,
        rawData: { 
          isAffordable, 
          overage, 
          maxPayment: borrowerQualification.maxMonthlyPayment, 
          actualPayment: payment.total,
          priceWithinLimit,
          loanWithinLimit,
          comparisonDetails
        }
      });

      // Step 9: Generate formatted SMS response
      const step9Id = addStep('Generating response', 'processing');
      await new Promise(resolve => setTimeout(resolve, 400));

      // Helper function to format nullable values
      const formatNullable = (value: any, formatter: (v: any) => string, fallback: string = 'Unknown'): string => {
        return value !== null && value !== undefined ? formatter(value) : fallback;
      };

      let responseText = `🏡 Found it! ${formatNullable(enrichedData.address, (v) => v, 'Address not found')}\n\n`;
      responseText += `📋 Property Details:\n`;
      responseText += `- Price: ${formatNullable(enrichedData.price, formatCurrency)}\n`;
      responseText += `- ${formatNullable(enrichedData.beds, (v) => `${v}`, '?')} bed, ${formatNullable(enrichedData.baths, (v) => `${v}`, '?')} bath\n`;
      responseText += `- ${formatNullable(enrichedData.sqft, (v) => v.toLocaleString() + ' sq ft')}\n`;
      responseText += `- Built: ${formatNullable(enrichedData.yearBuilt, (v) => v.toString())}\n`;
      
      // HOA display: Show $0/mo instead of Unknown (we standardize null to 0 in enrichment)
      responseText += `- HOA: ${formatCurrency(enrichedData.hoa || 0)}/mo\n`;
      responseText += `\n`;
      
      responseText += `💰 Your Payment (${borrowerQualification.downPaymentPercent}% down):\n`;
      responseText += `- P&I: ${formatCurrency(payment.principalAndInterest)}\n`;
      responseText += `- Property Tax: ${formatCurrency(payment.propertyTax)}/mo${estimates.includes('Property Tax') ? ' (est)*' : ''}\n`;
      responseText += `- Insurance: ${formatCurrency(payment.insurance)}/mo (est)*\n`;
      if (payment.pmi > 0) {
        responseText += `- PMI: ${formatCurrency(payment.pmi)}/mo\n`;
      }
      // Always show HOA (will be $0/mo if no HOA)
      responseText += `- HOA: ${formatCurrency(payment.hoa || 0)}/mo\n`;
      responseText += `━━━━━━━━━━━━━━━━\n`;
      responseText += `TOTAL: ${formatCurrency(payment.total)}/month\n\n`;
      
      if (estimates.length > 0) {
        responseText += `*Estimated based on Utah averages\n\n`;
      }

      if (isAffordable) {
        responseText += `✅ This fits your budget of ${formatCurrency(borrowerQualification.maxMonthlyPayment)}/mo!\n`;
        responseText += `You have ${formatCurrency(Math.abs(overage))}/mo cushion.`;
      } else {
        responseText += `⚠️ This is ${formatCurrency(overage)} OVER your budget of ${formatCurrency(borrowerQualification.maxMonthlyPayment)}/mo\n\n`;
        responseText += `But I found ways to make it work!\n`;
        responseText += `Reply OPTIONS to see solutions`;
      }

      updateStep(step9Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: 'Response generated',
        rawData: { responseText }
      });

      // Step 9: Display response in chat
      systemResponseText = responseText;
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: responseText,
        sender: 'system',
        timestamp: new Date()
      }]);
      
      // Add system response as final step
      addStep('💬 SYSTEM RESPONSE', 'success', `Response sent to user:\n\n${responseText}`);

    } catch (error) {
      console.error('Error processing message:', error);
      const errorResponseText = 'Sorry, I encountered an error. Please try again.';
      systemResponseText = errorResponseText;
      
      addStep('❌ ERROR', 'error', `Error occurred: ${error instanceof Error ? error.message : String(error)}\n\nStack trace: ${error instanceof Error ? error.stack : 'N/A'}`);
      addStep('💬 SYSTEM RESPONSE', 'error', `Error response sent to user:\n\n${errorResponseText}`);
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: errorResponseText,
        sender: 'system',
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
      
      // Save completed processing to history with user input and system response
      // Use setTimeout to ensure all steps are captured
      setTimeout(() => {
        if (processingSteps.length > 0) {
          setProcessingHistory(prev => [...prev, {
            userInput: messageText,
            systemResponse: systemResponseText,
            steps: [...processingSteps],
            timestamp: new Date()
          }]);
        }
      }, 100);
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

      {/* Three Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Borrower Qualification */}
        <div className="w-1/3 border-r-2 border-indigo-200 bg-gradient-to-b from-white to-slate-50 flex flex-col shadow-lg">
          <div className="px-6 py-5 border-b-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                <Edit2 className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Borrower Qualification</h2>
            </div>
            <p className="text-sm text-slate-600 ml-10">Pre-approval details (editable)</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Borrower Info - Compact */}
            <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Borrower</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Name</label>
                  <input
                    type="text"
                    value={borrowerQualification.borrowerName}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, borrowerName: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Credit Score</label>
                  <input
                    type="number"
                    value={borrowerQualification.creditScore}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, creditScore: Number(e.target.value) || 0 }))}
                    min="300"
                    max="850"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Income & Debt - Compact */}
            <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Income & Debt</h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Monthly Income</label>
                  <FormattedNumberInput
                    value={borrowerQualification.totalIncome}
                    onChangeValue={(val) => setBorrowerQualification(prev => ({ ...prev, totalIncome: val }))}
                    isCurrency={true}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Monthly Debts</label>
                  <FormattedNumberInput
                    value={borrowerQualification.monthlyDebts}
                    onChangeValue={(val) => setBorrowerQualification(prev => ({ ...prev, monthlyDebts: val }))}
                    isCurrency={true}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Front-End DTI %</label>
                  <input
                    type="number"
                    value={borrowerQualification.maxFrontEndDTI}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, maxFrontEndDTI: Number(e.target.value) || 0 }))}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Back-End DTI %</label>
                  <input
                    type="number"
                    value={borrowerQualification.maxBackEndDTI}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, maxBackEndDTI: Number(e.target.value) || 0 }))}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 mt-2">
                <div className="text-center">
                  <div className="text-[9px] text-slate-500 mb-0.5">Current Front-End</div>
                  <div className="text-sm font-bold text-indigo-600">
                    {borrowerQualification.totalIncome > 0 
                      ? ((borrowerQualification.maxMonthlyPayment / borrowerQualification.totalIncome) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] text-slate-500 mb-0.5">Current Back-End</div>
                  <div className="text-sm font-bold text-indigo-600">
                    {borrowerQualification.totalIncome > 0
                      ? (((borrowerQualification.maxMonthlyPayment + borrowerQualification.monthlyDebts) / borrowerQualification.totalIncome) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </div>
              </div>
            </div>

            {/* Qualification Limits - Compact */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-3 border-2 border-indigo-200 shadow-sm">
              <h3 className="text-[10px] font-bold text-indigo-700 mb-2 uppercase tracking-wider">Qualification Limits</h3>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-slate-600">Max Payment:</span>
                  <span className="text-sm font-bold text-indigo-600">{formatCurrency(borrowerQualification.maxMonthlyPayment)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-slate-600">Max Loan:</span>
                  <span className="text-sm font-bold text-indigo-600">{formatCurrency(borrowerQualification.maxLoanAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-slate-600">Max Price:</span>
                  <span className="text-sm font-bold text-indigo-600">{formatCurrency(borrowerQualification.maxPurchasePrice)}</span>
                </div>
              </div>
            </div>

            {/* Loan Structure - Compact */}
            <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Loan Structure</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Loan Type</label>
                  <select
                    value={borrowerQualification.loanType}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, loanType: e.target.value as 'Conventional' | 'FHA' | 'VA' }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="Conventional">Conventional</option>
                    <option value="FHA">FHA</option>
                    <option value="VA">VA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Down Payment %</label>
                  <input
                    type="number"
                    value={borrowerQualification.downPaymentPercent}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, downPaymentPercent: Number(e.target.value) || 0 }))}
                    min="0"
                    max="100"
                    step="0.5"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Interest Rate %</label>
                  <input
                    type="number"
                    value={borrowerQualification.interestRate}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, interestRate: Number(e.target.value) || 0 }))}
                    min="0"
                    max="20"
                    step="0.125"
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Term (years)</label>
                  <select
                    value={borrowerQualification.loanTermMonths / 12}
                    onChange={(e) => setBorrowerQualification(prev => ({ ...prev, loanTermMonths: Number(e.target.value) * 12 }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="30">30</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Backend Processing Log */}
        <div className="w-1/3 border-r-2 border-emerald-200 bg-gradient-to-b from-white to-slate-50 flex flex-col shadow-lg">
          <div className="px-6 py-5 border-b-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Backend Processing Log</h2>
              </div>
              <button
                onClick={copyBackendLogToClipboard}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md"
                title="Copy entire backend log to clipboard"
              >
                {copiedToClipboard ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Log</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-sm text-slate-600 ml-10">Real-time processing steps</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Show history first */}
            {processingHistory.map((historyItem, historyIdx) => (
              <div key={`history-${historyIdx}`} className="space-y-3 mb-6">
                {/* Header with timestamp */}
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider border-b-2 border-indigo-300 pb-2 mb-3">
                  {formatTime(historyItem.timestamp)} - Search Session #{historyIdx + 1}
                </div>
                
                {/* USER INPUT - Clearly labeled */}
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">👤</span>
                    </div>
                    <h3 className="font-bold text-blue-900 text-sm uppercase tracking-wide">USER INPUT</h3>
                  </div>
                  <div className="ml-8 text-sm text-slate-800 font-mono whitespace-pre-wrap break-words">
                    {historyItem.userInput}
                  </div>
                </div>
                
                {/* Processing Steps */}
                {historyItem.steps.map((step) => (
                  <div
                    key={step.id}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-4 transition-all hover:shadow-sm opacity-80"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{step.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-slate-900 text-sm">{step.label}</h3>
                          {step.rawData && (
                            <button
                              onClick={() => {
                                // Find step in current steps or create a temporary expanded state
                                const stepId = `history-${historyIdx}-${step.id}`;
                                // For history, we'll just show/hide the raw data inline
                                const existingStep = document.getElementById(stepId);
                                if (existingStep) {
                                  existingStep.classList.toggle('hidden');
                                }
                              }}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {step.details && (
                          <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap font-mono leading-relaxed">
                            {step.details}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            
            {/* Current processing steps */}
            {processingSteps.length === 0 && processingHistory.length === 0 ? (
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
                        <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap font-mono leading-relaxed">
                          {step.details}
                        </div>
                      )}
                      {step.expanded && step.rawData && (
                        <div className="mt-3 p-3 bg-slate-100 rounded border border-slate-200 max-h-96 overflow-y-auto">
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
        <div className="w-1/3 bg-gradient-to-b from-slate-50 to-white flex flex-col shadow-lg">
          <div className="px-6 py-5 border-b-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <Send className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">SMS Chat Interface</h2>
            </div>
            <p className="text-sm text-slate-600 ml-10">Send URL, MLS #, or address to analyze</p>
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
                placeholder="Paste URL, MLS #, or type address..."
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

