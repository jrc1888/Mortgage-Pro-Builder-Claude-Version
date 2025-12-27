/**
 * Utility functions for formatting numbers, currency, percentages, and dates
 */

/**
 * Formats a number as USD currency with no decimals
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., "$500,000")
 */
export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Formats a number as a percentage
 * @param rate - The rate to format (e.g., 6.5 for 6.5%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string (e.g., "6.50%")
 */
export const formatPercent = (rate: number, decimals: number = 2): string => {
  return `${rate.toFixed(decimals)}%`;
};

/**
 * Formats a date as MM/DD/YYYY
 * @param date - Date object or ISO string
 * @returns Formatted date string (e.g., "12/25/2024")
 */
export const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${month}/${day}/${year}`;
};

