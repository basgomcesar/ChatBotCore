const welcomeFlow = require("../flows/welcomeFlow");

//Lógica para procesar mensajes (llama a los flows)
module.exports = async (sock, m) => {
  try {
    const msg = m.messages?.[0];
    if (!msg || !msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    if (!text || from.endsWith("@g.us")) return;
    if (!from.endsWith("2556@s.whatsapp.net")) return;

    console.log(`📩 Mensaje de ${from}: ${text}`);
    const respuesta = await welcomeFlow.handle(from, text);

    if (respuesta) {
      await sock.sendMessage(from, respuesta);
    }
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }
};
