const { FLOWS } = require("../../config/constants");
const { PREGUNTAR_TIPO_PRESTAMO } = require("./messages");

const FLOW = FLOWS.REQUISITOS.NAME;
const STEPS = FLOWS.REQUISITOS.STEPS;

const stepHandlers = {
  [STEPS.REQUISITOS_INICIAL]: (userId, text, state) => ({
    reply: PREGUNTAR_TIPO_PRESTAMO(state.name),
    newState: { flow: FLOW, step: STEPS.ENVIANDO_REQUISITOS },
  }),
  [STEPS.ENVIANDO_REQUISITOS]: (userId, text, state) => ({
    reply: "A CONTIENUACION SE ENVIAN LOS REQUISITOS PARA EL TRAMITE",
    newState: { flow: "BIENVENIDA", step: "MENU" },
  }),
};

module.exports = {
  handle: async (userId, text, state) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de requisitos",
      newState: { flow: "welcome", step: 0 },
    };
  },
};
