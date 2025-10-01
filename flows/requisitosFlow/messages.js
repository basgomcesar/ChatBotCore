const PREGUNTAR_TIPO_PRESTAMO = (nombre) => `
🔍 *¡Entendido, ${nombre}!*  
¿Para qué tipo de préstamo necesitas los requisitos?  

Por favor elige una opción:  
1️⃣ Corto Plazo  
2️⃣ Mediano Plazo  
3️⃣ Información General ℹ️
`;

// PERSONAL ACTIVO - CORTO PLAZO
const REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO = `
📝 *Requisitos: Préstamo a Corto Plazo (Personal Activo)*

📌 *Condiciones:*  
- Antigüedad mínima: 6 meses.  
- Si tiene menos de 10 años cotizando al IPE → necesita un aval en servicio activo con antigüedad mínima de 6 meses.  
- El monto aprobado dependerá de la capacidad de pago.  

📑 *Documentos Originales:*  
- Solicitud de Préstamo Corto Plazo Domiciliado.¹  
- Formato de Domiciliación.  

📄 *Documentos en Copia:*  
- Estado de Cuenta de Nómina con CLABE.²  
- Último Comprobante de Pago de Nómina.  
- Credencial de Afiliación del Instituto de Pensiones.³  
- Identificación Oficial vigente.⁴  
- Comprobante de Domicilio.⁵  

ℹ️ *Notas Importantes:*  
¹ Certificada por la institución donde labora. (SEV o UV no requieren certificación).  
² Debe estar actualizado (últimos 30 días). *No debe tener portabilidad de nómina.*  
³ Credencial vigente y firmada.  
⁴ INE, pasaporte o cartilla militar vigente.  
⁵ Recibo de agua, luz o teléfono con vigencia < 3 meses.  
`;

// PERSONAL ACTIVO - MEDIANO PLAZO
const REQUISITOS_MEDIANO_PLAZO_ACTIVO = `
📝 *Requisitos: Préstamo a Mediano Plazo (Personal Activo)*

📌 *Condiciones:*  
- Antigüedad mínima: 3 años.  
- Deberá presentar de 1 a 3 avales en servicio activo con al menos 6 meses y que equiparen o superen sus ingresos.  
- Se evaluará historial crediticio interno y externo.  

📑 *Documentos Originales:*  
- Solicitud de Préstamo Mediano Plazo Domiciliado.¹  
- Formato de Domiciliación.  

📄 *Documentos en Copia:*  
- Estado de Cuenta de Nómina con CLABE.²  
- Dos últimos comprobantes de nómina.  
- Credencial de Afiliación del Instituto de Pensiones.³  
- Identificación Oficial vigente.⁴  
- Comprobante de Domicilio.⁵  

ℹ️ *Notas:*  
¹ Certificada por la institución donde labora (SEV y UV no requieren certificación).  
² Actualizado, últimos 30 días, *sin portabilidad de nómina*.  
³ Vigente y firmada.  
⁴ INE, pasaporte o cartilla militar vigente.  
⁵ Recibo agua, luz o teléfono (vigencia < 3 meses).  
`;

// PERSONAL PENSIONADO - CORTO PLAZO
const REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO = `
📝 *Requisitos: Préstamo a Corto Plazo (Pensionistas)*

📌 *Condiciones:*  
- No requiere aval.  
- El monto dependerá de la pensión recibida.  

📑 *Documentos Originales:*  
- Solicitud de Préstamo Corto Plazo Domiciliado.  

📄 *Documentos en Copia:*  
- Credencial de Afiliación del Instituto de Pensiones.¹  
- Identificación Oficial vigente.²  

ℹ️ *Notas:*  
¹ Vigente y firmada.  
² INE, pasaporte o cartilla militar vigente.  
`;

// PERSONAL PENSIONADO - MEDIANO PLAZO
const REQUISITOS_MEDIANO_PLAZO_PENSIONADO = `
📝 *Requisitos: Préstamo a Mediano Plazo (Pensionistas)*

📌 *Condiciones:*  
- Requiere de 1 a 3 avales que equiparen o superen ingresos.  
- Avales pueden ser pensionistas o trabajadores activos con antigüedad mínima de 6 meses.  
- Sujeto a análisis financiero.  

📑 *Documentos Originales:*  
- Solicitud de Préstamo Mediano Plazo Domiciliado.  
- Formato de Domiciliación.³  

📄 *Documentos en Copia:*  
- Credencial de Afiliación del Instituto de Pensiones.¹  
- Identificación Oficial vigente.²  
- Dos últimos comprobantes de pago de pensión.³  
- Estado de Cuenta de Nómina con CLABE.³ ⁴  
- Comprobante de Domicilio.³ ⁵  

ℹ️ *Notas:*  
¹ Vigente y firmada.  
² INE, pasaporte o cartilla militar vigente.  
³ Requisito sólo para avales activos.  
⁴ Estado de cuenta actualizado (últimos 30 días). *Sin portabilidad.*  
⁵ Recibo agua, luz o teléfono (< 3 meses).  
`;

module.exports = {
  PREGUNTAR_TIPO_PRESTAMO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO,
  REQUISITOS_MEDIANO_PLAZO_ACTIVO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO,
  REQUISITOS_MEDIANO_PLAZO_PENSIONADO,
};
