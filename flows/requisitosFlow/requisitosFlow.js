const { FLOWS, USUARIOS } = require("../../config/constants");
const {
  PREGUNTAR_TIPO_PRESTAMO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO,
  REQUISITOS_MEDIANO_PLAZO_ACTIVO,
  REQUISITOS_MEDIANO_PLAZO_PENSIONADO,
} = require("./messages");

const FLOW = FLOWS.REQUISITOS.NAME;
const STEPS = FLOWS.REQUISITOS.STEPS;

const stepHandlers = {
  [STEPS.REQUISITOS_INICIAL]: (userId, text, state) => ({
    reply: PREGUNTAR_TIPO_PRESTAMO(state.name),
    newState: { flow: FLOW, step: STEPS.ESPERANDO_TIPO_PRESTAMO },
  }),

  [STEPS.ESPERANDO_TIPO_PRESTAMO]: (userId, text, state) => {
    const option = text.trim();

    if (option === "1" && state.userType === USUARIOS.ACTIVO) {
      return {
        reply: REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO,
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    } else if (option === "2" && state.userType === USUARIOS.ACTIVO) {
      return {
        reply: REQUISITOS_MEDIANO_PLAZO_ACTIVO,
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    } else if (option === "1" && state.userType === USUARIOS.PENSIONADO) {
      return {
        reply: REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO,
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    } else if (option === "2" && state.userType === USUARIOS.PENSIONADO) {
      return {
        reply: REQUISITOS_MEDIANO_PLAZO_PENSIONADO,
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    }

    // Caso inválido
    return {
      reply: PREGUNTAR_TIPO_PRESTAMO(state.name),
      newState: { flow: FLOW, step: STEPS.ESPERANDO_TIPO_PRESTAMO },
    };
  },

  [STEPS.ENVIANDO_REQUISITOS]: (userId, text, state) => ({
    reply: "📋 A continuación se envían los requisitos para el trámite.",
    newState: { flow: FLOWS.BIENVENIDA.NAME, step: FLOWS.BIENVENIDA.STEPS.MENU },
  }),
};

module.exports = {
  handle: async (userId, text, state) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de requisitos.",
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.MENU,
      },
    };
  },
};
