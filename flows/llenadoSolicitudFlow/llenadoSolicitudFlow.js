/**
 * Filling request
 * Displays flow to fill a request
 * @module llenadoSolicitud
 */

const { FLOWS } = require("../../config/constants");
const { preguntarTipoSolicitudPrestamo, pedirCredencialCortoPlazo, pedirCredencialMedianoPlazo, verificarSolicitudPrestamo } = require("./messages");
const { procesarCredencial, procesarCredencialSolicitud, procesarCredencialSolicitudManual, validarImagen } = require("../../services/imageProcessingService");
const logger = require("../../config/logger");
const { llenarSolicitudPDFActivos } = require("../../utils/llenadoSolicitud");

// Centralize flow constants
const FLOW_NAME = FLOWS.LLENADO_SOLICITUD.NAME;
const STEPS = FLOWS.LLENADO_SOLICITUD.STEPS;

const stepHandlers = {
  [STEPS.LLENADO_SOLICITUD_INICIAL]: async (userId, text, state) => ({
    reply: preguntarTipoSolicitudPrestamo(),
    newState: { flow: FLOW_NAME, step: STEPS.RECIBIR_CREDENCIAL, tipoPrestamo: state.tipoPrestamo },
  }),
  [STEPS.RECIBIR_CREDENCIAL]: async (userId, text, state) => {
    const tipo = text.trim();
    if (tipo === "1" || tipo.toLowerCase() === "corto plazo") {
      return {
        reply: pedirCredencialCortoPlazo(),
        newState: { flow: FLOW_NAME, step: STEPS.PROCESAR_CREDENCIAL, tipoPrestamo: "CortoPlazo" },
      };
    } else if (tipo === "2" || tipo.toLowerCase() === "mediano plazo") {
      return {
        reply: pedirCredencialMedianoPlazo(),
        newState: { flow: FLOW_NAME, step: STEPS.PROCESAR_CREDENCIAL, tipoPrestamo: "MedianoPlazo" },
      };
    } else {
      return {
        reply: "Opción no válida. \nPor favor, selecciona 1️⃣ para Corto Plazo o 2️⃣ para Mediano Plazo.",
        newState: { flow: FLOW_NAME, step: STEPS.LLENADO_SOLICITUD_INICIAL, tipoPrestamo: state.tipoPrestamo, numeroAfiliacion: state.numeroAfiliacion },
      };
    }
  },
  [STEPS.PROCESAR_INFO_MANUALMENTE]: async (userId, text, state, messageData) => {
    const texto = text.trim().toLowerCase();
    const partes = texto.split(",");
    let numAfiliacion = null;
    let folio = null;
    partes.forEach(parte => {
      const [clave, valor] = parte.split(":").map(s => s.trim());
      if (clave === "afiliacion" || clave === "pension") {
        numAfiliacion = valor;
      } else if (clave === "folio") {
        folio = valor;
      }
    });
    if (numAfiliacion && folio) {
      // Aquí se podría llamar a una función para obtener más datos del usuario si es necesario
      const infoUsuario = await procesarCredencialSolicitudManual(numAfiliacion, folio, state.tipoPrestamo);

      return {
        reply: verificarSolicitudPrestamo(infoUsuario),
        newState: { flow: FLOW_NAME, step: STEPS.CONFIRMAR_INFORMACION, tipoPrestamo: state.tipoPrestamo, folio: folio,numeroAfiliacion: numAfiliacion},
      };
    }
  },
  [STEPS.CONFIRMAR_INFORMACION]: async (userId, text, state, messageData) => {
    const respuesta = text.trim().toLowerCase();
    if (respuesta === "si") {
      return {
        newState: { flow: FLOW_NAME, step: STEPS.LLENADO_SOLICITUD_PDF },
      };
    } else if (respuesta === "no") {
      return {
        reply: "❌ Solicitud cancelada. Si deseas iniciar de nuevo, por favor selecciona la opción correspondiente en el menú.",
        newState: { flow: FLOWS.BIENVENIDA.NAME, step: FLOWS.BIENVENIDA.STEPS.MENU },
      };
    }
  },
  [STEPS.LLENADO_SOLICITUD_PDF]: async (userId, text, state, messageData) => {
    // Aquí se manejaría el llenado del PDF de la solicitud
    const infoUsuario = await procesarCredencialSolicitudManual(state.numeroAfiliacion, state.folio, state.tipoPrestamo);
    infoUsuario.folioSolicitud=state.folio;
    const rutaPDF = await llenarSolicitudPDFActivos({ remitente: userId }, infoUsuario);

    return {
      file: rutaPDF,
      newState: { flow: FLOW_NAME, step: STEPS.LLENADO_SOLICITUD_PDF },
    };
  }
  ,
  [STEPS.PROCESAR_CREDENCIAL]: async (userId, text, state, messageData) => {
    // Aquí se manejaría la validación de la credencial enviada por el usuario
    const { imageBuffer, messageType } = messageData || {};
    logger.debug(`messageType: ${messageType}`);
    if (!imageBuffer || messageType !== "image") {
      return {
        reply: "❌ Por favor, envía una foto de tu credencial del IPE.\n\n" +
          "La imagen debe ser clara y legible.\n\n" +
          "Si deseas cancelar, escribe:  cancelar",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_CREDENCIAL
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
            step: STEPS.PROCESAR_CREDENCIAL
          }
        }
      }
      logger.info(`🔄 Procesando credencial para usuario ${userId}`);
      const resultado = await procesarCredencialSolicitud(imageBuffer, userId, state.tipoPrestamo);


      if (resultado) {
        if (resultado.tipoDerechohabiente === "P") {
          //Es pensionado

        } else if (resultado.tipoDerechohabiente === "A") {
          //Es activo
          if (resultado.quincenasCotizadas < 240) {
            return {
              reply: "🔍 Detectamos que tu antigüedad es menor a 10 años. Para continuar, es necesario un aval en servicio activo. Por favor envía la credencial IPE del aval (foto clara frontal).",
              newState: {
                flow: FLOW_NAME,
                step: STEPS.PROCESAR_CREDENCIAL
              }
            }
          } else {
            //Cumple con las quincenas cotizadas
            return {
              reply: verificarSolicitudPrestamo(resultado),
              newState: {
                flow: FLOW_NAME,
                step: STEPS.PROCESAR_INFO_MANUALMENTE
              }
            }
          }
        }
      } else {

      }
    } catch (error) {
      logger.error(`❌ Error inesperado procesando credencial para ${userId}: ${error.message}`);
      return {
        reply: "❌ Error al procesar la imagen. Por favor, intenta ingresando la información manualmente. \n\n Escribe 'afiliacion/pension' : 1234567 , 'folio': 8901234 ",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_INFO_MANUALMENTE
        }
      }
    }
  }
};

module.exports = {
  /**
   * Handles the Llenado de Solicitud flow steps
   * @param {string} userId - User ID
   * @param {string} text - User input text
   * @param {object} state - Current user state
   * @returns {Promise<object>} Object containing reply and newState
   */
  handle: async (userId, text, state, messageData) => {
    const handler = stepHandlers[state.step];
    if (handler) {
      return handler(userId, text, state, messageData);
    }
    return {
      reply: "❌ Paso no reconocido en el flujo de Llenado de Solicitud.",
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.MENU
      },
    };
  },
};
