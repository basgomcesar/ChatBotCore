
function obtenerSaludo() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "Buenos días ☀️";
  if (hora < 18) return "Buenas tardes 🌤️";
  return "Buenas noches 🌙";
}
//Definición de mensajes
const AVISO_PRIVACIDAD = `🔒 *Aviso de Privacidad:*
Ya conoces nuestro Aviso de Privacidad.
Consulta la política vigente en: https://www.veracruz.gob.mx/ipe/transparencia/sistema-de-datos-personales/`;

const MENU =(nombre)=>
                `🤖 *¿En qué más puedo ayudarte, ${nombre || ''}?*\n\n` +
                `1️⃣ *Requisitos y Formatos*\n` +
                `2️⃣ *Simulación*\n` +
                `3️⃣ *Llenado de Solicitud*\n` +
                `4️⃣ *Comprobante de Préstamo*\n` +
                `5️⃣ *Asesor*\n` +
                `6️⃣ *Preguntas Frecuentes*\n\n` +
                `Por favor, responde con el número o el nombre de la opción que deseas.`;

const BIENVENIDA = ()=>`${obtenerSaludo()}

💬 _Gracias por comunicarte con el *Departamento de Prestaciones Económicas* del *Instituto de Pensiones del Estado*_.  

👩‍💻 Soy *IPEBOT*, tu *asistente virtual inteligente* 🤖 y estoy aquí para ayudarte en lo que necesites.  

💁‍♂️ *¿Podrías decirme tu nombre para brindarte una mejor atención?*  

${AVISO_PRIVACIDAD}`;
const ERRORES = {NOMBRE_INVALIDO:"❌ Por favor ingresa un nombre válido."} 

module.exports={BIENVENIDA,MENU,ERRORES}