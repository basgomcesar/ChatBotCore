const { FLOWS, USUARIOS } = require("../../config/constants");
const { REQ_SIMULACION_ACTIVO, MSG_PREPARADO } = require("./messages");

// Centraliza los nombres de flujo
const FLOW_NAME = FLOWS.SIMULACION.NAME;
const STEPS = FLOWS.SIMULACION.STEPS;

const stepHandlers = {
  [STEPS.SIMULACION_INICIAL]: async (userId, text, state) => {
    if (state.userType == USUARIOS.ACTIVO) {
      return {
        reply: [REQ_SIMULACION_ACTIVO(), MSG_PREPARADO()],
        newState: {
          flow: FLOWS.BIENVENIDA.NAME, step: FLOWS.BIENVENIDA.STEPS.MENU
        }
      }
    } else if (state.userType == USUARIOS.PENSIONADO) {
      return {
        reply: "Eres un usuario pensionado para prestamo",
        newState: {
          flow: FLOWS.BIENVENIDA.NAME, step: FLOWS.BIENVENIDA.STEPS.MENU
        }
      }
    }
  }
}

module.exports = {
  /**
   * Maneja los pasos del flujo de Simulacion 
   */
  handle: async (userId, text, state) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de Simulación.",
      newState: { flow: FLOW_NAME, step: STEPS.SALUDO_INICIAL },
    };
  },
};
