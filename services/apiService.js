/**
 * API service for backend communication
 * @module apiService
 */

const axios = require("axios");
const logger = require("../config/logger");

const API_URL = process.env.BACKEND_API_URL || "https://tu-backend/api";

/**
 * Axios instance with base configuration
 * @type {object}
 */
const api = axios.create({
  baseURL: API_URL,
  timeout: 5000, // 5 segundos por seguridad
});

/**
 * Gets user data by phone number
 * @param {string} telefono - User's phone number
 * @returns {Promise<object>} User data or default guest object
 */
async function getUser(telefono) {
  try {
    const response = await api.get(`/Derechohabiente/${telefono}`);
    return response.data;
  } catch (error) {
    logger.error("Error consultando usuario:", error.message);
    // En caso de no existir, devolvemos un objeto base
    return { nombre: "Invitado", telefono };
  }
}

/**
 * Updates user state (flow and step) in the backend
 * @param {object} params - User state parameters
 * @param {string} params.telefono - User's phone number (required)
 * @param {string} params.flujo - Current flow name
 * @param {string} params.paso - Current step in flow
 * @param {string} [params.folio=''] - User's folio number
 * @param {string} [params.tipo=''] - User type
 * @param {string} [params.nombre] - User's name
 * @param {string} [params.tipoPrestamo] - Type of loan
 * @param {string} [params.numeroAfiliacion] - Affiliation number
 * @param {number} [params.numeroAvalesProcesados] - Number of processed guarantors
 * @param {Array} [params.avales] - List of guarantors
 * @returns {Promise<object>} Response data or error object
 */
async function setUserState({
  telefono,
  flujo,
  paso,
  folio = "",
  tipo = "",
  nombre = "",
  tipoPrestamo = "",
  cantidadAvalesRequeridos = 0,
  numeroAfiliacion = "",
  numeroAvalesProcesados = 0,
  avales = []
}) {
  try {
    if (!telefono) throw new Error("El teléfono es requerido");

    const payload = {
      telefono,
      flujo,
      paso,
      folio: folio ?? "",
      tipo: String(tipo ?? ""),
      nombre: nombre ?? "",
      tipoPrestamo: tipoPrestamo ?? "",
      numeroAfiliacion: numeroAfiliacion ?? "",
      cantidadAvalesRequeridos: cantidadAvalesRequeridos ?? 0,
      numeroAvalesProcesados: numeroAvalesProcesados ?? 0,
      avales: avales ?? []
    };
    const response = await api.post(`/Derechohabiente/update-state`, payload);
    return response.data;
  } catch (error) {
    if (error.response) {
      logger.error(
        `❌ Error del backend: ${error.response.status}`,
        error.response.data
      );
    } else if (error.request) {
      logger.error("❌ No hubo respuesta del servidor:", error.request);
    } else {
      logger.error("❌ Error configurando la petición:", error.message);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Gets current user state from backend
 * @param {string} telefono - User's phone number
 * @returns {Promise<object>} User state or error object
 */
async function getUserState(telefono) {
  try {
    if (!telefono) throw new Error("El teléfono es requerido");

    const response = await api.get(`/Derechohabiente/get-state/${telefono}`);
    return response.data;
  } catch (error) {
    logger.error("Error obteniendo estado del usuario:", error.message);
    return { success: false, message: "No se pudo obtener el estado" };
  }
}

module.exports = {
  getUser,
  setUserState,
  getUserState,
};
