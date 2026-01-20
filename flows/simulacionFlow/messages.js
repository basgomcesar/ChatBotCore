const REQ_SIMULACION_ACTIVO = () => `📋 Requisitos para Simulación de Préstamo para Trabajadoras y Trabajadores Activos:
Para realizar la simulación de préstamo, necesitamos los siguientes documentos:

1️⃣ Credencial IPE (en formato de imagen, foto clara y legible).
2️⃣ Estado de cuenta en formato PDF que contenga los movimientos de los últimos 30 días.

Por favor, asegúrate de tener estos documentos antes de iniciar el proceso.`;
const REQ_SIMULACION_PENSIONADO = () => `
📋 *Requisitos para Simulación de Préstamo para Pensionados*:
Para realizar la simulación de préstamo, necesitamos el siguiente documento:

1️⃣ *Credencial IPE vigente* (en formato de imagen, foto clara y legible).

Por favor, asegúrate de tener este documento antes de iniciar el proceso.
            `
const MSG_PREPARADO = () => `¿Los tienes listos? Responde con Sí o No para continuar.`;
const MSG_INGRESE_CREDENCIAL = () => `✅ ¡Excelente!  ✅
Por favor envíame primero una foto clara y legible de tu credencial del IPE (frontal). 
🧠 Estoy listo para analizarla en cuanto la reciba.
❌ Si deseas cancelar esta operación, solo escribe cancelar y volveremos al inicio.`;
const MSG_NO_TE_PREOCUPES = () => `🕐 No te preocupes.  
Cuando tengas los documentos listos, puedes volver a escribirme para iniciar la simulación.  
Estoy aquí para ayudarte. 😊

⬅️ También puedes escribir menú para regresar al inicio cuando lo desees.`;

module.exports = {
  REQ_SIMULACION_ACTIVO,
  REQ_SIMULACION_PENSIONADO,
  MSG_PREPARADO,
  MSG_INGRESE_CREDENCIAL,
  MSG_NO_TE_PREOCUPES
};