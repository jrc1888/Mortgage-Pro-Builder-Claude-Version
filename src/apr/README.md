# APR Calculator - Reg Z / TILA Compliant

A comprehensive, Reg Z/TILA compliant Annual Percentage Rate (APR) calculator for US mortgages.

## Overview

This module implements accurate APR calculation according to Truth in Lending Act (TILA) Regulation Z requirements. It supports:

- **Loan Types**: Conventional, FHA, VA, Jumbo, USDA
- **Structures**: Fixed-rate, ARM, Interest-Only (IO), IO+ARM combinations
- **Fee Classification**: Automatic classification of finance charges vs. non-finance charges
- **Payment Schedules**: Full payment schedule generation with rate adjustments

## Key Concepts

### APR Definition
APR is the nominal annual rate that satisfies:
```
Present Value(all scheduled payments) = Net Amount Financed
```

Where:
- **Net Amount Financed** = Base Loan Amount - Total Finance Charges
- Finance charges reduce the amount financed **regardless** of whether paid in cash or financed

### Finance Charges
Finance charges include:
- Lender/broker origination fees
- Discount points
- Underwriting/processing fees
- Required upfront MI (FHA UFMIP)
- VA Funding Fee (when treated as prepaid finance charge)

Finance charges **exclude**:
- Third-party fees (title, appraisal, recording)
- Prepaids (taxes, insurance, daily interest)
- Monthly MI (not included in APR)

### Note Amount vs. Base Loan Amount
- **Base Loan Amount**: Purchase price minus down payment
- **Note Amount**: Base loan + financed upfront fees (UFMIP, VA funding fee)
- **Net Amount Financed**: Base loan - finance charges (for APR calculation)

## Usage

### Basic Example

```typescript
import { calculateAPR } from './src/apr';

const input = {
  loan_type: 'conv',
  structure: 'fixed',
  base_loan_amount: 475000,
  note_rate_initial: 0.065, // 6.5%
  term_months: 360,
  fees: [
    {
      name: 'Origination',
      amount: 4750,
      paid_to: 'lender',
      paid_by: 'borrower_cash',
      required_for_credit: true,
      category: 'origination'
    }
  ]
};

const result = calculateAPR(input);
console.log(`APR: ${result.apr_annual}%`);
```

### Using with Existing Scenario Data

```typescript
import { calculateAPRFromScenario } from './utils/formatting';
import { calculateScenario } from './services/loanMath';

const results = calculateScenario(scenario);
const apr = calculateAPRFromScenario(scenario, results);
```

## Module Structure

- **`models.ts`**: Type definitions and data structures
- **`feeClassifier.ts`**: Classifies fees as finance charges or not
- **`paymentSchedule.ts`**: Generates payment schedules for all loan structures
- **`aprSolver.ts`**: Numerical solver to find APR (Newton-Raphson + bisection)
- **`index.ts`**: Main calculator and convenience functions
- **`adapter.ts`**: Converts from existing Scenario format to APRInput

## Fee Classification Rules

The `FeeClassifier` automatically determines if a fee is a finance charge based on:

1. **Paid To**: Lender/broker fees are typically finance charges
2. **Category**: Points, origination, underwriting are finance charges
3. **Required for Credit**: Fees required to obtain credit are finance charges
4. **Third-Party**: Bona fide third-party fees (title, appraisal) are excluded

### Adding Custom Fee Rules

Modify `feeClassifier.ts` to add custom classification logic:

```typescript
private static isFinanceCharge(fee: Fee): boolean {
  // Add your custom rules here
  if (fee.name.includes('Custom Fee')) {
    return true; // or false
  }
  // ... existing logic
}
```

## ARM Calculation Modes

### Mode 1: Constant Index (Default)
Assumes the index stays constant at its initial value. Post-adjustment rate = `index_initial + margin`, subject to caps.

### Mode 2: Index Curve
Uses a provided forward curve of index values to calculate future rates.

```typescript
arm_params: {
  // ... other params
  use_constant_index: false,
  index_curve: [0.035, 0.036, 0.037, ...] // Future index values
}
```

## Interest-Only Loans

For IO loans:
- During IO period: Payment = `balance * rate / 12`
- After IO period: Re-amortize remaining balance over remaining term
- APR accounts for both IO payments and balloon payment

## Testing

Run tests with:
```bash
npm test -- src/apr/__tests__/aprCalculator.test.ts
```

Test cases cover:
- Conventional fixed with lender fees
- FHA with financed UFMIP
- VA with financed funding fee
- ARM with rate adjustments
- Interest-only loans
- Lender credits

## Debugging

Use `explainAPR()` to get a human-readable breakdown:

```typescript
import { explainAPR } from './src/apr';

const explanation = explainAPR(input);
console.log(explanation);
```

This shows:
- Finance charge breakdown
- Fee classifications
- Payment schedule summary
- Solver convergence status

## Important Notes

1. **APR should always be ≥ interest rate** when finance charges exist
2. **Financed fees** (UFMIP, VA funding fee) are included in note amount AND finance charges
3. **Prepaids** are excluded from APR calculation
4. **Monthly MI** is excluded from APR (standard TILA treatment)
5. **Lender credits** reduce finance charges (negative fees)

## Regulatory Compliance

This implementation follows:
- **Reg Z §1026.22**: APR calculation requirements
- **Reg Z §1026.4**: Finance charge definitions
- **TILA**: Truth in Lending Act requirements

## Extension Points

To add support for new loan types or structures:

1. Add loan type to `LoanType` in `models.ts`
2. Update `FeeClassifier` if fee rules differ
3. Update `PaymentScheduleGenerator` for new payment structures
4. Add test cases in `__tests__/`

## Troubleshooting

### APR showing lower than interest rate
- Check that finance charges are being classified correctly
- Verify net amount financed calculation
- Ensure solver converged (check `solver_converged` flag)

### Solver not converging
- Increase `maxIterations` in solver options
- Check for invalid payment schedule (zero payments, etc.)
- Verify net amount financed is positive

### Incorrect fee classification
- Review fee `paid_to`, `category`, and `required_for_credit` fields
- Check `FeeClassifier` rules
- Use `explainAPR()` to see classification reasoning




