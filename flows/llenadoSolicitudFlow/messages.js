const preguntarTipoSolicitudPrestamo = () =>
    `📝 Llenado de Solicitud de Préstamo:

Por favor, indica el tipo de préstamo para el cual deseas llenar la solicitud:

1️⃣ Corto Plazo
2️⃣ Mediano Plazo
`;
const pedirCredencialCortoPlazo = () =>
    `Por favor, envíame una foto clara de tu credencial IPE (solicitante) para comenzar con el llenado de la solicitud de Corto Plazo.`;
const pedirCredencialMedianoPlazo = () =>
    `Para el llenado de la solicitud de *Préstamo a Mediano Plazo*, por favor envíame primero la credencial IPE del solicitante.`;

const verificarSolicitudPrestamo = ({ nombre, paterno, materno, numAfiliacion, folio, infoDomicilio, infoLaboral ,correo, telefono, dependencia, organismo, empleo }) => `
📋 *Solicitud de Préstamo a Corto Plazo para Trabajadores Activos*

🔸 *Nombre Completo*: ${nombre} ${paterno} ${materno}
🔸 *Afiliación*: ${numAfiliacion}
🔸 *Folio*: ${folio}
🔸 *Domicilio*: ${infoDomicilio.calle}
🔸 *Colonia*: ${infoDomicilio.colonia}
🔸 *Código Postal*: ${infoDomicilio.cp}
🔸 *Municipio*: ${infoDomicilio.municipio}
🔸 *Estado*: ${infoDomicilio.estado}
${correo ? `🔸 *Correo Electrónico*: ${correo}` : ''}
${telefono ? `🔸 *Celular*: ${telefono}` : ''}

🔸 *Dependencia*: ${infoLaboral.dependencia}
🔸 *Organismo*: ${infoLaboral.organismo}
🔸 *Empleo*: ${infoLaboral.empleo}

✅ *Por favor, confirma si deseas proceder con esta información.* Responde *SI* para continuar o *NO* para cancelar.
        `;
module.exports = { preguntarTipoSolicitudPrestamo, pedirCredencialCortoPlazo, pedirCredencialMedianoPlazo, verificarSolicitudPrestamo };