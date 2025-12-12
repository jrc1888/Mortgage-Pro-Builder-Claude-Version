import { jsPDF } from 'jspdf';
import { Scenario } from '../types';

// Guild Mortgage Brand Color
const BRAND_COLOR = '#1f3b83';
const BRAND_COLOR_R = 31;
const BRAND_COLOR_G = 59;
const BRAND_COLOR_B = 131;

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
  downPayment?: string;
  loanType: string;
  letterDate?: Date;
  status?: 'Pre-Approval' | 'Pre-Qualification';
  validDays?: number;
  notes?: string;
}

// Helper functions
function getLastName(fullName: string): string {
  if (!fullName) return 'Borrower';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || 'Borrower';
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function calculateDownPayment(
  purchasePrice: number | 'TBD',
  loanAmount: number | 'TBD',
  manualDownPayment?: string
): string {
  if (manualDownPayment && manualDownPayment.trim()) {
    return manualDownPayment.trim();
  }
  if (typeof purchasePrice === 'number' && typeof loanAmount === 'number' && purchasePrice > 0) {
    const percentDown = Math.max(0, ((purchasePrice - loanAmount) / purchasePrice) * 100);
    return `${percentDown.toFixed(1)}%`;
  }
  return '—';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
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

// Main PDF generation - PROPERLY SPACED TO FILL PAGE
async function generatePDFWithData(data: PreApprovalData): Promise<jsPDF> {
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

  // Page settings - good margins
  const marginLeft = 0.75;
  const marginRight = 0.75;
  const marginTop = 0.65;
  const pageWidth = 8.5;
  const contentWidth = pageWidth - marginLeft - marginRight; // 7.0"

  let yPos = marginTop;

  // Load images
  const logoBase64 = await loadImageAsBase64('/SE96398_logo_orig.png');
  const headshotBase64 = await loadImageAsBase64('/john_creager_guild.png');

  // === HEADER SECTION === (matches Fackrell)
  // Logo - left side
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', marginLeft, yPos, 2.0, 0.78);
  }

  // Headshot - right side
  const headshotX = pageWidth - marginRight - 0.88;
  if (headshotBase64) {
    doc.addImage(headshotBase64, 'PNG', headshotX, yPos, 0.88, 0.88);
  }

  // Contact info - right aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  let contactY = yPos + 1.0;
  doc.text(OFFICER_INFO.name, pageWidth - marginRight, contactY, { align: 'right' });
  
  contactY += 0.135;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Loan Officer', pageWidth - marginRight, contactY, { align: 'right' });
  
  contactY += 0.125;
  doc.text(OFFICER_INFO.nmls, pageWidth - marginRight, contactY, { align: 'right' });
  
  contactY += 0.125;
  doc.text(OFFICER_INFO.phone, pageWidth - marginRight, contactY, { align: 'right' });
  
  contactY += 0.125;
  doc.text(OFFICER_INFO.email, pageWidth - marginRight, contactY, { align: 'right' });

  yPos += 1.68; // Header height

  // === DIVIDER === (prominent blue line)
  doc.setDrawColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.setLineWidth(0.045);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  
  yPos += 0.28; // Space after divider

  // === TITLE === (bold and large)
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Pre-Approval Letter', marginLeft, yPos);
  
  yPos += 0.22; // Space after title

  // === DATE ===
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${formatDate(letterDate)}`, marginLeft, yPos);
  
  yPos += 0.32; // Space before greeting

  // === GREETING PARAGRAPH ===
  const buyers = buyer1 + (buyer2 ? ` & ${buyer2}` : '');
  const greeting = `Congratulations ${buyers}! Based on the information provided and a review of your documentation, you have been ${status.toLowerCase()} for the home purchase outlined below.`;
  
  doc.setFontSize(11);
  const greetingLines = doc.splitTextToSize(greeting, contentWidth);
  doc.text(greetingLines, marginLeft, yPos);
  yPos += (greetingLines.length * 0.17);
  
  yPos += 0.28; // Space before table

  // === SUMMARY TABLE === (well-proportioned)
  const gridData = [
    ['Purchase Price', ppDisplay],
    ['Loan Amount', laDisplay],
    ['Down Payment', dpDisplay],
    ['Loan Type', loanType || '—'],
    ['Valid Through', formatDate(expiresDate)]
  ];

  const labelWidth = 2.2;
  const valueWidth = 4.8;
  const rowHeight = 0.36;

  gridData.forEach((row, index) => {
    const rowY = yPos + (index * rowHeight);
    
    // Label cell - blue background
    doc.setFillColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
    doc.rect(marginLeft, rowY, labelWidth, rowHeight, 'F');
    
    // Value cell - alternating gray/white
    if (index % 2 === 0) {
      doc.setFillColor(246, 246, 246);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(marginLeft + labelWidth, rowY, valueWidth, rowHeight, 'F');
    
    // Borders
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.004);
    doc.rect(marginLeft, rowY, labelWidth + valueWidth, rowHeight, 'S');
    
    // Label text - white, bold
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(row[0], marginLeft + 0.11, rowY + 0.235);
    
    // Value text - black
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text(row[1], marginLeft + labelWidth + 0.11, rowY + 0.235);
  });

  yPos += (gridData.length * rowHeight);
  yPos += 0.3; // Space after table

  // === ASSURANCES PARAGRAPH ===
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const assurances = "This pre-approval is based on current market conditions and the information and documentation provided. Rate is floating and subject to change until locked. This letter is typically valid for 60 days from the date shown above, subject to satisfactory appraisal, title, and final underwriting approval.";
  const assuranceLines = doc.splitTextToSize(assurances, contentWidth);
  doc.text(assuranceLines, marginLeft, yPos);
  yPos += (assuranceLines.length * 0.145);

  // Optional Notes
  if (notes) {
    yPos += 0.22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const noteText = `Notes: `;
    doc.text(noteText, marginLeft, yPos);
    const noteWidth = doc.getTextWidth(noteText);
    
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(notes, contentWidth - noteWidth);
    doc.text(notesLines[0], marginLeft + noteWidth, yPos);
    for (let i = 1; i < notesLines.length; i++) {
      yPos += 0.145;
      doc.text(notesLines[i], marginLeft, yPos);
    }
    yPos += 0.145;
  }
  
  yPos += 0.35; // Space before signature

  // === SIGNATURE BLOCK ===
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
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
    yPos += 0.145;
  });

  yPos += 0.22; // Space before footer

  // === FOOTER ===
  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.008);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  
  yPos += 0.1;

  // Legal text
  doc.setTextColor(110, 110, 110);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const legalLines = doc.splitTextToSize(LEGAL_TEXT, contentWidth);
  doc.text(legalLines, marginLeft, yPos);

  return doc;
}

// Generate and download PDF
export async function generatePreApprovalPDF(data: PreApprovalData): Promise<void> {
  const doc = await generatePDFWithData(data);
  const lastName = getLastName(data.buyer1);
  const filename = `${lastName} - Pre-Approval Letter.pdf`;
  doc.save(filename);
}

// Generate PDF and return as blob URL for preview
export async function generatePreApprovalPDFPreview(data: PreApprovalData): Promise<{ pdfUrl: string; filename: string }> {
  const doc = await generatePDFWithData(data);
  const lastName = getLastName(data.buyer1);
  const filename = `${lastName} - Pre-Approval Letter.pdf`;
  
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  
  return { pdfUrl, filename };
}

// Convenience function to generate from Scenario
export async function generatePreApprovalFromScenario(scenario: Scenario): Promise<void> {
  const data: PreApprovalData = {
    buyer1: scenario.clientName,
    buyer2: '',
    purchasePrice: scenario.isAddressTBD ? ('TBD' as const) : scenario.purchasePrice,
    loanAmount: scenario.isAddressTBD ? ('TBD' as const) : (scenario.purchasePrice - scenario.downPaymentAmount),
    downPayment: `${scenario.downPaymentPercent}%`,
    loanType: scenario.loanType,
    letterDate: new Date(),
    status: 'Pre-Approval',
    validDays: 60,
    notes: ''
  };

  await generatePreApprovalPDF(data);
}
