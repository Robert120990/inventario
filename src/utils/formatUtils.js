/**
 * Formats a calendar date string from YYYY-MM-DD (or ISO date) to DD/MM/YYYY
 * @param {string|Date} dateString
 * @returns {string}
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';

  if (dateString instanceof Date) {
    if (Number.isNaN(dateString.getTime())) return '';
    const d = String(dateString.getDate()).padStart(2, '0');
    const m = String(dateString.getMonth() + 1).padStart(2, '0');
    const y = dateString.getFullYear();
    return `${d}/${m}/${y}`;
  }

  const str = String(dateString).trim();
  // If it's an ISO string (contains T) or SQL datetime, extract only the date part for calendar dates
  const dateOnly = str.includes('T') ? str.split('T')[0] : str.split(' ')[0];

  const parts = dateOnly.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
};

/**
 * Formats a point-in-time timestamp (such as MySQL created_at / updated_at)
 * in the user's local timezone as DD/MM/YYYY so evening timestamps in UTC
 * do not roll over to the next calendar day.
 * @param {string|Date} timestamp
 * @returns {string}
 */
export const formatTimestampLocal = (timestamp) => {
  if (!timestamp) return '';
  if (timestamp instanceof Date) {
    return formatDate(timestamp);
  }
  const str = String(timestamp).trim();
  // Pure YYYY-MM-DD without time component -> treat as calendar date directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return formatDate(str);
  }
  const parsed = new Date(str.includes('T') ? str : str.replace(' ', 'T'));
  if (!Number.isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return formatDate(str);
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
 * Formats a number to appropriate decimal places for unit prices ($0.001, $0.038, $54.00)
 * @param {number} value
 * @returns {string}
 */
export const formatPrice = (value) => {
  const num = Number(value || 0);
  if (num === 0) return '0.00';
  if (num < 1) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
  }
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
};
