/**
 * PDF form filling utility for loan applications
 * @module llenadoSolicitud
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { procesarCredencialSolicitudManual } = require('../services/imageProcessingService');

const archivosDir = path.join(__dirname, '../archivos');

/**
 * Fills PDF form for active employee loan application
 * @param {object} usuario - User information (phone, etc.)
 * @param {object} datosUsuario - User data to fill in the form
 * @returns {Promise<object|null>} PDF file object or null on error
 */
async function llenarSolicitudPDFActivos(usuario, datosUsuario) {
  try {
    // Path to the PDF template with form fields for active employees
    const pdfTemplatePath = path.join(__dirname, '../formato_solicitud/pcpactivo.pdf');

    // Read the PDF as bytes
    const existingPdfBytes = fs.readFileSync(pdfTemplatePath);

    // Load the PDF
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Get the form
    const form = pdfDoc.getForm();

    // Assign values to corresponding fields
    form.getTextField('nombre').setText(datosUsuario.nombre);
    form.getTextField('afiliacion').setText(datosUsuario.numAfiliacion.toString());
    form.getTextField('domicilio').setText(datosUsuario.infoDomicilio.calle);
    form.getTextField('colonia').setText(datosUsuario.infoDomicilio.colonia);
    form.getTextField('codigopostal').setText(datosUsuario.infoDomicilio.cp);
    form.getTextField('municipio').setText(datosUsuario.infoDomicilio.municipio);
    form.getTextField('estado').setText(datosUsuario.infoDomicilio.estado);
    form.getTextField('correo').setText(datosUsuario.correo || '');
    form.getTextField('celular').setText(datosUsuario.telefono || '');

    form.getTextField('dependencia').setText(datosUsuario.infoLaboral.dependencia);
    form.getTextField('organismo').setText(datosUsuario.infoLaboral.organismo);
    form.getTextField('empleo').setText(datosUsuario.infoLaboral.empleo);

    // Flatten the form
    form.flatten();

    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // Save the PDF
    const filePath = path.join(archivosDir, `solicitud_${datosUsuario.numAfiliacion}.pdf`);
    fs.writeFileSync(filePath, pdfBytes);

    // Return the PDF file object
    return {
      document: { url: filePath },
      mimetype: 'application/pdf',
      fileName: `solicitud_${datosUsuario.numAfiliacion}.pdf`,
      caption: 'Aquí está tu solicitud completada. Por favor, revísala y confirma si todo es correcto.',
    };
  } catch (error) {
    logger.error('Error al generar el PDF:', error);
    return null;
  }
}

/**
 * Fills PDF form for pensioner loan application
 * @param {object} usuario - User information (phone, etc.)
 * @param {object} datosUsuario - User data to fill in the form
 * @returns {Promise<object|null>} PDF file object or null on error
 */
async function llenarSolicitudPDFPensionados(usuario, datosUsuario) {
  try {
    // Path to the PDF template with form fields for pensioners
    const pdfTemplatePath = path.join(__dirname, '../formato_solicitud/pcppensionado.pdf');

    // Read the PDF as bytes
    const existingPdfBytes = fs.readFileSync(pdfTemplatePath);

    // Load the PDF
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Get the form
    const form = pdfDoc.getForm();

    // Assign values to corresponding fields
    form.getTextField('nombre').setText(datosUsuario.nombre);
    form.getTextField('pension').setText(datosUsuario.numAfiliacion.toString());
    form.getTextField('domicilio').setText(datosUsuario.infoDomicilio.calle);
    form.getTextField('colonia').setText(datosUsuario.infoDomicilio.colonia);
    form.getTextField('codigopostal').setText(datosUsuario.infoDomicilio.cp);
    form.getTextField('municipio').setText(datosUsuario.infoDomicilio.municipio);
    form.getTextField('estado').setText(datosUsuario.infoDomicilio.estado);
    form.getTextField('celular').setText(datosUsuario.celular || '');
    form.getTextField('correo').setText(datosUsuario.correo || '');


    // Flatten the form
    form.flatten();

    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // Save the PDF
    const filePath = path.join(archivosDir, `solicitud_${datosUsuario.numAfiliacion}.pdf`);
    fs.writeFileSync(filePath, pdfBytes);

    // Return the PDF file object
    return {
      document: { url: filePath },
      mimetype: 'application/pdf',
      fileName: `solicitud_${datosUsuario.numAfiliacion}.pdf`,
      caption: 'Aquí está tu solicitud completada. Por favor, revísala y confirma si todo es correcto.',
    };
  } catch (error) {
    logger.error('Error al generar el PDF:', error);
    return null;
  }
}

/**
 * Fills PDF form for pensioner loan application (Medium Term)
 * @param {object} usuario - User information (phone, etc.)
 * @param {object} datosUsuario - User data to fill in the form
 * @returns {Promise<object|null>} PDF file object or null on error
 */
async function llenarSolicitudPDFPensionadosMedianoPlazo(datosUsuario, avales) {
  try {
    logger.info('Generando PDF de Mediano Plazo para pensionado...');
    logger.info(`Datos del usuario: ${JSON.stringify(datosUsuario)}`);
    //obtener datos de cada uno de los avales llamar al servicio de procesamiento manual de credencial para cada uno de los avales y obtener su información completa
    const avalesInfo = [];
    for (const aval of avales) {
      logger.info(`Procesando aval con afiliación ${aval.afiliacion} y folio ${aval.folio}...`);
      const infoAval = await procesarCredencialSolicitudManual(aval.afiliacion, aval.folio);
      logger.info(`Información obtenida para aval ${aval.afiliacion}: ${JSON.stringify(infoAval)}`);
      avalesInfo.push(infoAval);
    }

    // Extraemos datos: información del solicitante, arreglo de avales, afiliación y folio

    // Ruta a la plantilla PDF que contiene los campos para solicitante y varios avales
    const pdfTemplatePath = path.join(__dirname, '../formato_solicitud/PMP2025.pdf');

    // Leer y cargar el PDF
    const existingPdfBytes = fs.readFileSync(pdfTemplatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    // =============== CAMPOS DEL SOLICITANTE ===============
    form.getTextField('NOMBRE_SOLICITANTE').setText(`${datosUsuario.nombre} ${datosUsuario.paterno} ${datosUsuario.materno}`);
    form.getTextField('AFILIACION_SOLICITANTE').setText(String(datosUsuario.numAfiliacion || ''));
    form.getTextField('DOMICILIO_SOLICITANTE').setText(datosUsuario.infoDomicilio?.calle || '');
    form.getTextField('COLONIA_SOLICITANTE').setText(datosUsuario.infoDomicilio?.colonia || '');
    form.getTextField('CP_SOLICITANTE').setText(datosUsuario.infoDomicilio?.cp || '');
    form.getTextField('MUNICIPIO_SOLICITANTE').setText(datosUsuario.infoDomicilio?.municipio || '');
    form.getTextField('ESTADO_SOLICITANTE').setText(datosUsuario.infoDomicilio?.estado || '');

    // Aquí se deben extraer los datos laborales de infoLaboral
    form.getTextField('DEPENDENCIA_SOLICITANTE').setText(datosUsuario.infoLaboral?.dependencia || '');
    form.getTextField('ORGANISMO_SOLICITANTE').setText(datosUsuario.infoLaboral?.organismo || '');
    form.getTextField('EMPLEO_SOLICITANTE').setText(datosUsuario.infoLaboral?.empleo || '');

    // =============== CAMPOS PARA AVALES ===============
    avalesInfo.forEach((aval, index) => {
      const idx = index + 1; // 1, 2, o 3
      const nombreAval = `${aval.nombre} ${aval.paterno} ${aval.materno}`.trim();

      form.getTextField(`NOMBRE_AVAL${idx}`).setText(nombreAval);
      form.getTextField(`AFILIACION_AVAL${idx}`).setText(String(aval.numAfiliacion || ''));
      form.getTextField(`DOMICILIO_AVAL${idx}`).setText(aval.infoDomicilio?.calle || '');
      form.getTextField(`COLONIA_AVAL${idx}`).setText(aval.infoDomicilio?.colonia || '');
      form.getTextField(`CP_AVAL${idx}`).setText(aval.infoDomicilio?.cp || '');
      form.getTextField(`MUNICIPIO_AVAL${idx}`).setText(aval.infoDomicilio?.municipio || '');
      form.getTextField(`ESTADO_AVAL${idx}`).setText(aval.infoDomicilio?.estado || '');
    });

    // Aplanar el formulario para que los campos no sean editables
    form.flatten();

    // Serializar el PDF a bytes
    const pdfBytes = await pdfDoc.save();
    // Generar un nombre único para el archivo PDF
    const fileName = `solicitud_mediano_plazo_${datosUsuario.numAfiliacion}_${Date.now()}.pdf`;
    const filePath = path.join(archivosDir, fileName);
    fs.writeFileSync(filePath, pdfBytes);

    // Leer el PDF generado en un buffer y enviarlo
    const pdfBuffer = fs.readFileSync(filePath);
    return {
      document: { url: filePath },
      mimetype: 'application/pdf',
      fileName: fileName,
      caption: 'Aquí está tu solicitud de Mediano Plazo completada. Por favor, revísala y confirma si todo es correcto.',
    };

    // Actualizar el estado del usuario a menú principal

  } catch (error) {
    console.error('Error al generar el PDF de Mediano Plazo:', error);
  }
}

async function llenarSolicitudPDFActivosMedianoPlazo(datosUsuario, avales) {
  try {
    logger.info('Generando PDF de Mediano Plazo para pensionado...');
    logger.info(`Datos del usuario: ${JSON.stringify(datosUsuario)}`);
    //obtener datos de cada uno de los avales llamar al servicio de procesamiento manual de credencial para cada uno de los avales y obtener su información completa
    const avalesInfo = [];
    for (const aval of avales) {
      logger.info(`Procesando aval con afiliación ${aval.afiliacion} y folio ${aval.folio}...`);
      const infoAval = await procesarCredencialSolicitudManual(aval.afiliacion, aval.folio);
      logger.info(`Información obtenida para aval ${aval.afiliacion}: ${JSON.stringify(infoAval)}`);
      avalesInfo.push(infoAval);
    }

    // Extraemos datos: información del solicitante, arreglo de avales, afiliación y folio

    // Ruta a la plantilla PDF que contiene los campos para solicitante y varios avales
    const pdfTemplatePath = path.join(__dirname, '../formato_solicitud/PMP2025.pdf');

    // Leer y cargar el PDF
    const existingPdfBytes = fs.readFileSync(pdfTemplatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    // =============== CAMPOS DEL SOLICITANTE ===============
    form.getTextField('NOMBRE_SOLICITANTE').setText(`${datosUsuario.nombre} ${datosUsuario.paterno} ${datosUsuario.materno}`);
    form.getTextField('AFILIACION_SOLICITANTE').setText(String(datosUsuario.numAfiliacion || ''));
    form.getTextField('DOMICILIO_SOLICITANTE').setText(datosUsuario.infoDomicilio?.calle || '');
    form.getTextField('COLONIA_SOLICITANTE').setText(datosUsuario.infoDomicilio?.colonia || '');
    form.getTextField('CP_SOLICITANTE').setText(datosUsuario.infoDomicilio?.cp || '');
    form.getTextField('MUNICIPIO_SOLICITANTE').setText(datosUsuario.infoDomicilio?.municipio || '');
    form.getTextField('ESTADO_SOLICITANTE').setText(datosUsuario.infoDomicilio?.estado || '');

    // Aquí se deben extraer los datos laborales de infoLaboral
    form.getTextField('DEPENDENCIA_SOLICITANTE').setText(datosUsuario.infoLaboral?.dependencia || '');
    form.getTextField('ORGANISMO_SOLICITANTE').setText(datosUsuario.infoLaboral?.organismo || '');
    form.getTextField('EMPLEO_SOLICITANTE').setText(datosUsuario.infoLaboral?.empleo || '');

    // =============== CAMPOS PARA AVALES ===============
    avalesInfo.forEach((aval, index) => {
      const idx = index + 1; // 1, 2, o 3
      const nombreAval = `${aval.nombre} ${aval.paterno} ${aval.materno}`.trim();

      form.getTextField(`NOMBRE_AVAL${idx}`).setText(nombreAval);
      form.getTextField(`AFILIACION_AVAL${idx}`).setText(String(aval.numAfiliacion || ''));
      form.getTextField(`DOMICILIO_AVAL${idx}`).setText(aval.infoDomicilio?.calle || '');
      form.getTextField(`COLONIA_AVAL${idx}`).setText(aval.infoDomicilio?.colonia || '');
      form.getTextField(`CP_AVAL${idx}`).setText(aval.infoDomicilio?.cp || '');
      form.getTextField(`MUNICIPIO_AVAL${idx}`).setText(aval.infoDomicilio?.municipio || '');
      form.getTextField(`ESTADO_AVAL${idx}`).setText(aval.infoDomicilio?.estado || '');
    });

    // Aplanar el formulario para que los campos no sean editables
    form.flatten();

    // Serializar el PDF a bytes
    const pdfBytes = await pdfDoc.save();
    // Generar un nombre único para el archivo PDF
    const fileName = `solicitud_mediano_plazo_${datosUsuario.numAfiliacion}_${Date.now()}.pdf`;
    const filePath = path.join(archivosDir, fileName);
    fs.writeFileSync(filePath, pdfBytes);

    // Leer el PDF generado en un buffer y enviarlo
    const pdfBuffer = fs.readFileSync(filePath);
    return {
      document: { url: filePath },
      mimetype: 'application/pdf',
      fileName: fileName,
      caption: 'Aquí está tu solicitud de Mediano Plazo completada. Por favor, revísala y confirma si todo es correcto.',
    };

    // Actualizar el estado del usuario a menú principal

  } catch (error) {
    console.error('Error al generar el PDF de Mediano Plazo:', error);
  }
}

async function llenarSolicitudPDFActivosConAval(datosSolicitante, datosAval) {
  try {

    logger.info('Generando PDF para activo con aval...');
    logger.info(`Datos del solicitante: ${JSON.stringify(datosSolicitante)}`);
    const datosAvalCompleto = await procesarCredencialSolicitudManual(datosAval.afiliacion, datosAval.folio);
    logger.info(`Información completa del aval obtenida: ${JSON.stringify(datosAvalCompleto)}`);
    // Ruta al PDF que ya contiene campos para solicitante y aval
    const pdfTemplatePath = path.join(__dirname, '../formato_solicitud/pcpactivo_con_aval.pdf');

    // Leer y cargar el PDF
    const existingPdfBytes = fs.readFileSync(pdfTemplatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    // =============== CAMPOS DEL SOLICITANTE ===============
    form.getTextField('nombre_solicitante').setText(datosSolicitante.nombre + ' ' + datosSolicitante.paterno + ' ' + datosSolicitante.materno);
    form.getTextField('afiliacion_solicitante').setText(String(datosSolicitante.numAfiliacion || ''));
    form.getTextField('domicilio_solicitante').setText(datosSolicitante.infoDomicilio?.calle || '');
    form.getTextField('colonia_solicitante').setText(datosSolicitante.infoDomicilio?.colonia || '');
    form.getTextField('cp_solicitante').setText(datosSolicitante.infoDomicilio?.cp || '');
    form.getTextField('municipio_solicitante').setText(datosSolicitante.infoDomicilio?.municipio || '');
    form.getTextField('estado_solicitante').setText(datosSolicitante.infoDomicilio?.estado || '');
    // Datos de contacto del solicitante
    // (Asegúrate de tener campos en el PDF para correo y celular del solicitante si lo deseas)
    form.getTextField('correo_solicitante').setText(datosSolicitante.correo || '');
    form.getTextField('celular_solicitante').setText(datosSolicitante.telefono || '');

    // Datos laborales del solicitante
    form.getTextField('dependencia_solicitante').setText(datosSolicitante.infoLaboral?.dependencia || '');
    form.getTextField('organismo_solicitante').setText(datosSolicitante.infoLaboral?.organismo || '');
    form.getTextField('empleo_solicitante').setText(datosSolicitante.infoLaboral?.empleo || '');

    // =============== CAMPOS DEL AVAL ===============
    const nombreCompletoAval = `${datosAvalCompleto.nombre} ${datosAvalCompleto.paterno} ${datosAvalCompleto.materno}`.trim();
    form.getTextField('nombre_aval').setText(nombreCompletoAval);
    form.getTextField('afiliacion_aval').setText(String(datosAvalCompleto.numAfiliacion || ''));

    // Domicilio del aval (infoDomicilio)
    form.getTextField('domicilio_aval').setText(datosAvalCompleto.infoDomicilio?.calle || '');
    form.getTextField('colonia_aval').setText(datosAvalCompleto.infoDomicilio?.colonia || '');
    form.getTextField('cp_aval').setText(datosAvalCompleto.infoDomicilio?.cp || '');
    form.getTextField('municipio_aval').setText(datosAvalCompleto.infoDomicilio?.municipio || '');
    form.getTextField('estado_aval').setText(datosAvalCompleto.infoDomicilio?.estado || '');

    // Datos de contacto del aval
    // form.getTextField('correo_aval').setText(datosAvalCompleto.correo || '');
    // form.getTextField('celular_aval').setText(datosAvalCompleto.telefono || '');

    // Si el aval también tiene datos laborales (depende de tu PDF):
    // form.getTextField('dependencia_aval').setText(datosAvalCompleto.infoLaboral?.dependencia || '');
    // form.getTextField('organismo_aval').setText(datosAvalCompleto.infoLaboral?.organismo || '');
    // form.getTextField('empleo_aval').setText(datosAvalCompleto.infoLaboral?.empleo || '');

    // =============== APLANAR Y GUARDAR ===============
    form.flatten();
    const pdfBytes = await pdfDoc.save();

    // Generar un nombre de archivo único
    const filePath = path.join(archivosDir, `solicitud_cplazo_conaval_${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfBytes);

    // Retornar el PDF generado
    return {
      document: { url: filePath },
      mimetype: 'application/pdf',
      fileName: `solicitud_cplazo_conaval_${Date.now()}.pdf`,
      caption: 'Aquí está tu solicitud con aval completada. Por favor, revísala y confirma si todo es correcto.',
    };

  } catch (error) {
    console.error('Error al generar el PDF con aval:', error);
    await sock.sendMessage(usuario.remitente, {
      text: 'Hubo un error al generar tu solicitud con aval. Inténtalo más tarde.'
    });
  }
}

module.exports = {
  llenarSolicitudPDFActivos,
  llenarSolicitudPDFPensionados,
  llenarSolicitudPDFPensionadosMedianoPlazo,
  llenarSolicitudPDFActivosMedianoPlazo,
  llenarSolicitudPDFActivosConAval
};