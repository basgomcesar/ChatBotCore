const { createSocket } = require("./whatsappService");
const { registerEvents } = require("./eventHandlers");

//Crea el socket de comunicacion y 
async function init() {
  async function startSock() {
    const sock = await createSocket();
    registerEvents(sock, startSock);
    return sock;
  }
  await startSock();
}

module.exports = { init };