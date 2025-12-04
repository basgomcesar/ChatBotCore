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

module.exports = {
  REQ_SIMULACION_ACTIVO,
  REQ_SIMULACION_PENSIONADO,
  MSG_PREPARADO,
};