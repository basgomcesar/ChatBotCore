/**
 * Event handlers for WhatsApp connection and messages
 * @module eventHandlers
 */

const qrcode = require("qrcode-terminal");
const { DisconnectReason } = require("@whiskeysockets/baileys");
const messageHandler = require("./messageHandler");
const logger = require("../config/logger");

/**
 * Registers event handlers for WhatsApp socket
 * @param {object} sock - WhatsApp socket connection
 * @param {Function} startSock - Function to restart socket on disconnect
 * @description Sets up handlers for connection updates and incoming messages
 */
function registerEvents(sock, startSock) {
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      logger.info("📲 Escanea este código QR con tu WhatsApp:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      logger.info("✅ Conectado a WhatsApp!");
    } else if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.warn(
        `❌ Conexión cerrada: ${lastDisconnect?.error?.message || 'Sin detalles'} → Reintentando: ${shouldReconnect}`
      );
      if (shouldReconnect) {
        startSock();
      } else {
        logger.info("🔒 Sesión cerrada. Elimina la carpeta auth_info para volver a conectar.");
      }
    }
  });

  sock.ev.on("messages.upsert", (m) => messageHandler(sock, m));
}

module.exports = { registerEvents };