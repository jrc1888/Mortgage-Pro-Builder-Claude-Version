# AMI Module Integration Examples

This document shows practical examples of how to integrate the AMI lookup module into your Mortgage Pro Builder application.

## Example 1: Add AMI Tab to ScenarioBuilder

Add AMI lookup as a new tab in the ScenarioBuilder component:

```tsx
// In components/ScenarioBuilder.tsx

import { AMILookup } from './AMILookup';
import { extractZipCode } from '../services/amiService';

// Update the activeTab type
const [activeTab, setActiveTab] = useState<'loan' | 'costs' | 'advanced' | 'income' | 'ami'>('loan');

// Add tab button in the tab navigation section
<div className="flex gap-1 border-b border-slate-200">
  {/* ... existing tabs ... */}
  <button
    onClick={() => setActiveTab('ami')}
    className={`px-4 py-2 text-xs font-bold uppercase transition-colors ${
      activeTab === 'ami'
        ? 'text-indigo-600 border-b-2 border-indigo-600'
        : 'text-slate-500 hover:text-slate-700'
    }`}
  >
    AMI & Qualifications
  </button>
</div>

// Add AMI tab content
{activeTab === 'ami' && (
  <div className="p-6">
    <AMILookup
      initialZipCode={extractZipCode(scenario.propertyAddress) || undefined}
      initialFamilySize={calculateFamilySize(scenario)}
      annualIncome={
        scenario.income.borrower1 + 
        scenario.income.borrower2 + 
        scenario.income.other
      }
      onZipCodeFound={(zip) => {
        // Optional: Save zip code back to scenario if needed
        console.log('Zip code found:', zip);
      }}
    />
  </div>
)}
```

## Example 2: Add AMI Modal/Button

Add a button that opens AMI lookup in a modal:

```tsx
// In components/ScenarioBuilder.tsx

import { Modal } from './Modal';
import { AMILookup } from './AMILookup';
import { extractZipCode } from '../services/amiService';
import { Info } from 'lucide-react';

// Add state
const [showAMIModal, setShowAMIModal] = useState(false);

// Add button (e.g., in the property address section)
<div className="flex items-center gap-2">
  <input 
    type="text" 
    value={scenario.propertyAddress}
    onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
  />
  {extractZipCode(scenario.propertyAddress) && (
    <button
      onClick={() => setShowAMIModal(true)}
      className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
      title="Check AMI Limits"
    >
      <Info size={14} />
      Check AMI
    </button>
  )}
</div>

// Add modal
<Modal
  isOpen={showAMIModal}
  onClose={() => setShowAMIModal(false)}
  title="Area Median Income Lookup"
  subtitle="View AMI limits and qualification information"
  maxWidth="max-w-3xl"
>
  <AMILookup
    initialZipCode={extractZipCode(scenario.propertyAddress) || undefined}
    initialFamilySize={calculateFamilySize(scenario)}
    annualIncome={
      scenario.income.borrower1 + 
      scenario.income.borrower2 + 
      scenario.income.other
    }
  />
</Modal>
```

## Example 3: Auto-Populate from Address

Automatically extract zip code and show AMI info when address is entered:

```tsx
// In components/ScenarioBuilder.tsx

import { useEffect, useState } from 'react';
import { AMILookup } from './AMILookup';
import { extractZipCode, getAMILimits } from '../services/amiService';

// Add state for AMI summary
const [amiSummary, setAmiSummary] = useState<{
  zipCode: string;
  medianIncome: number;
} | null>(null);

// Extract zip code when address changes
useEffect(() => {
  const zip = extractZipCode(scenario.propertyAddress);
  if (zip) {
    // Load AMI data for quick display
    getAMILimits(zip, 1).then((limits) => {
      if (limits) {
        setAmiSummary({
          zipCode: zip,
          medianIncome: limits.limits.median,
        });
      }
    });
  } else {
    setAmiSummary(null);
  }
}, [scenario.propertyAddress]);

// Display AMI summary badge
{amiSummary && (
  <div className="mt-2 flex items-center gap-2 text-xs">
    <span className="text-slate-500">AMI for {amiSummary.zipCode}:</span>
    <span className="font-semibold text-indigo-600">
      ${amiSummary.medianIncome.toLocaleString()}
    </span>
    <button
      onClick={() => setShowAMIModal(true)}
      className="text-indigo-600 hover:underline"
    >
      View Details
    </button>
  </div>
)}
```

## Example 4: Helper Function for Family Size

Calculate family size from scenario data:

```tsx
// In components/ScenarioBuilder.tsx or a utility file

function calculateFamilySize(scenario: Scenario): number {
  // Simple calculation: count borrowers + dependents if tracked
  // Adjust based on your data model
  let size = 0;
  
  if (scenario.income.borrower1 > 0) size++;
  if (scenario.income.borrower2 > 0) size++;
  
  // If you track dependents, add them here
  // For now, default to minimum of 1
  return Math.max(1, size);
}
```

## Example 5: Display AMI Qualification in Results

Show AMI qualification status in the calculated results:

```tsx
// In components/ScenarioBuilder.tsx

import { useEffect, useState } from 'react';
import { getQualificationStatus, extractZipCode } from '../services/amiService';

// Add qualification state
const [qualification, setQualification] = useState<QualificationStatus | null>(null);

// Calculate qualification when scenario changes
useEffect(() => {
  const zip = extractZipCode(scenario.propertyAddress);
  const totalIncome = 
    scenario.income.borrower1 + 
    scenario.income.borrower2 + 
    scenario.income.other;
  
  if (zip && totalIncome > 0) {
    getQualificationStatus(zip, calculateFamilySize(scenario), totalIncome)
      .then(setQualification);
  } else {
    setQualification(null);
  }
}, [scenario.propertyAddress, scenario.income]);

// Display in results section
{qualification && (
  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-4">
    <h4 className="font-bold text-sm text-indigo-900 mb-2">AMI Qualification</h4>
    <p className="text-sm text-indigo-800">
      Income is <strong>{qualification.percentageOfAMI}%</strong> of AMI
      ({qualification.incomeCategory.replace(/([A-Z])/g, ' $1').trim()})
    </p>
    {qualification.qualifiesFor.length > 0 && (
      <div className="mt-2">
        <p className="text-xs font-semibold text-indigo-700 mb-1">May Qualify For:</p>
        <ul className="text-xs text-indigo-600 space-y-0.5">
          {qualification.qualifiesFor.map((program, idx) => (
            <li key={idx}>• {program}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}
```

## Example 6: Standalone AMI Tool Page

Create a dedicated page/route for AMI lookup:

```tsx
// In App.tsx or a new component

import { AMILookup } from './components/AMILookup';

const AMIToolPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Area Median Income Lookup Tool
        </h1>
        <p className="text-slate-600">
          Enter a zip code and family size to view AMI limits and qualification information
          for various housing programs.
        </p>
      </div>
      <AMILookup />
    </div>
  );
};
```

## Example 7: Integration with Dashboard

Add quick AMI lookup to the dashboard:

```tsx
// In components/Dashboard.tsx

import { useState } from 'react';
import { Modal } from './Modal';
import { AMILookup } from './AMILookup';

const Dashboard: React.FC<Props> = ({ ... }) => {
  const [showAMILookup, setShowAMILookup] = useState(false);

  return (
    <>
      {/* Add button in dashboard header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowAMILookup(true)}
          className="px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          AMI Lookup Tool
        </button>
      </div>

      {/* AMI Modal */}
      <Modal
        isOpen={showAMILookup}
        onClose={() => setShowAMILookup(false)}
        title="Area Median Income Lookup"
        maxWidth="max-w-3xl"
      >
        <AMILookup />
      </Modal>
    </>
  );
};
```

## Best Practices

1. **Extract Zip Code Automatically**: Use `extractZipCode()` when possible
2. **Calculate Family Size**: Create a helper function based on your data model
3. **Show Loading States**: The component handles this, but you can add your own
4. **Handle Errors Gracefully**: Component shows errors, but you can add fallbacks
5. **Cache Results**: Consider caching AMI lookups to reduce API calls
6. **Update Annually**: Set reminders to update AMI data when HUD releases new data

## Testing Checklist

- [ ] Test with valid zip codes
- [ ] Test with invalid zip codes
- [ ] Test with various family sizes (1-8)
- [ ] Test income qualification calculations
- [ ] Test error states
- [ ] Test loading states
- [ ] Test with missing data scenarios
- [ ] Test zip code extraction from addresses
- [ ] Test integration with scenario data

## Notes

- The component is self-contained and handles its own state
- You can pass initial values or let users enter them
- The component works with or without Supabase (falls back to JSON)
- All validation and error handling is built-in
- The UI is responsive and matches your app's design system

