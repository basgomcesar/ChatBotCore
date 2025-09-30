const { USUARIOS } = require("../config/constants");

// Valida si un nombre es válido (solo letras y espacios, mínimo 2 caracteres)
function isValidName(name) {
  return /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(name.trim());
}

// Valida si la opción es un número dentro de un rango permitido
function isValidMenuOption(input, min, max) {
  const num = parseInt(input, 10);
  return !isNaN(num) && num >= min && num <= max;
}

// Valida si una cadena contiene solo números (ejemplo: para CURP, teléfono, etc.)
function isNumeric(str) {
  return /^\d+$/.test(str.trim());
}

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
  detectUserType
};
