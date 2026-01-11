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

  // Utah county-specific property tax rates (after 45% primary residence exemption)
  // Source: Utah State Tax Commission - 2024 rates
  const UTAH_TAX_RATES: { [key: string]: number } = {
    // Major Counties (sorted by population)
    'Salt Lake': 0.0056,
    'Utah': 0.0052,
    'Davis': 0.0053,
    'Weber': 0.0054,
    'Washington': 0.0051,
    'Cache': 0.0049,
    'Summit': 0.0048,
    'Tooele': 0.0050,
    'Iron': 0.0052,
    'Sevier': 0.0051,
    'Sanpete': 0.0049,
    'Carbon': 0.0053,
    'Emery': 0.0050,
    'Grand': 0.0055,
    'San Juan': 0.0048,
    'Uintah': 0.0052,
    'Wasatch': 0.0050,
    'Box Elder': 0.0051,
    'Morgan': 0.0049,
    'Rich': 0.0047,
    'Juab': 0.0050,
    'Millard': 0.0049,
    'Beaver': 0.0048,
    'Piute': 0.0047,
    'Wayne': 0.0047,
    'Garfield': 0.0048,
    'Kane': 0.0049,
    'Duchesne': 0.0051,
    'Daggett': 0.0046,
    'DEFAULT': 0.0052  // Utah state average
  };

  // Comprehensive mapping of ALL Utah cities to their counties
  const UTAH_CITY_TO_COUNTY: { [key: string]: string } = {
    // Salt Lake County
    'salt lake city': 'Salt Lake', 'salt lake': 'Salt Lake', 'slc': 'Salt Lake',
    'west valley city': 'Salt Lake', 'west valley': 'Salt Lake',
    'sandy': 'Salt Lake', 'west jordan': 'Salt Lake', 'south jordan': 'Salt Lake',
    'draper': 'Salt Lake', 'murray': 'Salt Lake', 'taylorsville': 'Salt Lake',
    'riverton': 'Salt Lake', 'cottonwood heights': 'Salt Lake', 'midvale': 'Salt Lake',
    'holladay': 'Salt Lake', 'millcreek': 'Salt Lake', 'herriman': 'Salt Lake',
    'bluffdale': 'Salt Lake', 'south salt lake': 'Salt Lake', 'magna': 'Salt Lake',
    'kearns': 'Salt Lake', 'white city': 'Salt Lake', 'copperton': 'Salt Lake',
    
    // Utah County
    'provo': 'Utah', 'orem': 'Utah', 'lehi': 'Utah', 'american fork': 'Utah',
    'pleasant grove': 'Utah', 'springville': 'Utah', 'spanish fork': 'Utah',
    'payson': 'Utah', 'saratoga springs': 'Utah', 'eagle mountain': 'Utah',
    'lindon': 'Utah', 'mapleton': 'Utah', 'salem': 'Utah', 'santaquin': 'Utah',
    'vineyard': 'Utah', 'cedar hills': 'Utah', 'highland': 'Utah', 'alpine': 'Utah',
    'elk ridge': 'Utah', 'genola': 'Utah', 'goshen': 'Utah', 'woodland hills': 'Utah',
    
    // Davis County
    'layton': 'Davis', 'bountiful': 'Davis', 'farmington': 'Davis', 'kaysville': 'Davis',
    'centerville': 'Davis', 'clearfield': 'Davis', 'clinton': 'Davis', 'syracuse': 'Davis',
    'roy': 'Davis', 'sunset': 'Davis', 'fruit heights': 'Davis', 'south weber': 'Davis',
    'west point': 'Davis', 'woods cross': 'Davis', 'north salt lake': 'Davis',
    
    // Weber County
    'ogden': 'Weber', 'riverdale': 'Weber',
    'south ogden': 'Weber', 'washington terrace': 'Weber', 'north ogden': 'Weber',
    'pleasant view': 'Weber', 'harrisville': 'Weber', 'farr west': 'Weber',
    'plain city': 'Weber', 'hooper': 'Weber', 'west haven': 'Weber', 'uintah': 'Weber',
    'marriott-slaterville': 'Weber', 'huntsville': 'Weber', 'eden': 'Weber',
    
    // Washington County
    'st george': 'Washington', 'st. george': 'Washington', 'saint george': 'Washington',
    'hurricane': 'Washington', 'santa clara': 'Washington', 'ivins': 'Washington',
    'washington': 'Washington', 'leeds': 'Washington', 'la verkin': 'Washington',
    'hildale': 'Washington', 'enterprise': 'Washington', 'toquerville': 'Washington',
    'rockville': 'Washington', 'springdale': 'Washington', 'virgin': 'Washington',
    
    // Cache County
    'logan': 'Cache', 'north logan': 'Cache', 'smithfield': 'Cache', 'hyde park': 'Cache',
    'nibley': 'Cache', 'providence': 'Cache', 'millville': 'Cache', 'river heights': 'Cache',
    'lewiston': 'Cache', 'richmond': 'Cache', 'wellsville': 'Cache', 'cornish': 'Cache',
    'mendon': 'Cache', 'trenton': 'Cache', 'amalga': 'Cache', 'clarkston': 'Cache',
    
    // Summit County
    'park city': 'Summit', 'heber city': 'Summit', 'coalville': 'Summit', 'kamas': 'Summit',
    'francis': 'Summit', 'oakley': 'Summit', 'snyderville': 'Summit', 'hideout': 'Summit',
    
    // Tooele County
    'tooele': 'Tooele', 'grantsville': 'Tooele', 'stansbury park': 'Tooele',
    'wendover': 'Tooele', 'stockton': 'Tooele', 'rush valley': 'Tooele', 'vernon': 'Tooele',
    
    // Iron County
    'cedar city': 'Iron', 'enoch': 'Iron', 'parowan': 'Iron', 'brian head': 'Iron',
    'kanarraville': 'Iron', 'paragonah': 'Iron',
    
    // Box Elder County
    'brigham city': 'Box Elder', 'tremonton': 'Box Elder', 'garland': 'Box Elder',
    'perry': 'Box Elder', 'willard': 'Box Elder', 'bear river city': 'Box Elder',
    'corinne': 'Box Elder', 'elwood': 'Box Elder', 'fielding': 'Box Elder',
    'honeyville': 'Box Elder', 'mantua': 'Box Elder', 'deweyville': 'Box Elder',
    
    // Carbon County
    'price': 'Carbon', 'helper': 'Carbon', 'wellington': 'Carbon', 'scofield': 'Carbon',
    
    // Sanpete County
    'ephraim': 'Sanpete', 'manti': 'Sanpete', 'mount pleasant': 'Sanpete',
    'moroni': 'Sanpete', 'gunnison': 'Sanpete', 'spring city': 'Sanpete',
    'centerfield': 'Sanpete', 'fairview': 'Sanpete', 'fountain green': 'Sanpete',
    
    // Sevier County
    'richfield': 'Sevier', 'monroe': 'Sevier', 'salina': 'Sevier', 'glenwood': 'Sevier',
    'elsinore': 'Sevier', 'joseph': 'Sevier', 'aurora': 'Sevier', 'redmond': 'Sevier',
    
    // Uintah County
    'vernal': 'Uintah', 'naples': 'Uintah', 'ballard': 'Uintah',
    
    // Wasatch County
    'heber': 'Wasatch', 'midway': 'Wasatch', 'charleston': 'Wasatch', 'daniel': 'Wasatch',
    'interlaken': 'Wasatch', 'wallsburg': 'Wasatch', 'independence': 'Wasatch',
    
    // Duchesne County
    'duchesne': 'Duchesne', 'roosevelt': 'Duchesne', 'myton': 'Duchesne', 'tabiona': 'Duchesne',
    
    // Grand County
    'moab': 'Grand', 'castle valley': 'Grand',
    
    // Emery County
    'castle dale': 'Emery', 'huntington': 'Emery', 'ferron': 'Emery', 'green river': 'Emery',
    'orangeville': 'Emery', 'clawson': 'Emery', 'elmo': 'Emery',
    
    // San Juan County
    'blanding': 'San Juan', 'monticello': 'San Juan', 'bluff': 'San Juan', 'mexican hat': 'San Juan',
    
    // Morgan County
    'morgan': 'Morgan', 'mountain green': 'Morgan', 'devils slide': 'Morgan',
    
    // Rich County
    'randolph': 'Rich', 'laketown': 'Rich', 'garden city': 'Rich', 'woodruff': 'Rich',
    
    // Juab County
    'nephi': 'Juab', 'mona': 'Juab', 'eureka': 'Juab', 'rocky ridge': 'Juab',
    
    // Millard County
    'delta': 'Millard', 'fillmore': 'Millard', 'oak city': 'Millard', 'scipio': 'Millard',
    'holden': 'Millard', 'kanosh': 'Millard', 'meadow': 'Millard',
    
    // Beaver County
    'beaver': 'Beaver', 'milford': 'Beaver', 'minersville': 'Beaver',
    
    // Piute County
    'junction': 'Piute', 'marysvale': 'Piute', 'circleville': 'Piute',
    
    // Wayne County
    'loa': 'Wayne', 'lyman': 'Wayne', 'bicknell': 'Wayne', 'torrey': 'Wayne',
    
    // Garfield County
    'panguitch': 'Garfield', 'tropic': 'Garfield', 'boulder': 'Garfield', 'cannonville': 'Garfield',
    'hatch': 'Garfield', 'antimony': 'Garfield', 'escalante': 'Garfield',
    
    // Kane County
    'kanab': 'Kane', 'orderville': 'Kane', 'alton': 'Kane', 'glendale': 'Kane',
    
    // Daggett County
    'manila': 'Daggett', 'dutch john': 'Daggett'
  };

  // Helper function: Map Utah ZIP codes to counties
  // Covers major ZIP code ranges for all 29 Utah counties
  const getCountyFromZip = (zip: string): string | null => {
    const zipNum = parseInt(zip);
    
    // Salt Lake County: 84044-84121, 84123, 84128, 84129, 84130, 84180, 84184, 84190, 84199
    if ((zipNum >= 84044 && zipNum <= 84121) || zipNum === 84123 || zipNum === 84128 || 
        zipNum === 84129 || zipNum === 84130 || zipNum === 84180 || zipNum === 84184 || 
        zipNum === 84190 || zipNum === 84199) return 'Salt Lake';
    
    // Utah County: 84003, 84004, 84005, 84013, 84042, 84043, 84045, 84057, 84058, 84059, 84062, 84601-84606, 84621, 84626, 84653, 84655, 84660, 84663
    if (zipNum === 84003 || zipNum === 84004 || zipNum === 84005 || zipNum === 84013 || 
        zipNum === 84042 || zipNum === 84043 || zipNum === 84045 || zipNum === 84057 || 
        zipNum === 84058 || zipNum === 84059 || zipNum === 84062 || 
        (zipNum >= 84601 && zipNum <= 84606) || zipNum === 84621 || zipNum === 84626 || 
        zipNum === 84653 || zipNum === 84655 || zipNum === 84660 || zipNum === 84663) return 'Utah';
    
    // Davis County: 84010, 84014-84025, 84037, 84040, 84041, 84054, 84056, 84075, 84087
    if (zipNum === 84010 || (zipNum >= 84014 && zipNum <= 84025) || zipNum === 84037 || 
        zipNum === 84040 || zipNum === 84041 || zipNum === 84054 || zipNum === 84056 || 
        zipNum === 84075 || zipNum === 84087) return 'Davis';
    
    // Weber County: 84067, 84201, 84244, 84310, 84401-84409, 84414, 84415
    if (zipNum === 84067 || zipNum === 84201 || zipNum === 84244 || zipNum === 84310 || 
        (zipNum >= 84401 && zipNum <= 84409) || zipNum === 84414 || zipNum === 84415) return 'Weber';
    
    // Washington County: 84720, 84737, 84738, 84741, 84765, 84770, 84771, 84772, 84774, 84779, 84780, 84782, 84783, 84790
    if (zipNum === 84720 || zipNum === 84737 || zipNum === 84738 || zipNum === 84741 || 
        zipNum === 84765 || zipNum === 84770 || zipNum === 84771 || zipNum === 84772 || 
        zipNum === 84774 || zipNum === 84779 || zipNum === 84780 || zipNum === 84782 || 
        zipNum === 84783 || zipNum === 84790) return 'Washington';
    
    // Cache County: 84301, 84304, 84305, 84319, 84321, 84322, 84327, 84333, 84335, 84336, 84337, 84338, 84341
    if (zipNum === 84301 || zipNum === 84304 || zipNum === 84305 || zipNum === 84319 || 
        zipNum === 84321 || zipNum === 84322 || zipNum === 84327 || zipNum === 84333 || 
        zipNum === 84335 || zipNum === 84336 || zipNum === 84337 || zipNum === 84338 || 
        zipNum === 84341) return 'Cache';
    
    // Summit County: 84017, 84032, 84033, 84034, 84036, 84055, 84060, 84068, 84098
    if (zipNum === 84017 || zipNum === 84032 || zipNum === 84033 || zipNum === 84034 || 
        zipNum === 84036 || zipNum === 84055 || zipNum === 84060 || zipNum === 84068 || 
        zipNum === 84098) return 'Summit';
    
    // Tooele County: 84029, 84074, 84083, 84104
    if (zipNum === 84029 || zipNum === 84074 || zipNum === 84083 || zipNum === 84104) return 'Tooele';
    
    // Iron County: 84710, 84719, 84721, 84722, 84754, 84755, 84757, 84759, 84761, 84762
    if (zipNum === 84710 || zipNum === 84719 || zipNum === 84721 || zipNum === 84722 || 
        zipNum === 84754 || zipNum === 84755 || zipNum === 84757 || zipNum === 84759 || 
        zipNum === 84761 || zipNum === 84762) return 'Iron';
    
    // Box Elder County: 84302, 84307, 84312, 84313, 84314, 84316, 84317, 84320, 84324, 84325, 84328, 84329, 84330, 84332, 84334, 84339
    if (zipNum === 84302 || zipNum === 84307 || zipNum === 84312 || zipNum === 84313 || 
        zipNum === 84314 || zipNum === 84316 || zipNum === 84317 || zipNum === 84320 || 
        zipNum === 84324 || zipNum === 84325 || zipNum === 84328 || zipNum === 84329 || 
        zipNum === 84330 || zipNum === 84332 || zipNum === 84334 || zipNum === 84339) return 'Box Elder';
    
    // Carbon County: 84501, 84520, 84526, 84539
    if (zipNum === 84501 || zipNum === 84520 || zipNum === 84526 || zipNum === 84539) return 'Carbon';
    
    // Sanpete County: 84622, 84623, 84624, 84627, 84628, 84629, 84630, 84631, 84632, 84633, 84634, 84635, 84636, 84637, 84638, 84643, 84645, 84646, 84647, 84649
    if (zipNum === 84622 || zipNum === 84623 || zipNum === 84624 || zipNum === 84627 || 
        zipNum === 84628 || zipNum === 84629 || zipNum === 84630 || zipNum === 84631 || 
        zipNum === 84632 || zipNum === 84633 || zipNum === 84634 || zipNum === 84635 || 
        zipNum === 84636 || zipNum === 84637 || zipNum === 84638 || zipNum === 84643 || 
        zipNum === 84645 || zipNum === 84646 || zipNum === 84647 || zipNum === 84649) return 'Sanpete';
    
    // Sevier County: 84654, 84701, 84713, 84723, 84724, 84729, 84732, 84744, 84766
    if (zipNum === 84654 || zipNum === 84701 || zipNum === 84713 || zipNum === 84723 || 
        zipNum === 84724 || zipNum === 84729 || zipNum === 84732 || zipNum === 84744 || 
        zipNum === 84766) return 'Sevier';
    
    // Uintah County: 84007, 84046, 84072, 84073, 84076, 84078, 84085
    if (zipNum === 84007 || zipNum === 84046 || zipNum === 84072 || zipNum === 84073 || 
        zipNum === 84076 || zipNum === 84078 || zipNum === 84085) return 'Uintah';
    
    // Wasatch County: 84049, 84051, 84052, 84053
    if (zipNum === 84049 || zipNum === 84051 || zipNum === 84052 || zipNum === 84053) return 'Wasatch';
    
    // Duchesne County: 84021, 84026, 84035, 84039, 84066
    if (zipNum === 84021 || zipNum === 84026 || zipNum === 84035 || zipNum === 84039 || 
        zipNum === 84066) return 'Duchesne';
    
    // Grand County: 84515, 84532
    if (zipNum === 84515 || zipNum === 84532) return 'Grand';
    
    // Emery County: 84513, 84516, 84518, 84521, 84522, 84525, 84528, 84531, 84533
    if (zipNum === 84513 || zipNum === 84516 || zipNum === 84518 || zipNum === 84521 || 
        zipNum === 84522 || zipNum === 84525 || zipNum === 84528 || zipNum === 84531 || 
        zipNum === 84533) return 'Emery';
    
    // San Juan County: 84511, 84512, 84534, 84536
    if (zipNum === 84511 || zipNum === 84512 || zipNum === 84534 || zipNum === 84536) return 'San Juan';
    
    // Morgan County: 84050
    if (zipNum === 84050) return 'Morgan';
    
    // Rich County: 84028, 84061, 84063, 84086
    if (zipNum === 84028 || zipNum === 84061 || zipNum === 84063 || zipNum === 84086) return 'Rich';
    
    // Juab County: 84639, 84640, 84648, 84651
    if (zipNum === 84639 || zipNum === 84640 || zipNum === 84648 || zipNum === 84651) return 'Juab';
    
    // Millard County: 84642, 84644, 84656, 84657, 84662, 84664, 84665
    if (zipNum === 84642 || zipNum === 84644 || zipNum === 84656 || zipNum === 84657 || 
        zipNum === 84662 || zipNum === 84664 || zipNum === 84665) return 'Millard';
    
    // Beaver County: 84711, 84712, 84714, 84726, 84735
    if (zipNum === 84711 || zipNum === 84712 || zipNum === 84714 || zipNum === 84726 || 
        zipNum === 84735) return 'Beaver';
    
    // Piute County: 84725, 84728, 84733, 84750
    if (zipNum === 84725 || zipNum === 84728 || zipNum === 84733 || zipNum === 84750) return 'Piute';
    
    // Wayne County: 84716, 84718, 84747, 84775
    if (zipNum === 84716 || zipNum === 84718 || zipNum === 84747 || zipNum === 84775) return 'Wayne';
    
    // Garfield County: 84715, 84717, 84736, 84740, 84742, 84743, 84758, 84764, 84776
    if (zipNum === 84715 || zipNum === 84717 || zipNum === 84736 || zipNum === 84740 || 
        zipNum === 84742 || zipNum === 84743 || zipNum === 84758 || zipNum === 84764 || 
        zipNum === 84776) return 'Garfield';
    
    // Kane County: 84731, 84745, 84746, 84756, 84760, 84763
    if (zipNum === 84731 || zipNum === 84745 || zipNum === 84746 || zipNum === 84756 || 
        zipNum === 84760 || zipNum === 84763) return 'Kane';
    
    // Daggett County: 84023
    if (zipNum === 84023) return 'Daggett';
    
    return null; // ZIP not found in Utah
  };

  // Extract county tax rate from address - works for ALL Utah addresses
  const getCountyTaxRate = (address: string): number => {
    if (!address) return UTAH_TAX_RATES.DEFAULT;
    
    const addressLower = address.toLowerCase().trim();
    
    // Method 1: Try to find county name directly in address
    // Format examples: "123 Main St, Davis County, UT" or "123 Main St, Davis, UT"
    for (const county of Object.keys(UTAH_TAX_RATES)) {
      if (county === 'DEFAULT') continue;
      
      // Match exact county name (with or without "County" suffix)
      const countyPattern = new RegExp(`\\b${county.toLowerCase()}(?:\\s+county)?\\b`, 'i');
      if (countyPattern.test(addressLower)) {
        console.log(`[Property Tax] Found county "${county}" directly in address`);
        return UTAH_TAX_RATES[county];
      }
    }
    
    // Method 2: Match city to county using comprehensive mapping
    for (const [city, county] of Object.entries(UTAH_CITY_TO_COUNTY)) {
      // Use word boundary matching to avoid partial matches
      // e.g., "salt" won't match "salt lake city", but "salt lake" will
      const cityPattern = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (cityPattern.test(addressLower)) {
        console.log(`[Property Tax] Matched city "${city}" to county "${county}"`);
        return UTAH_TAX_RATES[county];
      }
    }
    
    // Method 3: Extract ZIP code and lookup county (if ZIP mapping is available)
    const zipMatch = addressLower.match(/\b(84\d{3})\b/);
    if (zipMatch) {
      const zip = zipMatch[1];
      const county = getCountyFromZip(zip);
      if (county && UTAH_TAX_RATES[county]) {
        console.log(`[Property Tax] Matched ZIP "${zip}" to county "${county}"`);
        return UTAH_TAX_RATES[county];
      }
    }
    
    // Method 4: Fall back to state average if no match found
    console.log(`[Property Tax] No county match found for "${address}", using Utah state average`);
    return UTAH_TAX_RATES.DEFAULT;
  };

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
    estimatedTaxRate: number = 0.0029, // Utah effective rate (after 45% primary residence exemption)
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
          // Utah Primary Residence Property Tax Calculation
          // Step 1: Apply 45% primary residence exemption (only 55% of home value is taxable)
          const taxableValue = enrichedData.price * 0.55;
          
          // Step 2: Get county-specific tax rate based on property address
          // This function checks: county name in address → city to county mapping → ZIP to county → default
          const countyTaxRate = getCountyTaxRate(enrichedData.address || '');
          
          // Step 3: Calculate annual property tax
          const annualTax = taxableValue * countyTaxRate;
          
          // Step 4: Convert to monthly for payment calculation
          enrichedData.propertyTax = annualTax / 12;
          
          // This results in ~0.29% effective rate (0.55 × 0.52% avg = 0.286%)
          // Example: $1,099,900 home in Davis County → $604,945 taxable → $3,206/year → $267/month
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

      // 🆕 Track HOA status more explicitly
      let hoaStatus: 'found' | 'not_found_assumed_zero' | 'confirmed_zero' = 'found';
      
      if (enrichedData.hoa === null || enrichedData.hoa === undefined) {
        enrichedData.hoa = 0; // Assume no HOA
        hoaStatus = 'not_found_assumed_zero';
      } else if (enrichedData.hoa === 0) {
        hoaStatus = 'confirmed_zero';
      }

      // Add data provenance tracking for debugging
      const dataProvenance = {
        price: propertyData.price !== null && propertyData.price !== undefined ? 'extracted' : 'missing',
        propertyTax: propertyData.propertyTax !== null && propertyData.propertyTax !== undefined ? 'extracted' : 'estimated',
        insurance: 'estimated', // Always estimated
        hoa: hoaStatus === 'found' ? 'extracted' : 
             hoaStatus === 'confirmed_zero' ? 'confirmed_zero' : 
             'assumed_zero',
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
      
      // 🆕 HOA display with source/status indicator
      const hoaText = enrichedData.hoa !== null && enrichedData.hoa !== undefined
        ? enrichedData.hoa === 0
          ? `$0/mo (no HOA)${dataProvenance.hoa === 'confirmed_zero' ? ' [confirmed]' : dataProvenance.hoa === 'extracted' ? ' [extracted]' : ''}`
          : `${formatCurrency(enrichedData.hoa)}/mo${dataProvenance.hoa === 'extracted' ? ' [extracted]' : ''}`
        : `$0/mo (assumed)*`;
      responseText += `- HOA: ${hoaText}\n`;
      responseText += `\n`;
      
      responseText += `💰 Your Payment (${borrowerQualification.downPaymentPercent}% down):\n`;
      responseText += `- P&I: ${formatCurrency(payment.principalAndInterest)}\n`;
      responseText += `- Property Tax: ${formatCurrency(payment.propertyTax)}/mo${estimates.includes('Property Tax') ? ' (est)*' : ''}\n`;
      responseText += `- Insurance: ${formatCurrency(payment.insurance)}/mo (est)*\n`;
      if (payment.pmi > 0) {
        responseText += `- PMI: ${formatCurrency(payment.pmi)}/mo\n`;
      }
      // 🆕 Show HOA with source/status indicator
      const paymentHoaText = payment.hoa !== null && payment.hoa !== undefined
        ? payment.hoa === 0
          ? `$0/mo (no HOA)${dataProvenance.hoa === 'confirmed_zero' ? ' [confirmed]' : ''}`
          : `${formatCurrency(payment.hoa)}/mo${dataProvenance.hoa === 'extracted' ? ' [extracted]' : ''}`
        : `$0/mo (assumed)*`;
      responseText += `- HOA: ${paymentHoaText}\n`;
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

