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
 * Uploads credential image to processing API
 * @param {Buffer} optimizedImage - Optimized image buffer
 * @returns {Promise<object>} API response with credential data
 */
async function uploadCredentialImage(optimizedImage) {
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

  logger.info(`Respuesta del servicio de procesamiento de imagen recibida ${JSON.stringify(response.data)}`);
  return response.data;
}

async function procesarCredencialSolicitud(imageBuffer, telefono, tipoPrestamo) {
  try {
    // Optimizar imagen
    const optimizedImage = await sharp(imageBuffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: IMAGE_QUALITY })
      .toBuffer();

    const credentialData = await uploadCredentialImage(optimizedImage);

    const afiliacion = credentialData.afiliacion || credentialData.pensionado;
    if (!afiliacion) {
      throw new Error("No se encontró número de afiliación en la respuesta");
    }

    const folio = credentialData.folio;
    if (!folio) {
      throw new Error("No se encontró folio en la respuesta");
    }

    const tipoDerechohabiente = credentialData.pensionado ? "P" : "A";

    const rawDataUser = {
      numAfiliacion: afiliacion,
      tipoDerechohabiente: tipoDerechohabiente,
      folio: folio,
    };

    const userInfo = await getUserInfo(rawDataUser);
    return userInfo;
  } catch (error) {
    logger.error(`❌ Error procesando credencial: ${error.message}`);
    if (error.response) {
      logger.error(
        `Error backend ${error.response.status}`,
        error.response.data
      );
    }
    throw error;
  }
}

async function procesarCredencialSolicitudManual(afiliacion, folio) {
  try {
    const tiposDerechohabiente = ['A', 'P'];
    
    for (const tipo of tiposDerechohabiente) {
      try {
        const rawDataUser = {
          numAfiliacion: afiliacion,
          folio: folio,
          tipoDerechohabiente: tipo,
        };
        const userInfo = await getUserInfo(rawDataUser);
        userInfo.folio = folio;
        return userInfo;
      } catch (error) {
        logger.warn(`Fallo con tipoDerechohabiente ${tipo}: ${error.message}`);
        if (tipo === tiposDerechohabiente[tiposDerechohabiente.length - 1]) {
          throw error;
        }
      }
    }
  } catch (error) {
    logger.error(`❌ Error procesando credencial manual: ${error.message}`);
    if (error.response) {
      logger.error(
        `Error backend ${error.response.status}`,
        error.response.data
      );
    }
    throw error;
  }
}

/**
 * Fetches user information from backend API
 * @param {object} userData - User data with affiliation and folio
 * @returns {Promise<object>} User information including salary and balance
 */
async function getUserInfo(userData) {
  const response = await axios.post(
    BACKEND_API_USER_INFO_URL,
    userData,
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: API_TIMEOUT,
    }
  );

  return response.data.data;
}

/**
 * Fetches simulation data from backend
 * @param {object} simulationData - Data for simulation calculation
 * @returns {Promise<Array>} Simulation data array
 */
async function getSimulation(simulationData) {
  logger.debug(`Llamando a backend de simulacion: ${BACKEND_SIMULACION_API_URL}`);

  const response = await axios.post(
    BACKEND_SIMULACION_API_URL,
    simulationData,
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: API_TIMEOUT,
    }
  );

  return response.data.data || [];
}

/**
 * Processes credential image and retrieves user simulation data
 * @param {Buffer} imageBuffer - Image buffer to process
 * @param {string} telefono - User's phone number
 * @returns {Promise<object>} Processing result with user data and simulation
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

    const credentialData = await uploadCredentialImage(optimizedImage);

    const afiliacion = credentialData.afiliacion || credentialData.pensionado;
    if (!afiliacion) {
      throw new Error("No se encontró número de afiliación en la respuesta");
    }

    const folio = credentialData.folio;
    if (!folio) {
      throw new Error("No se encontró folio en la respuesta");
    }

    const tipoDerechohabiente = credentialData.pensionado ? "P" : "A";

    const rawDataUser = {
      numAfiliacion: afiliacion,
      tipoDerechohabiente: tipoDerechohabiente,
      folio: folio,
    };

    const userInfo = await getUserInfo(rawDataUser);

    const rwDataUserSimulacion = {
      tipoDerechohabiente: tipoDerechohabiente,
      numAfiliacion: afiliacion,
      sueldo: userInfo.sueldo,
      saldo: userInfo.saldo,
      fechaAjustada: userInfo.fechaAjustada
    };

    const simulacionData = await getSimulation(rwDataUserSimulacion);

    logger.info("✅ Imagen procesada correctamente");

    return {
      success: true,
      numeroAfiliacion: credentialData.afiliacion,
      numeroFolio: credentialData.folio,
      numPensionado: credentialData.pensionado,
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
  procesarCredencialSolicitud,
  procesarCredencialSolicitudManual
};
