/**
 * Message templates for the welcome flow
 * @module welcomeFlow/messages
 */

/**
 * Gets a greeting based on the current time of day
 * @returns {string} A time-appropriate greeting
 */
function obtenerSaludo() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "Buenos días ☀️";
  if (hora < 18) return "Buenas tardes 🌤️";
  return "Buenas noches 🌙";
}

// Message definitions
const AVISO_PRIVACIDAD = `🔒 *Aviso de Privacidad:*
Ya conoces nuestro Aviso de Privacidad.
Consulta la política vigente en: https://www.veracruz.gob.mx/ipe/transparencia/sistema-de-datos-personales/`;

/**
 * Asks for user type (active or retired)
 * @param {string} name - User's name
 * @returns {string} Message asking for user type
 */
const PREGUNTAR_TIPO_USUARIO = (name) =>
  `¡Hola, *${name}*! 😊\n` +
  `¿Eres Personal Activo o Pensionista?\n` +
  `Por favor, selecciona una opción:\n` +
  `1️⃣ Personal Activo\n` +
  `2️⃣ Pensionista`;

/**
 * Displays the main menu
 * @param {string} nombre - User's name (optional)
 * @returns {string} Main menu message
 */
const MENU = (nombre) =>
  `🤖 *¿En qué más puedo ayudarte, ${nombre || ""}?*\n\n` +
  `1️⃣ *Requisitos y Formatos*\n` +
  `2️⃣ *Simulación*\n` +
  `3️⃣ *Llenado de Solicitud*\n` +
  `4️⃣ *Comprobante de Préstamo*\n` +
  `5️⃣ *Asesor*\n` +
  `6️⃣ *Preguntas Frecuentes*\n\n` +
  `Por favor, responde con el número o el nombre de la opción que deseas.`;

/**
 * Welcome message with greeting and privacy notice
 * @returns {string} Welcome message
 */
const BIENVENIDA = () => `${obtenerSaludo()}

💬 _Gracias por comunicarte con el *Departamento de Prestaciones Económicas* del *Instituto de Pensiones del Estado*_.  

👩‍💻 Soy *IPEBOT*, tu *asistente virtual inteligente* 🤖 y estoy aquí para ayudarte en lo que necesites.  

${AVISO_PRIVACIDAD}

💁‍♂️ *¿Podrías decirme tu nombre para brindarte una mejor atención?*  
`;

/**
 * Error messages for the welcome flow
 */
const ERRORES = { 
  NOMBRE_INVALIDO: "❌ Por favor ingresa un nombre válido.",
  TIPO_USUARIO_INVALIDO: (nombre) => 
    `⚠️ *Por favor, indícame si eres Personal Activo o Pensionista, ${nombre}.*\n\n` +
    `Responde con *1* para Personal Activo, *2* para Pensionista` 
};

module.exports = { BIENVENIDA, MENU, PREGUNTAR_TIPO_USUARIO, ERRORES };
