/**
 * Advisor flow handler
 * Manages the flow for connecting users with human advisors
 * Only available during business hours
 * @module asesorFlow
 */

const { FLOWS } = require("../../config/constants");
const { mensajeAsesor } = require("./messages");
const { esHorarioDeAtencion } = require("../../utils/validations");

// Centralize flow constants
const FLOW_NAME = FLOWS.ASESOR.NAME;
const STEPS = FLOWS.ASESOR.STEPS;

const stepHandlers = {
  [STEPS.ASESOR_INICIAL]: async (userId, text, state) => {
    if (!esHorarioDeAtencion()) {
      // Outside business hours
      return {
        reply: mensajeAsesor(state.name),
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    } else {
      // During business hours - suspend bot and allow human advisor to take over
      return {
        newState: {
          flow: FLOW_NAME,
          step: STEPS.CHAT_SUSPENDIDO,
        },
      };
    }
  },
  [STEPS.CHAT_SUSPENDIDO]: async (userId, text, state) => {
    // Chat is suspended - human advisor should be handling the conversation
    // No automatic response
    return {};
  }
};

module.exports = {
  /**
   * Handles the advisor flow steps
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
      reply: "❌ Paso no reconocido en el flujo de asesor.",
      newState: { 
        flow: FLOWS.BIENVENIDA.NAME, 
        step: FLOWS.BIENVENIDA.STEPS.MENU 
      },
    };
  },
};
