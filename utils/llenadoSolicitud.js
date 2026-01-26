const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const archivosDir = path.join(__dirname, '../archivos');

async function llenarSolicitudPDFActivos(usuario, datosUsuario) {
    try {
        // Ruta al PDF original con los campos de formulario para activos
        const pdfTemplatePath = path.join(__dirname, '../formato_solicitud/pcpactivo.pdf');

        // Leer el PDF como bytes
        const existingPdfBytes = fs.readFileSync(pdfTemplatePath);

        // Cargar el PDF
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Obtener el formulario
        const form = pdfDoc.getForm();

        // Asignar los valores a los campos correspondientes

        form.getTextField('nombre').setText(datosUsuario.nombre);
        form.getTextField('afiliacion').setText(datosUsuario.numAfiliacion.toString());
        form.getTextField('domicilio').setText(datosUsuario.infoDomicilio.domicilio);
        form.getTextField('colonia').setText(datosUsuario.infoDomicilio.colonia);
        form.getTextField('codigopostal').setText(datosUsuario.infoDomicilio.cp);
        form.getTextField('municipio').setText(datosUsuario.infoDomicilio.municipio);
        form.getTextField('estado').setText(datosUsuario.infoDomicilio.estado);
        form.getTextField('correo').setText(datosUsuario.correo || '');
        form.getTextField('celular').setText(datosUsuario.telefono || '');

        form.getTextField('dependencia').setText(datosUsuario.infoLaboral.dependencia);
        form.getTextField('organismo').setText(datosUsuario.infoLaboral.organismo);
        form.getTextField('empleo').setText(datosUsuario.infoLaboral.empleo);

        // Aplanar el formulario
        form.flatten();

        // Serializar el PDF a bytes
        const pdfBytes = await pdfDoc.save();

        // Guardar el PDF
        const filePath = path.join(archivosDir, `solicitud_${datosUsuario.numAfiliacion}.pdf`);
        fs.writeFileSync(filePath, pdfBytes);

        // Enviar el PDF al usuario
        return {
            document: { url: filePath },
            mimetype: 'application/pdf',
            fileName: `solicitud_${datosUsuario.numAfiliacion}.pdf`,
            caption: 'Aquí está tu solicitud completada. Por favor, revísala y confirma si todo es correcto.'
        };

    } catch (error) {
        console.error('Error al generar el PDF:', error);

        return null;
    }
}

module.exports = {
    llenarSolicitudPDFActivos
};