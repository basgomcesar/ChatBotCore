const { FLOWS } = require("../../config/constants");
//const {  } = require("./messages");

// Centraliza los nombres de flujo
const FLOW_NAME = FLOWS.ASESOR.NAME;
const STEPS = FLOWS.ASESOR.STEPS;




const stepHandlers = {
  [STEPS.ASESOR_INICIAL]: async (userId, text, state) => ({
    //reply: mostrarPreguntasFrecuentes(),
    newState: { flow: FLOWS.BIENVENIDA.NAME, step: FLOWS.BIENVENIDA.STEPS.MENU },
  }),
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