/**
 * Welcome flow handler
 * Manages the initial conversation flow including greeting, name collection,
 * user type identification, and main menu navigation
 * @module welcomeFlow
 */

const { FLOWS, USUARIOS } = require("../../config/constants");
const {
  BIENVENIDA,
  MENU,
  ERRORES,
  PREGUNTAR_TIPO_USUARIO,
} = require("./messages");
const { detectUserType, isValidName } = require("../../utils/validations");

// Centralize flow constants
const FLOW_NAME = FLOWS.BIENVENIDA.NAME;
const STEPS = FLOWS.BIENVENIDA.STEPS;

/**
 * Menu routing configuration
 * Maps menu option numbers to their corresponding flow and step
 */
const menuRoutes = {
  1: {
    flow: FLOWS.REQUISITOS.NAME,
    step: FLOWS.REQUISITOS.STEPS.REQUISITOS_INICIAL,
  },
  2: {
    flow: FLOWS.SIMULACION.NAME,
    step: FLOWS.SIMULACION.STEPS.SIMULACION_INICIAL,
  },
  3: {
    flow: FLOWS.LLENADO_SOLICITUD.NAME,
    step: FLOWS.LLENADO_SOLICITUD.STEPS.LLENADO_SOLICITUD_INICIAL,
  },
  4: {
    flow: FLOWS.COMPROBANTE.NAME,
    step: FLOWS.COMPROBANTE.STEPS.COMPROBANTE_INICIAL,
  },
  5: { 
    flow: FLOWS.ASESOR.NAME, 
    step: FLOWS.ASESOR.STEPS.ASESOR_INICIAL 
  },
  6: {
    flow: FLOWS.PREGUNTAS_FRECUENTES.NAME,
    step: FLOWS.PREGUNTAS_FRECUENTES.STEPS.PREGUNTAS_FRECUENTES_INICIAL,
  },
};

const stepHandlers = {
  [STEPS.SALUDO_INICIAL]: async (userId, text, state) => ({
    reply: BIENVENIDA(),
    newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_NOMBRE },
  }),
  [STEPS.ESPERANDO_NOMBRE]: async (userId, text, state) => {
    const nombre = text.trim();
    if (isValidName(nombre)) {
      return {
        reply: PREGUNTAR_TIPO_USUARIO(nombre),
        newState: {
          flow: FLOW_NAME,
          step: STEPS.ESPERANDO_TIPO_USUARIO,
          name: nombre,
        },
      };
    }
    return {
      reply: ERRORES.NOMBRE_INVALIDO,
      newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_NOMBRE },
    };
  },
  [STEPS.ESPERANDO_TIPO_USUARIO]: async (userId, text, state) => {
    const usuario = detectUserType(text);
    if (usuario) {
      return {
        newState: { flow: FLOW_NAME, step: STEPS.MENU, userType: usuario },
      };
    }
    return {
      reply: ERRORES.TIPO_USUARIO_INVALIDO(state.name),
      newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_TIPO_USUARIO },
    };
  },
  [STEPS.MENU]: async (userId, text, state) => {
    return {
      reply: MENU(state.name),
      newState: { flow: FLOW_NAME, step: STEPS.ESPERANDO_OPCION },
    };
  },
  [STEPS.ESPERANDO_OPCION]: async (userId, text, state) => {
    const route = menuRoutes[text.trim()];
    return route
      ? { newState: route }
      : { newState: { flow: FLOW_NAME, step: STEPS.MENU } };
  },
};

module.exports = {
  /**
   * Handles the welcome flow steps
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
      reply: "❌ Paso no reconocido en el flujo de bienvenida.",
      newState: { flow: FLOW_NAME, step: STEPS.SALUDO_INICIAL },
    };
  },
};
