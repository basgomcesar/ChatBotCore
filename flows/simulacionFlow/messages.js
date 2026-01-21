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
const MSG_PROCESANDO_CREDENCIAL = () => `🔄 Procesando tu credencial... 
Por favor espera un momento mientras analizo la imagen.`;

const MSG_CREDENCIAL_PROCESADA = (numeroAfiliacion, tipo, simulacion) => `✅ ¡Credencial procesada exitosamente!  ✅

📄 **Número de ${tipo === 'A' ? 'Afiliación' : 'Pensionado'}:** ${numeroAfiliacion}

Estos son los resultados de la simulación de préstamo basados en tu información:

${simulacion.map(sim => `
💰 **Plazo: ${sim.plazo} meses**
├─ Importe Cheque: $${sim.importeCheque.toFixed(2)}
├─ Importe Líquido: $${sim.importeLiquido.toFixed(2)}
└─ Descuento: $${sim.descuento.toFixed(2)}
`).join('')}
`;

const MSG_ERROR_PROCESANDO_CREDENCIAL = (mensaje) => `❌ No pude procesar tu credencial. 

**Motivo:** ${mensaje}

Por favor, verifica que: 
✔️ La imagen sea clara y legible
✔️ Se vea completo el número de afiliación/pensionado
✔️ La credencial esté bien iluminada

Intenta enviar la foto nuevamente o escribe 'cancelar' para salir.`;

module.exports = {
  REQ_SIMULACION_ACTIVO,
  REQ_SIMULACION_PENSIONADO,
  MSG_PREPARADO,
  MSG_INGRESE_CREDENCIAL,
  MSG_NO_TE_PREOCUPES,
  MSG_PROCESANDO_CREDENCIAL,
  MSG_CREDENCIAL_PROCESADA,
  MSG_ERROR_PROCESANDO_CREDENCIAL
};