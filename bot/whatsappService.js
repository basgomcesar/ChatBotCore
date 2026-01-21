/**
 * WhatsApp service for creating and managing socket connections
 * @module whatsappService
 */

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");

/**
 * Creates a WhatsApp Web socket connection
 * @returns {Promise<object>} WhatsApp socket instance
 * @description Initializes authentication state and creates a new socket connection
 */
async function createSocket() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state });
  sock.ev.on("creds.update", saveCreds);

  return sock;
}

module.exports = { createSocket };