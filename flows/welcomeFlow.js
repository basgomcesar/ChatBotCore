async function handle(userId, message) {
  // ... lógica
  return {
    text: `${obtenerSaludo()}

💬 _Gracias por comunicarte con el *Departamento de Prestaciones Económicas* del *Instituto de Pensiones del Estado*_.

👩‍💻 Soy *IPEBOT*, tu *asistente virtual inteligente* 🤖 y estoy aquí para ayudarte en lo que necesites.

💁‍♂️ *¿Podrías decirme tu nombre para brindarte una mejor atención?*

🔒 *Aviso de Privacidad:*
Ya conoces nuestro Aviso de Privacidad.
Consulta la política vigente en: https://www.veracruz.gob.mx/ipe/transparencia/sistema-de-datos-personales/`,
  }; // SIEMPRE retorna un string
}

function obtenerSaludo() {
  const horaActual = new Date().getHours();
  if (horaActual >= 5 && horaActual < 12) {
    return "Buenos días ☀️";
  } else if (horaActual >= 12 && horaActual < 18) {
    return "Buenas tardes 🌤️";
  } else {
    return "Buenas noches 🌙";
  }
}

module.exports = { handle };
