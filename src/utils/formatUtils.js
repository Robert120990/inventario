/**
 * Formats a date string from YYYY-MM-DD to DD/MM/YYYY
 * @param {string} dateString 
 * @returns {string}
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
};

/**
 * Formats a number to a currency string with 2 decimal places
 * @param {number} value 
 * @returns {string}
 */
export const formatCurrency = (value) => {
  return Number(value || 0).toFixed(2);
};

/**
 * Formats a number to 3 decimal places (for unit prices)
 * @param {number} value 
 * @returns {string}
 */
export const formatPrice = (value) => {
  return Number(value || 0).toFixed(3);
};
