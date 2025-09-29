const { FLOWS } = require("../../config/constants");
const { BIENVENIDA, MENU,ERRORES } = require("./messages");

// Centraliza los nombres de flujo
const FLOW_NAME = FLOWS.BIENVENIDA.NAME;
const STEPS = FLOWS.BIENVENIDA.STEPS;

const stepHandlers = {
  [STEPS.SALUDO_INICIAL]: async (userId, text, state) => ({
    reply: BIENVENIDA(),
    newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_NOMBRE }
  }),

  [STEPS.ESPERANDO_NOMBRE]: async (userId, text, state) => {
    const nombre = text.trim();
    if (nombre.length < 2) {
      return {
        reply: ERRORES.NOMBRE_INVALIDO,
        newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_NOMBRE }
      };
    }
    return {
      reply: `¡Encantado de conocerte, *${nombre}*! 🙌\n${MENU(nombre)}`,
      newState: { flow: FLOW_NAME, step: STEPS.MENU, name:nombre }
    };
  },

  [STEPS.MENU]: async (userId, text, state) => {
    switch (text.trim()) {
      case "1":
        return {
          reply: "📄 Estás entrando al flujo de *Requisitos y Formatos*.",
          newState: { flow: FLOWS.REQUISITOS.NAME, step: FLOWS.REQUISITOS.STEPS.REQUISITOS_INICIAL }
        };
      case "2":
        return {
          reply: "📞 Te comunicaré con un agente de soporte.",
          newState: { flow: "SOPORTE", step: "INICIO" } // Usa aquí tus constantes si tienes el flujo de soporte definido
        };
      case "3":
        return {
          reply: "👋 Gracias por comunicarte con *IPEBOT*. ¡Hasta pronto!",
          newState: { flow: FLOW_NAME, step: STEPS.INICIO }
        };
      default:
        return {
          reply: `❌ Opción no válida. Elige una opción:\n\n${MENU}`,
          newState: { flow: FLOW_NAME, step: STEPS.MENU }
        };
    }
  }
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
      newState: { flow: FLOW_NAME, step: STEPS.SALUDO_INICIAL }
    };
  }
};