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
} = require("./messages");
const {
  procesarCredencialSolicitud,
  procesarCredencialSolicitudManual,
} = require("../../services/imageProcessingService");
const logger = require("../../config/logger");
const { llenarSolicitudPDFActivos, llenarSolicitudPDFPensionados, llenarSolicitudPDFPensionadosMedianoPlazo } = require("../../utils/llenadoSolicitud");

// Import state management and validation utilities
const { FLOW_NAME, STEPS, SolicitudStateBuilder, UserTypeStateBuilder, PDFGenerationStateBuilder } = require("./solicitudState");
const {
  performCompleteImageValidation,
  validateManualInput,
  determineUserTypeScenario,
  needsAval,
  MIN_QUINCENAS_SIN_AVAL,
} = require("./solicitudValidations");
const {
  createPensionerShortTermResponse,
  createPensionerMediumTermResponse,
  createActiveEmployeeWithAvalResponse,
  createActiveEmployeeNoAvalResponse,
  createCredentialErrorResponse,
  createUnknownUserTypeResponse,
  createAvalProcessingResponse,
  createAvalErrorResponse,
  createPDFCompletionResponse,
} = require("./solicitudResponses");



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
    const { numAfiliacion, folio, isValid } = validateManualInput(text);

    if (!isValid) {
      return {
        reply:
          "❌ Formato incorrecto. Por favor, usa el formato:\nafiliacion: 1234567, folio: 8901234",
        newState: new SolicitudStateBuilder(state)
          .setStep(STEPS.PROCESAR_INFO_MANUALMENTE)
          .build(),
      };
    }

    // Process the credential manually
    const infoUsuario = await procesarCredencialSolicitudManual(
      numAfiliacion,
      folio,
      state.tipoPrestamo
    );

    // Determine user type scenario and create appropriate response
    const scenario = determineUserTypeScenario(infoUsuario, state.tipoPrestamo);

    switch (scenario) {
      case "PENSIONER_SHORT_TERM":
        return createPensionerShortTermResponse(infoUsuario, state);

      case "PENSIONER_MEDIUM_TERM":
        console.log("Usuario pensionado solicitando mediano plazo");
        return createPensionerMediumTermResponse(infoUsuario, state);

      case "ACTIVE_SHORT_TERM_NO_AVAL":
      case "ACTIVE_SHORT_TERM_WITH_AVAL":
        // Both cases handled the same way - show verification
        return {
          reply: verificarSolicitudPrestamo(infoUsuario),
          newState: new SolicitudStateBuilder(state)
            .setStep(STEPS.CONFIRMAR_INFORMACION)
            .setNumeroAfiliacion(numAfiliacion)
            .setFolio(folio)
            .build(),
        };

      default:
        return createUnknownUserTypeResponse(state);
    }
  },
  [STEPS.CONFIRMAR_INFORMACION]: async (userId, text, state, messageData) => {
    const respuesta = text.trim().toLowerCase();
    console.log(`Usuario respondió en confirmar información: ${respuesta}`);

    if (respuesta === "si") {
      console.log("Usuario confirmó la información. Generando solicitud...");
      return {
        newState: new SolicitudStateBuilder(state)
          .setStep(STEPS.LLENADO_SOLICITUD_PDF)
          .build(),
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
      newState: new SolicitudStateBuilder(state)
        .setStep(STEPS.CONFIRMAR_INFORMACION)
        .build(),
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
    
    // Determine PDF type based on user type and loan type
    const scenario = determineUserTypeScenario(infoUsuario, state.tipoPrestamo);
    
    switch (scenario) {
      case "PENSIONER_SHORT_TERM":
        rutaPDF = await llenarSolicitudPDFPensionados(
          { remitente: userId },
          infoUsuario
        );
        console.log("PDF generado en:", rutaPDF);
        break;

      case "ACTIVE_SHORT_TERM_NO_AVAL":
        rutaPDF = await llenarSolicitudPDFActivos(
          { remitente: userId },
          infoUsuario
        );
        console.log("PDF generado en:", rutaPDF);
        break;

      case "ACTIVE_SHORT_TERM_WITH_AVAL":
        return createActiveEmployeeWithAvalResponse(state);

      case "PENSIONER_MEDIUM_TERM":
        rutaPDF = await llenarSolicitudPDFPensionadosMedianoPlazo(
          infoUsuario,
          state.avales
        );
        console.log("PDF generado en:", rutaPDF);
        break;

      default:
        // Unknown scenario - should not happen
        return createUnknownUserTypeResponse(state);
    }

    return createPDFCompletionResponse(rutaPDF);
  },
  [STEPS.PROCESAR_CREDENCIAL]: async (userId, text, state, messageData) => {
    // Perform complete image validation
    const validationError = await performCompleteImageValidation(messageData, state, false);
    if (validationError) {
      return validationError;
    }

    try {
      // Process credential
      logger.info(`🔄 Procesando credencial para usuario ${userId}`);
      const resultado = await procesarCredencialSolicitud(
        messageData.imageBuffer,
        userId,
        state.tipoPrestamo
      );

      if (!resultado) {
        return createCredentialErrorResponse(state);
      }

      // Determine user type scenario and create appropriate response
      const scenario = determineUserTypeScenario(resultado, state.tipoPrestamo);

      switch (scenario) {
        case "PENSIONER_MEDIUM_TERM":
          console.log("Usuario pensionado solicitando mediano plazo");
          return createPensionerMediumTermResponse(resultado, state);

        case "ACTIVE_SHORT_TERM_WITH_AVAL":
          return createActiveEmployeeWithAvalResponse(state);

        case "ACTIVE_SHORT_TERM_NO_AVAL":
          return createActiveEmployeeNoAvalResponse(resultado, state);

        case "UNKNOWN":
        default:
          return createUnknownUserTypeResponse(state);
      }
    } catch (error) {
      logger.error(
        `❌ Error inesperado procesando credencial para ${userId}: ${error.message}`
      );
      return createCredentialErrorResponse(state);
    }
  },
  [STEPS.PROCESAR_NUMEROS_AVALES]: async (userId, text, state, messageData) => {
    const cantidad = parseInt(text.trim(), 10);

    if (isNaN(cantidad) || cantidad <= 0) {
      return {
        reply:
          "❌ Por favor, ingresa un número válido de avales requeridos (mayor a 0).",
        newState: new SolicitudStateBuilder(state)
          .setStep(STEPS.PROCESAR_NUMEROS_AVALES)
          .build(),
      };
    }
    return {
      reply:
        `🔍 Necesitamos procesar las credenciales IPE de tus ${cantidad} aval(es). ` +
        `Por favor envía la credencial IPE del aval 1/${cantidad} (foto clara frontal).`,
      newState: new SolicitudStateBuilder(state)
        .setStep(STEPS.PROCESAR_CREDENCIAL_AVAL)
        .setAvalesRequeridos(cantidad)
        .setAvalesProcesados(0)
        .build(),
    };
  },
  [STEPS.PROCESAR_CREDENCIAL_AVAL]: async (userId, text, state, messageData) => {
    // Perform complete image validation for aval
    const validationError = await performCompleteImageValidation(messageData, state, true);
    if (validationError) {
      return validationError;
    }

    try {
      const resultado = await procesarCredencialSolicitud(
        messageData.imageBuffer,
        userId,
        "CortoPlazo"
      );

      if (!resultado || !resultado.numAfiliacion) {
        return createAvalErrorResponse(state);
      }

      // Extract only necessary data from aval
      const datosAval = {
        afiliacion: resultado.numAfiliacion || null,
        folio: resultado.folio,
        tipo: resultado.tipoDerechohabiente,
      };

      const avalesActualizados = [...(state.avales || []), datosAval];
      logger.debug(`Avales actualizados: ${JSON.stringify(avalesActualizados)}`);
      
      const cantidadProcesada = avalesActualizados.length;
      logger.info(`✅ Aval ${cantidadProcesada} procesado: ${JSON.stringify(datosAval)}`);
      logger.info(`🔄 Avales procesados: ${cantidadProcesada}/${state.cantidadAvalesRequeridos}`);

      // Create response using the response builder
      return createAvalProcessingResponse(datosAval, avalesActualizados, state);

    } catch (error) {
      logger.error(
        `❌ Error inesperado procesando credencial de aval para ${userId}: ${error.message}`
      );
      return createAvalErrorResponse(state);
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
