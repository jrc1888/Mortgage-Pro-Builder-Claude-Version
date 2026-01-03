/**
 * Helper functions for scenario type handling
 * Provides backward compatibility between transactionType and scenarioType
 */

import { Scenario } from '../types';

/**
 * Get the normalized scenario type from a scenario
 * Handles backward compatibility between transactionType and scenarioType
 */
export function getScenarioType(scenario: Scenario): 'purchase' | 'refinance' {
  // Prefer scenarioType if it exists
  if (scenario.scenarioType === 'purchase' || scenario.scenarioType === 'refinance') {
    return scenario.scenarioType;
  }
  
  // Fall back to transactionType for backward compatibility
  if (scenario.transactionType === 'Purchase') {
    return 'purchase';
  }
  if (scenario.transactionType === 'Refinance') {
    return 'refinance';
  }
  
  // Default to purchase
  return 'purchase';
}

/**
 * Convert scenarioType to transactionType (for backward compatibility)
 */
export function scenarioTypeToTransactionType(scenarioType: 'purchase' | 'refinance'): 'Purchase' | 'Refinance' {
  return scenarioType === 'purchase' ? 'Purchase' : 'Refinance';
}

/**
 * Migrate a scenario to include scenarioType field
 * This is a one-time migration function
 */
export function migrateScenarioType(scenario: Scenario): Scenario {
  // If scenarioType already exists, return as-is
  if (scenario.scenarioType === 'purchase' || scenario.scenarioType === 'refinance') {
    return scenario;
  }
  
  // Set scenarioType based on transactionType
  const scenarioType = getScenarioType(scenario);
  
  return {
    ...scenario,
    scenarioType
  };
}

