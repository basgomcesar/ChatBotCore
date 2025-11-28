/**
 * Filling request
 * Displays flow to fill a request
 * @module llenadoSolicitud
 */

const { FLOWS } = require("../../config/constants");
const { preguntarTipoSolicitudPrestamo } = require("./messages");

// Centralize flow constants
const FLOW_NAME = FLOWS.LLENADO_SOLICITUD.NAME;
const STEPS = FLOWS.LLENADO_SOLICITUD.STEPS;

const stepHandlers = {
  [STEPS.LLENADO_SOLICITUD_INICIAL]: async (userId, text, state) => ({
    reply: preguntarTipoSolicitudPrestamo(),
    newState: { flow: FLOWS.BIENVENIDA.NAME, step: FLOWS.BIENVENIDA.STEPS.MENU },
  }),
};

module.exports = {
  /**
   * Handles the FAQ flow steps
   * @param {string} userId - User ID
   * @param {string} text - User input text
   * @param {object} state - Current user state
   * @returns {Promise<object>} Object containing reply and newState
   */
  handle: async (userId, text, state) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de Preguntas frecuentes.",
      newState: { 
        flow: FLOWS.BIENVENIDA.NAME, 
        step: FLOWS.BIENVENIDA.STEPS.MENU 
      },
    };
  },
};
