/**
 * Simulation flow handler
 * Manages the flow for loan simulation based on user credentials
 * @module simulacionFlow
 */

const { FLOWS, USUARIOS } = require("../../config/constants");
const {
  REQ_SIMULACION_ACTIVO,
  MSG_PREPARADO,
  REQ_SIMULACION_PENSIONADO,
  MSG_INGRESE_CREDENCIAL,
  MSG_NO_TE_PREOCUPES,
  MSG_CREDENCIAL_PROCESADA,
  MSG_ERROR_PROCESANDO_CREDENCIAL,
} = require("./messages");
const { procesarCredencial, validarImagen } = require("../../services/imageProcessingService");
const logger = require("../../config/logger");

// Centralize flow constants
const FLOW_NAME = FLOWS.SIMULACION.NAME;
const STEPS = FLOWS.SIMULACION.STEPS;

/**
 * Validates if user sent an image message
 * @param {object} messageData - Message data containing imageBuffer and messageType
 * @returns {object|null} Error response if invalid, null if valid
 */
function validateImageMessage(messageData) {
  const { imageBuffer, messageType } = messageData || {};
  
  if (!imageBuffer || messageType !== "image") {
    return {
      reply:
        "❌ Por favor, envía una foto de tu credencial del IPE.\n\n" +
        "La imagen debe ser clara y legible.\n\n" +
        "Si deseas cancelar, escribe:  cancelar",
      newState: {
        flow: FLOW_NAME,
        step: STEPS.VALIDACION_CREDENCIAL,
      },
    };
  }
  
  return null;
}

const stepHandlers = {
  [STEPS.SIMULACION_INICIAL]: async (userId, text, state) => {
    const messages =
      state.userType === USUARIOS.ACTIVO
        ? [REQ_SIMULACION_ACTIVO(), MSG_PREPARADO()]
        : [REQ_SIMULACION_PENSIONADO(), MSG_PREPARADO()];

    return {
      reply: messages,
      newState: {
        flow: FLOW_NAME,
        step: STEPS.SIMULACION_CREDENCIAL,
      },
    };
  },
  [STEPS.SIMULACION_CREDENCIAL]: async (userId, text, state) => {
    const texto = text.trim().toLowerCase();
    
    if (texto === "sí" || texto === "si") {
      return {
        reply: MSG_INGRESE_CREDENCIAL(),
        newState: {
          flow: FLOW_NAME,
          step: STEPS.VALIDACION_CREDENCIAL,
        },
      };
    }
    
    return {
      reply: MSG_NO_TE_PREOCUPES(),
      newState: {
        flow: FLOW_NAME,
        step: STEPS.SIMULACION_CREDENCIAL,
      },
    };
  },
  [STEPS.VALIDACION_CREDENCIAL]: async (userId, text, state, messageData) => {
    const { imageBuffer, messageType } = messageData || {};
    logger.debug(`messageType: ${messageType}`);

    // Validate image message
    const imageValidationError = validateImageMessage(messageData);
    if (imageValidationError) {
      return imageValidationError;
    }

    try {
      // Validate image format
      const esImagenValida = await validarImagen(imageBuffer);
      if (!esImagenValida) {
        return {
          reply:
            "❌ El archivo enviado no es una imagen válida.\n\n" +
            "Por favor, envía una foto en formato JPG o PNG.",
          newState: {
            flow: FLOW_NAME,
            step: STEPS.VALIDACION_CREDENCIAL,
          },
        };
      }

      // Process credential
      logger.info(`🔄 Procesando credencial para usuario ${userId}`);
      const resultado = await procesarCredencial(imageBuffer, userId);

      if (resultado.success) {
        return {
          reply: MSG_CREDENCIAL_PROCESADA(
            resultado.numeroAfiliacion,
            resultado.tipoCredencial,
            resultado.simulacion
          ),
          newState: {
            flow: FLOW_NAME,
            step: STEPS.SOLICITAR_ESTADO_CUENTA,
            numeroAfiliacion: resultado.numeroAfiliacion,
            tipoCredencial: resultado.tipoCredencial,
          },
        };
      }

      return {
        reply: MSG_ERROR_PROCESANDO_CREDENCIAL(resultado.mensaje),
        newState: {
          flow: FLOW_NAME,
          step: STEPS.VALIDACION_CREDENCIAL,
        },
      };
    } catch (error) {
      logger.error(
        `❌ Error inesperado procesando credencial para ${userId}: ${error.message}`
      );
      return {
        reply: "❌ Error al procesar la imagen. Por favor, intenta de nuevo.",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.VALIDACION_CREDENCIAL,
        },
      };
    }
  },
};

module.exports = {
  /**
   * Handles the simulation flow steps
   * @param {string} userId - User ID
   * @param {string} text - User input text
   * @param {object} state - Current user state
   * @param {object} messageData - Message data (text, imageBuffer, documentBuffer, etc.)
   * @returns {Promise<object>} Object containing reply and newState
   */
  handle: async (userId, text, state, messageData = {}) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state, messageData);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de Simulación.",
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.MENU,
      },
    };
  },
};
