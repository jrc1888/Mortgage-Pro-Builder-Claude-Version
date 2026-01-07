import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
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
  const [pendingConfirmation, setPendingConfirmation] = useState<{ type: 'mls' | 'address'; value: string } | null>(null);
  
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
    setProcessingSteps([]);

    try {
      // Step 1: Detect URL, MLS, or Address
      const step1Id = addStep('Analyzing message', 'processing');
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
        
        // Construct placeholder URL for confirmed address
        propertyUrl = `https://search.property.com/${encodeURIComponent(addressToProcess || '')}`;
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
        // First time detecting address - ask for confirmation
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
      
      // If we have address but no URL, construct placeholder URL
      if (!url && addressToProcess) {
        propertyUrl = `https://search.property.com/${encodeURIComponent(addressToProcess)}`;
      }

      updateStep(step1Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: propertyUrl ? `Found URL: ${propertyUrl}` : (mlsToProcess ? `Found MLS: #${mlsToProcess}` : `Found Address: ${addressToProcess}`)
      });

      // Step 2: Fetch page content
      const step2Id = addStep('Fetching page content', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 3: Call OpenAI API
      const step3Id = addStep('Calling OpenAI', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await fetch('/api/sms-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: propertyUrl || undefined,
          address: addressToProcess || undefined
        })
      });

      const data = await response.json();

      // Handle API errors (even if response is 200, check for success flag)
      if (!response.ok || !data.success) {
        const errorMessage = data.error || 'Failed to process property listing';
        const errorDetails = data.details || data.suggestion || '';
        
        updateStep(step2Id, { 
          status: data.ingestion?.source === 'openai_web_search_fallback' ? 'error' : 'success', 
          icon: data.ingestion?.source === 'openai_web_search_fallback' 
            ? <AlertCircle className="w-4 h-4 text-amber-500" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
          details: data.ingestion?.source === 'openai_web_search_fallback' 
            ? 'Direct fetch blocked, using OpenAI web search'
            : 'Page content fetched successfully',
          rawData: data.ingestion
        });

        updateStep(step3Id, { 
          status: 'error', 
          icon: <XCircle className="w-4 h-4 text-red-500" />,
          details: errorMessage,
          rawData: { error: errorMessage, details: errorDetails, ...data }
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

      // Update step 2 with ingestion info
        updateStep(step2Id, { 
          status: data.ingestion?.source === 'openai_web_search_fallback' ? 'error' : 'success', 
          icon: data.ingestion?.source === 'openai_web_search_fallback' 
            ? <AlertCircle className="w-4 h-4 text-amber-500" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
          details: data.ingestion?.source === 'openai_web_search_fallback' 
            ? 'Direct fetch blocked, using OpenAI web search'
            : 'Page content fetched successfully',
        rawData: data.ingestion
      });

      updateStep(step3Id, { 
        status: 'success', 
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
        details: 'Property data extracted successfully',
        rawData: data.propertyData
      });

      // Step 4: Parse JSON response
      const step4Id = addStep('Processing property data', 'processing');
      await new Promise(resolve => setTimeout(resolve, 500));

      const propertyData = data.propertyData;
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

      if (propertyData.propertyTax === null || propertyData.propertyTax === undefined) {
        if (enrichedData.price) {
          enrichedData.propertyTax = enrichedData.price * 0.0058 / 12; // Utah avg monthly
          estimates.push('Property Tax');
        } else {
          enrichedData.propertyTax = null;
        }
      }

      // Estimate insurance with age adjustment (only if we have price)
      if (enrichedData.price) {
        const age = new Date().getFullYear() - (propertyData.yearBuilt || 2020);
        let insuranceRate = 0.003; // Base 0.3% annually
        if (age > 20) insuranceRate = 0.0035; // Older homes cost more to insure
        if (age < 5) insuranceRate = 0.0025; // Newer homes cost less

        enrichedData.insurance = enrichedData.price * insuranceRate / 12;
        estimates.push('Insurance');
      } else {
        enrichedData.insurance = null;
      }

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
      
      if (enrichedData.hoa !== null && enrichedData.hoa !== undefined) {
        responseText += `- HOA: ${enrichedData.hoa > 0 ? formatCurrency(enrichedData.hoa) + '/mo' : 'None detected ✓'}\n`;
      } else {
        responseText += `- HOA: Unknown\n`;
      }
      responseText += `\n`;
      
      responseText += `💰 Your Payment (${borrowerQualification.downPaymentPercent}% down):\n`;
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
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Backend Processing Log</h2>
            </div>
            <p className="text-sm text-slate-600 ml-10">Real-time processing steps</p>
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

