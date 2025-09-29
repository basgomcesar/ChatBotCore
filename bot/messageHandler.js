const welcomeFlow = require("../flows/bienvenidaFlow/welcomeFlow");
const userState = require("../state/userState");
const flowRouter = require("../utils/flowRouter");

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
    //------------------------EMPIEZA A LLAMAR EL ESTADO Y REDIRIGIR AL FLUJO
    //1. Obtiene el estado actual del usuario
    let state = userState.getState(from);
    console.log("Este el estado incial cuando es la primera vez",state)
    // 2. Pasar el mensaje al router de flows
    const { reply, newState } = await flowRouter.route(from, text, state);

    // 3. Guardar el nuevo estado
    userState.setState(from, newState);

    // 4. Enviar la respuesta si existe
    if (reply) {
      await sock.sendMessage(from, { text: reply });
    }
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }
};
