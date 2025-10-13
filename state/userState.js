/**
 * User state management module
 * Manages conversation state for each user, persisted to JSON file
 * @module userState
 */

const fs = require("fs");
const path = require("path");
const { FLOWS } = require("../config/constants");
const logger = require("../config/logger");

const stateFile = path.join(__dirname, "userState.json");

// Load initial state from JSON file (if it exists)
let userStates = {};
if (fs.existsSync(stateFile)) {
  try {
    userStates = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    logger.info(`Estados de usuario cargados: ${Object.keys(userStates).length} usuarios`);
  } catch (err) {
    logger.error("Error leyendo userState.json:", err);
  }
}

/**
 * Saves the current state to the JSON file
 * @private
 */
function saveStates() {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(userStates, null, 2), "utf8");
  } catch (err) {
    logger.error("Error guardando userState.json:", err);
  }
}

module.exports = {
  /**
   * Gets the current state for a user
   * @param {string} userId - User ID (phone number)
   * @returns {object} User state object with flow and step information
   */
  getState: (userId) => {
    return (
      userStates[userId] || {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.SALUDO_INICIAL,
      }
    );
  },

  /**
   * Sets or updates the state for a user
   * @param {string} userId - User ID (phone number)
   * @param {object} newState - New state object to merge with existing state
   */
  setState: (userId, newState) => {
    userStates[userId] = { ...userStates[userId], ...newState };
    saveStates();
  },

  /**
   * Resets a user's state to the initial welcome state
   * @param {string} userId - User ID (phone number)
   */
  resetState: (userId) => {
    userStates[userId] = {
      flow: FLOWS.BIENVENIDA.NAME,
      step: FLOWS.BIENVENIDA.STEPS.SALUDO_INICIAL,
    };
    saveStates();
  },

  /**
   * Gets all user states (for debugging/administrative purposes)
   * @returns {object} Object containing all user states
   */
  getAllStates: () => userStates,
};
