/**
 * Filling request flow handler
 * Manages the flow for filling loan application forms
 * Processes user credentials and generates PDF documents
 * @module llenadoSolicitudFlow
 */

const { FLOWS } = require("../../config/constants");
const {
  preguntarTipoSolicitudPrestamo,
  pedirCredencialCortoPlazo,
  pedirCredencialMedianoPlazo,
  verificarSolicitudPrestamo,
  verificarSolicitudPrestamoCPPensionado,
  datosVerificadosSolicitudMedianoPlazoPensionado,
} = require("./messages");
const {
  procesarCredencialSolicitud,
  procesarCredencialSolicitudManual,
  validarImagen,
} = require("../../services/imageProcessingService");
const logger = require("../../config/logger");
const { llenarSolicitudPDFActivos, llenarSolicitudPDFPensionados, llenarSolicitudPDFPensionadosMedianoPlazo } = require("../../utils/llenadoSolicitud");

// Centralize flow constants
const FLOW_NAME = FLOWS.LLENADO_SOLICITUD.NAME;
const STEPS = FLOWS.LLENADO_SOLICITUD.STEPS;

// Validation constants
const MIN_QUINCENAS_SIN_AVAL = 240; // 10 years

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
        step: STEPS.PROCESAR_CREDENCIAL,
      },
    };
  }

  return null;
}

/**
 * Parses manual input for affiliation and folio numbers
 * @param {string} text - User input text
 * @returns {object} Object with numAfiliacion and folio properties
 */
function parseManualInput(text) {
  const texto = text.trim().toLowerCase();
  const partes = texto.split(",");
  let numAfiliacion = null;
  let folio = null;

  partes.forEach((parte) => {
    const [clave, valor] = parte.split(":").map((s) => s.trim());
    if (clave === "afiliacion" || clave === "pension") {
      numAfiliacion = valor;
    } else if (clave === "folio") {
      folio = valor;
    }
  });

  return { numAfiliacion, folio };
}

const stepHandlers = {
  [STEPS.LLENADO_SOLICITUD_INICIAL]: async (userId, text, state) => ({
    reply: preguntarTipoSolicitudPrestamo(),
    newState: {
      flow: FLOW_NAME,
      step: STEPS.RECIBIR_CREDENCIAL,
      tipoPrestamo: state.tipoPrestamo,
    },
  }),

  [STEPS.RECIBIR_CREDENCIAL]: async (userId, text, state) => {
    const tipo = text.trim();

    if (tipo === "1" || tipo.toLowerCase() === "corto plazo") {
      return {
        reply: pedirCredencialCortoPlazo(),
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_CREDENCIAL,
          tipoPrestamo: "CortoPlazo",
        },
      };
    }

    if (tipo === "2" || tipo.toLowerCase() === "mediano plazo") {
      return {
        reply: pedirCredencialMedianoPlazo(),
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_CREDENCIAL,
          tipoPrestamo: "MedianoPlazo",
        },
      };
    }

    return {
      reply:
        "Opción no válida. \nPor favor, selecciona 1️⃣ para Corto Plazo o 2️⃣ para Mediano Plazo.",
      newState: {
        flow: FLOW_NAME,
        step: STEPS.LLENADO_SOLICITUD_INICIAL,
        tipoPrestamo: state.tipoPrestamo,
        numeroAfiliacion: state.numeroAfiliacion,
      },
    };
  },
  [STEPS.PROCESAR_INFO_MANUALMENTE]: async (userId, text, state, messageData) => {
    const { numAfiliacion, folio } = parseManualInput(text);

    if (numAfiliacion && folio) {
      // Despues de obtener los datos manuales, puedo verificar si esta pidiendo Corto o Mediano Plazo y si es activo o pensionado
      const infoUsuario = await procesarCredencialSolicitudManual(
        numAfiliacion,
        folio,
        state.tipoPrestamo
      );
      //case user pensionado 
      if (infoUsuario.tipoDerechohabiente === "P" && state.tipoPrestamo === "CortoPlazo") {
        return {
          reply: verificarSolicitudPrestamoCPPensionado(infoUsuario),
          newState: {
            flow: FLOW_NAME,
            step: STEPS.CONFIRMAR_INFORMACION,
            tipoPrestamo: state.tipoPrestamo,
            folio,
            numeroAfiliacion: numAfiliacion,
          },
        };
      }
      if (infoUsuario.tipoDerechohabiente === "P" && state.tipoPrestamo === "MedianoPlazo") {
        console.log("Usuario pensionado solicitando mediano plazo");
        return {
          reply: ["✅ Datos verificados correctamente.", datosVerificadosSolicitudMedianoPlazoPensionado()],
          newState: {
            flow: FLOW_NAME,
            step: STEPS.PROCESAR_NUMEROS_AVALES,
          },
        };
      }

      //case user activo mayor a 10 años
      //case user activo menor a 10 años ya validado en paso anterior


      return {
        reply: verificarSolicitudPrestamo(infoUsuario),
        newState: {
          flow: FLOW_NAME,
          step: STEPS.CONFIRMAR_INFORMACION,
          tipoPrestamo: state.tipoPrestamo,
          folio,
          numeroAfiliacion: numAfiliacion,
        },
      };
    }

    return {
      reply:
        "❌ Formato incorrecto. Por favor, usa el formato:\nafiliacion: 1234567, folio: 8901234",
      newState: {
        flow: FLOW_NAME,
        step: STEPS.PROCESAR_INFO_MANUALMENTE,
      },
    };
  },
  [STEPS.CONFIRMAR_INFORMACION]: async (userId, text, state, messageData) => {
    const respuesta = text.trim().toLowerCase();
    console.log(`Usuario respondió en confirmar información: ${respuesta}`);

    if (respuesta === "si") {
      console.log("Usuario confirmó la información. Generando solicitud...");
      return {
        newState: { flow: FLOW_NAME, step: STEPS.LLENADO_SOLICITUD_PDF },
      };
    }

    if (respuesta === "no") {
      return {
        reply:
          "❌ Solicitud cancelada. Si deseas iniciar de nuevo, por favor selecciona la opción correspondiente en el menú.",
        newState: { flow: FLOWS.BIENVENIDA.NAME, step: FLOWS.BIENVENIDA.STEPS.MENU },
      };
    }

    return {
      reply: "Por favor, responde 'si' o 'no'.",
      newState: {
        flow: FLOW_NAME,
        step: STEPS.CONFIRMAR_INFORMACION,
      },
    };
  },
  [STEPS.LLENADO_SOLICITUD_PDF]: async (userId, text, state, messageData) => {
    console.log("Generando PDF de solicitud...");
    const infoUsuario = await procesarCredencialSolicitudManual(
      state.numeroAfiliacion,
      state.folio,
      state.tipoPrestamo
    );
    infoUsuario.folioSolicitud = state.folio;

    let rutaPDF;
    if (infoUsuario.tipoDerechohabiente === "P" && state.tipoPrestamo === "CortoPlazo") {
      rutaPDF = await llenarSolicitudPDFPensionados(
        { remitente: userId },
        infoUsuario
      );
      console.log("PDF generado en:", rutaPDF);
    } else if (infoUsuario.tipoDerechohabiente === "A" && state.tipoPrestamo === "CortoPlazo" && infoUsuario.quincenasCotizadas >= MIN_QUINCENAS_SIN_AVAL) {
      rutaPDF = await llenarSolicitudPDFActivos(
        { remitente: userId },
        infoUsuario
      );
      console.log("PDF generado en:", rutaPDF);
    } else if (state.tipoPrestamo === "CortoPlazo" && infoUsuario.tipoDerechohabiente === "A" && infoUsuario.quincenasCotizadas < MIN_QUINCENAS_SIN_AVAL) {
      return {
        reply: "🔍 Detectamos que tu antigüedad es menor a 10 años. " +
          "Para continuar, es necesario un aval en servicio activo. " +
          "Por favor envía la credencial IPE del aval (foto clara frontal).",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_CREDENCIAL_AVAL,
        },
      };
    } else if (state.tipoPrestamo === "MedianoPlazo" && infoUsuario.tipoDerechohabiente === "P") {
      // Llenado de PDF para pensionados en mediano plazo

      rutaPDF = await llenarSolicitudPDFPensionadosMedianoPlazo(
        infoUsuario,
        state.avales
      );

      console.log("PDF generado en:", rutaPDF);
    }


    return {
      file: rutaPDF,
      reply: "✅ Tu solicitud ha sido generada exitosamente.",
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.MENU,
      },
    };
  },
  [STEPS.PROCESAR_CREDENCIAL]: async (userId, text, state, messageData) => {
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
            step: STEPS.PROCESAR_CREDENCIAL,
          },
        };
      }

      // Process credential
      logger.info(`🔄 Procesando credencial para usuario ${userId}`);
      const resultado = await procesarCredencialSolicitud(
        imageBuffer,
        userId,
        state.tipoPrestamo
      );

      if (!resultado) {
        return {
          reply:
            "❌ Error al procesar la imagen. Por favor, intenta ingresando la información manualmente. \n\n" +
            "Escribe 'afiliacion/pension' : 1234567 , 'folio': 8901234",
          newState: {
            flow: FLOW_NAME,
            step: STEPS.PROCESAR_INFO_MANUALMENTE,
          },
        };
      }

      if (resultado.tipoDerechohabiente === "P" && state.tipoPrestamo === "MedianoPlazo") {
        console.log("Usuario pensionado solicitando mediano plazo");
        return {
          reply: ["✅ Datos verificados correctamente.", datosVerificadosSolicitudMedianoPlazoPensionado()],
          newState: {
            flow: FLOW_NAME,
            folio: resultado.folio,
            numeroAfiliacion: resultado.numAfiliacion,
            step: STEPS.PROCESAR_NUMEROS_AVALES,
          },
        };
      }

      // Handle activo type
      if (resultado.tipoDerechohabiente === "A" && state.tipoPrestamo === "CortoPlazo") {
        // Check if user needs an aval (guarantor)
        if (resultado.quincenasCotizadas < MIN_QUINCENAS_SIN_AVAL) {
          return {
            reply:
              "🔍 Detectamos que tu antigüedad es menor a 10 años. " +
              "Para continuar, es necesario un aval en servicio activo. " +
              "Por favor envía la credencial IPE del aval (foto clara frontal).",
            newState: {
              flow: FLOW_NAME,
              step: STEPS.PROCESAR_CREDENCIAL_AVAL,
              cantidadAvalesRequeridos: 1,
            },
          };
        }

        // User meets requirements
        return {
          reply: verificarSolicitudPrestamo(resultado),
          newState: {
            flow: FLOW_NAME,
            step: STEPS.PROCESAR_INFO_MANUALMENTE,
          },
        };
      }

      // Unknown type
      return {
        reply:
          "❌ No se pudo determinar el tipo de derechohabiente. " +
          "Por favor, intenta ingresando la información manualmente.\n\n" +
          "Escribe 'afiliacion/pension' : 1234567 , 'folio': 8901234",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_INFO_MANUALMENTE,
        },
      };
    } catch (error) {
      logger.error(
        `❌ Error inesperado procesando credencial para ${userId}: ${error.message}`
      );
      return {
        reply:
          "❌ Error al procesar la imagen. Por favor, intenta ingresando la información manualmente. \n\n" +
          "Escribe 'afiliacion/pension' : 1234567 , 'folio': 8901234",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_INFO_MANUALMENTE,
        },
      };
    }
  },
  [STEPS.PROCESAR_NUMEROS_AVALES]: async (userId, text, state, messageData) => {
    const cantidad = parseInt(text.trim(), 10);

    if (isNaN(cantidad) || cantidad <= 0) {
      return {
        reply:
          "❌ Por favor, ingresa un número válido de avales requeridos (mayor a 0).",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_NUMEROS_AVALES,
          cantidadAvalesRequeridos: cantidad,
          avalesProcesados: 0,
        },
      };
    }
    return {
      reply:
        `🔍 Necesitamos procesar las credenciales IPE de tus ${cantidad} aval(es). ` +
        `Por favor envía la credencial IPE del aval 1/${cantidad} (foto clara frontal).`,
      newState: {
        flow: FLOW_NAME,
        step: STEPS.PROCESAR_CREDENCIAL_AVAL,
        cantidadAvalesRequeridos: cantidad,
        avalesProcesados: 0,
      },
    };
  }
  ,
  [STEPS.PROCESAR_CREDENCIAL_AVAL]: async (userId, text, state, messageData) => {
    const { imageBuffer, messageType } = messageData || {};
    logger.debug(`messageType: ${messageType}`);

    // Validate image message
    const imageValidationError = validateImageMessage(messageData);
    if (imageValidationError) {
      return {
        ...imageValidationError,
        newState: {
          ...imageValidationError.newState,
          step: STEPS.PROCESAR_CREDENCIAL_AVAL,
          tipoPrestamo: state.tipoPrestamo,
          infoSolicitante: state.infoSolicitante,
          avales: state.avales || [],
          cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
          avalesProcesados: state.avalesProcesados || 0,
        }
      };
    }

    try {
      const esImagenValida = await validarImagen(imageBuffer);
      if (!esImagenValida) {
        return {
          reply:
            "❌ El archivo enviado no es una imagen válida.\n\n" +
            "Por favor, envía una foto en formato JPG o PNG.",
          newState: {
            flow: FLOW_NAME,
            step: STEPS.PROCESAR_CREDENCIAL_AVAL,
            tipoPrestamo: state.tipoPrestamo,
            infoSolicitante: state.infoSolicitante,
            avales: state.avales || [],
            cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
            avalesProcesados: state.avalesProcesados || 0,
          },
        };
      }

      const resultado = await procesarCredencialSolicitud(
        imageBuffer,
        userId,
        "CortoPlazo"
      );

      if (!resultado || !resultado.numAfiliacion) {
        return {
          reply: "❌ Error al procesar la imagen del aval. Por favor, intenta nuevamente.",
          newState: {
            flow: FLOW_NAME,
            step: STEPS.PROCESAR_CREDENCIAL_AVAL,
            tipoPrestamo: state.tipoPrestamo,
            avales: state.avales || [],
            cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
          },
        };
      }

      // **EXTRAER SOLO LOS DATOS NECESARIOS DEL AVAL**
      const datosAval = {
        afiliacion: resultado.numAfiliacion || null,
        folio: resultado.folio,
        tipo: resultado.tipoDerechohabiente,
      };

      const avalesActualizados = [...(state.avales || []), datosAval];
      logger.debug(`Avales actualizados: ${JSON.stringify(avalesActualizados)}`);
      const cantidadAvalesRequeridos = avalesActualizados.length;

      logger.info(`✅ Aval ${cantidadAvalesRequeridos} procesado: ${JSON.stringify(datosAval)}`);

      // Verificar si ya procesamos todos los avales
      logger.info(`🔄 Avales procesados: ${cantidadAvalesRequeridos}/${state.cantidadAvalesRequeridos}`);
      if (cantidadAvalesRequeridos <= state.cantidadAvalesRequeridos) {
        logger.info(`🔄 Esperando credencial del aval ${cantidadAvalesRequeridos + 1}/${state.cantidadAvalesRequeridos || 0}`);
        return {
          reply:
            `✅ Aval ${cantidadAvalesRequeridos}/${state.cantidadAvalesRequeridos} procesado correctamente.\n\n` +
            `📋 **Datos del aval:**\n` +
            `- Tipo: ${datosAval.tipo === 'A' ? 'Activo' : 'Pensionado'}\n` +
            `- Número: ${datosAval.numeroAfiliacion}\n` +
            `- Folio: ${datosAval.folio}\n\n` +
            `📸 Por favor, envía la credencial IPE del aval ${cantidadAvalesRequeridos + 1}/${state.cantidadAvalesRequeridos}.`,
          newState: {
            flow: FLOW_NAME,
            step: cantidadAvalesRequeridos < state.cantidadAvalesRequeridos ? STEPS.PROCESAR_CREDENCIAL_AVAL : STEPS.LLENADO_SOLICITUD_PDF,
            tipoPrestamo: state.tipoPrestamo,
            infoSolicitante: state.infoSolicitante,
            avales: avalesActualizados,
            cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
          },
        };
      }

      // Todos los avales procesados, proceder a generar PDF
      logger.info(`✅ Todos los avales (${cantidadAvalesRequeridos}) procesados. Generando solicitud...`);

      // Crear resumen de avales para mostrar al usuario
      const resumenAvales = avalesActualizados.map((aval, index) =>
        `${index + 1}. ${aval.tipo === 'A' ? 'Activo' : 'Pensionado'} - ` +
        `Núm: ${aval.numeroAfiliacion || aval.numeroPensionado} - ` +
        `Folio: ${aval.folio}`
      ).join('\n');

      return {
        reply:
          `✅ Todos los avales han sido procesados correctamente (${cantidadAvalesRequeridos}/${state.cantidadAvalesRequeridos}).\n\n` +
          `📋 **Resumen de avales:**\n${resumenAvales}\n\n` +
          `⏳ Procediendo a generar tu solicitud de préstamo...`,
        newState: {
          flow: FLOW_NAME,
          step: STEPS.LLENADO_SOLICITUD_PDF,
          tipoPrestamo: state.tipoPrestamo,
          infoSolicitante: state.infoSolicitante,
          avales: avalesActualizados,
          cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
          avalesProcesados: cantidadAvalesRequeridos,
          folio: state.infoSolicitante?.folio || state.folio,
          numeroAfiliacion: state.infoSolicitante?.numAfiliacion || state.numeroAfiliacion,
        },
      };

    } catch (error) {
      logger.error(
        `❌ Error inesperado procesando credencial de aval para ${userId}: ${error.message}`
      );
      return {
        reply:
          "❌ Error al procesar la imagen del aval. Por favor, intenta nuevamente.",
        newState: {
          flow: FLOW_NAME,
          step: STEPS.PROCESAR_CREDENCIAL_AVAL,
          tipoPrestamo: state.tipoPrestamo,
          infoSolicitante: state.infoSolicitante,
          avales: state.avales || [],
          cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
          avalesProcesados: state.avalesProcesados || 0,
        },
      };
    }
  },

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
