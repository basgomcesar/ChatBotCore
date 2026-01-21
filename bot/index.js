/**
 * Bot initialization module
 * @module bot
 */

const { createSocket } = require("./whatsappService");
const { registerEvents } = require("./eventHandlers");

/**
 * Initializes the WhatsApp bot
 * @returns {Promise<void>}
 * @description Creates socket connection and registers event handlers
 */
async function init() {
  /**
   * Starts a new socket connection with event handlers
   * @returns {Promise<object>} Socket instance
   */
  async function startSock() {
    const sock = await createSocket();
    registerEvents(sock, startSock);
    return sock;
  }
  await startSock();
}

module.exports = { init };