/**
 * Image processing service for credential validation
 * @module imageProcessingService
 */

const axios = require("axios");
const FormData = require("form-data");
const logger = require("../config/logger");
const sharp = require("sharp");

// Environment configuration
const IMAGE_PROCESSING_API_URL =
  process.env.IMAGE_PROCESSING_API_URL ||
  "http://localhost:5003/api/Credencial/upload";
const BACKEND_API_USER_INFO_URL = process.env.BACKEND_API_USER_INFO_URL ||
  "http://ipeenlinea.ipever.gob.mx/WSIPEEnLinea/api/v2/prestamos/login";
const BACKEND_SIMULACION_API_URL = process.env.BACKEND_SIMULACION_API_URL ||
  "http://localhost:5003/api";

// Image processing constants
const MAX_IMAGE_DIMENSION = 1920;
const IMAGE_QUALITY = 85;
const API_TIMEOUT = 30000; // 30 seconds

/**
 * Processes credential image and retrieves user simulation data
 * @param {Buffer} imageBuffer - Image buffer to process
 * @param {string} telefono - User's phone number
 * @returns {Promise<object>} Processing result with user data and simulation
 * @property {boolean} success - Whether processing was successful
 * @property {string} [numeroAfiliacion] - User's affiliation number
 * @property {string} [numeroFolio] - User's folio number
 * @property {string} [numPensionado] - Pensioner number if applicable
 * @property {string} [tipoCredencial] - Credential type (A=Active, P=Pensioner)
 * @property {Array} [simulacion] - Simulation data array
 * @property {string} [error] - Error message if failed
 * @property {string} [mensaje] - User-friendly error message
 */
async function procesarCredencial(imageBuffer, telefono) {
  try {
    // Optimizar imagen
    const optimizedImage = await sharp(imageBuffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: IMAGE_QUALITY })
      .toBuffer();

    const formData = new FormData();
    formData.append("file", optimizedImage, {
      filename: `credencial_${Date.now()}.jpg`,
      contentType: "image/jpeg",
    });
    const response = await axios.post(
      IMAGE_PROCESSING_API_URL,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: API_TIMEOUT,
      }
    );
    //Con la respuesta del backend llamar a otro endpoint 
    //preparando los datos para el usuario
    const afiliacion = response.data.afiliacion || response.data.pensionado;
    if (!afiliacion) {
      throw new Error("No se encontró número de afiliación en la respuesta");
    }
    const folio = response.data.folio;
    if (!folio) {
      throw new Error("No se encontró folio en la respuesta");
    }
    const tipoDerechohabiente = response.data.pensionado ? "P" : "A";
    const rawDataUser = {
      numAfiliacion: afiliacion,
      tipoDerechohabiente: tipoDerechohabiente,
      folio: folio,
    };
    const responseUser = await axios.post(
      BACKEND_API_USER_INFO_URL,
      rawDataUser,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: API_TIMEOUT,
      }
    );
    
    const rwDataUserSimulacion = {
      tipoDerechohabiente: tipoDerechohabiente,
      numAfiliacion: afiliacion,
      sueldo: responseUser.data.data.sueldo,
      saldo: responseUser.data.data.saldo,
      fechaAjustada: responseUser.data.data.fechaAjustada
    };
    logger.debug(`Datos para simulacion: ${JSON.stringify(rwDataUserSimulacion)}`);
    logger.debug(`Llamando a backend de simulacion: ${BACKEND_SIMULACION_API_URL}`);
    const responseSimulacion = await axios.post(
      BACKEND_SIMULACION_API_URL,
      rwDataUserSimulacion,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: API_TIMEOUT,
      }
    );
    const simulacionData = responseSimulacion.data.data || [];
    logger.debug(`Respuesta simulacion backend: ${JSON.stringify(responseSimulacion.data)}`);

    logger.info("✅ Imagen procesada correctamente");

    return {
      success: true,
      numeroAfiliacion: response.data.afiliacion,
      numeroFolio: response.data.folio,
      numPensionado: response.data.pensionado,
      tipoCredencial: tipoDerechohabiente,
      simulacion: simulacionData
    };

  } catch (error) {
    logger.error(`❌ Error procesando credencial: ${error.message}`);

    if (error.response) {
      logger.error(
        `Error backend ${error.response.status}`,
        error.response.data
      );
    }

    return {
      success: false,
      error: error.message,
      mensaje: "No se pudo procesar la imagen",
    };
  }
}

/**
 * Validates if image buffer is valid
 * @param {Buffer} imageBuffer - Image buffer to validate
 * @returns {Promise<boolean>} True if image is valid, false otherwise
 */
async function validarImagen(imageBuffer) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    logger.info(
      `📸 Imagen válida: ${metadata.format}, ${metadata.width}x${metadata.height}`
    );
    return true;
  } catch (error) {
    logger.error(`❌ Imagen inválida: ${error.message}`);
    return false;
  }
}

module.exports = {
  procesarCredencial,
  validarImagen,
};
