/**
 * PDF form filling utility for loan applications
 * @module llenadoSolicitud
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

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

module.exports = {
  llenarSolicitudPDFActivos,
  llenarSolicitudPDFPensionados,
};