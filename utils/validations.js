/**
 * Validation utilities for user input
 * @module validations
 */

const { USUARIOS } = require("../config/constants");

/**
 * Validates if a name is valid (only letters and spaces, minimum 2 characters)
 * @param {string} name - The name to validate
 * @returns {boolean} True if the name is valid, false otherwise
 */
function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  return /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(name.trim());
}

/**
 * Validates if the option is a number within a permitted range
 * @param {string|number} input - The input to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if the option is valid, false otherwise
 */
function isValidMenuOption(input, min, max) {
  const num = parseInt(input, 10);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Checks if the current time is within business hours
 * Business hours: Monday to Friday, 8:00 AM to 3:00 PM (Mexico City time)
 * @returns {boolean} True if within business hours, false otherwise
 */
function esHorarioDeAtencion() {
  // Obtener fecha/hora actual en zona horaria de la Ciudad de México
  const cdmxTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  const nowCDMX = new Date(cdmxTime);

  // Obtener día de la semana (0 = domingo, 1 = lunes, ..., 6 = sábado)
  const dayOfWeek = nowCDMX.getDay();

  // Obtener la hora del día (formato 0-23)
  const hour = nowCDMX.getHours();

  // Verificar que sea lunes a viernes (dayOfWeek: 1..5)
  const esDiaHabil = dayOfWeek >= 1 && dayOfWeek <= 5;

  // Verificar que la hora esté entre 8:00 y 14:59
  const esHoraValida = hour >= 8 && hour < 15;

  return esDiaHabil && esHoraValida;
}

/**
 * Validates if a string contains only numbers
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is numeric, false otherwise
 */
function isNumeric(str) {
  if (!str || typeof str !== 'string') return false;
  return /^\d+$/.test(str.trim());
}

/**
 * Detects the user type based on input
 * Recognizes numeric options (1 for active, 2 for retired) and keywords
 * @param {string} input - The user input
 * @returns {string|null} The user type (ACTIVO or PENSIONADO) or null if not detected
 */
function detectUserType(input) {
  const normalized = (input || "").toLowerCase().trim();
  const tokens = normalized.split(/\W+/).filter(Boolean);
  const isNumber = /^\d+$/.test(normalized);

  // Palabras clave por tipo
  const activeKeywords = ["activo", "activa"];
  const pensionistaKeywords = [
    "pensionado",
    "pensionada",
    "jubilado",
    "jubilada",
    "pensionista",
  ];

  if (isNumber) {
    if (normalized === "1") return USUARIOS.ACTIVO;
    if (normalized === "2") return USUARIOS.PENSIONADO;
  } else {
    if (tokens.some((t) => activeKeywords.includes(t))) return USUARIOS.ACTIVO;
    if (tokens.some((t) => pensionistaKeywords.includes(t)))
      return USUARIOS.PENSIONADO;
  }

  return null;
}

module.exports = {
  isValidName,
  isValidMenuOption,
  isNumeric,
  detectUserType,
  esHorarioDeAtencion
};
