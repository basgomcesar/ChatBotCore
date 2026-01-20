const { FLOWS, USUARIOS } = require("../../config/constants");
const { REQ_SIMULACION_ACTIVO, MSG_PREPARADO,REQ_SIMULACION_PENSIONADO,MSG_INGRESE_CREDENCIAL,MSG_NO_TE_PREOCUPES } = require("./messages");

// Centraliza los nombres de flujo
const FLOW_NAME = FLOWS.SIMULACION.NAME;
const STEPS = FLOWS.SIMULACION.STEPS;

const stepHandlers = {
  [STEPS.SIMULACION_INICIAL]: async (userId, text, state) => {
    if (state.userType == USUARIOS.ACTIVO) {
      return {
        reply: [REQ_SIMULACION_ACTIVO(), MSG_PREPARADO()],
        newState: {
          flow: FLOW_NAME, step: STEPS.SIMULACION_CREDENCIAL
        }
      }
    } else if (state.userType == USUARIOS.PENSIONADO) {
      return {
        reply: [REQ_SIMULACION_PENSIONADO(), MSG_PREPARADO()],
        newState: {
          flow: FLOW_NAME, step: STEPS.SIMULACION_CREDENCIAL
        }
      }
    }
  },
  [STEPS.SIMULACION_CREDENCIAL]: async (userId, text, state) => {
    const texto = text.trim().toLowerCase();
    if (texto === "sí" || texto === "si") {
      return {
        reply: MSG_INGRESE_CREDENCIAL(),
        newState: {
          flow: FLOW_NAME, step: STEPS.VALIDACION_CREDENCIAL
        }
      }
    } else {
      return {
        reply: MSG_NO_TE_PREOCUPES(),
        newState: {
          flow: FLOW_NAME,
          step: STEPS.SIMULACION_CREDENCIAL,
        }
      }
    }
  },
  [STEPS.VALIDACION_CREDENCIAL]: async (userId, text, state) => {
    // Aquí se manejaría la validación de la credencial enviada por el usuario
    
  }

}
//1. Recibe la credencial 
//2. Valida la credencial llamando al servicio correspondiente
//3. Responde al 

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
