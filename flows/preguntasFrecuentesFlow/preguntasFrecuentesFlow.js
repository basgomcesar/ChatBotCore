/**
 * Frequently Asked Questions (FAQ) flow handler
 * Displays common questions and answers to users
 * @module preguntasFrecuentesFlow
 */

const { FLOWS } = require("../../config/constants");
const { mostrarPreguntasFrecuentes } = require("./messages");

// Centralize flow constants
const FLOW_NAME = FLOWS.PREGUNTAS_FRECUENTES.NAME;
const STEPS = FLOWS.PREGUNTAS_FRECUENTES.STEPS;

const stepHandlers = {
  [STEPS.PREGUNTAS_FRECUENTES_INICIAL]: async (userId, text, state) => ({
    reply: mostrarPreguntasFrecuentes(),
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
