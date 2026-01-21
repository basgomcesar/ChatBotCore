/**
 * Flow router - Routes messages to the appropriate conversation flow
 * @module flowRouter
 */

const { FLOWS, GLOBAL_COMMANDS } = require("../config/constants");
const requisitosFlow = require("../flows/requisitosFlow/requisitosFlow");
const welcomeFlow = require("../flows/bienvenidaFlow/welcomeFlow");
const asesorFlow = require("../flows/asesorFlow/asesorFlow");
const userState = require("../state/userState");
const preguntasFrecuentesFlow = require("../flows/preguntasFrecuentesFlow/preguntasFrecuentesFlow");
const simulacionFlow = require("../flows/simulacionFlow/simulacionFlow");
const llenadoSolicitudFlow = require("../flows/llenadoSolicitudFlow/llenadoSolicitudFlow");
const logger = require("../config/logger");

const FLOW_HANDLERS = {
  [FLOWS. BIENVENIDA. NAME]: welcomeFlow,
  [FLOWS.REQUISITOS.NAME]: requisitosFlow,
  [FLOWS. PREGUNTAS_FRECUENTES. NAME]: preguntasFrecuentesFlow,
  [FLOWS.ASESOR.NAME]:  asesorFlow,
  [FLOWS.SIMULACION.NAME]: simulacionFlow,
  [FLOWS.LLENADO_SOLICITUD.NAME]: llenadoSolicitudFlow,
};

module.exports = {
  /**
   * Routes a message to the correct flow based on user state
   * @param {string} userId - User ID (phone number)
   * @param {string} text - Received message text
   * @param {object} state - Current user state
   * @param {object} messageData - Message data (text, imageBuffer, documentBuffer, etc.)
   * @returns {Promise<object>} Object containing reply, newState, and optionally file
   */
  route:  async (userId, text, state, messageData = {}) => {
    const cleanText = text.trim().toLowerCase();

    // 1. Check for global commands
    if (GLOBAL_COMMANDS.includes(cleanText)) {
      logger.info(`Usuario ${userId} ejecutó comando global: ${cleanText}`);
      userState.resetState(userId);
      return {
        reply: "🔙 Has regresado al menú principal",
        newState:  {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    }

    // 2. Route to appropriate flow handler
    const flowHandler =
      FLOW_HANDLERS[state.flow] || FLOW_HANDLERS[FLOWS.BIENVENIDA.NAME];
    
    if (! flowHandler) {
      logger.error(`No se encontró handler para el flujo: ${state. flow}`);
      return {
        reply: "❌ Ocurrió un error interno.  Intenta más tarde.",
        newState: {
          flow: FLOWS. BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS. MENU,
        },
      };
    }
    
    // Pasar messageData completo al handler
    const { reply, newState, file } = await flowHandler.handle(
      userId, 
      text, 
      state, 
      messageData
    );

    return {
      reply,
      file,
      newState:  newState || state,
    };
  },
};