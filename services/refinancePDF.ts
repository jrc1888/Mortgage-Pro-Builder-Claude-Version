import { jsPDF } from 'jspdf';
import { Scenario, CalculatedResults } from '../types';
import { BRANDING } from '../config/branding';
import { formatMoney, formatPercent, formatDate } from '../utils/formatting';
import {
  calculateCurrentLoanStatus,
  calculatePayoff,
  calculateBreakEven,
  calculateTotalInterest,
  calculateTermComparison,
  calculatePrepaymentScenario
} from './refinanceCalculations';

// Use branding configuration
const BRAND_COLOR = BRANDING.brandColor;
const BRAND_COLOR_R = BRANDING.brandColorRGB.r;
const BRAND_COLOR_G = BRANDING.brandColorRGB.g;
const BRAND_COLOR_B = BRANDING.brandColorRGB.b;
const LEGAL_TEXT = BRANDING.legalFooter;
const OFFICER_INFO = BRANDING.officer;

// Helper function to get last name from full name
function getLastName(fullName: string): string {
  if (!fullName) return 'Borrower';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || 'Borrower';
}

// Format date for PDF (Month Day, Year)
function formatDateForPDF(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';
  return dateObj.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

async function loadImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading image:', error);
    return '';
  }
}

// Get image dimensions from base64 data
function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = base64;
  });
}

// Calculate dimensions preserving aspect ratio
function calculateImageDimensions(
  originalWidth: number,
  originalHeight: number,
  targetWidth?: number,
  targetHeight?: number
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;
  
  if (targetWidth && !targetHeight) {
    // Calculate height based on target width
    return { width: targetWidth, height: targetWidth / aspectRatio };
  } else if (targetHeight && !targetWidth) {
    // Calculate width based on target height
    return { width: targetHeight * aspectRatio, height: targetHeight };
  } else if (targetWidth && targetHeight) {
    // Use the dimension that maintains aspect ratio better
    const widthBasedHeight = targetWidth / aspectRatio;
    const heightBasedWidth = targetHeight * aspectRatio;
    
    if (widthBasedHeight <= targetHeight) {
      return { width: targetWidth, height: widthBasedHeight };
    } else {
      return { width: heightBasedWidth, height: targetHeight };
    }
  }
  
  // Default: use original dimensions
  return { width: originalWidth, height: originalHeight };
}

interface RefinanceAnalysisData {
  scenario: Scenario;
  results: CalculatedResults;
  loanStatus: ReturnType<typeof calculateCurrentLoanStatus>;
  payoff: ReturnType<typeof calculatePayoff>;
  breakEven: ReturnType<typeof calculateBreakEven>;
  interestComparison: {
    remainingInterestCurrent: number;
    totalInterestNew: number;
    netSavings: number;
  } | null;
  termComparison: {
    term30: ReturnType<typeof calculateTermComparison>;
    term15: ReturnType<typeof calculateTermComparison> & { yearsSaved: number; interestSaved: number; monthlyDifference: number };
  };
  prepaymentScenarios: {
    matchingPayment: ReturnType<typeof calculatePrepaymentScenario>;
    halfDifference: ReturnType<typeof calculatePrepaymentScenario>;
    base30YearPayment: number;
    base15YearPayment: number;
    difference: number;
  } | null;
  currentMonthlyPayment: number;
  monthlySavings: number;
  parsedGoals?: any; // Optional parsed goals from AI to customize PDF
}

async function generateRefinancePDFWithData(data: RefinanceAnalysisData): Promise<jsPDF> {
  const { scenario, results, loanStatus, payoff, breakEven, interestComparison, termComparison, prepaymentScenarios, currentMonthlyPayment, monthlySavings, parsedGoals } = data;
  
  // Extract customization instructions from parsed goals
  const focusAreas = parsedGoals?.focusAreas || [];
  const emphasizeMetrics = parsedGoals?.emphasizeMetrics || [];
  const tone = parsedGoals?.tone || 'professional';
  const keyMessages = parsedGoals?.keyMessages || [];
  const dataHighlights = parsedGoals?.dataHighlights || {};
  const skipSections = parsedGoals?.skipSections || [];

  // Create PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  // Page settings - optimized for 2 pages
  const marginLeft = 0.6;
  const marginRight = 0.6;
  const marginTop = 0.5;
  const marginBottom = 0.4;
  const pageWidth = 8.5;
  const pageHeight = 11;
  const contentWidth = pageWidth - marginLeft - marginRight;

  let yPos = marginTop;

  // Load images
  const logoBase64 = await loadImageAsBase64('/SE96398_logo_orig.png');
  const headshotBase64 = await loadImageAsBase64('/john_creager_guild.png');

  // === PAGE 1: HEADER ===
  if (logoBase64) {
    try {
      const logoDims = await getImageDimensions(logoBase64);
      const logoDisplayDims = calculateImageDimensions(logoDims.width, logoDims.height, 2.4);
      doc.addImage(logoBase64, 'PNG', marginLeft, yPos, logoDisplayDims.width, logoDisplayDims.height);
    } catch (error) {
      // Fallback to default dimensions if image loading fails
      console.warn('Failed to get logo dimensions, using default:', error);
      doc.addImage(logoBase64, 'PNG', marginLeft, yPos, 2.4, 0.9);
    }
  }

  // Headshot - right side, aligned with right margin boundary (preserve aspect ratio)
  if (headshotBase64) {
    try {
      const headshotDims = await getImageDimensions(headshotBase64);
      const headshotDisplayDims = calculateImageDimensions(headshotDims.width, headshotDims.height, 1.0);
      // Position so right edge aligns with right margin: pageWidth - marginRight - width
      const headshotX = pageWidth - marginRight - headshotDisplayDims.width;
      doc.addImage(headshotBase64, 'PNG', headshotX, yPos, headshotDisplayDims.width, headshotDisplayDims.height);
    } catch (error) {
      // Fallback to default dimensions if image loading fails
      console.warn('Failed to get headshot dimensions, using default:', error);
      const headshotX = pageWidth - marginRight - 1.0;
      doc.addImage(headshotBase64, 'PNG', headshotX, yPos, 1.0, 1.0);
    }
  }

  // Contact info - condensed
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  let contactY = yPos + 1.1;
  doc.text(OFFICER_INFO.name, pageWidth - marginRight, contactY, { align: 'right' });
  
  contactY += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(OFFICER_INFO.phone, pageWidth - marginRight, contactY, { align: 'right' });
  
  contactY += 0.15;
  doc.text(OFFICER_INFO.email, pageWidth - marginRight, contactY, { align: 'right' });
  
  contactY += 0.15;
  doc.text(OFFICER_INFO.nmls, pageWidth - marginRight, contactY, { align: 'right' });

  yPos = contactY + 0.35;

  // === HERO TITLE ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.text('Your Refinance Opportunity', marginLeft, yPos);
  
  yPos += 0.25;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(`${scenario.clientName} • ${formatDateForPDF(new Date())}`, marginLeft, yPos);
  
  yPos += 0.35;

  // === KEY BENEFITS BOX - Prominent Highlight ===
  doc.setFillColor(240, 248, 255); // Light blue background
  doc.roundedRect(marginLeft, yPos, contentWidth, 0.9, 0.05, 0.05, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.text('Why Refinance Now?', marginLeft + 0.1, yPos + 0.2);
  
  yPos += 0.25;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  
  // Customize benefits based on parsed goals
  const benefits = [];
  
  // If monthly savings is emphasized in goals, make it more prominent
  const emphasizeMonthlySavings = emphasizeMetrics.includes('monthly_savings') || focusAreas.includes('monthly_savings');
  
  if (monthlySavings > 0) {
    if (emphasizeMonthlySavings && dataHighlights.monthly_savings) {
      // Use AI-generated highlight if available
      benefits.push(`✓ ${dataHighlights.monthly_savings}`);
    } else {
      benefits.push(`✓ Save ${formatMoney(monthlySavings)} every month - that's ${formatMoney(monthlySavings * 12)} per year`);
    }
  }
  
  // Customize break-even message based on goals
  const emphasizeBreakEven = emphasizeMetrics.includes('break_even_months') || focusAreas.includes('break_even');
  
  if (breakEven && breakEven.breakEvenMonths !== Infinity && breakEven.breakEvenMonths < 60) {
    if (emphasizeBreakEven && dataHighlights.break_even) {
      // Use AI-generated highlight if available
      benefits.push(`✓ ${dataHighlights.break_even}`);
    } else {
      benefits.push(`✓ Break even in just ${breakEven.breakEvenMonths} months (${breakEven.breakEvenYears.toFixed(1)} years)`);
    }
  }
  
  // Customize interest savings message based on goals
  const emphasizeInterestSavings = emphasizeMetrics.includes('total_interest_savings') || focusAreas.includes('interest_reduction');
  
  if (interestComparison && interestComparison.netSavings > 0) {
    if (emphasizeInterestSavings && dataHighlights.total_interest_savings) {
      benefits.push(`✓ ${dataHighlights.total_interest_savings}`);
    } else {
      benefits.push(`✓ Save ${formatMoney(interestComparison.netSavings)} in total interest over the life of the loan`);
    }
  }
  
  // Add any custom key messages from parsed goals
  if (keyMessages && keyMessages.length > 0) {
    keyMessages.forEach((msg: string) => {
      if (msg && msg.trim()) {
        benefits.push(`✓ ${msg}`);
      }
    });
  }
  
  if (benefits.length === 0) {
    benefits.push('✓ Lower your interest rate and improve your financial position');
  }

  benefits.forEach((benefit, idx) => {
    if (yPos > marginTop + 0.85) {
      // Split if needed
      const lines = doc.splitTextToSize(benefit, contentWidth - 0.2);
      doc.text(lines[0], marginLeft + 0.1, yPos);
      yPos += 0.16;
    } else {
      doc.text(benefit, marginLeft + 0.1, yPos);
      yPos += 0.16;
    }
  });

  yPos += 0.4;

  // === MONTHLY PAYMENT COMPARISON - Side by Side ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.text('Monthly Payment Comparison', marginLeft, yPos);
  
  yPos += 0.22;

  // Two-column layout
  const col1X = marginLeft;
  const col2X = marginLeft + contentWidth / 2 + 0.15;
  const boxWidth = contentWidth / 2 - 0.15;

  // Current Loan Box
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(col1X, yPos, boxWidth, 0.85, 0.05, 0.05, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.005);
  doc.roundedRect(col1X, yPos, boxWidth, 0.85, 0.05, 0.05, 'S');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Your Current Loan', col1X + 0.1, yPos + 0.15);
  
  // Calculate current full payment for PDF
  const currentFullPayment = currentMonthlyPayment; // This should already be full payment from RefiAnalysisTab
  // Calculate new full payment
  const newFullPayment = results.totalMonthlyPayment || (
    results.monthlyPrincipalAndInterest + 
    results.monthlyTax + 
    results.monthlyInsurance + 
    results.monthlyMI + 
    results.monthlyHOA + 
    results.monthlyDPAPayment + 
    (results.monthlyDPA2Payment || 0)
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(formatMoney(currentFullPayment), col1X + 0.1, yPos + 0.4);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Rate: ${formatPercent(scenario.currentLoan?.originalRate || 0, 3)}`, col1X + 0.1, yPos + 0.6);
  doc.text(`Balance: ${formatMoney(loanStatus?.currentPrincipalBalance || 0)}`, col1X + 0.1, yPos + 0.75);

  // New Loan Box - Highlighted
  doc.setFillColor(230, 245, 255);
  doc.roundedRect(col2X, yPos, boxWidth, 0.85, 0.05, 0.05, 'F');
  doc.setDrawColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.setLineWidth(0.008);
  doc.roundedRect(col2X, yPos, boxWidth, 0.85, 0.05, 0.05, 'S');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.text('Your New Loan', col2X + 0.1, yPos + 0.15);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.text(formatMoney(newFullPayment), col2X + 0.1, yPos + 0.4);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Rate: ${formatPercent(scenario.interestRate, 3)}`, col2X + 0.1, yPos + 0.6);
  doc.text(`Amount: ${formatMoney(results.totalLoanAmount)}`, col2X + 0.1, yPos + 0.75);

  // Monthly Savings Callout
  if (monthlySavings > 0) {
    yPos += 1.0;
    doc.setFillColor(232, 245, 233); // Light green
    doc.roundedRect(marginLeft, yPos, contentWidth, 0.5, 0.05, 0.05, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(46, 125, 50); // Dark green
    doc.text(`You'll Save ${formatMoney(monthlySavings)} Every Month`, marginLeft + 0.1, yPos + 0.2);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`That's ${formatMoney(monthlySavings * 12)} per year in your pocket!`, marginLeft + 0.1, yPos + 0.4);
  } else if (monthlySavings < 0) {
    yPos += 1.0;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Note: Your payment will increase by ${formatMoney(Math.abs(monthlySavings))}/month to save interest long-term`, marginLeft, yPos);
  }

  yPos += 0.6;

  // === BREAK-EVEN ANALYSIS ===
  if (breakEven && breakEven.breakEvenMonths !== Infinity) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('When Will You Break Even?', marginLeft, yPos);
    
    yPos += 0.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    const breakEvenText = `Your total refinance costs are ${formatMoney(breakEven.totalCosts)}. ` +
      `With monthly savings of ${formatMoney(breakEven.monthlySavings)}, ` +
      `you'll recover these costs in just ${breakEven.breakEvenMonths} months (${breakEven.breakEvenYears.toFixed(1)} years). ` +
      `After ${formatDateForPDF(breakEven.breakEvenDate)}, every dollar you save goes straight into your pocket!`;
    
    const beLines = doc.splitTextToSize(breakEvenText, contentWidth);
    doc.text(beLines, marginLeft, yPos);
    yPos += beLines.length * 0.16 + 0.2;
  }

  // === TOTAL INTEREST SAVINGS ===
  if (interestComparison && interestComparison.netSavings > 0) {
    doc.setFillColor(255, 251, 230); // Light yellow
    doc.roundedRect(marginLeft, yPos, contentWidth, 0.5, 0.05, 0.05, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(183, 110, 0); // Dark orange/yellow
    doc.text('Lifetime Interest Savings', marginLeft + 0.1, yPos + 0.2);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`By refinancing, you'll save ${formatMoney(interestComparison.netSavings)} in total interest ` +
      `compared to keeping your current loan.`, marginLeft + 0.1, yPos + 0.4);
    
    yPos += 0.65;
  }

  // Check if we need page 2
  if (yPos > pageHeight - marginBottom - 0.8) {
    doc.addPage();
    yPos = marginTop;
  }

  // === PAGE 2: TERM COMPARISON & DETAILS ===
  // Header on page 2
  if (yPos === marginTop) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
    doc.text('Additional Options & Details', marginLeft, yPos);
    yPos += 0.3;
  }

  // === TERM COMPARISON (Condensed) ===
  const actualLoanTermMonths = scenario.loanTermMonths || 360;
  const actualLoanTermYears = Math.round(actualLoanTermMonths / 12);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.text(`${actualLoanTermYears}-Year vs Accelerated Paydown Comparison`, marginLeft, yPos);
  
  yPos += 0.2;

  // Compact comparison boxes
  const termBoxWidth = contentWidth / 2 - 0.1;
  
  // Actual Loan Term Box
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(col1X, yPos, termBoxWidth, 0.9, 0.05, 0.05, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.005);
  doc.roundedRect(col1X, yPos, termBoxWidth, 0.9, 0.05, 0.05, 'S');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(`${actualLoanTermYears}-Year Option`, col1X + 0.08, yPos + 0.15);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Payment: ${formatMoney(termComparison.term30.monthlyPayment)}`, col1X + 0.08, yPos + 0.3);
  doc.text(`Total Interest: ${formatMoney(termComparison.term30.totalInterest)}`, col1X + 0.08, yPos + 0.45);
  doc.text(`Paid off: ${formatDateForPDF(termComparison.term30.payoffDate).split(',')[0]}`, col1X + 0.08, yPos + 0.6);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Lower monthly payment', col1X + 0.08, yPos + 0.8);
  doc.text('More flexibility', col1X + 0.08, yPos + 0.92);

  // Accelerated Paydown Box
  doc.setFillColor(230, 245, 255);
  doc.roundedRect(col2X, yPos, termBoxWidth, 0.9, 0.05, 0.05, 'F');
  doc.setDrawColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.setLineWidth(0.008);
  doc.roundedRect(col2X, yPos, termBoxWidth, 0.9, 0.05, 0.05, 'S');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  // Calculate accelerated term years from payoff date
  const acceleratedPayoffDate = new Date(termComparison.term15.payoffDate);
  const acceleratedTermYears = Math.round((acceleratedPayoffDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  doc.text(`${acceleratedTermYears}-Year Option`, col2X + 0.08, yPos + 0.15);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Payment: ${formatMoney(termComparison.term15.monthlyPayment)}`, col2X + 0.08, yPos + 0.3);
  doc.text(`Total Interest: ${formatMoney(termComparison.term15.totalInterest)}`, col2X + 0.08, yPos + 0.45);
  doc.text(`Paid off: ${formatDateForPDF(termComparison.term15.payoffDate).split(',')[0]}`, col2X + 0.08, yPos + 0.6);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.text(`Save ${formatMoney(termComparison.term15.interestSaved)}`, col2X + 0.08, yPos + 0.8);
  doc.text(`Paid off ${termComparison.term15.yearsSaved} years sooner`, col2X + 0.08, yPos + 0.92);

  yPos += 1.1;

  // === PAYOFF INFORMATION ===
  if (payoff && loanStatus) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Current Loan Payoff', marginLeft, yPos);
    
    yPos += 0.18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Your current loan balance is ${formatMoney(loanStatus.currentPrincipalBalance)}. ` +
      `To pay off your existing loan, you'll need approximately ${formatMoney(payoff.payoffAmount)}, ` +
      `which includes accrued interest through your expected closing date.`, marginLeft, yPos, { maxWidth: contentWidth });
    
    yPos += 0.35;
  }

  // === PREPAYMENT STRATEGY (Condensed) ===
  if (prepaymentScenarios && prepaymentScenarios.difference > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Smart Prepayment Strategy', marginLeft, yPos);
    
    yPos += 0.18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    
    const actualLoanTermYears = Math.round((scenario.loanTermMonths || 360) / 12);
    const prepayText = `With a ${actualLoanTermYears}-year loan, your required payment is ${formatMoney(prepaymentScenarios.difference)} lower than the accelerated paydown option. ` +
      `If you pay the extra ${formatMoney(prepaymentScenarios.difference)} each month, you'll pay off your loan in approximately ${prepaymentScenarios.matchingPayment.payoffYears.toFixed(1)} years ` +
      `and save ${formatMoney(prepaymentScenarios.matchingPayment.interestSaved)} in total interest, while maintaining the flexibility to reduce payments if needed.`;
    
    const prepayLines = doc.splitTextToSize(prepayText, contentWidth);
    doc.text(prepayLines, marginLeft, yPos);
    yPos += prepayLines.length * 0.14 + 0.25;
  }

  // Ensure we don't go past page 2
  if (yPos > pageHeight - marginBottom - 1.2) {
    yPos = pageHeight - marginBottom - 1.2;
  }

  // === SIGNATURE & CONTACT ===
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.005);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  
  yPos += 0.2;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Ready to Move Forward?', marginLeft, yPos);
  
  yPos += 0.25;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const sigLines = [
    OFFICER_INFO.name,
    OFFICER_INFO.title,
    OFFICER_INFO.nmls,
    OFFICER_INFO.phone,
    OFFICER_INFO.email
  ];
  sigLines.forEach(line => {
    doc.text(line, marginLeft, yPos);
    yPos += 0.17;
  });

  yPos += 0.2;

  // === FOOTER ===
  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.01);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  
  yPos += 0.12;

  // Legal text - condensed
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const legalLines = doc.splitTextToSize(LEGAL_TEXT, contentWidth);
  doc.text(legalLines, marginLeft, yPos);
  
  yPos += legalLines.length * 0.1 + 0.08;
  
  // Generated by line
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${formatDateForPDF(new Date())}`, marginLeft, yPos);

  return doc;
}

// Generate and download PDF
export async function generateRefinancePDF(
  scenario: Scenario,
  results: CalculatedResults,
  analysisData: {
    loanStatus: ReturnType<typeof calculateCurrentLoanStatus>;
    payoff: ReturnType<typeof calculatePayoff>;
    breakEven: ReturnType<typeof calculateBreakEven>;
    interestComparison: {
      remainingInterestCurrent: number;
      totalInterestNew: number;
      netSavings: number;
    } | null;
    termComparison: {
      term30: ReturnType<typeof calculateTermComparison>;
      term15: ReturnType<typeof calculateTermComparison> & { yearsSaved: number; interestSaved: number; monthlyDifference: number };
    };
    prepaymentScenarios: {
      matchingPayment: ReturnType<typeof calculatePrepaymentScenario>;
      halfDifference: ReturnType<typeof calculatePrepaymentScenario>;
      base30YearPayment: number;
      base15YearPayment: number;
      difference: number;
    } | null;
    currentMonthlyPayment: number;
    monthlySavings: number;
  }
): Promise<void> {
  const data: RefinanceAnalysisData = {
    scenario,
    results,
    ...analysisData
  };
  
  const doc = await generateRefinancePDFWithData(data);
  const lastName = getLastName(scenario.clientName);
  const filename = `${lastName} - Refinance Analysis.pdf`;
  doc.save(filename);
}

// Generate PDF and return as blob URL for preview
export async function generateRefinancePDFPreview(
  scenario: Scenario,
  results: CalculatedResults,
  analysisData: {
    loanStatus: ReturnType<typeof calculateCurrentLoanStatus>;
    payoff: ReturnType<typeof calculatePayoff>;
    breakEven: ReturnType<typeof calculateBreakEven>;
    interestComparison: {
      remainingInterestCurrent: number;
      totalInterestNew: number;
      netSavings: number;
    } | null;
    termComparison: {
      term30: ReturnType<typeof calculateTermComparison>;
      term15: ReturnType<typeof calculateTermComparison> & { yearsSaved: number; interestSaved: number; monthlyDifference: number };
    };
    prepaymentScenarios: {
      matchingPayment: ReturnType<typeof calculatePrepaymentScenario>;
      halfDifference: ReturnType<typeof calculatePrepaymentScenario>;
      base30YearPayment: number;
      base15YearPayment: number;
      difference: number;
    } | null;
    currentMonthlyPayment: number;
    monthlySavings: number;
  },
  parsedGoals?: any // Optional parsed goals from AI
): Promise<{ pdfUrl: string; filename: string }> {
  const data: RefinanceAnalysisData = {
    scenario,
    results,
    ...analysisData,
    parsedGoals // Include parsed goals in data
  };
  
  const doc = await generateRefinancePDFWithData(data);
  const lastName = getLastName(scenario.clientName);
  const filename = `${lastName} - Refinance Analysis.pdf`;
  
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  
  return { pdfUrl, filename };
}
