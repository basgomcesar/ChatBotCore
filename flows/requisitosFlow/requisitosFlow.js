const { FLOWS, USUARIOS } = require("../../config/constants");
const fs = require("fs");
const path = require("path");

const {
  PREGUNTAR_TIPO_PRESTAMO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO,
  REQUISITOS_MEDIANO_PLAZO_ACTIVO,
  REQUISITOS_MEDIANO_PLAZO_PENSIONADO,
} = require("./messages");

const FLOW = FLOWS.REQUISITOS.NAME;
const STEPS = FLOWS.REQUISITOS.STEPS;

// --- Configuración centralizada de archivos y mensajes ---
const requisitosConfig = {
  [USUARIOS.ACTIVO]: {
    "1": {
      fileName: "PCPA.pdf",
      reply: REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO,
      caption: "📄 *Solicitud de Préstamo a Corto Plazo para Personal Activo*",
    },
    "2": {
      fileName: "DOMI.pdf",
      reply: REQUISITOS_MEDIANO_PLAZO_ACTIVO,
      caption: "📄 *Solicitud de Préstamo a Mediano Plazo para Personal Activo*",
    },
  },
  [USUARIOS.PENSIONADO]: {
    "1": {
      fileName: "PCPP.pdf",
      reply: REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO,
      caption: "📄 *Solicitud de Préstamo a Corto Plazo para Personal Pensionado*",
    },
    "2": {
      fileName: "PMP.pdf",
      reply: REQUISITOS_MEDIANO_PLAZO_PENSIONADO,
      caption: "📄 *Solicitud de Préstamo a Mediano Plazo para Personal Pensionado*",
    },
  },
};

// --- Función auxiliar para construir la respuesta ---
function buildResponse(config) {
  try {
    const pdfPath = path.join(__dirname, "..", "..", "archivos", config.fileName);
    const documentBuffer = fs.readFileSync(pdfPath);

    return {
      reply: config.reply,
      file: {
        document: documentBuffer,
        fileName: config.fileName,
        mimetype: "application/pdf",
        caption: config.caption,
      },
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.MENU,
      },
    };
  } catch (err) {
    console.error(`⚠️ Error al leer el archivo ${config.fileName}:`, err.message);
    return {
      reply: "❌ No se encontró el archivo de requisitos. Contacta con soporte.",
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.MENU,
      },
    };
  }
}

const stepHandlers = {
  [STEPS.REQUISITOS_INICIAL]: (userId, text, state) => ({
    reply: PREGUNTAR_TIPO_PRESTAMO(state.name),
    newState: { flow: FLOW, step: STEPS.ESPERANDO_TIPO_PRESTAMO },
  }),

  [STEPS.ESPERANDO_TIPO_PRESTAMO]: (userId, text, state) => {
    const option = text.trim();
    const userTypeConfig = requisitosConfig[state.userType];

    if (userTypeConfig && userTypeConfig[option]) {
      return buildResponse(userTypeConfig[option]);
    }

    // Caso inválido
    return {
      reply: PREGUNTAR_TIPO_PRESTAMO(state.name),
      newState: { flow: FLOW, step: STEPS.ESPERANDO_TIPO_PRESTAMO },
    };
  },

  [STEPS.ENVIANDO_REQUISITOS]: () => ({
    reply: "📋 A continuación se envían los requisitos para el trámite.",
    newState: {
      flow: FLOWS.BIENVENIDA.NAME,
      step: FLOWS.BIENVENIDA.STEPS.MENU,
    },
  }),
};

module.exports = {
  handle: async (userId, text, state) => {
    const handler = stepHandlers[state.step];
    if (handler) return handler(userId, text, state);

    return {
      reply: "❌ Paso no reconocido en el flujo de requisitos.",
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.MENU,
      },
    };
  },
};
