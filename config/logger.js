/**
 * Logger utility for consistent logging throughout the application
 * @module logger
 */

const getTimestamp = () => new Date().toISOString();

const logger = {
  /**
   * Log an informational message
   * @param {string} msg - The message to log
   */
  info: (msg) => console.log(`[${getTimestamp()}] [INFO] ${msg}`),
  
  /**
   * Log an error message
   * @param {string} msg - The error message to log
   * @param {Error} [error] - Optional error object
   */
  error: (msg, error) => {
    console.error(`[${getTimestamp()}] [ERROR] ${msg}`);
    if (error && error.stack) {
      console.error(error.stack);
    }
  },
  
  /**
   * Log a warning message
   * @param {string} msg - The warning message to log
   */
  warn: (msg) => console.warn(`[${getTimestamp()}] [WARN] ${msg}`),
  
  /**
   * Log a debug message
   * @param {string} msg - The debug message to log
   */
  debug: (msg) => {
    if (process.env.DEBUG === 'true') {
      console.log(`[${getTimestamp()}] [DEBUG] ${msg}`);
    }
  }
};

module.exports = logger;