const { FLOWS } = require("../../config/constants");
const { mensajeAsesor } = require("./messages");
const { esHorarioDeAtencion } = require("../../utils/validations");

// Centraliza los nombres de flujo
const FLOW_NAME = FLOWS.ASESOR.NAME;
const STEPS = FLOWS.ASESOR.STEPS;


const stepHandlers = {
  [STEPS.ASESOR_INICIAL]: async (userId, text, state) => {
    if (!esHorarioDeAtencion()) {
      return {
        reply: mensajeAsesor(state.name),
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    }else{
      return {
        newState: {
          flow: FLOW_NAME,
          step: STEPS.CHAT_SUSPENDIDO,
        },
      };
    }
  },
  [STEPS.CHAT_SUSPENDIDO]: async (userId, text, state) => {

  }
};

module.exports = {
  /**
   * Maneja los pasos del flujo de preguntas frecuentes
   */
  handle: async (userId, text, state) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de asesor.",
      newState: { flow: FLOW_NAME, step: STEPS.SALUDO_INICIAL },
    };
  },
};
