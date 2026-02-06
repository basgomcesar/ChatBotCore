/**
 * Response builders for Llenado Solicitud flow
 * Standardizes response creation to reduce code repetition
 * @module solicitudResponses
 */

const {
  verificarSolicitudPrestamo,
  verificarSolicitudPrestamoCPPensionado,
  datosVerificadosSolicitudMedianoPlazoPensionado,
} = require("./messages");
const {
  UserTypeStateBuilder,
  CredentialErrorStateBuilder,
  PDFGenerationStateBuilder,
} = require("./solicitudState");

/**
 * Creates response for pensioner short-term loan
 */
function createPensionerShortTermResponse(infoUsuario, state) {
  return {
    reply: verificarSolicitudPrestamoCPPensionado(infoUsuario),
    newState: UserTypeStateBuilder.forPensionerShortTerm(state, infoUsuario),
  };
}

/**
 * Creates response for pensioner medium-term loan
 */
function createPensionerMediumTermResponse(infoUsuario, state) {
  return {
    reply: [
      "✅ Datos verificados correctamente.",
      datosVerificadosSolicitudMedianoPlazoPensionado(),
    ],
    newState: UserTypeStateBuilder.forPensionerMediumTerm(state, infoUsuario),
  };
}

/**
 * Creates response for active employee requiring aval
 */
function createActiveEmployeeWithAvalResponse(state) {
  return {
    reply:
      "🔍 Detectamos que tu antigüedad es menor a 10 años. " +
      "Para continuar, es necesario un aval en servicio activo. " +
      "Por favor envía la credencial IPE del aval (foto clara frontal).",
    newState: UserTypeStateBuilder.forActiveEmployeeWithAval(state),
  };
}

/**
 * Creates response for active employee not requiring aval
 */
function createActiveEmployeeNoAvalResponse(infoUsuario, state) {
  return {
    reply: verificarSolicitudPrestamo(infoUsuario),
    newState: UserTypeStateBuilder.forActiveEmployeeNoAval(state, infoUsuario),
  };
}

/**
 * Creates response for credential processing error
 */
function createCredentialErrorResponse(state) {
  return {
    reply:
      "❌ Error al procesar la imagen. Por favor, intenta ingresando la información manualmente. \n\n" +
      "Escribe 'afiliacion/pension' : 1234567 , 'folio': 8901234",
    newState: CredentialErrorStateBuilder.forManualInputRequired(state),
  };
}

/**
 * Creates response for unknown user type
 */
function createUnknownUserTypeResponse(state) {
  return {
    reply:
      "❌ No se pudo determinar el tipo de derechohabiente. " +
      "Por favor, intenta ingresando la información manualmente.\n\n" +
      "Escribe 'afiliacion/pension' : 1234567 , 'folio': 8901234",
    newState: CredentialErrorStateBuilder.forManualInputRequired(state),
  };
}

/**
 * Creates response for aval processing
 */
function createAvalProcessingResponse(avalData, avalesActualizados, state) {
  const cantidadProcesada = avalesActualizados.length;
  const cantidadRequerida = state.cantidadAvalesRequeridos;
  const needsMore = cantidadProcesada < cantidadRequerida;

  if (needsMore) {
    return {
      reply:
        `✅ Aval ${cantidadProcesada}/${cantidadRequerida} procesado correctamente.\n\n` +
        `📋 **Datos del aval:**\n` +
        `- Tipo: ${avalData.tipo === "A" ? "Activo" : "Pensionado"}\n` +
        `- Número: ${avalData.afiliacion}\n` +
        `- Folio: ${avalData.folio}\n\n` +
        `📸 Por favor, envía la credencial IPE del aval ${cantidadProcesada + 1}/${cantidadRequerida}.`,
      newState: {
        ...state,
        avales: avalesActualizados,
        step: UserTypeStateBuilder.forActiveEmployeeWithAval(state).step,
      },
    };
  }

  // All avales processed
  const resumenAvales = avalesActualizados
    .map(
      (aval, index) =>
        `${index + 1}. ${aval.tipo === "A" ? "Activo" : "Pensionado"} - ` +
        `Núm: ${aval.afiliacion} - ` +
        `Folio: ${aval.folio}`
    )
    .join("\n");

  return {
    reply:
      `✅ Todos los avales han sido procesados correctamente (${cantidadProcesada}/${cantidadRequerida}).\n\n` +
      `📋 **Resumen de avales:**\n${resumenAvales}\n\n` +
      `⏳ Procediendo a generar tu solicitud de préstamo...`,
    newState: PDFGenerationStateBuilder.forPDFGeneration(state, {
      avales: avalesActualizados,
      avalesProcesados: cantidadProcesada,
      folio: state.folio,
      numeroAfiliacion: state.numeroAfiliacion,
    }),
  };
}

/**
 * Creates response for aval processing error
 */
function createAvalErrorResponse(state) {
  return {
    reply: "❌ Error al procesar la imagen del aval. Por favor, intenta nuevamente.",
    newState: CredentialErrorStateBuilder.forAvalImageValidationError(state),
  };
}

/**
 * Creates response for PDF completion
 */
function createPDFCompletionResponse(rutaPDF) {
  return {
    file: rutaPDF,
    reply: "✅ Tu solicitud ha sido generada exitosamente.",
    newState: PDFGenerationStateBuilder.forCompletion(),
  };
}

module.exports = {
  createPensionerShortTermResponse,
  createPensionerMediumTermResponse,
  createActiveEmployeeWithAvalResponse,
  createActiveEmployeeNoAvalResponse,
  createCredentialErrorResponse,
  createUnknownUserTypeResponse,
  createAvalProcessingResponse,
  createAvalErrorResponse,
  createPDFCompletionResponse,
};
