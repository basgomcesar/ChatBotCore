const welcomeFlow = require("../flows/bienvenidaFlow/welcomeFlow");
const { FLOWS, GLOBAL_COMMANDS } = require("../config/constants");
const requisitosFlow = require("../flows/requisitosFlow/requisitosFlow");
// const pedidosFlow = require("../flows/pedidosFlow");
// const soporteFlow = require("../flows/soporteFlow");
const userState = require("../state/userState");

// Mapea los nombres de flujo a su handler
const FLOW_HANDLERS = {
  [FLOWS.BIENVENIDA.NAME]: welcomeFlow,
  [FLOWS.REQUISITOS.NAME]: requisitosFlow,
  // Agrega más flujos aquí
};

module.exports = {
  /**
   * Ruta el mensaje al flujo correcto según el estado del usuario
   * @param {string} userId - ID de usuario
   * @param {string} text - Texto recibido
   * @param {object} state - Estado actual del usuario
   * @returns {object} - { reply, newState }
   */
  route: async (userId, text, state) => {
    const cleanText = text.trim().toLowerCase();

    // 1. Comando global
    if (GLOBAL_COMMANDS.includes(cleanText)) {
      userState.resetState(userId);
      return {
        reply: "🔙 Has regresado al menú principal",
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    }

    // 2. Handler por flujo (usando objeto en vez de switch)
    const flowHandler =
      FLOW_HANDLERS[state.flow] || FLOW_HANDLERS[FLOWS.BIENVENIDA.NAME];
    if (!flowHandler) {
      return {
        reply: "❌ Ocurrió un error interno. Intenta más tarde.",
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    }
    const { reply, newState } = await flowHandler.handle(userId, text, state);

    return {
      reply,
      newState: newState || state,
    };
  },
};
