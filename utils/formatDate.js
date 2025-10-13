/**
 * Date formatting utilities
 * @module formatDate
 */

/**
 * Formats a date to YYYY-MM-DD format
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string (YYYY-MM-DD)
 */
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    throw new Error('Invalid date provided to formatDate');
  }
  return date.toISOString().split('T')[0];
}

/**
 * Formats a date to a more readable Spanish format
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string (DD/MM/YYYY)
 */
function formatDateSpanish(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    throw new Error('Invalid date provided to formatDateSpanish');
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

module.exports = { formatDate, formatDateSpanish };