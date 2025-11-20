const axios = require("axios");
const logger = require("../config/logger");

const API_URL = process.env.BACKEND_API_URL || "https://tu-backend/api";

/**
 * Axios con configuración base
 */
const api = axios.create({
  baseURL: API_URL,
  timeout: 5000, // 5 segundos por seguridad
});

/**
 * Obtiene los datos de un usuario por su número de teléfono
 */
async function getUser(telefono) {
  try {
    const response = await api.get(`/Derechohabiente/${telefono}`);
    return response.data;
  } catch (error) {
    logger.error(" Error consultando usuario:", error.message);
    // En caso de no existir, devolvemos un objeto base
    return { nombre: "Invitado", telefono };
  }
}

/**
 *  Actualiza el estado (flujo y paso) del usuario en el backend
 */
async function setUserState({
  telefono,
  flujo,
  paso,
  folio = "",
  tipo = "",
  nombre ,
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
    };
    const response = await api.post(`/Derechohabiente/update-state`, payload);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(
        "❌ Error del backend:",
        error.response.status,
        error.response.data,
        error
      );
    } else if (error.request) {
      console.error("❌ No hubo respuesta del servidor:", error.request);
    } else {
      console.error("❌ Error configurando la petición:", error.message);
    }
  }
}

/**
 * 📊 Obtiene el estado actual del usuario (flujo y paso)
 */
async function getUserState(telefono) {
  try {
    if (!telefono) throw new Error("El teléfono es requerido");

    const response = await api.get(`/Derechohabiente/get-state/${telefono}`);
    return response.data;
  } catch (error) {
    logger.error(" Error obteniendo estado del usuario:", error.message);
    return { success: false, message: "No se pudo obtener el estado" };
  }
}

module.exports = {
  getUser,
  setUserState,
  getUserState,
};
