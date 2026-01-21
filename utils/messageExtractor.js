/**
 * Message extraction utilities
 * Handles extraction of text and media from WhatsApp messages
 * @module messageExtractor
 */

const logger = require("../config/logger");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");  // ✅ Importar desde Baileys

/**
 * Extracts message content (text or image) from WhatsApp message
 * @param {object} sock - WhatsApp socket connection
 * @param {object} msg - Message object
 * @returns {Promise<object>} Object with { text, imageBuffer, messageType }
 */
async function extractMessageContent(sock, msg) {
  if (!msg || !msg.message) {
    return { text: "", imageBuffer: null, messageType: "unknown" };
  }

  const messageType = Object.keys(msg.message)[0];
  const isImage = messageType === "imageMessage";
  const isDocument = messageType === "documentMessage";
  const isVideo = messageType === "videoMessage";

  let text = "";
  let imageBuffer = null;

  // Handle image messages
  if (isImage) {
    try {
      imageBuffer = await downloadMedia(msg);  
      text = "[IMAGEN_RECIBIDA]"; 
      
      const from = msg.key.remoteJid;
      logger.info(`📷 Imagen recibida de ${from}, tamaño: ${imageBuffer. length} bytes`);
    } catch (error) {
      logger.error(`❌ Error descargando imagen: ${error.message}`);
      throw new Error("No se pudo descargar la imagen");
    }
  } 
  // Handle document messages (PDFs, etc.)
  else if (isDocument) {
    try {
      const documentBuffer = await downloadMedia(msg);  
      const mimeType = msg.message. documentMessage.mimetype;
      const fileName = msg.message.documentMessage.fileName;
      
      text = "[DOCUMENTO_RECIBIDO]";
      const from = msg.key.remoteJid;
      logger.info(`📄 Documento recibido de ${from}:  ${fileName} (${mimeType}), tamaño: ${documentBuffer. length} bytes`);
      
      return { 
        text, 
        imageBuffer: null,
        documentBuffer,
        messageType: "document",
        mimeType,
        fileName
      };
    } catch (error) {
      logger.error(`❌ Error descargando documento:  ${error.message}`);
      throw new Error("No se pudo descargar el documento");
    }
  }
  // Handle video messages
  else if (isVideo) {
    text = "[VIDEO_RECIBIDO]";
    logger.info(`🎥 Video recibido de ${msg.key.remoteJid}`);
  }
  // Handle text messages
  else {
    text = msg.message.conversation || 
           msg.message.extendedTextMessage?.text || 
           msg.message.imageMessage?.caption ||
           msg.message.videoMessage?.caption ||
           "";
  }

  return { 
    text, 
    imageBuffer, 
    messageType:  isImage ? "image" : isDocument ? "document" : "text" 
  };
}

/**
 * Downloads media (image, document, video) from WhatsApp message
 * @param {object} msg - Message object
 * @returns {Promise<Buffer>} Media buffer
 */
async function downloadMedia(msg) {
  try {
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { 
        logger:  {
          level: 'silent',
          child: () => ({ level: 'silent' })
        },
        reuploadRequest: () => Promise.resolve()
      }
    );
    
    return buffer;
  } catch (error) {
    logger.error(`❌ Error en downloadMedia: ${error.message}`);
    throw error;
  }
}

/**
 * Validates if message should be processed
 * @param {object} msg - Message object
 * @param {string} from - Sender JID
 * @returns {boolean} True if message should be processed
 */
function shouldProcessMessage(msg, from) {
  // Ignore messages from self
  if (! msg || !msg.message || msg.key.fromMe) {
    return false;
  }

  // Ignore group messages
  if (from. endsWith("@g.us")) {
    return false;
  }

  return true;
}

/**
 * Gets the sender's JID from message
 * @param {object} msg - Message object
 * @returns {string} Sender JID
 */
function getSenderJid(msg) {
  return msg.key. remoteJid;
}

module.exports = {
  extractMessageContent,
  downloadMedia,
  shouldProcessMessage,
  getSenderJid
};