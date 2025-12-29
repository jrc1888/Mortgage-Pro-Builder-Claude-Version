/**
 * Fee Classifier
 * Classifies fees according to Reg Z/TILA rules to determine:
 * - Is it a finance charge? (affects APR)
 * - Does it adjust the amount financed? (affects note balance when financed)
 */

import { Fee, FeeClassification, PaidTo, PaidBy, FeeCategory } from './models';

export class FeeClassifier {
  /**
   * Classify a fee according to Reg Z/TILA rules
   */
  static classify(fee: Fee): FeeClassification {
    const isFinanceCharge = this.isFinanceCharge(fee);
    const isAmountFinancedAdjustment = this.isAmountFinancedAdjustment(fee);
    const explanation = this.generateExplanation(fee, isFinanceCharge, isAmountFinancedAdjustment);

    return {
      fee,
      is_finance_charge: isFinanceCharge,
      is_amount_financed_adjustment: isAmountFinancedAdjustment,
      explanation
    };
  }

  /**
   * Determine if a fee is a finance charge (affects APR)
   * Reg Z §1026.4: Finance charge includes fees and charges imposed by creditor
   * as incident to or a condition of the extension of credit
   */
  private static isFinanceCharge(fee: Fee): boolean {
    // Lender/broker origination fees - always finance charges
    if (fee.paid_to === 'lender' || fee.paid_to === 'broker') {
      if (fee.category === 'origination' || 
          fee.category === 'points' || 
          fee.category === 'underwriting' || 
          fee.category === 'processing') {
        return true;
      }
    }

    // Points - always finance charges
    if (fee.category === 'points') {
      return true;
    }

    // Required upfront MI (FHA UFMIP) - finance charge
    if (fee.category === 'MI_upfront') {
      return true;
    }

    // VA Funding Fee - finance charge (prepaid finance charge)
    if (fee.category === 'VA_funding_fee') {
      return true;
    }

    // Rate lock fees - finance charge
    if (fee.name.toLowerCase().includes('rate lock') || 
        fee.name.toLowerCase().includes('lock fee')) {
      return true;
    }

    // Broker compensation if borrower-paid - finance charge
    if (fee.paid_to === 'broker' && fee.paid_by === 'borrower_cash') {
      return true;
    }

    // Exclusions (NOT finance charges):
    // - Title/settlement fees (third party, bona fide)
    if (fee.category === 'title' && fee.paid_to === 'third_party') {
      return false;
    }

    // - Appraisal (bona fide, reasonable)
    if (fee.category === 'appraisal' && fee.paid_to === 'third_party') {
      return false;
    }

    // - Recording fees
    if (fee.category === 'recording') {
      return false;
    }

    // - Transfer taxes
    if (fee.category === 'transfer_tax') {
      return false;
    }

    // - Prepaid interest (daily interest)
    if (fee.category === 'prepaid_interest') {
      return false; // Excluded from APR finance charge
    }

    // - Taxes and insurance (prepaids)
    if (fee.category === 'taxes_insurance') {
      return false;
    }

    // - Monthly MI (not included in APR)
    if (fee.category === 'MI_monthly') {
      return false;
    }

    // Default: if required for credit and paid to lender/broker, likely finance charge
    if (fee.required_for_credit && (fee.paid_to === 'lender' || fee.paid_to === 'broker')) {
      return true;
    }

    return false;
  }

  /**
   * Determine if a fee adjusts the amount financed (note balance)
   * Only applies when fee is financed (paid_by === 'financed')
   */
  private static isAmountFinancedAdjustment(fee: Fee): boolean {
    if (fee.paid_by !== 'financed') {
      return false;
    }

    // Financed upfront fees adjust note balance
    // Examples: FHA UFMIP, VA Funding Fee when financed
    if (fee.category === 'MI_upfront' || fee.category === 'VA_funding_fee') {
      return true;
    }

    // Points can be financed (rare but possible)
    if (fee.category === 'points' && fee.paid_by === 'financed') {
      return true;
    }

    return false;
  }

  /**
   * Generate human-readable explanation of classification
   */
  private static generateExplanation(
    fee: Fee, 
    isFinanceCharge: boolean, 
    isAmountFinancedAdjustment: boolean
  ): string {
    const parts: string[] = [];

    if (isFinanceCharge) {
      parts.push('Finance charge (included in APR)');
      
      if (fee.paid_to === 'lender' || fee.paid_to === 'broker') {
        parts.push(`because it's a lender/broker fee`);
      }
      
      if (fee.category === 'points') {
        parts.push('because points are always finance charges');
      }
      
      if (fee.category === 'MI_upfront' || fee.category === 'VA_funding_fee') {
        parts.push('because required upfront MI/funding fees are finance charges');
      }
    } else {
      parts.push('Not a finance charge (excluded from APR)');
      
      if (fee.paid_to === 'third_party') {
        parts.push('because it\'s a third-party fee');
      }
      
      if (fee.category === 'appraisal' || fee.category === 'title') {
        parts.push('because it\'s a bona fide third-party service fee');
      }
      
      if (fee.category === 'prepaid_interest' || fee.category === 'taxes_insurance') {
        parts.push('because prepaids are excluded from APR');
      }
    }

    if (isAmountFinancedAdjustment) {
      parts.push('Adjusts note balance (financed)');
    } else if (fee.paid_by === 'financed') {
      parts.push('Financed but does not adjust note balance');
    }

    return parts.join('. ');
  }

  /**
   * Process credits (lender credit, seller credit) as negative fees
   */
  static processCredits(
    lenderCredit?: number,
    sellerCredit?: number
  ): Fee[] {
    const creditFees: Fee[] = [];

    if (lenderCredit && lenderCredit > 0) {
      creditFees.push({
        name: 'Lender Credit',
        amount: -lenderCredit, // Negative amount
        paid_to: 'lender',
        paid_by: 'lender_credit',
        required_for_credit: false,
        category: 'other',
        notes: 'Lender credit reduces finance charges'
      });
    }

    if (sellerCredit && sellerCredit > 0) {
      creditFees.push({
        name: 'Seller Credit',
        amount: -sellerCredit, // Negative amount
        paid_to: 'third_party', // Seller is treated as third party
        paid_by: 'seller_credit',
        required_for_credit: false,
        category: 'other',
        notes: 'Seller credit (typically not a finance charge reduction, but may offset costs)'
      });
    }

    return creditFees;
  }

  /**
   * Classify all fees and return summary
   */
  static classifyAll(fees: Fee[]): FeeClassification[] {
    return fees.map(fee => this.classify(fee));
  }
}

