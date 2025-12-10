import { jsPDF } from 'jspdf';
import { Scenario } from '../types';

// Guild Mortgage Brand Color
const BRAND_COLOR = '#1f3b83';
const BRAND_COLOR_RGB = [31, 59, 131];

// Locked legal footer text (compliance requirement)
const LEGAL_TEXT = 
  "Equal Housing Lender. Guild Mortgage is an Equal Housing Lender. " +
  "NMLS #3274. This letter is not a commitment to lend. All loans are subject to " +
  "underwriting approval and credit terms. Additional restrictions may apply.";

// Officer information
const OFFICER_INFO = {
  name: "John Creager",
  title: "Loan Officer",
  nmls: "NMLS #2098333",
  phone: "(801) 589-0502",
  email: "jcreager@guildmortgage.net",
  company: "Guild Mortgage"
};

interface PreApprovalData {
  buyer1: string;
  buyer2?: string;
  purchasePrice: number | 'TBD';
  loanAmount: number | 'TBD';
  downPayment?: string; // e.g., "3.5%" or "$20,000"
  loanType: string;
  letterDate?: Date;
  status?: 'Pre-Approval' | 'Pre-Qualification';
  validDays?: number;
  notes?: string;
}

// Helper to get last name
function getLastName(fullName: string): string {
  if (!fullName) return 'Borrower';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || 'Borrower';
}

// Helper to format currency
function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Helper to calculate down payment
function calculateDownPayment(
  purchasePrice: number | 'TBD',
  loanAmount: number | 'TBD',
  manualDownPayment?: string
): string {
  // If manual down payment provided, use it
  if (manualDownPayment && manualDownPayment.trim()) {
    return manualDownPayment.trim();
  }

  // If both are numbers, calculate percentage
  if (typeof purchasePrice === 'number' && typeof loanAmount === 'number' && purchasePrice > 0) {
    const percentDown = Math.max(0, ((purchasePrice - loanAmount) / purchasePrice) * 100);
    return `${percentDown.toFixed(1)}%`;
  }

  return '—';
}

// Helper to format date
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

// Helper to load image as base64
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

// Main PDF generation function
export async function generatePreApprovalPDF(data: PreApprovalData): Promise<void> {
  const {
    buyer1,
    buyer2 = '',
    purchasePrice,
    loanAmount,
    downPayment,
    loanType,
    letterDate = new Date(),
    status = 'Pre-Approval',
    validDays = 60,
    notes = ''
  } = data;

  // Calculate expiration date
  const expiresDate = new Date(letterDate);
  expiresDate.setDate(expiresDate.getDate() + validDays);

  // Format values
  const ppDisplay = typeof purchasePrice === 'number' ? formatCurrency(purchasePrice) : (purchasePrice || '—');
  const laDisplay = typeof loanAmount === 'number' ? formatCurrency(loanAmount) : (loanAmount || '—');
  const dpDisplay = calculateDownPayment(purchasePrice, loanAmount, downPayment);

  // Create PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  // Set margins
  const marginLeft = 0.75;
  const marginRight = 0.75;
  const marginTop = 0.7;
  const pageWidth = 8.5;
  const contentWidth = pageWidth - marginLeft - marginRight;

  let yPos = marginTop;

  // Load images
  const logoBase64 = await loadImageAsBase64('/SE96398_logo_orig.png');
  const headshotBase64 = await loadImageAsBase64('/john_creager_guild.png');

  // Header - Logo (left side)
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', marginLeft, yPos, 2.7, 1.05);
  }

  // Header - Headshot and Contact (right side)
  const rightX = pageWidth - marginRight - 1.0;
  if (headshotBase64) {
    doc.addImage(headshotBase64, 'PNG', rightX, yPos, 1.0, 1.0);
  }

  // Contact info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(OFFICER_INFO.name, pageWidth - marginRight, yPos + 1.15, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.text(`${OFFICER_INFO.title}`, pageWidth - marginRight, yPos + 1.30, { align: 'right' });
  doc.text(OFFICER_INFO.nmls, pageWidth - marginRight, yPos + 1.45, { align: 'right' });
  doc.text(OFFICER_INFO.phone, pageWidth - marginRight, yPos + 1.60, { align: 'right' });
  doc.text(OFFICER_INFO.email, pageWidth - marginRight, yPos + 1.75, { align: 'right' });

  yPos += 1.9;

  // Divider line
  doc.setDrawColor(...BRAND_COLOR_RGB);
  doc.setLineWidth(0.03);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  
  yPos += 0.15;

  // Title
  doc.setTextColor(...BRAND_COLOR_RGB);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Pre-Approval Letter', marginLeft, yPos);
  
  yPos += 0.1;

  // Date
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${formatDate(letterDate)}`, marginLeft, yPos);
  
  yPos += 0.2;

  // Greeting paragraph
  const buyers = buyer1 + (buyer2 ? ` & ${buyer2}` : '');
  const greeting = `Congratulations ${buyers}! Based on the information provided and a review of your documentation, you have been ${status.toLowerCase()} for the home purchase outlined below.`;
  
  doc.setFontSize(11);
  const greetingLines = doc.splitTextToSize(greeting, contentWidth);
  doc.text(greetingLines, marginLeft, yPos);
  yPos += (greetingLines.length * 0.15) + 0.15;

  // Summary Grid
  const gridData = [
    ['Purchase Price', ppDisplay],
    ['Loan Amount', laDisplay],
    ['Down Payment', dpDisplay],
    ['Loan Type', loanType || '—'],
    ['Valid Through', formatDate(expiresDate)]
  ];

  const labelWidth = 2.2;
  const valueWidth = 4.8;
  const rowHeight = 0.35;

  gridData.forEach((row, index) => {
    const rowY = yPos + (index * rowHeight);
    
    // Label cell (blue background, white text)
    doc.setFillColor(...BRAND_COLOR_RGB);
    doc.rect(marginLeft, rowY, labelWidth, rowHeight, 'F');
    
    // Value cell (alternating background)
    if (index % 2 === 0) {
      doc.setFillColor(245, 245, 245); // whitesmoke
    } else {
      doc.setFillColor(255, 255, 255); // white
    }
    doc.rect(marginLeft + labelWidth, rowY, valueWidth, rowHeight, 'F');
    
    // Grid borders
    doc.setDrawColor(211, 211, 211); // lightgrey
    doc.setLineWidth(0.003);
    doc.rect(marginLeft, rowY, labelWidth + valueWidth, rowHeight, 'S');
    
    // Text - Label (white)
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(row[0], marginLeft + 0.1, rowY + 0.23);
    
    // Text - Value (black)
    doc.setTextColor(0, 0, 0);
    doc.text(row[1], marginLeft + labelWidth + 0.1, rowY + 0.23);
  });

  yPos += (gridData.length * rowHeight) + 0.2;

  // Assurances paragraph
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const assurances = "This pre-approval is based on current market conditions and the information and documentation provided. Rate is floating and subject to change until locked. This letter is typically valid for 60 days from the date shown above, subject to satisfactory appraisal, title, and final underwriting approval.";
  const assuranceLines = doc.splitTextToSize(assurances, contentWidth);
  doc.text(assuranceLines, marginLeft, yPos);
  yPos += (assuranceLines.length * 0.14) + 0.1;

  // Notes (if provided)
  if (notes) {
    doc.setFont('helvetica', 'bold');
    const noteText = `Notes: `;
    doc.text(noteText, marginLeft, yPos);
    const noteWidth = doc.getTextWidth(noteText);
    
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(notes, contentWidth - noteWidth);
    doc.text(notesLines[0], marginLeft + noteWidth, yPos);
    for (let i = 1; i < notesLines.length; i++) {
      yPos += 0.14;
      doc.text(notesLines[i], marginLeft, yPos);
    }
    yPos += 0.2;
  } else {
    yPos += 0.1;
  }

  // Signature block
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const sigLines = [
    OFFICER_INFO.name,
    OFFICER_INFO.title,
    OFFICER_INFO.nmls,
    OFFICER_INFO.company,
    OFFICER_INFO.phone,
    OFFICER_INFO.email
  ];
  sigLines.forEach(line => {
    doc.text(line, marginLeft, yPos);
    yPos += 0.13;
  });

  yPos += 0.1;

  // Legal footer
  // Draw line above footer
  doc.setDrawColor(211, 211, 211);
  doc.setLineWidth(0.007);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  
  yPos += 0.08;

  // Footer text
  doc.setTextColor(128, 128, 128);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const legalLines = doc.splitTextToSize(LEGAL_TEXT, contentWidth);
  doc.text(legalLines, marginLeft, yPos);

  // Generate filename and save
  const lastName = getLastName(buyer1);
  const filename = `${lastName} - Pre-Approval Letter.pdf`;
  
  doc.save(filename);
}

// Convenience function to generate from Scenario
export async function generatePreApprovalFromScenario(scenario: Scenario): Promise<void> {
  const data: PreApprovalData = {
    buyer1: scenario.clientName,
    buyer2: '', // Could add a field for this
    purchasePrice: scenario.isAddressTBD ? 'TBD' : scenario.purchasePrice,
    loanAmount: scenario.isAddressTBD ? 'TBD' : (scenario.purchasePrice - scenario.downPaymentAmount),
    downPayment: `${scenario.downPaymentPercent}%`,
    loanType: scenario.loanType,
    letterDate: new Date(),
    status: 'Pre-Approval',
    validDays: 60,
    notes: ''
  };

  await generatePreApprovalPDF(data);
}
