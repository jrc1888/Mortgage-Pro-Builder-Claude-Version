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

// Convert pixels to inches (assuming 72 DPI)
function pxToInches(px: number): number {
  return px / 72;
}

// Main PDF generation function following EXACT specification
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

  // Create PDF - EXACT PAGE SETTINGS
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  // EXACT MARGINS as specified
  const marginLeft = 0.75;
  const marginRight = 0.75;
  const marginTop = 0.7;
  const pageWidth = 8.5;
  const contentWidth = pageWidth - marginLeft - marginRight; // 7.0"

  let yPos = marginTop;

  // Load images
  const logoBase64 = await loadImageAsBase64('/SE96398_logo_orig.png');
  const headshotBase64 = await loadImageAsBase64('/john_creager_guild.png');

  // 1. HEADER SECTION
  // 1B. Logo - max 2.7" x 1.05", left-aligned
  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', marginLeft, yPos, 2.7, 1.05);
  }

  // 1C. Headshot - max 1.0" x 1.0", right-aligned
  const headshotX = pageWidth - marginRight - 1.0;
  if (headshotBase64) {
    doc.addImage(headshotBase64, 'PNG', headshotX, yPos, 1.0, 1.0);
  }

  // Contact block - right-aligned, font 9pt, leading 11
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const contactStartY = yPos + 1.05;
  let contactY = contactStartY;
  
  doc.text(OFFICER_INFO.name, pageWidth - marginRight, contactY, { align: 'right' });
  contactY += 11 / 72; // 11pt leading
  
  doc.setFont('helvetica', 'normal');
  doc.text(OFFICER_INFO.title, pageWidth - marginRight, contactY, { align: 'right' });
  contactY += 11 / 72;
  doc.text(OFFICER_INFO.nmls, pageWidth - marginRight, contactY, { align: 'right' });
  contactY += 11 / 72;
  doc.text(OFFICER_INFO.phone, pageWidth - marginRight, contactY, { align: 'right' });
  contactY += 11 / 72;
  doc.text(OFFICER_INFO.email, pageWidth - marginRight, contactY, { align: 'right' });

  // 1D. Spacing after header: 6px
  yPos += 1.05 + (5 * 11 / 72) + pxToInches(6);

  // 2. THICK DIVIDER LINE - 3px, brand blue
  doc.setDrawColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.setLineWidth(3 / 72); // 3px
  doc.line(marginLeft, yPos, marginLeft + 7.0, yPos);
  
  // Spacing after: 10px
  yPos += pxToInches(10);

  // 3. TITLE BLOCK - 18pt, Helvetica-Bold, brand blue
  doc.setTextColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Pre-Approval Letter', marginLeft, yPos);
  
  // Spacing below title: 4px
  yPos += pxToInches(4);

  // Date line - 10pt
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${formatDate(letterDate)}`, marginLeft, yPos);
  
  // Spacing below date: 10px
  yPos += pxToInches(10);

  // 4. INTRODUCTORY PARAGRAPH - 11pt, leading 15
  const buyers = buyer1 + (buyer2 ? ` & ${buyer2}` : '');
  const greeting = `Congratulations ${buyers}! Based on the information provided and a review of your documentation, you have been ${status.toLowerCase()} for the home purchase outlined below.`;
  
  doc.setFontSize(11);
  const greetingLines = doc.splitTextToSize(greeting, contentWidth);
  doc.text(greetingLines, marginLeft, yPos);
  yPos += (greetingLines.length * 15 / 72); // 15pt leading
  
  // Spacing after paragraph: 10px
  yPos += pxToInches(10);

  // 5. SUMMARY GRID TABLE - 2.2" x 4.8" columns, 5 rows
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
    
    // Left column - brand blue background, white text, 11pt
    doc.setFillColor(BRAND_COLOR_R, BRAND_COLOR_G, BRAND_COLOR_B);
    doc.rect(marginLeft, rowY, labelWidth, rowHeight, 'F');
    
    // Right column - alternating whitesmoke/white
    if (index % 2 === 0) {
      doc.setFillColor(245, 245, 245); // whitesmoke
    } else {
      doc.setFillColor(255, 255, 255); // white
    }
    doc.rect(marginLeft + labelWidth, rowY, valueWidth, rowHeight, 'F');
    
    // Grid borders - 0.25pt light grey
    doc.setDrawColor(211, 211, 211);
    doc.setLineWidth(0.25 / 72);
    doc.rect(marginLeft, rowY, labelWidth + valueWidth, rowHeight, 'S');
    
    // Text - Label (white, 11pt)
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(row[0], marginLeft + 0.1, rowY + 0.23);
    
    // Text - Value (black, 11pt)
    doc.setTextColor(0, 0, 0);
    doc.text(row[1], marginLeft + labelWidth + 0.1, rowY + 0.23);
  });

  yPos += (gridData.length * rowHeight);
  
  // Spacing after grid: 12px
  yPos += pxToInches(12);

  // 6. ASSURANCES PARAGRAPH - 10.5pt, leading 14
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const assurances = "This pre-approval is based on current market conditions and the information and documentation provided. Rate is floating and subject to change until locked. This letter is typically valid for 60 days from the date shown above, subject to satisfactory appraisal, title, and final underwriting approval.";
  const assuranceLines = doc.splitTextToSize(assurances, contentWidth);
  doc.text(assuranceLines, marginLeft, yPos);
  yPos += (assuranceLines.length * 14 / 72); // 14pt leading

  // Optional Notes - spacing before: 6px, then 10.5pt/14pt leading
  if (notes) {
    yPos += pxToInches(6);
    doc.setFont('helvetica', 'bold');
    const noteText = `Notes: `;
    doc.text(noteText, marginLeft, yPos);
    const noteWidth = doc.getTextWidth(noteText);
    
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(notes, contentWidth - noteWidth);
    doc.text(notesLines[0], marginLeft + noteWidth, yPos);
    for (let i = 1; i < notesLines.length; i++) {
      yPos += 14 / 72;
      doc.text(notesLines[i], marginLeft, yPos);
    }
    yPos += 14 / 72;
  }
  
  // Spacing after assurances/notes: 14px
  yPos += pxToInches(14);

  // 7. SIGNATURE BLOCK - 10.5pt, leading 13
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
    yPos += 13 / 72; // 13pt leading
  });

  // Spacing after signature: 10px
  yPos += pxToInches(10);

  // 8. FOOTER SECTION
  // 8A. Thin divider - 0.5pt, light grey
  doc.setDrawColor(211, 211, 211);
  doc.setLineWidth(0.5 / 72);
  doc.line(marginLeft, yPos, marginLeft + 7.0, yPos);
  
  // Spacing after: 4px
  yPos += pxToInches(4);

  // 8B. Legal text - 7.5pt, leading 10, grey
  doc.setTextColor(128, 128, 128);
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
