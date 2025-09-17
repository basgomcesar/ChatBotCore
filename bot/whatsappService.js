const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");


// Inicializa y exporta la conexión de WhatsApp
async function createSocket() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state });
  sock.ev.on("creds.update", saveCreds);

  return sock;
}

module.exports = { createSocket };