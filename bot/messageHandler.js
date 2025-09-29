const userState = require("../state/userState");
const flowRouter = require("../utils/flowRouter");

// Lógica para procesar mensajes (llama a los flows)
module.exports = async (sock, m) => {
  try {
    const msg = m.messages?.[0];
    if (!msg || !msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    if (!text || from.endsWith("@g.us")) return;
    // if (!from.endsWith("2556@s.whatsapp.net")) return;

    console.log(`📩 Mensaje de ${from}: ${text}`);

    let reply, newState;
    let tries = 0;
    const MAX_TRANSITIONS = 5; // Para evitar bucles infinitos

    let inputText = text;

    do {
      // 1. Siempre obtiene el estado actual según el número antes de cada transición
      let state = userState.getState(from);

      // 2. Pasar el mensaje al router, usando el estado más reciente
      ({ reply, newState } = await flowRouter.route(from, inputText, state));

      // 3. Guardar el nuevo estado (haciendo merge si tu setState lo soporta)
      userState.setState(from, newState);

      // 4. Para siguientes ciclos, inputText es vacío
      inputText = "";
      tries++;
    } while (!reply && tries < MAX_TRANSITIONS);

    // 5. Enviar la respuesta si existe
    if (reply) {
      await sock.sendMessage(from, { text: reply });
    }
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }
};