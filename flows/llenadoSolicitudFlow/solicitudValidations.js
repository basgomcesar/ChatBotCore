/**
 * Validation utilities for Llenado Solicitud flow
 * Extracts common validation patterns to reduce code repetition
 * @module solicitudValidations
 */

const { validarImagen } = require("../../services/imageProcessingService");
const logger = require("../../config/logger");
const { CredentialErrorStateBuilder } = require("./solicitudState");

// Validation constants
const MIN_QUINCENAS_SIN_AVAL = 240; // 10 years

/**
 * Validates if user sent an image message
 * @param {object} messageData - Message data containing imageBuffer and messageType
 * @param {string} errorMessage - Custom error message to display
 * @param {function} stateBuilder - Function to build error state
 * @returns {object|null} Error response if invalid, null if valid
 */
function validateImageMessage(messageData, errorMessage, stateBuilder) {
  const { imageBuffer, messageType } = messageData || {};

  if (!imageBuffer || messageType !== "image") {
    return {
      reply: errorMessage || 
        "❌ Por favor, envía una foto de tu credencial del IPE.\n\n" +
        "La imagen debe ser clara y legible.\n\n" +
        "Si deseas cancelar, escribe:  cancelar",
      newState: stateBuilder(),
    };
  }

  return null;
}

/**
 * Validates image format using the image processing service
 * @param {Buffer} imageBuffer - Image buffer to validate
 * @param {string} errorMessage - Custom error message to display
 * @param {function} stateBuilder - Function to build error state
 * @returns {Promise<object|null>} Error response if invalid, null if valid
 */
async function validateImageFormat(imageBuffer, errorMessage, stateBuilder) {
  const esImagenValida = await validarImagen(imageBuffer);
  
  if (!esImagenValida) {
    return {
      reply: errorMessage ||
        "❌ El archivo enviado no es una imagen válida.\n\n" +
        "Por favor, envía una foto en formato JPG o PNG.",
      newState: stateBuilder(),
    };
  }

  return null;
}

/**
 * Performs complete image validation (message and format)
 * @param {object} messageData - Message data containing imageBuffer and messageType
 * @param {object} state - Current user state
 * @param {boolean} isAval - Whether this is for aval processing
 * @returns {Promise<object|null>} Error response if invalid, null if valid
 */
async function performCompleteImageValidation(messageData, state, isAval = false) {
  logger.debug(`messageType: ${messageData?.messageType}`);

  // Create state builder function
  const stateBuilder = isAval
    ? () => CredentialErrorStateBuilder.forAvalImageValidationError(state)
    : () => CredentialErrorStateBuilder.forImageValidationError(state);

  // Validate image message
  const imageMessageError = validateImageMessage(
    messageData,
    isAval 
      ? "❌ Por favor, envía una foto de la credencial del IPE del aval.\n\n" +
        "La imagen debe ser clara y legible.\n\n" +
        "Si deseas cancelar, escribe:  cancelar"
      : null,
    stateBuilder
  );

  if (imageMessageError) {
    return imageMessageError;
  }

  // Validate image format
  const imageFormatError = await validateImageFormat(
    messageData.imageBuffer,
    null,
    stateBuilder
  );

  if (imageFormatError) {
    return imageFormatError;
  }

  return null;
}

/**
 * Checks if active employee needs an aval (guarantor)
 * @param {number} quincenasCotizadas - Number of fortnights worked
 * @returns {boolean} True if aval is required
 */
function needsAval(quincenasCotizadas) {
  return quincenasCotizadas < MIN_QUINCENAS_SIN_AVAL;
}

/**
 * Validates manual input format for affiliation and folio
 * @param {string} text - User input text
 * @returns {object} Object with numAfiliacion, folio, and isValid properties
 */
function validateManualInput(text) {
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

  return {
    numAfiliacion,
    folio,
    isValid: !!(numAfiliacion && folio),
  };
}

/**
 * Determines user type and loan type combination
 * @param {object} infoUsuario - User information from credential processing
 * @param {string} tipoPrestamo - Loan type (CortoPlazo or MedianoPlazo)
 * @returns {string} User type identifier
 */
function determineUserTypeScenario(infoUsuario, tipoPrestamo) {
  const { tipoDerechohabiente, quincenasCotizadas } = infoUsuario;

  if (tipoDerechohabiente === "P" && tipoPrestamo === "CortoPlazo") {
    return "PENSIONER_SHORT_TERM";
  }

  if (tipoDerechohabiente === "P" && tipoPrestamo === "MedianoPlazo") {
    return "PENSIONER_MEDIUM_TERM";
  }

  if (tipoDerechohabiente === "A" && tipoPrestamo === "CortoPlazo") {
    if (needsAval(quincenasCotizadas)) {
      return "ACTIVE_SHORT_TERM_WITH_AVAL";
    }
    return "ACTIVE_SHORT_TERM_NO_AVAL";
  }

  return "UNKNOWN";
}

module.exports = {
  validateImageMessage,
  validateImageFormat,
  performCompleteImageValidation,
  needsAval,
  validateManualInput,
  determineUserTypeScenario,
  MIN_QUINCENAS_SIN_AVAL,
};
