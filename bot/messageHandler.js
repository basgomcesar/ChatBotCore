/**
 * Message handler for processing incoming WhatsApp messages
 * @module messageHandler
 */

const userState = require("../state/userState");
const flowRouter = require("../utils/flowRouter");
const logger = require("../config/logger");

/**
 * Processes incoming messages and routes them to appropriate flows
 * @param {object} sock - WhatsApp socket connection
 * @param {object} m - Message event object
 */
module.exports = async (sock, m) => {
  try {
    const msg = m.messages?.[0];
    if (!msg || !msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    if (!text || from.endsWith("@g.us")) return;

    logger.info(`📩 Mensaje de ${from}: ${text}`);

    let reply, newState, file;
    let tries = 0;
    const MAX_TRANSITIONS = 5; // Para evitar bucles infinitos

    let inputText = text;

    do {
      // 1. Siempre obtiene el estado actual según el número antes de cada transición
      let state = await userState.getState(from);
      
      // 2. Pasar el mensaje al router, usando el estado más reciente
      ({ reply, newState, file } = await flowRouter.route(
        from,
        inputText,
        state
      ));

      // 3. Guardar el nuevo estado (haciendo merge si tu setState lo soporta)
      await userState.setState(from, newState);

      // 4. Para siguientes ciclos, inputText es vacío
      inputText = "";
      tries++;
    } while (!reply && tries < MAX_TRANSITIONS);

    // 5. Enviar la respuesta si existe
    if (reply) {
      await sock.sendMessage(from, { text: reply });
    }
    if (file) {
      await sock.sendMessage(from, file);
    }
  } catch (error) {
    logger.error("Error procesando mensaje:", error);
    // Attempt to send error message to user
    try {
      await sock.sendMessage(from, { 
        text: "❌ Ocurrió un error al procesar tu mensaje. Por favor, intenta nuevamente o escribe 'menu' para regresar al inicio." 
      });
    } catch (sendError) {
      logger.error("Error enviando mensaje de error al usuario:", sendError);
    }
  }
};
