const { FLOWS, USUARIOS } = require("../../config/constants");
const { REQ_SIMULACION_ACTIVO, MSG_PREPARADO, REQ_SIMULACION_PENSIONADO, MSG_INGRESE_CREDENCIAL, MSG_NO_TE_PREOCUPES, MSG_PROCESANDO_CREDENCIAL, MSG_CREDENCIAL_PROCESADA, MSG_ERROR_PROCESANDO_CREDENCIAL } = require("./messages");
const { procesarCredencial, validarImagen } = require("../../services/imageProcessingService");
const logger = require("../../config/logger");

// Centraliza los nombres de flujo
const FLOW_NAME = FLOWS.SIMULACION.NAME;
const STEPS = FLOWS.SIMULACION.STEPS;

const stepHandlers = {
  [STEPS.SIMULACION_INICIAL]: async (userId, text, state) => {
    if (state.userType === USUARIOS.ACTIVO) {
      return {
        reply: [REQ_SIMULACION_ACTIVO(), MSG_PREPARADO()],
        newState: {
          flow: FLOW_NAME, step: STEPS.SIMULACION_CREDENCIAL
        }
      }
    } else if (state.userType === USUARIOS.PENSIONADO) {
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
  [STEPS.VALIDACION_CREDENCIAL]: async (userId, text, state, messageData) => {
    // Aquí se manejaría la validación de la credencial enviada por el usuario
    const { imageBuffer, messageType } = messageData || {};
    logger.debug(`imageBuffer: ${imageBuffer ? `${imageBuffer.length} bytes` : 'null'}`);
    logger.debug(`messageType: ${messageType}`);
    if (!imageBuffer || messageType !== "image") {
      return {
        reply: "❌ Por favor, envía una foto de tu credencial del IPE.\n\n" +
          "La imagen debe ser clara y legible.\n\n" +
          "Si deseas cancelar, escribe:  cancelar",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.VALIDACION_CREDENCIAL
        }
      }
    }
    try {
      const esImagenValida = await validarImagen(imageBuffer);
      if (!esImagenValida) {
        return {
          reply: "❌ El archivo enviado no es una imagen válida.\n\n" +
            "Por favor, envía una foto en formato JPG o PNG.",
          newState: {
            flow: FLOW_NAME,
            step: STEPS.VALIDACION_CREDENCIAL
          }
        }
      }
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
            tipoCredencial: resultado.tipoCredencial
          }
        }
      } else {
        return {
          reply: MSG_ERROR_PROCESANDO_CREDENCIAL(resultado.mensaje),
          newState: {
            flow: FLOW_NAME,
            step: STEPS.VALIDACION_CREDENCIAL
          }
        }
      }
    } catch (error) {
      logger.error(`❌ Error inesperado procesando credencial para ${userId}: ${error.message}`);
      return {
        reply: "❌ Error al procesar la imagen. Por favor, intenta de nuevo.",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.VALIDACION_CREDENCIAL
        }
      }
    }
  }

}
//1. Recibe la credencial 
//2. Valida la credencial llamando al servicio correspondiente
//3. Responde al 

module.exports = {
  /**
   * Maneja los pasos del flujo de Simulacion 
   */
  handle: async (userId, text, state, messageData = {}) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state, messageData);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de Simulación.",
      newState: { flow: FLOW_NAME, step: STEPS.SALUDO_INICIAL },
    };
  },
};
