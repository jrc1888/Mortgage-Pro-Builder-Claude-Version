import { jsPDF } from 'jspdf';
import { Scenario, CalculatedResults } from '../types';

interface StructuredSubmissionData {
  executiveSummary: {
    borrowerName: string;
    propertyAddress: string;
    transactionType: string;
    faDate?: string;
    settlementDate?: string;
    loanType: string;
    loanAmount: string;
    purchasePrice: string;
    ltv: string;
    downPayment: string;
    interestRate: string;
    monthlyPayment: string;
  };
  loanDetails: {
    loanTerm: string;
    occupancyType: string;
    creditScore: string;
    specialFeatures: string[];
  };
  monthlyPaymentBreakdown: {
    principalAndInterest: string;
    propertyTax: string;
    homeInsurance: string;
    mortgageInsurance: string;
    hoaDues: string;
    dpaPayments: string;
    totalMonthlyPayment: string;
  };
  cashToClose: {
    downPayment: string;
    closingCosts: string;
    prepaidInterest?: string;
    credits: string;
    dpaAssistance: string;
    earnestMoney: string;
    netCashToClose: string;
  };
  borrowerQualification: {
    creditScore: string;
    totalIncome: string;
    monthlyDebts: string;
    frontEndDTI: string;
    backEndDTI: string;
    qualificationStatus: string;
  };
  specialFeatures: {
    dpa?: any;
    dpa2?: any;
    buydown?: any;
    sellerConcessions: string;
    lenderCredits: string;
  };
  notes: string;
  missingInformation: Array<{
    priority: 'critical' | 'important' | 'recommended';
    category: string;
    item: string;
    question: string;
  }>;
}

export async function generateSubmissionPDFData(
  scenario: Scenario,
  results: CalculatedResults
): Promise<StructuredSubmissionData> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('/api/generate-submission-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scenario, results }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return await response.json();
}

export async function generateSubmissionPDF(
  scenario: Scenario,
  results: CalculatedResults,
  structuredData: StructuredSubmissionData
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  const marginLeft = 0.75;
  const marginRight = 0.75;
  const marginTop = 0.5;
  const marginBottom = 0.5;
  const pageWidth = 8.5;
  const pageHeight = 11;
  const contentWidth = pageWidth - marginLeft - marginRight;

  let yPos = marginTop;
  const lineHeight = 0.2;
  const sectionSpacing = 0.3;

  // Helper function to add new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - marginBottom) {
      doc.addPage();
      yPos = marginTop;
    }
  };

  // Helper function to add text with wrapping
  const addText = (text: string, fontSize: number, isBold: boolean = false, color: [number, number, number] = [0, 0, 0]) => {
    if (!text || text.trim() === '') return;
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(color[0], color[1], color[2]);
    
    const lines = doc.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      checkPageBreak(lineHeight);
      doc.text(line, marginLeft, yPos);
      yPos += lineHeight;
    });
  };

  // Helper function to add section header
  const addSectionHeader = (title: string) => {
    checkPageBreak(lineHeight * 2);
    yPos += sectionSpacing;
    addText(title, 12, true, [31, 59, 131]); // Brand color
    yPos += 0.1;
    doc.setLineWidth(0.01);
    doc.setDrawColor(31, 59, 131);
    doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
    yPos += 0.15;
  };

  // Header
  addText('SUBMISSION EMAIL', 16, true, [31, 59, 131]);
  yPos += 0.1;
  addText(`Borrower: ${structuredData.executiveSummary.borrowerName}`, 10);
  addText(`Property: ${structuredData.executiveSummary.propertyAddress}`, 10);
  if (structuredData.executiveSummary.faDate) {
    addText(`F&A Date: ${structuredData.executiveSummary.faDate}`, 10);
  }
  if (structuredData.executiveSummary.settlementDate) {
    addText(`Settlement Date: ${structuredData.executiveSummary.settlementDate}`, 10);
  }
  addText(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 9, false, [100, 100, 100]);
  yPos += sectionSpacing;

  // Executive Summary
  addSectionHeader('EXECUTIVE SUMMARY');
  addText(`Transaction Type: ${structuredData.executiveSummary.transactionType}`, 10);
  addText(`Loan Type: ${structuredData.executiveSummary.loanType}`, 10);
  addText(`Loan Amount: ${structuredData.executiveSummary.loanAmount}`, 10);
  addText(`Purchase Price: ${structuredData.executiveSummary.purchasePrice}`, 10);
  addText(`LTV: ${structuredData.executiveSummary.ltv}`, 10);
  addText(`Down Payment: ${structuredData.executiveSummary.downPayment}`, 10);
  addText(`Interest Rate: ${structuredData.executiveSummary.interestRate}`, 10);
  addText(`Monthly Payment: ${structuredData.executiveSummary.monthlyPayment}`, 10, true);

  // Loan Details
  addSectionHeader('LOAN DETAILS');
  addText(`Loan Term: ${structuredData.loanDetails.loanTerm}`, 10);
  addText(`Occupancy: ${structuredData.loanDetails.occupancyType}`, 10);
  addText(`Credit Score: ${structuredData.loanDetails.creditScore}`, 10);
  if (structuredData.loanDetails.specialFeatures.length > 0) {
    addText(`Special Features: ${structuredData.loanDetails.specialFeatures.join(', ')}`, 10);
  }

  // Monthly Payment Breakdown
  addSectionHeader('MONTHLY PAYMENT BREAKDOWN');
  addText(`Principal & Interest: ${structuredData.monthlyPaymentBreakdown.principalAndInterest}`, 10);
  addText(`Property Tax: ${structuredData.monthlyPaymentBreakdown.propertyTax}`, 10);
  addText(`Home Insurance: ${structuredData.monthlyPaymentBreakdown.homeInsurance}`, 10);
  addText(`Mortgage Insurance: ${structuredData.monthlyPaymentBreakdown.mortgageInsurance}`, 10);
  if (structuredData.monthlyPaymentBreakdown.hoaDues !== '$0') {
    addText(`HOA Dues: ${structuredData.monthlyPaymentBreakdown.hoaDues}`, 10);
  }
  if (structuredData.monthlyPaymentBreakdown.dpaPayments !== '$0') {
    addText(`DPA Payments: ${structuredData.monthlyPaymentBreakdown.dpaPayments}`, 10);
  }
  addText(`Total Monthly Payment: ${structuredData.monthlyPaymentBreakdown.totalMonthlyPayment}`, 10, true);

  // Cash to Close
  addSectionHeader('CASH TO CLOSE');
  addText(`Down Payment: ${structuredData.cashToClose.downPayment}`, 10);
  addText(`Closing Costs: ${structuredData.cashToClose.closingCosts}`, 10);
  if (structuredData.cashToClose.prepaidInterest && structuredData.cashToClose.prepaidInterest !== '$0') {
    addText(`Prepaid Interest: ${structuredData.cashToClose.prepaidInterest}`, 10);
  }
  if (structuredData.cashToClose.credits !== '$0') {
    addText(`Credits Applied: ${structuredData.cashToClose.credits}`, 10);
  }
  if (structuredData.cashToClose.dpaAssistance !== '$0') {
    addText(`DPA Assistance: ${structuredData.cashToClose.dpaAssistance}`, 10);
  }
  if (structuredData.cashToClose.earnestMoney !== '$0') {
    addText(`Earnest Money: ${structuredData.cashToClose.earnestMoney}`, 10);
  }
  addText(`Net Cash to Close: ${structuredData.cashToClose.netCashToClose}`, 10, true);

  // Borrower Qualification
  addSectionHeader('BORROWER QUALIFICATION');
  addText(`Credit Score: ${structuredData.borrowerQualification.creditScore}`, 10);
  addText(`Total Monthly Income: ${structuredData.borrowerQualification.totalIncome}`, 10);
  addText(`Monthly Debts: ${structuredData.borrowerQualification.monthlyDebts}`, 10);
  addText(`Front-End DTI: ${structuredData.borrowerQualification.frontEndDTI}`, 10);
  addText(`Back-End DTI: ${structuredData.borrowerQualification.backEndDTI}`, 10);
  addText(`Qualification Status: ${structuredData.borrowerQualification.qualificationStatus}`, 10, true);

  // Special Features
  const hasSpecialFeatures = 
    structuredData.specialFeatures.dpa || 
    structuredData.specialFeatures.dpa2 || 
    structuredData.specialFeatures.buydown ||
    (structuredData.specialFeatures.sellerConcessions && structuredData.specialFeatures.sellerConcessions !== '$0') ||
    (structuredData.specialFeatures.lenderCredits && structuredData.specialFeatures.lenderCredits !== '$0');
    
  if (hasSpecialFeatures) {
    addSectionHeader('SPECIAL FEATURES');
    if (structuredData.specialFeatures.dpa && typeof structuredData.specialFeatures.dpa === 'object') {
      const dpa = structuredData.specialFeatures.dpa;
      addText(`DPA 1: ${dpa.amount || 'N/A'} at ${dpa.rate || 'N/A'}% for ${dpa.termMonths || 'N/A'} months`, 10);
      if (dpa.isDeferred) {
        addText('  (Deferred Payment)', 9, false, [100, 100, 100]);
      }
    }
    if (structuredData.specialFeatures.dpa2 && typeof structuredData.specialFeatures.dpa2 === 'object') {
      const dpa2 = structuredData.specialFeatures.dpa2;
      addText(`DPA 2: ${dpa2.amount || 'N/A'} at ${dpa2.rate || 'N/A'}% for ${dpa2.termMonths || 'N/A'} months`, 10);
      if (dpa2.isDeferred) {
        addText('  (Deferred Payment)', 9, false, [100, 100, 100]);
      }
    }
    if (structuredData.specialFeatures.buydown && typeof structuredData.specialFeatures.buydown === 'object') {
      const buydown = structuredData.specialFeatures.buydown;
      addText(`Buydown: ${buydown.type || 'N/A'} - Cost: ${buydown.cost || '$0'}`, 10);
    }
    if (structuredData.specialFeatures.sellerConcessions && structuredData.specialFeatures.sellerConcessions !== '$0') {
      addText(`Seller Concessions: ${structuredData.specialFeatures.sellerConcessions}`, 10);
    }
    if (structuredData.specialFeatures.lenderCredits && structuredData.specialFeatures.lenderCredits !== '$0') {
      addText(`Lender Credits: ${structuredData.specialFeatures.lenderCredits}`, 10);
    }
  }

  // Notes
  if (structuredData.notes && structuredData.notes.trim()) {
    addSectionHeader('ADDITIONAL INFORMATION & NOTES');
    addText(structuredData.notes, 10);
  }

  // Missing Information
  if (structuredData.missingInformation && structuredData.missingInformation.length > 0) {
    addSectionHeader('⚠️ MISSING INFORMATION REQUIRED');
    
    const critical = structuredData.missingInformation.filter(m => m.priority === 'critical');
    const important = structuredData.missingInformation.filter(m => m.priority === 'important');
    const recommended = structuredData.missingInformation.filter(m => m.priority === 'recommended');

    if (critical.length > 0) {
      addText('CRITICAL (Required for Processing):', 10, true, [200, 0, 0]);
      critical.forEach(item => {
        addText(`• ${item.item}`, 9);
        addText(`  Question: ${item.question}`, 9, false, [100, 100, 100]);
        yPos += 0.05;
      });
    }

    if (important.length > 0) {
      yPos += 0.1;
      addText('IMPORTANT (Needed Soon):', 10, true, [200, 100, 0]);
      important.forEach(item => {
        addText(`• ${item.item}`, 9);
        addText(`  Question: ${item.question}`, 9, false, [100, 100, 100]);
        yPos += 0.05;
      });
    }

    if (recommended.length > 0) {
      yPos += 0.1;
      addText('RECOMMENDED (Helpful):', 10, true, [0, 100, 200]);
      recommended.forEach(item => {
        addText(`• ${item.item}`, 9);
        addText(`  Question: ${item.question}`, 9, false, [100, 100, 100]);
        yPos += 0.05;
      });
    }
  }

  // Footer
  const footerY = pageHeight - marginBottom;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    'This submission email is generated for internal use. All information subject to verification.',
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  return doc;
}

export async function generateSubmissionPDFPreview(
  scenario: Scenario,
  results: CalculatedResults
): Promise<{ pdfUrl: string; filename: string; missingInfo: any[] }> {
  // Get structured data from AI
  const structuredData = await generateSubmissionPDFData(scenario, results);
  
  // Generate PDF
  const doc = await generateSubmissionPDF(scenario, results, structuredData);
  
  // Create filename
  const borrowerLastName = scenario.clientName.split(' ').pop() || 'Borrower';
  const filename = `${borrowerLastName} - Submission Email - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.pdf`;
  
  // Create blob URL
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  
  return {
    pdfUrl,
    filename,
    missingInfo: structuredData.missingInformation || []
  };
}

export async function downloadSubmissionPDF(
  scenario: Scenario,
  results: CalculatedResults
): Promise<void> {
  const { pdfUrl, filename } = await generateSubmissionPDFPreview(scenario, results);
  
  // Create download link
  const link = document.createElement('a');
  link.href = pdfUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(pdfUrl);
}
