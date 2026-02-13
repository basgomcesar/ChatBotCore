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
const {
  llenarSolicitudPDFActivos,
  llenarSolicitudPDFActivosConAval,
  llenarSolicitudPDFPensionados,
  llenarSolicitudPDFPensionadosMedianoPlazo,
  llenarSolicitudPDFActivosMedianoPlazo,
} = require("../../utils/llenadoSolicitud");

// Centralize flow constants
const FLOW_NAME = FLOWS.LLENADO_SOLICITUD.NAME;
const STEPS = FLOWS.LLENADO_SOLICITUD.STEPS;

// Validation constants
const MIN_QUINCENAS_SIN_AVAL = 240; // 10 years

// ---------------------------------------------------------
// Helpers genéricos de estado / respuestas
// ---------------------------------------------------------

/**
 * Crea un newState fusionando FLOW_NAME y overrides.
 * @param {object} overrides
 * @returns {object}
 */
function buildState(overrides = {}) {
  return {
    flow: FLOW_NAME,
    ...overrides,
  };
}

/**
 * Crea un error genérico de paso no reconocido en este flujo.
 */
function buildUnknownStepResponse() {
  return {
    reply: "❌ Paso no reconocido en el flujo de Llenado de Solicitud.",
    newState: {
      flow: FLOWS.BIENVENIDA.NAME,
      step: FLOWS.BIENVENIDA.STEPS.MENU,
    },
  };
}

// ---------------------------------------------------------
// Helpers de validación de imagen
// ---------------------------------------------------------

/**
 * Valida que venga una imagen y construye respuesta de error común.
 * @param {object} messageData
 * @param {object} customStateOverrides - propiedades extra/override para newState
 * @returns {{reply:string,newState:object}|null}
 */
function validateImageMessageWithState(messageData, customStateOverrides = {}) {
  const { imageBuffer, messageType } = messageData || {};

  if (!imageBuffer || messageType !== "image") {
    return {
      reply:
        "❌ Por favor, envía una foto de tu credencial del IPE.\n\n" +
        "La imagen debe ser clara y legible.\n\n" +
        "Si deseas cancelar, escribe:  cancelar",
      newState: buildState({
        step: STEPS.PROCESAR_CREDENCIAL,
        ...customStateOverrides,
      }),
    };
  }

  return null;
}

/**
 * Versión reducida para el caso estándar de PROCESAR_CREDENCIAL.
 * @param {object} messageData - Message data containing imageBuffer and messageType
 * @returns {object|null} Error response if invalid, null if valid
 */
function validateImageMessage(messageData) {
  return validateImageMessageWithState(messageData, {
    step: STEPS.PROCESAR_CREDENCIAL,
  });
}

/**
 * Valida que el buffer sea una imagen válida y construye respuesta de error común.
 * @param {Buffer} imageBuffer
 * @param {object} customState
 * @returns {Promise<null|{reply:string,newState:object}>}
 */
async function ensureValidImageOrError(imageBuffer, customState) {
  const esImagenValida = await validarImagen(imageBuffer);
  if (!esImagenValida) {
    return {
      reply:
        "❌ El archivo enviado no es una imagen válida.\n\n" +
        "Por favor, envía una foto en formato JPG o PNG.",
      newState: buildState(customState),
    };
  }
  return null;
}

// ---------------------------------------------------------
// Helpers de error de procesamiento de imágenes
// ---------------------------------------------------------

/**
 * Construye respuesta de error genérico al procesar imagen (para solicitante).
 * @returns {{reply:string,newState:object}}
 */
function buildGenericImageProcessErrorResponse() {
  return {
    reply:
      "❌ Error al procesar la imagen. Por favor, intenta ingresando la información manualmente. \n\n" +
      "Escribe 'afiliacion/pension' : 1234567 , 'folio': 8901234",
    newState: buildState({
      step: STEPS.PROCESAR_INFO_MANUALMENTE,
    }),
  };
}

/**
 * Construye respuesta de error genérico al procesar imagen de aval.
 * @param {object} state
 * @returns {{reply:string,newState:object}}
 */
function buildGenericAvalImageProcessErrorResponse(state) {
  return {
    reply:
      "❌ Error al procesar la imagen del aval. Por favor, intenta nuevamente.",
    newState: buildState({
      step: STEPS.PROCESAR_CREDENCIAL_AVAL,
      tipoPrestamo: state.tipoPrestamo,
      infoSolicitante: state.infoSolicitante,
      avales: state.avales || [],
      cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
      avalesProcesados: state.avalesProcesados || 0,
    }),
  };
}

// ---------------------------------------------------------
// Helpers de parsing / negocio
// ---------------------------------------------------------

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

/**
 * Maneja la lógica cuando un derechohabiente activo de corto plazo
 * tiene menos de las quincenas requeridas y necesita aval.
 * @param {object} infoUsuario
 * @returns {{reply:string,newState:object}}
 */
function buildNeedAvalResponseFromInfo(infoUsuario) {
  return {
    reply:
      "🔍 Detectamos que tu antigüedad es menor a 10 años. " +
      "Para continuar, es necesario un aval en servicio activo. " +
      "Por favor envía la credencial IPE del aval (foto clara frontal).",
    newState: buildState({
      folio: infoUsuario.folio,
      numeroAfiliacion: infoUsuario.numAfiliacion,
      step: STEPS.PROCESAR_CREDENCIAL_AVAL,
      cantidadAvalesRequeridos: 1,
    }),
  };
}

/**
 * Lógica común cuando el usuario es pensionado y solicita mediano plazo.
 * @param {object} extraState
 * @returns {{reply:array,newState:object}}
 */
function buildPensionadoMedianoPlazoResponse(extraState = {}) {
  return {
    reply: [
      "✅ Datos verificados correctamente.",
      datosVerificadosSolicitudMedianoPlazoPensionado(),
    ],
    newState: buildState({
      step: STEPS.PROCESAR_NUMEROS_AVALES,
      ...extraState,
    }),
  };
}

/**
 * Lógica para validar y formatear respuesta de aval procesado.
 * @param {object} datosAval
 * @param {number} cantidadProcesada
 * @param {number} cantidadRequerida
 * @param {object} newStateBase
 */
function buildAvalProcessedResponse(
  datosAval,
  cantidadProcesada,
  cantidadRequerida,
  newStateBase
) {
  const baseReply =
    `✅ Aval ${cantidadProcesada}/${cantidadRequerida} procesado correctamente.\n\n` +
    `📋 **Datos del aval:**\n` +
    `- Tipo: ${datosAval.tipo === "A" ? "Activo" : "Pensionado"}\n` +
    `- Número: ${datosAval.afiliacion}\n` +
    `- Folio: ${datosAval.folio}\n\n`;

  const necesitaMas =
    cantidadProcesada < cantidadRequerida
      ? `📸 Por favor, envía la credencial IPE del aval ${
          cantidadProcesada + 1
        }/${cantidadRequerida}.`
      : "";

  return {
    reply: baseReply + necesitaMas,
    newState: newStateBase,
  };
}

/**
 * Construye respuesta final cuando todos los avales fueron procesados.
 * @param {Array} avalesActualizados
 * @param {object} state
 * @param {number} cantidadAvalesRequeridos
 */
function buildAllAvalesProcessedResponse(
  avalesActualizados,
  state,
  cantidadAvalesRequeridos
) {
  const resumenAvales = avalesActualizados
    .map(
      (aval, index) =>
        `${index + 1}. ${
          aval.tipo === "A" ? "Activo" : "Pensionado"
        } - Núm: ${aval.afiliacion} - Folio: ${aval.folio}`
    )
    .join("\n");

  return {
    reply:
      `✅ Todos los avales han sido procesados correctamente (${cantidadAvalesRequeridos}/${state.cantidadAvalesRequeridos}).\n\n` +
      `📋 **Resumen de avales:**\n${resumenAvales}\n\n` +
      `⏳ Procediendo a generar tu solicitud de préstamo...`,
    newState: buildState({
      step: STEPS.LLENADO_SOLICITUD_PDF,
      tipoPrestamo: state.tipoPrestamo,
      infoSolicitante: state.infoSolicitante,
      avales: avalesActualizados,
      cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
      avalesProcesados: cantidadAvalesRequeridos,
      folio: state.infoSolicitante?.folio || state.folio,
      numeroAfiliacion:
        state.infoSolicitante?.numAfiliacion || state.numeroAfiliacion,
    }),
  };
}

// ---------------------------------------------------------
// Helper para decidir qué PDF generar
// ---------------------------------------------------------

/**
 * Decide y genera el PDF correspondiente según tipo de derechohabiente, tipo de préstamo y avales.
 * @param {string} userId
 * @param {object} state
 * @returns {Promise<{rutaPDF?: string, responseIfAvalNeeded?: object}>}
 */
async function generarPDFSegunReglas(userId, state) {
  const infoUsuario = await procesarCredencialSolicitudManual(
    state.numeroAfiliacion,
    state.folio,
    state.tipoPrestamo
  );
  infoUsuario.folioSolicitud = state.folio;

  let rutaPDF;

  // Pensionado - Corto Plazo
  if (infoUsuario.tipoDerechohabiente === "P" && state.tipoPrestamo === "CortoPlazo") {
    rutaPDF = await llenarSolicitudPDFPensionados(
      { remitente: userId },
      infoUsuario
    );
    return { rutaPDF };
  }

  // Activo - Corto Plazo con suficiente antigüedad
  if (
    infoUsuario.tipoDerechohabiente === "A" &&
    state.tipoPrestamo === "CortoPlazo" &&
    infoUsuario.quincenasCotizadas >= MIN_QUINCENAS_SIN_AVAL
  ) {
    rutaPDF = await llenarSolicitudPDFActivos(
      { remitente: userId },
      infoUsuario
    );
    return { rutaPDF };
  }

  // Activo - Corto Plazo, poca antigüedad y sin avales: pedir aval
  if (
    state.tipoPrestamo === "CortoPlazo" &&
    infoUsuario.tipoDerechohabiente === "A" &&
    infoUsuario.quincenasCotizadas < MIN_QUINCENAS_SIN_AVAL &&
    !state.avales
  ) {
    return {
      responseIfAvalNeeded: {
        reply:
          "🔍 Detectamos que tu antigüedad es menor a 10 años. " +
          "Para continuar, es necesario un aval en servicio activo. " +
          "Por favor envía la credencial IPE del aval (foto clara frontal).",
        newState: buildState({
          step: STEPS.PROCESAR_CREDENCIAL_AVAL,
          numeroAfiliacion: infoUsuario.numAfiliacion,
          folio: infoUsuario.folio,
          cantidadAvalesRequeridos: 1,
        }),
      },
    };
  }

  // Activo - Corto Plazo, poca antigüedad y con avales
  if (
    state.tipoPrestamo === "CortoPlazo" &&
    infoUsuario.tipoDerechohabiente === "A" &&
    infoUsuario.quincenasCotizadas < MIN_QUINCENAS_SIN_AVAL &&
    state.avales
  ) {
    rutaPDF = await llenarSolicitudPDFActivosConAval(
      infoUsuario,
      state.avales[0]
    );
    return { rutaPDF };
  }

  // Pensionado - Mediano plazo
  if (
    state.tipoPrestamo === "MedianoPlazo" &&
    infoUsuario.tipoDerechohabiente === "P"
  ) {
    rutaPDF = await llenarSolicitudPDFPensionadosMedianoPlazo(
      infoUsuario,
      state.avales
    );
    return { rutaPDF };
  }

  // Activo - Mediano plazo
  if (
    state.tipoPrestamo === "MedianoPlazo" &&
    infoUsuario.tipoDerechohabiente === "A"
  ) {
    rutaPDF = await llenarSolicitudPDFActivosMedianoPlazo(
      infoUsuario,
      state.avales
    );
    return { rutaPDF };
  }

  // Caso por defecto (no debería llegar aquí normalmente)
  return { rutaPDF };
}

// ---------------------------------------------------------
// Handlers por step
// ---------------------------------------------------------

const stepHandlers = {
  [STEPS.LLENADO_SOLICITUD_INICIAL]: async (userId, text, state) => ({
    reply: preguntarTipoSolicitudPrestamo(),
    newState: buildState({
      step: STEPS.RECIBIR_CREDENCIAL,
      tipoPrestamo: state.tipoPrestamo,
    }),
  }),

  [STEPS.RECIBIR_CREDENCIAL]: async (userId, text, state) => {
    const tipo = text.trim().toLowerCase();

    if (tipo === "1" || tipo === "corto plazo") {
      return {
        reply: pedirCredencialCortoPlazo(),
        newState: buildState({
          step: STEPS.PROCESAR_CREDENCIAL,
          tipoPrestamo: "CortoPlazo",
        }),
      };
    }

    if (tipo === "2" || tipo === "mediano plazo") {
      return {
        reply: pedirCredencialMedianoPlazo(),
        newState: buildState({
          step: STEPS.PROCESAR_CREDENCIAL,
          tipoPrestamo: "MedianoPlazo",
        }),
      };
    }

    return {
      reply:
        "Opción no válida. \nPor favor, selecciona 1️⃣ para Corto Plazo o 2️⃣ para Mediano Plazo.",
      newState: buildState({
        step: STEPS.LLENADO_SOLICITUD_INICIAL,
        tipoPrestamo: state.tipoPrestamo,
        numeroAfiliacion: state.numeroAfiliacion,
      }),
    };
  },

  [STEPS.PROCESAR_INFO_MANUALMENTE]: async (userId, text, state) => {
    const { numAfiliacion, folio } = parseManualInput(text);

    if (numAfiliacion && folio) {
      const infoUsuario = await procesarCredencialSolicitudManual(
        numAfiliacion,
        folio,
        state.tipoPrestamo
      );

      // Pensionado - Corto Plazo
      if (
        infoUsuario.tipoDerechohabiente === "P" &&
        state.tipoPrestamo === "CortoPlazo"
      ) {
        return {
          reply: verificarSolicitudPrestamoCPPensionado(infoUsuario),
          newState: buildState({
            step: STEPS.CONFIRMAR_INFORMACION,
            tipoPrestamo: state.tipoPrestamo,
            folio,
            numeroAfiliacion: numAfiliacion,
          }),
        };
      }

      // Pensionado - Mediano Plazo
      if (
        infoUsuario.tipoDerechohabiente === "P" &&
        state.tipoPrestamo === "MedianoPlazo"
      ) {
        console.log("Usuario pensionado solicitando mediano plazo");
        return buildPensionadoMedianoPlazoResponse();
      }

      // Activo - Corto Plazo
      if (
        infoUsuario.tipoDerechohabiente === "A" &&
        state.tipoPrestamo === "CortoPlazo"
      ) {
        if (infoUsuario.quincenasCotizadas < MIN_QUINCENAS_SIN_AVAL) {
          return buildNeedAvalResponseFromInfo(infoUsuario);
        }

        return {
          reply: verificarSolicitudPrestamo(infoUsuario),
          newState: buildState({
            step: STEPS.PROCESAR_INFO_MANUALMENTE,
          }),
        };
      }

      // Activo - Mediano Plazo (manual, aunque aquí tu código original genera PDF directo)
      if (
        state.tipoPrestamo === "MedianoPlazo" &&
        infoUsuario.tipoDerechohabiente === "A"
      ) {
        console.log(
          "Generando PDF para activo en mediano plazo con avales:",
          state.avales
        );
        const rutaPDF = await llenarSolicitudPDFActivosMedianoPlazo(
          infoUsuario,
          state.avales
        );
        console.log("PDF generado en:", rutaPDF);
      }

      return {
        reply: verificarSolicitudPrestamo(infoUsuario),
        newState: buildState({
          step: STEPS.CONFIRMAR_INFORMACION,
          tipoPrestamo: state.tipoPrestamo,
          folio,
          numeroAfiliacion: numAfiliacion,
        }),
      };
    }

    return {
      reply:
        "❌ Formato incorrecto. Por favor, usa el formato:\nafiliacion: 1234567, folio: 8901234",
      newState: buildState({
        step: STEPS.PROCESAR_INFO_MANUALMENTE,
      }),
    };
  },

  [STEPS.CONFIRMAR_INFORMACION]: async (userId, text, state) => {
    const respuesta = text.trim().toLowerCase();
    console.log(`Usuario respondió en confirmar información: ${respuesta}`);

    if (respuesta === "si") {
      console.log("Usuario confirmó la información. Generando solicitud...");
      return {
        newState: buildState({
          step: STEPS.LLENADO_SOLICITUD_PDF,
        }),
      };
    }

    if (respuesta === "no") {
      return {
        reply:
          "❌ Solicitud cancelada. Si deseas iniciar de nuevo, por favor selecciona la opción correspondiente en el menú.",
        newState: {
          flow: FLOWS.BIENVENIDA.NAME,
          step: FLOWS.BIENVENIDA.STEPS.MENU,
        },
      };
    }

    return {
      reply: "Por favor, responde 'si' o 'no'.",
      newState: buildState({
        step: STEPS.CONFIRMAR_INFORMACION,
      }),
    };
  },

  [STEPS.LLENADO_SOLICITUD_PDF]: async (userId, text, state) => {
    console.log("Generando PDF de solicitud...");

    const { rutaPDF, responseIfAvalNeeded } = await generarPDFSegunReglas(
      userId,
      state
    );

    if (responseIfAvalNeeded) {
      // Caso en el que aún se necesita pedir aval (activo corto plazo < 10 años y sin avales)
      return responseIfAvalNeeded;
    }

    console.log("PDF generado en:", rutaPDF);

    return {
      file: rutaPDF,
      reply: "✅ Tu solicitud ha sido generada exitosamente.",
      newState: {
        flow: FLOWS.BIENVENIDA.NAME,
        avales: [],
        step: FLOWS.BIENVENIDA.STEPS.MENU,
      },
    };
  },

  [STEPS.PROCESAR_CREDENCIAL]: async (userId, text, state, messageData) => {
    const { imageBuffer } = messageData || {};

    const imageValidationError = validateImageMessage(messageData);
    if (imageValidationError) {
      return imageValidationError;
    }

    try {
      const invalidImageResponse = await ensureValidImageOrError(imageBuffer, {
        step: STEPS.PROCESAR_CREDENCIAL,
      });
      if (invalidImageResponse) return invalidImageResponse;

      logger.info(`🔄 Procesando credencial para usuario ${userId}`);
      const resultado = await procesarCredencialSolicitud(
        imageBuffer,
        userId,
        state.tipoPrestamo
      );

      if (!resultado) {
        return buildGenericImageProcessErrorResponse();
      }

      // Pensionado - Mediano Plazo
      if (
        resultado.tipoDerechohabiente === "P" &&
        state.tipoPrestamo === "MedianoPlazo"
      ) {
        console.log("Usuario pensionado solicitando mediano plazo");
        return buildPensionadoMedianoPlazoResponse({
          folio: resultado.folio,
          numeroAfiliacion: resultado.numAfiliacion,
        });
      }

      // Activo - Corto Plazo
      if (
        resultado.tipoDerechohabiente === "A" &&
        state.tipoPrestamo === "CortoPlazo"
      ) {
        if (resultado.quincenasCotizadas < MIN_QUINCENAS_SIN_AVAL) {
          return buildNeedAvalResponseFromInfo(resultado);
        }

        return {
          reply: verificarSolicitudPrestamo(resultado),
          newState: buildState({
            step: STEPS.PROCESAR_INFO_MANUALMENTE,
          }),
        };
      }

      // Activo - Mediano Plazo
      if (
        resultado.tipoDerechohabiente === "A" &&
        state.tipoPrestamo === "MedianoPlazo"
      ) {
        console.log("Usuario activo solicitando mediano plazo");
        return {
          reply: [
            "✅ Datos verificados correctamente.",
            "¿Cuántos avales en servicio activo vas a proporcionar? Por favor ingresa un número.",
          ],
          newState: buildState({
            numeroAfiliacion: resultado.numAfiliacion,
            folio: resultado.folio,
            step: STEPS.PROCESAR_NUMEROS_AVALES,
          }),
        };
      }

      return buildGenericImageProcessErrorResponse();
    } catch (error) {
      logger.error(
        `❌ Error inesperado procesando credencial para ${userId}: ${error.message}`
      );
      return buildGenericImageProcessErrorResponse();
    }
  },

  [STEPS.PROCESAR_NUMEROS_AVALES]: async (userId, text, state) => {
    const cantidad = parseInt(text.trim(), 10);

    if (isNaN(cantidad) || cantidad <= 0) {
      return {
        reply:
          "❌ Por favor, ingresa un número válido de avales requeridos (mayor a 0).",
        newState: buildState({
          step: STEPS.PROCESAR_NUMEROS_AVALES,
          cantidadAvalesRequeridos: cantidad,
          avalesProcesados: 0,
        }),
      };
    }

    return {
      reply:
        `🔍 Necesitamos procesar las credenciales IPE de tus ${cantidad} aval(es). ` +
        `Por favor envía la credencial IPE del aval 1/${cantidad} (foto clara frontal).`,
      newState: buildState({
        step: STEPS.PROCESAR_CREDENCIAL_AVAL,
        cantidadAvalesRequeridos: cantidad,
        avalesProcesados: 0,
      }),
    };
  },

  [STEPS.PROCESAR_CREDENCIAL_AVAL]: async (userId, text, state, messageData) => {
    const { imageBuffer } = messageData || {};

    const commonStateOverrides = {
      step: STEPS.PROCESAR_CREDENCIAL_AVAL,
      tipoPrestamo: state.tipoPrestamo,
      infoSolicitante: state.infoSolicitante,
      avales: state.avales || [],
      cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
      avalesProcesados: state.avalesProcesados || 0,
    };

    const imageValidationError = validateImageMessageWithState(
      messageData,
      commonStateOverrides
    );
    if (imageValidationError) {
      return imageValidationError;
    }

    try {
      const invalidImageResponse = await ensureValidImageOrError(
        imageBuffer,
        commonStateOverrides
      );
      if (invalidImageResponse) return invalidImageResponse;

      const resultado = await procesarCredencialSolicitud(
        imageBuffer,
        userId,
        "CortoPlazo"
      );

      if (!resultado || !resultado.numAfiliacion) {
        return buildGenericAvalImageProcessErrorResponse(state);
      }

      const datosAval = {
        afiliacion: resultado.numAfiliacion || null,
        folio: resultado.folio,
        tipo: resultado.tipoDerechohabiente,
      };

      const avalesActualizados = [...(state.avales || []), datosAval];
      logger.debug(`Avales actualizados: ${JSON.stringify(avalesActualizados)}`);

      const cantidadAvalesRequeridos = avalesActualizados.length;
      logger.info(
        `✅ Aval ${cantidadAvalesRequeridos} procesado: ${JSON.stringify(
          datosAval
        )}`
      );
      logger.info(
        `🔄 Avales procesados: ${cantidadAvalesRequeridos}/${state.cantidadAvalesRequeridos}`
      );

      if (cantidadAvalesRequeridos <= state.cantidadAvalesRequeridos) {
        const nextStep =
          cantidadAvalesRequeridos < state.cantidadAvalesRequeridos
            ? STEPS.PROCESAR_CREDENCIAL_AVAL
            : STEPS.LLENADO_SOLICITUD_PDF;

        const newStateBase = buildState({
          step: nextStep,
          tipoPrestamo: state.tipoPrestamo,
          infoSolicitante: state.infoSolicitante,
          avales: avalesActualizados,
          cantidadAvalesRequeridos: state.cantidadAvalesRequeridos,
        });

        if (cantidadAvalesRequeridos < state.cantidadAvalesRequeridos) {
          logger.info(
            `🔄 Esperando credencial del aval ${
              cantidadAvalesRequeridos + 1
            }/${state.cantidadAvalesRequeridos || 0}`
          );
          return buildAvalProcessedResponse(
            datosAval,
            cantidadAvalesRequeridos,
            state.cantidadAvalesRequeridos,
            newStateBase
          );
        }

        // Todos los avales requeridos procesados
        logger.info(
          `✅ Todos los avales (${cantidadAvalesRequeridos}) procesados. Generando solicitud...`
        );
        return buildAllAvalesProcessedResponse(
          avalesActualizados,
          state,
          cantidadAvalesRequeridos
        );
      }

      // Más avales de los requeridos (caso borde)
      logger.info(
        `✅ Todos los avales (${cantidadAvalesRequeridos}) procesados. Generando solicitud...`
      );
      return buildAllAvalesProcessedResponse(
        avalesActualizados,
        state,
        cantidadAvalesRequeridos
      );
    } catch (error) {
      logger.error(
        `❌ Error inesperado procesando credencial de aval para ${userId}: ${error.message}`
      );
      return buildGenericAvalImageProcessErrorResponse(state);
    }
  },
};

// ---------------------------------------------------------
// Export principal
// ---------------------------------------------------------

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
    return buildUnknownStepResponse();
  },
};