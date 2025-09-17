const qrcode = require("qrcode-terminal");
const { DisconnectReason } = require("@whiskeysockets/baileys");
const messageHandler = require("./messageHandler");

function registerEvents(sock, startSock) {
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("📲 Escanea este código QR con tu WhatsApp:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("✅ Conectado a WhatsApp!");
    } else if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(
        "❌ Conexión cerrada",
        lastDisconnect?.error,
        `→ Reintentando: ${shouldReconnect}`
      );
      if (shouldReconnect) {
        startSock();
      } else {
        console.log("🔒 Sesión cerrada. Elimina la carpeta auth_info para volver a conectar.");
      }
    }
  });

  sock.ev.on("messages.upsert", (m) => messageHandler(sock, m));
}

module.exports = { registerEvents };