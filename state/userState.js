/**
 * User state management module
 * Manages conversation state for each user, persisted in backend (.NET API)
 * @module userState
 */

const { FLOWS } = require("../config/constants");
const logger = require("../config/logger");
const { getUserState, setUserState } = require("../services/apiService");

/**
 * Gets the current state for a user from backend
 * @param {string} userId - User ID (phone number)
 * @returns {Promise<object>} User state object with flow and step information
 */
async function getState(userId) {
  try {
    const response = await getUserState(userId);

    if (response && response.flujo && response.paso) {
      return {
        flow: response.flujo,
        step: response.paso,
        folio: response.folio || null,
        userType: response.tipo || 0,
        name: response.nombre || "",
        tipoPrestamo: response.tipoPrestamo || "",
        numeroAfiliacion: response.numeroAfiliacion || ""
      };
    }

    // Default state for new users
    return {
      flow: FLOWS.BIENVENIDA.NAME,
      step: FLOWS.BIENVENIDA.STEPS.SALUDO_INICIAL,
    };
  } catch (error) {
    logger.error(`❌ Error obteniendo estado del usuario ${userId}:`, error.message);
    return {
      flow: FLOWS.BIENVENIDA.NAME,
      step: FLOWS.BIENVENIDA.STEPS.SALUDO_INICIAL,
    };
  }
}

/**
 * Saves or updates the state for a user in backend
 * @param {string} userId - User ID (phone number)
 * @param {object} newState - New state object to merge with existing state
 */
async function setState(userId, newState) {
  try {
    const payload = {
      nombre:newState.name,
      telefono: userId,
      flujo: newState.flow,
      paso: newState.step,
      folio: newState.folio || "",
      tipo: newState.userType || "",
      tipoPrestamo: newState.tipoPrestamo ,
      numeroAfiliacion: newState.numeroAfiliacion ,
    };

    await setUserState(payload);
    logger.info(`✅ Estado actualizado en backend para usuario ${userId}`);
  } catch (error) {
    logger.error(`❌ Error actualizando estado del usuario ${userId}:`, error.message);
  }
}

/**
 * Resets a user's state to the initial welcome state
 * @param {string} userId - User ID (phone number)
 */
async function resetState(userId) {
  const defaultState = {
    flow: FLOWS.BIENVENIDA.NAME,
    step: FLOWS.BIENVENIDA.STEPS.SALUDO_INICIAL,
  };
  await setState(userId, defaultState);
  return defaultState;
}

/**
 * Gets all user states (not applicable when using backend)
 * Included for compatibility/debug purposes
 */
function getAllStates() {
  logger.warn("⚠️ getAllStates() no está disponible en modo backend");
  return {};
}

module.exports = {
  getState,
  setState,
  resetState,
  getAllStates,
};
