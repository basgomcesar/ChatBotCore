const PREGUNTAR_TIPO_PRESTAMO = (nombre) => `🔍 *¡Entendido, ${nombre}!* 
¿Para qué tipo de préstamo necesitas los requisitos? 
    
Por favor elige una opción:
 1️⃣ Corto Plazo
 2️⃣ Mediano Plazo`;
//PERSONAL ACTIVO CORTO PLAZO.
REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO = `📝 *Requisitos para Préstamo a Corto Plazo Domiciliado: Personal Activo*
    

    ▪︎Antigüedad mínima: 6 meses.
    ▪︎Si tiene una antigüedad menor a 10 años cotizando al IPE, será necesario presentar un aval en servicio activo con la antigüedad mínima de 6 meses.
    
    📑 *Documentos Originales*:
    ▪︎Solicitud de Préstamo Corto Plazo Domiciliado.¹
    ▪︎Formato de Domiciliación.
    
    📄 *Documentos en Copia*:
    ▪︎Estado de Cuenta de Nómina con CLABE.² 
    ▪︎Último Comprobante de Pago de Correspondiente a su Nómina.  
    ▪︎Credencial de Afiliación del Instituto de Pensiones.³  
    ▪︎Identificación Oficial.⁴  
    ▪︎Comprobante de Domicilio.⁵  
    

¹ Certificada por la institución donde labora. Si usted trabaja en la SEV o UV, no es necesario contar con dicha certificación.
² Actualizado y con los movimientos de los últimos 30 días. *No debe tener portabilidad de nómina.*
³ Debe estar vigente y firmada.
⁴ Credencial de elector, pasaporte o cartilla militar vigente.
⁵ Recibo de agua, luz o teléfono, con una vigencia no mayor a 3 meses.`;

//PERSONAL ACTIVO MEDIANO PLAZO.
const REQUISITOS_MEDIANO_PLAZO_ACTIVO = `📝 *Requisitos para Préstamos a Mediano Plazo Domiciliado Personal Activo*
            
        ▪︎Antigüedad mínima para solicitarlo: 3 años.  
        ▪︎Será necesario presentar de 1 a 3 avales en servicio activo con antigüedad mínima de 6 meses, que equiparen o superen sus ingresos.
        
        📑 *Documentos Originales:*
        ▪︎Solicitud de Préstamo Mediano Plazo Domiciliado.¹
        ▪︎Formato de Domiciliación.
        
        📄 *Documentos en Copia*:
        ▪︎Estado de Cuenta de Nómina con CLABE.²
        ▪︎Dos últimos comprobantes de pago correspondientes a su nómina.
        ▪︎Credencial de Afiliación del Instituto de Pensiones.³
        ▪︎Identificación Oficial.⁴
        ▪︎Comprobante de Domicilio.⁵
        
        ¹ Certificada por la institución donde labora. Si usted trabaja en la SEV o UV, no es necesario contar con dicha certificación.
        ² Actualizado y con los movimientos de los últimos 30 días. *No debe tener portabilidad de nómina.*
        ³ Debe estar vigente y firmada.
        ⁴ Credencial de elector, pasaporte o cartilla militar vigente.
        ⁵ Recibo de agua, luz o teléfono, con una vigencia no mayor a 3 meses.`;
//PERSONAL PENSIONADO CORTO PLAZO
const REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO = `📝 *Requisitos para Préstamo a Corto Plazo Domiciliado Pensionistas*
    
    ▪︎Para este tipo de trámite no requiere de aval.
    
    📑 *Documentos Originales*:
    ▪︎Solicitud de Préstamo Corto Plazo Domiciliado.
    
    📄 *Documentos en Copia*:
    ▪︎Credencial de Afiliación del Instituto de Pensiones.¹
    ▪︎Identificación Oficial.²
    
    ¹ Debe estar vigente y firmada.
    ² Credencial de elector, pasaporte o cartilla militar vigente.`;
// PERSONAL PENSIONADO MEDIANO PLAZO
const REQUISITOS_MEDIANO_PLAZO_PENSIONADO = `📝 *Requisitos para Préstamos a Mediano Plazo Domiciliado (Pensionados)*
            
        ▪︎Será necesario presentar de 1 a 3 avales que equiparen o superen sus ingresos, estos podrán ser pensionistas o trabajadores activos con una antigüedad mínima de 6 meses cotizados.
        
        📑 *Documentos Originales:*
        ▪︎Solicitud de Préstamo Mediano Plazo Domiciliado.
        ▪︎Formato de Domiciliación.³
        
        📄 *Documentos en Fotocopia:*
        ▪︎Credencial de Afiliación del Instituto de Pensiones.¹
        ▪︎Identificación Oficial.²
        ▪︎Dos últimos comprobantes de pago correspondientes a su nómina.³
        ▪︎Estado de Cuenta de Nómina con CLABE.³ ⁴
        ▪︎Comprobante de Domicilio.³ ⁵
        
        ¹ Debe estar vigente y firmada.
        ² Credencial de elector, pasaporte o cartilla militar vigente.
        ³ Sólo para avales en servicio activo.
        ⁴ Actualizado y con los movimientos de los últimos 30 días. *No debe tener portabilidad de nómina.*
        ⁵ Recibo de agua, luz o teléfono, con una vigencia no mayor a 3 meses.`;
module.exports = {
  PREGUNTAR_TIPO_PRESTAMO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_PENSIONADO,
  REQUISITOS_MEDIANO_PLAZO_ACTIVO,
  REQUISITOS_MEDIANO_PLAZO_PENSIONADO,
  REQUISITOS_CORTO_PLAZO_PERSONAL_ACTIVO,
};
