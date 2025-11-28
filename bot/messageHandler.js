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
    const MAX_TRANSITIONS = 5;

    let inputText = text;

    do {
      let state = await userState.getState(from);
      
      ({ reply, newState, file } = await flowRouter.route(
        from,
        inputText,
        state
      ));

      await userState.setState(from, newState);

      inputText = "";
      tries++;
    } while (!reply && tries < MAX_TRANSITIONS);

    // 5. Enviar mas de una respuesta si hay un array en lugar de un string
    if (Array.isArray(reply)) {
      for (const message of reply) {
        await sock.sendMessage(from, { text: message });
      }
    } else if (reply) {
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
