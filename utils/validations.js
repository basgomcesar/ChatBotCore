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
  detectUserType,
  esHorarioDeAtencion
};
