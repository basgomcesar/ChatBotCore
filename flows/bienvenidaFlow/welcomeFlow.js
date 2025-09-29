const { FLOWS } = require("../../config/constants");
const { BIENVENIDA, MENU, ERRORES } = require("./messages");

// Centraliza los nombres de flujo
const FLOW_NAME = FLOWS.BIENVENIDA.NAME;
const STEPS = FLOWS.BIENVENIDA.STEPS;


const menuRoutes = {
  "1": { flow: FLOWS.REQUISITOS.NAME, step: FLOWS.REQUISITOS.STEPS.REQUISITOS_INICIAL },
  "2": { flow: FLOWS.SIMULACION.NAME, step: FLOWS.SIMULACION.STEPS.SIMULACION_INICIAL },
  "3": { flow: FLOWS.LLENADO_SOLICITUD.NAME, step: FLOWS.LLENADO_SOLICITUD.STEPS.LLENADO_SOLICITUD_INICIAL },
  "4": { flow: FLOWS.COMPROBANTE.NAME, step: FLOWS.COMPROBANTE.STEPS.COMPROBANTE_INICIAL },
  "5": { flow: FLOWS.ASESOR.NAME, step: FLOWS.ASESOR.STEPS.ASESOR_INICIAL },
  "6": { flow: FLOWS.PREGUNTAS_FRECUENTES.NAME, step: FLOWS.PREGUNTAS_FRECUENTES.STEPS.PREGUNTAS_FRECUENTES_INICIAL },
};

const stepHandlers = {
  [STEPS.SALUDO_INICIAL]: async (userId, text, state) => ({
    reply: BIENVENIDA(),
    newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_NOMBRE },
  }),
  [STEPS.ESPERANDO_NOMBRE]: async (userId, text, state) => {
    const nombre = text.trim();
    // Validación mínima de nombre
    if (nombre.length < 2) {
      return {
        reply: ERRORES.NOMBRE_INVALIDO,
        newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_NOMBRE },
      };
    }
    return {
      reply: `¡Encantado de conocerte, *${nombre}*! 🙌\n${MENU(nombre)}`,
      newState: { flow: FLOW_NAME, step: STEPS.MENU, name: nombre },
    };
  },

  [STEPS.MENU]: async (userId, text, state) => {
    const route = menuRoutes[text.trim()];
    return route
      ? { newState: route }
      : { newState: { flow: FLOW_NAME, step: STEPS.MENU } };
  },
};

module.exports = {
  /**
   * Maneja los pasos del flujo de bienvenida
   */
  handle: async (userId, text, state) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de bienvenida.",
      newState: { flow: FLOW_NAME, step: STEPS.SALUDO_INICIAL },
    };
  },
};
