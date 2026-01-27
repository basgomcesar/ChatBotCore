/**
 * Message handler for processing incoming WhatsApp messages
 * @module messageHandler
 */

const userState = require("../state/userState");
const flowRouter = require("../utils/flowRouter");
const logger = require("../config/logger");
const { 
  extractMessageContent, 
  shouldProcessMessage, 
  getSenderJid 
} = require("../utils/messageExtractor");

/**
 * Processes incoming messages and routes them to appropriate flows
 * @param {object} sock - WhatsApp socket connection
 * @param {object} m - Message event object
 */
module.exports = async (sock, m) => {
  try {
    const msg = m.messages?.[0];
    const from = getSenderJid(msg);

    if (!shouldProcessMessage(msg, from)) {
      return;
    }

    let text, imageBuffer, documentBuffer, messageType, mimeType, fileName;
    
    try {
      ({ text, imageBuffer, documentBuffer, messageType, mimeType, fileName } = 
        await extractMessageContent(sock, msg));
    } catch (error) {
      logger.error(`❌ Error extrayendo contenido del mensaje: ${error.message}`);
      await sock.sendMessage(from, { 
        text: "❌ No pude procesar tu mensaje. Por favor, intenta nuevamente." 
      });
      return;
    }

    if (!text) return;
    
    logger.info(`📩 Mensaje de ${from}: ${text}`);

    const messageData = {
      text,
      imageBuffer,
      documentBuffer,
      messageType,
      mimeType,
      fileName
    };

    let reply, newState, file;
    let tries = 0;
    const MAX_TRANSITIONS = 5;

    let inputText = text;

    do {
      let state = await userState.getState(from);
      
      ({ reply, newState, file } = await flowRouter.route(
        from,
        inputText,
        state,
        messageData 
      ));
      await userState.setState(from, newState);

      inputText = "";
      tries++;
    } while (!reply && tries < MAX_TRANSITIONS);

    // Enviar respuestas
    if (Array.isArray(reply)) {
      for (const message of reply) {
        await sock.sendMessage(from, { text: message });
      }
    } else if (reply) {
      await sock.sendMessage(from, { text: reply });
    }
    
    if (file) {
      console.log("Enviando archivo al usuario:", file.fileName);
      await sock.sendMessage(from, file);
    }
    
  } catch (error) {
    logger.error("Error procesando mensaje:", error);
    
    // Intentar enviar mensaje de error al usuario
    try {
      const from = msg?.key?.remoteJid;
      if (from) {
        await sock.sendMessage(from, { 
          text: "❌ Ocurrió un error al procesar tu mensaje. Por favor, intenta nuevamente o escribe 'menu' para regresar al inicio." 
        });
      }
    } catch (sendError) {
      logger.error("Error enviando mensaje de error al usuario:", sendError);
    }
  }
};