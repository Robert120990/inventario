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
 * Returns 'YYYY-MM-DD' in the user's local calendar timezone
 * @param {Date|string|number} [d=new Date()]
 * @returns {string}
 */
export const toLocalDateISO = (d = new Date()) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
    return d.trim();
  }
  const dateObj = d instanceof Date ? d : new Date(d);
  const valid = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const year = valid.getFullYear();
  const month = String(valid.getMonth() + 1).padStart(2, '0');
  const day = String(valid.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formats a time string HH:MM:SS or HH:MM to HH:MM
 * @param {string} timeStr
 * @returns {string}
 */
export const formatTimeShort = (timeStr) => {
  if (!timeStr) return '--:--';
  const clean = String(timeStr).trim();
  if (clean.length >= 5 && clean.includes(':')) {
    return clean.slice(0, 5);
  }
  return clean;
};

/**
 * Looks up the catalog product associated with a movement item in O(1) when productsMap is provided,
 * falling back to linear array search when needed.
 * @param {object} item
 * @param {Array} [products=[]]
 * @param {Map|null} [productsMap=null]
 * @returns {object|null}
 */
export const findProductForMovementItem = (item, products = [], productsMap = null) => {
  if (!item) return null;

  if (productsMap instanceof Map) {
    const fromMap =
      (item.productId !== undefined && item.productId !== null
        ? productsMap.get(String(item.productId)) || productsMap.get(item.productId)
        : null) ||
      (item.sku ? productsMap.get(String(item.sku)) || productsMap.get(item.sku) : null);
    if (fromMap) return fromMap;
  }

  return Array.isArray(products)
    ? products.find(
        (prod) =>
          prod.id === item.productId ||
          String(prod.id) === String(item.productId) ||
          prod.sku === item.productId ||
          (item.sku && prod.sku === item.sku)
      ) || null
    : null;
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
