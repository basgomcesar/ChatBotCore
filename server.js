// index.js

// Importar módulos necesarios
const express = require('express');
const path = require('path');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, downloadMediaMessage, downloadContentFromMessage, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino   = require('pino');
const logger = pino({ level: 'warn' }); // only warnings and errors
const fs = require('fs'); // Importación de fs
const Tesseract = require('tesseract.js'); // Importar Tesseract.js para OCR
const { exec } = require('child_process'); // Importar para ejecutar el script de Python
const cors = require('cors'); // Importar cors
const multer = require('multer'); // Importar multer para manejar multipart/form-data
const db = require('./db');
const { PDFDocument } = require('pdf-lib'); // Importar pdf-lib para manipular PDFs
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const sharp = require('sharp');
const http = require('http');
const { Server } = require('socket.io');
const llamadasRecientes = new Set();

// ---------- Control de reconexión global ----------
let reconnecting = false;     // evita instancias paralelas
let retry = 0;                // back-off exponencial

function nextDelay () {
    // 1 s → 2 s → 4 s … máx 30 s
    return Math.min(30_000, 1_000 * 2 ** retry++);
}

function safeReinit (delayMs = 0) {
    if (reconnecting) return;     // ya hay un intento en curso
    reconnecting = true;
    setTimeout(() => {
        reconnecting = false;
        iniciarBot();             // crea NUEVA sesión
    }, delayMs);
}
// ---------------------------------------------------

// Global error handlers to log full stack traces
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason.stack || reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.stack || err);
});


const solicitudesPendientes = new Map();

async function guardarSolicitudPendiente(usuarioId, datosUsuario) {
    solicitudesPendientes.set(usuarioId, datosUsuario);
}

async function obtenerSolicitudPendiente(usuarioId) {
    return solicitudesPendientes.get(usuarioId);
}

async function eliminarSolicitudPendiente(usuarioId) {
    solicitudesPendientes.delete(usuarioId);
}

const upload = multer({
    limits: { fileSize: 10 * 1024 * 1024 }, // Limitar el tamaño del archivo a 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'application/pdf' || file.mimetype === 'image/png') {
            cb(null, true); // Aceptar el archivo
        } else {
            cb(new Error('Tipo de archivo no soportado'), false); // Rechazar el archivo
        }
    }
});

async function consultarBaseDatos(pension, folio) {
    try {
        const sqlPensionados = `
        SELECT *
        FROM Pensionados
        WHERE Pension = ? AND Folio = ?
      `;
        const rowsPension = await db.query(sqlPensionados, [pension, folio]);

        if (rowsPension.length > 0) {
            return rowsPension[0];
        } else {
            // opcionalmente buscar en Activos
            const sqlActivos = `
          SELECT *
          FROM Activos
          WHERE Afiliacion = ? AND Folio = ?
        `;
            const rowsActivos = await db.query(sqlActivos, [pension, folio]);

            if (rowsActivos.length > 0) {
                return rowsActivos[0];
            } else {
                return null;
            }
        }
    } catch (error) {
        console.error('Error al consultar la base de datos:', error);
        return null;
    }
}


async function guardarUsuario(usuario) {
    try {
        const { nombre, telefono, tipo } = usuario;
        if (!telefono) return null;

        // Ajusta “usuarios” según tu nombre de tabla. 
        // Asegúrate de que “telefono” sea UNIQUE o PK en la tabla `usuarios`.
        const mergeQuery = `
        MERGE usuarios AS target
        USING (SELECT ? AS nombre, ? AS telefono, ? AS tipo) AS source
        ON (target.telefono = source.telefono)
        WHEN MATCHED THEN
          UPDATE SET
            nombre = source.nombre,
            tipo = source.tipo,
            ultima_interaccion = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (nombre, telefono, tipo, ultima_interaccion)
          VALUES (source.nombre, source.telefono, source.tipo, GETDATE())
        OUTPUT inserted.id AS insertedId;
      `;

        const rows = await db.query(mergeQuery, [nombre, telefono, tipo]);

        if (rows.length > 0) {
            const userId = rows[0].insertedId;
            if (process.env.VERBOSE_LOG === '1') {
                console.log('Usuario guardado o actualizado. ID:', userId);
            }
            return userId;
        }

        return null;
    } catch (error) {
        console.error('Error al guardar el usuario:', error);
        return null;
    }
}



// Nueva función para consultar datos del usuario en la API
async function consultarDatosUsuarioAPI(numAfiliacion, tipoDerechohabiente, folio) {
    try {
        const payload = {
            numAfiliacion: numAfiliacion,
            tipoDerechohabiente: tipoDerechohabiente,
            folio: folio
        };

        console.log('Enviando solicitud a la API con:', payload);

        const response = await axios.post('http://ipeenlinea.ipever.gob.mx/WSIPEEnLinea/api/v2/prestamos/login', payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.success) {
            console.log('Datos obtenidos de la API:', response.data.data);
            return response.data.data; // Asegúrate de retornar toda la data necesaria
        } else {
            console.error('Error en la respuesta de la API:', response.data.message);
            return null;
        }
    } catch (error) {
        console.error('Error al consultar datos de usuario en la API:', error);
        return null;
    }
}

async function llamarAPISimulacion(usuario) {
    try {
        // Obtener el sueldo original del usuario
        let sueldoOriginal = usuario.datosUsuario.sueldo;

        // ──────────────────────────────────────────────────────────────
        // Validación de adeudos: si existe adeudo, cancelar simulación
        // ──────────────────────────────────────────────────────────────
        const adeudosPendientes = usuario.datosUsuario.adeudos || 0;
        if (adeudosPendientes > 0) {
            const nombreSaludo = usuario.datosUsuario.nombre || usuario.nombre || '';
            await sock.sendMessage(usuario.remitente, {
                text: `Lo sentimos ${nombreSaludo}, pero presenta una situación de adeudo.\n\nPara más información, comuníquese con la Oficina de Contabilidad y Adeudo al 📞 228 141 0500 ext. 1108, 1109 y 1110.`
            });
            return; // se cancela la simulación
        }

        let sueldo;

        // ──────────────────────────────────────────────────────────────
        // Validación: préstamo activo con menos del 50 % pagado
        // (aplica a activos y pensionados)
        // ──────────────────────────────────────────────────────────────
        {
            const prestamo = usuario.datosUsuario.prestamoActivo;
            if (prestamo && prestamo.plazo && prestamo.periodosPagados !== null) {
                const porcentajePagado = prestamo.periodosPagados / prestamo.plazo;
                if (porcentajePagado < 0.5) {
                    await sock.sendMessage(usuario.remitente, {
                        text: `⚠️ Aún no has cubierto el 50 % del plazo de tu préstamo actual (has pagado ${prestamo.periodosPagados} de ${prestamo.plazo}).\n\nNo es posible tramitar una renovación en este momento. Para mayor información, comunícate con un asesor.`
                    });
                    return; // se cancela la simulación
                }
            }
        }

        if (usuario.datosUsuario.tipoDerechohabiente === 'A') {
            // Para Activos, aplicar la lógica de sueldoCalculado
            const totalPagosNomina = usuario.datosEstadoCuenta ? usuario.datosEstadoCuenta.total_nomina : 0;
            if (totalPagosNomina === 0) {
                await sock.sendMessage(usuario.remitente, {
                    text: '⚠️ No encontré depósitos de nómina en tu estado de cuenta. Por favor, comunícate con nuestros asesores para que te puedan apoyar.'
                });
                return;
            }
            const totalDescuentosDomiciliados = usuario.datosEstadoCuenta ? usuario.datosEstadoCuenta.total_domiciliado : 0;

            let sueldoCalculado = totalPagosNomina - totalDescuentosDomiciliados;

            // Asegurarse de que sueldoCalculado no sea negativo
            if (sueldoCalculado < 0) {
                sueldoCalculado = 0;
            }

            // Aplicar la lógica para ajustar el sueldo
            if (sueldoCalculado < sueldoOriginal) {
                sueldo = sueldoCalculado;
            } else {
                sueldo = sueldoOriginal;
            }
        } else {
            // Para Pensionados, usar el sueldo original
            sueldo = sueldoOriginal;
        }

        // Preparar los datos para la API de simulación
        const payloadSimulacion = {
            tipoDerechohabiente: usuario.datosUsuario.tipoDerechohabiente, // 'A' o 'P'
            numAfiliacion: usuario.datosUsuario.numAfiliacion,
            saldo: usuario.datosUsuario.saldo || 0,
            sueldo: sueldo,
            fechaAjustada: usuario.datosUsuario.fechaAjustada,
            totalPagosNomina: 0, // Para pensionados, estos valores pueden ser 0
            totalDescuentosDomiciliados: 0
        };

        console.log('Enviando solicitud a la API de simulación con:', payloadSimulacion);

        // Llamar a la API de simulación
        const response = await axios.post('http://ipeenlinea.ipever.gob.mx/WSIPEEnLinea/api/v2/prestamos/simular-prestamo', payloadSimulacion, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        let resultadoSimulacion = null;
        if (response.data && response.data.success) {
            console.log('Datos obtenidos de la API de simulación:', response.data.data);
            resultadoSimulacion = response.data.data;
        }

        // Bloque para guardar la simulación en solicitudes_simulacion
        try {
            const usuarioId = await manejarLogicaUsuario(usuario, 'simulacion');
            console.log('usuarioId obtenido:', usuarioId);
            console.log('Guardando simulación en solicitudes_simulacion para:', usuario.telefono, usuario.folio);
            await db.query(
              'INSERT INTO solicitudes_simulacion (nombre, telefono, afiliacion, folio, ultima_interaccion, usuario_id) VALUES (?, ?, ?, ?, GETDATE(), ?)',
              [usuario.nombre || '', usuario.telefono, usuario.afiliacion || usuario.pension, usuario.folio, usuarioId]
            );
        } catch (err) {
            console.error('❌ Error al guardar simulación en solicitudes_simulacion desde llamarAPISimulacion:', err);
        }

        if (response.data && response.data.success) {
            // Enviar los resultados al usuario
            await enviarResultadosSimulacion(usuario, response.data.data);
        } else {
            console.error('Error en la respuesta de la API de simulación:', response.data.message);
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ Error al obtener la simulación: ${response.data.message}`
            });
        }
    } catch (error) {
        console.error('Error al llamar a la API de simulación:', error);
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ Hubo un error al procesar tu simulación. Por favor, inténtalo más tarde.'
        });
    }
}


// ---------------------------------------------------
// Descarga adjuntos con hasta 2 intentos.
// Si falla, devuelve null para que el caller lo trate.
async function downloadWithRetry(msg, maxRetries = 1) {
    let attempt = 0;
    while (attempt <= maxRetries) {
        try {
            return await downloadMediaMessage(
                msg,
                'buffer',
                { auth: sock.authState, logger: sock.logger }
            );
        } catch (err) {
            const status = err?.response?.status;
            const retriable = status === 403 || status === 410;
            console.error(`downloadWithRetry intento #${attempt + 1} → ${status || err.code}`);

            if (retriable && attempt < maxRetries) {
                console.warn('Media URL caducada, reintentando...');
                attempt++;
                await new Promise(r => setTimeout(r, 500)); // breve pausa
            } else {
                console.error('downloadWithRetry falló tras reintentos:', err.stack || err);
                return null;      // ← NO lanzamos excepción
            }
        }
    }
    return null; // por seguridad
}
// ---------------------------------------------------


async function enviarResultadosSimulacion(usuario, datosSimulacion) {
    try {
        // 1. Revisar si tiene un préstamo activo con plazo 24, 30 o 36
        const prestamoActivo = usuario.datosUsuario?.prestamoActivo || null;
        if (prestamoActivo && [24, 30, 36].includes(prestamoActivo.plazo)) {
            // Filtrar los plazos 6 y 12 para no mostrarlos
            console.log(`El usuario tiene un préstamo activo de ${prestamoActivo.plazo} meses. Excluyendo plazos de 6 y 12 meses de la simulación...`);
            datosSimulacion = datosSimulacion.filter(sim => sim.plazo !== 6 && sim.plazo !== 12);

            // Mensaje opcional para avisar al usuario
            if (datosSimulacion.length < 5) {
                await sock.sendMessage(usuario.remitente, {
                    text: 'Dado que tu préstamo activo es a 24, 30 o 36 meses, no se muestran opciones de 6 o 12 meses en la simulación.'
                });
            }
        }

        // 2. Generar el PDF con los resultados de la simulación (ya filtrados, si aplica)
        const pdfFilePath = await generarPDFSimulacion(usuario, datosSimulacion);

        // 3. Enviar el PDF al usuario, junto con un mensaje cálido
        await sock.sendMessage(usuario.remitente, {
            document: { url: pdfFilePath },
            mimetype: 'application/pdf',
            fileName: 'simulacion_prestamo.pdf',
            caption: `💰 Aquí tienes tu simulación de préstamo, ${usuario.nombre}\n\nRevisa el documento adjunto para consultar los detalles de tu simulación en diferentes plazos.`
        });

        // 4. Enviar mensaje adicional de contacto/menú
        await sock.sendMessage(usuario.remitente, {
            text: `👨‍💼 Si tienes alguna duda, puedes comunicarte con un asesor.\n📋 O escribe *menú* para volver al menú principal y elegir otra opción.`
        });

        // 5. Regresar al menú principal
        usuario.estadoConversacion = 'menuPrincipal';

    } catch (error) {
        console.error('Error en enviarResultadosSimulacion:', error);
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ Hubo un error al generar y enviar tu simulación. Por favor, inténtalo más tarde.'
        });
    }
}

async function generarPDFSimulacion(usuario, datosSimulacion) {
    try {
        // Leer el PDF de la plantilla existente
        const existingPdfBytes = fs.readFileSync('simulacion_prestamo.pdf');
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();

        // Función para formatear moneda
        function formatCurrency(value) {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'MXN',          // O la moneda que necesites
                currencyDisplay: 'narrowSymbol',
                minimumFractionDigits: 2
            }).format(value);
        }

        // Datos del usuario
        const datosApi = usuario.datosUsuario || {};
        const nombreCompleto = `${datosApi.nombre || ''} ${datosApi.paterno || ''} ${datosApi.materno || ''}`.trim();
        form.getTextField('nombre').setText(nombreCompleto);

        // Rellenar los plazos, importes y descuento
        let descuentoValor = null;
        datosSimulacion.forEach((sim) => {
            const plazo = sim.plazo;   // p. ej. 6, 12, 24
            const importeCheque = formatCurrency(sim.importeCheque);
            const importeLiquido = formatCurrency(sim.importeLiquido);
            const descuento = sim.descuento ? formatCurrency(sim.descuento) : '';

            form.getTextField(`${plazo}Importe`).setText(importeCheque);
            form.getTextField(`${plazo}Liquido`).setText(importeLiquido);
            form.getTextField(`${plazo}Descuento`).setText(descuento);
        });
        // Aplanar
        form.flatten();

        // Guardar en disco
        const pdfBytes = await pdfDoc.save();
        const fileName = `simulacion_prestamo_${usuario.afiliacion || usuario.pension}_${Date.now()}.pdf`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, pdfBytes);

        return filePath;
    } catch (error) {
        console.error('Error al generar el PDF de simulación:', error);
        throw error;
    }
}

function obtenerNumeroCelular(remitente) {
    const numeroWhatsApp = remitente.split('@')[0];

    const codigoPais = numeroWhatsApp.substring(0, 2);
    let numero = numeroWhatsApp.substring(2);

    if (codigoPais === '52' && numero.startsWith('1')) {
        numero = numero.substring(1);
    }

    return numero;
}

// ====== LOG a TXT por número y día ======
function appendLogByPhone(telefono, direccion, texto, extra = {}) {
  try {
    if (!telefono || !texto) return;
    const date = new Date();
    const day = date.toISOString().slice(0, 10);
    const phoneFolder = path.join(logsDir, String(telefono).replace(/[^0-9]/g, ''));
    fs.mkdirSync(phoneFolder, { recursive: true });

    let line = `[${date.toLocaleString('es-MX')}] ${direccion === 'in' ? '<-' : '->'} ${texto}`;
    if (extra && (extra.fileUrl || extra.mime)) {
      line += `  [file: ${extra.fileUrl || 'n/a'} | mime: ${extra.mime || 'n/a'}]`;
    }
    line += '\n';

    fs.appendFile(path.join(phoneFolder, `${day}.txt`), line, (err) => {
      if (err) console.error('appendLogByPhone error:', err);
    });
  } catch (e) {
    console.error('appendLogByPhone exception:', e);
  }
}

async function guardarInteraccion(usuarioId, mensaje, tipoMensaje) {
    try {
        if (!usuarioId) {
            console.error('Error: No se puede guardar la interacción sin un usuario ID válido.');
            return;
        }

        // Evitar fallos si el mensaje es null o no es string
        if (!mensaje || typeof mensaje !== 'string') {
            if (process.env.VERBOSE_LOG === '1') {
                console.log('Mensaje vacío o no válido; no se guardará la interacción.');
            }
            return;
        }

        // Definir mensajes que consideras importantes
        const interaccionesImportantes = ['asesor', 'simulacion', 'requisitos', 'simulación', 'atendido'];
        const mensajeImportante = interaccionesImportantes.some(inter => mensaje.toLowerCase().includes(inter));

        if (!mensajeImportante) {
            if (process.env.VERBOSE_LOG === '1') {
                console.log('El mensaje no es considerado importante, no se guardará la interacción.');
            }
            return;
        }

        const sql = `
        INSERT INTO interacciones (usuario_id, mensaje, tipo_mensaje)
        VALUES (?, ?, ?)
      `;
        await db.query(sql, [usuarioId, mensaje, tipoMensaje]);
        if (process.env.VERBOSE_LOG === '1') {
            console.log('Interacción importante guardada con éxito para el usuario ID:', usuarioId);
        }
    } catch (error) {
        console.error('Error al guardar la interacción:', error);
    }
}

// ----- Guardar cada mensaje (in/out), notificar dashboard y log a TXT -----
async function guardarMensaje(usuarioId, texto, direccion = 'in', extra = {}) {
    try {
        if (!usuarioId || !texto) return;

        // 1) Registrar en tabla `mensajes`
        await db.query(
            `INSERT INTO mensajes (usuario_id, texto, direccion, file_url, mime)
   VALUES (?, ?, ?, ?, ?)`,
            [usuarioId, texto, direccion, extra.fileUrl || null, extra.mime || null]
        );

        // 2) Emitir al dashboard en la sala del propio usuario
        if (io) {
            io.to(String(usuarioId)).emit('chatUpdate', {
                usuarioId,
                texto,
                direccion,
                fecha: new Date(),
                ...extra
            });

            // 2‑bis) Además, si existe una solicitud_asesor pendiente,
            //       emite también en esa sala (ej. 1017) para que el panel
            //       se suscriba con el id de la solicitud.
            const [row] = await db.query(
                `SELECT TOP 1 id
                   FROM solicitudes_asesor
                  WHERE usuario_id = ? AND atendido = 0
                  ORDER BY id DESC`,
                [usuarioId]
            );

            if (row && row.id) {
                io.to(String(row.id)).emit('chatUpdate', {
                    usuarioId: row.id,
                    texto,
                    direccion,
                    fecha: new Date(),
                    ...extra
                });
            }
        }

        // 3) Log a TXT por número (in/out)
        try {
            // Prioriza extra.telefono o extra.remitente; si no, consulta la base
            let telefono = extra.telefono || null;
            if (!telefono && extra.remitente) {
                telefono = obtenerNumeroCelular(extra.remitente);
            }
            if (!telefono) {
                const [rowTel] = await db.query('SELECT telefono FROM usuarios WHERE id = ?', [usuarioId]);
                if (rowTel && rowTel.telefono) telefono = rowTel.telefono;
            }
            if (telefono) {
                appendLogByPhone(telefono, direccion, texto, extra);
            }
        } catch (e) {
            console.error('guardarMensaje/appendLogByPhone:', e);
        }
    } catch (err) {
        console.error('guardarMensaje:', err);
    }
}


async function guardarSolicitudAsesor(usuarioId, nombre, telefono) {
    try {
        const sqlInsert = `
        INSERT INTO solicitudes_asesor (usuario_id, nombre, telefono)
        VALUES (?, ?, ?)
      `;
        await db.query(sqlInsert, [usuarioId, nombre, telefono]);
        console.log('Solicitud de asesor guardada con éxito para el usuario ID:', usuarioId);
    } catch (error) {
        console.error('Error al guardar la solicitud de asesor:', error);
    }
}


async function guardarSolicitudSimulacion(usuarioId, nombre, telefono, afiliacion, folio) {
    try {
        const sql = `
        INSERT INTO solicitudes_simulacion (usuario_id, nombre, telefono, afiliacion, folio)
        VALUES (?, ?, ?, ?, ?)
      `;
        await db.query(sql, [usuarioId, nombre, telefono, afiliacion, folio]);
        console.log('Solicitud de simulación guardada con éxito para el usuario ID:', usuarioId);
    } catch (error) {
        console.error('Error al guardar la solicitud de simulación:', error);
    }
}


// Función para manejar la lógica de usuario
async function manejarLogicaUsuario(usuario, mensaje) {
    try {
        const usuarioId = await guardarUsuario(usuario);
        if (!usuarioId) {
            console.error('Error: No se pudo guardar el usuario.');
            return null;
        }

        // Guardamos la interacción recibida
        await guardarInteraccion(usuarioId, mensaje, 'recibido');
        return usuarioId;
    } catch (error) {
        console.error('Error en manejarLogicaUsuario:', error);
        return null;
    }
}


const app = express();
const port = 5001;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`; // ← NUEVO// Cambiado de 3000 a 5001
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
// ========= Canal en vivo para el dashboard =========
io.on('connection', (socket) => {
    console.log('[socket.io] dashboard conectado');

    // El panel se suscribe a la conversación de un usuario
    socket.on('join', (usuarioId) => {
        if (usuarioId) {
            socket.join(String(usuarioId));
            console.log(`[socket.io] Cliente unido a sala ${usuarioId}`);
        }
    });

    // Mensaje que el asesor manda desde el dashboard
    socket.on('advisorMessage', async ({ usuarioId, texto }) => {
        console.log('[advisorMessage] payload:', { usuarioId, texto });
        try {
            if (!usuarioId || !texto) return;

            // ❶ Intento principal: buscar por PK en usuarios
            let [row] = await db.query(
                'SELECT telefono FROM usuarios WHERE id = ?',
                [usuarioId]
            );

            // ❷ Fallback: el ID podría ser la PK de solicitudes_asesor
            if (!row) {
                const [alt] = await db.query(
                    `SELECT u.telefono
             FROM usuarios u
             JOIN solicitudes_asesor s ON s.usuario_id = u.id
            WHERE s.id = ?`,
                    [usuarioId]
                );
                row = alt;
            }

            // ❸ Fallback extra: puede provenir de solicitudes_simulacion
            if (!row) {
                const [alt2] = await db.query(
                    `SELECT u.telefono
             FROM usuarios u
             JOIN solicitudes_simulacion ss ON ss.usuario_id = u.id
            WHERE ss.id = ?`,
                    [usuarioId]
                );
                row = alt2;
            }

            // Si aún no encontramos teléfono, devolvemos error al panel
            if (!row) {
                console.warn('[advisorMessage] No se encontró teléfono para usuarioId:', usuarioId);
                socket.emit('advisorError', { usuarioId, msg: 'Usuario sin teléfono registrado.' });
                return;
            }

            // Normalizar teléfono a 10 dígitos y anteponer 521
            let digits = (row.telefono || '').replace(/[^0-9]/g, '');

            // Eliminar prefijos +52, 52 o 521 y posible 1 intranúmero
            if (digits.startsWith('52')) digits = digits.slice(2);
            if (digits.startsWith('1')) digits = digits.slice(1);

            if (digits.length !== 10) {
                console.warn('[advisorMessage] Teléfono con longitud inesperada:', digits);
                socket.emit('advisorError', { usuarioId, msg: 'Número inválido en la base de datos.' });
                return;
            }

            const jid = `521${digits}@s.whatsapp.net`;
            console.log('[advisorMessage] destinatario JID:', jid);

            // Enviar a WhatsApp
            try {
                await sock.sendMessage(jid, { text: texto });
            } catch (werr) {
                console.error('[WhatsApp error]', werr);
                socket.emit('advisorError', { usuarioId, msg: 'No se pudo enviar mensaje a WhatsApp.' });
                return;
            }

            // Registrar como mensaje saliente
            await guardarMensaje(usuarioId, texto, 'out', { telefono: digits, remitente: jid });
        } catch (err) {
            console.error('advisorMessage:', err);
        }
    });
});

// Usar CORS antes de definir las rutas
app.use(cors());

// Manejar datos JSON o URL-encoded en las solicitudes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mediaDir = path.join(__dirname, 'public', 'media');
fs.mkdirSync(mediaDir, { recursive: true });
app.use('/media', express.static(mediaDir));
// Crear carpeta de almacenamiento si no existe
const archivosDir = path.join(__dirname, 'archivos');
if (!fs.existsSync(archivosDir)) {
    fs.mkdirSync(archivosDir);
}
// Carpeta de logs por número (TXT por día)
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Almacenamiento de usuarios y solicitudes
const usuarios = {}; // Clave: remitente, Valor: instancia de Usuario
let solicitandoAsesor = [];
let solicitandoSimulacion = []; // Lista para solicitudes de simulación
let solicitandoEncuestas = []; // Lista para enviar encuestas
// ----- Historial completo para el dashboard -----
app.get('/api/conversaciones/:usuarioId', async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT texto,
          direccion,
          fecha,
          file_url AS fileUrl,
          mime
     FROM mensajes
    WHERE usuario_id = ?
 ORDER BY id`,
            [req.params.usuarioId]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET /api/conversaciones:', err);
        res.status(500).json({ error: 'db error' });
    }
});

// Clase para manejar el estado del usuario
class Usuario {
    constructor(remitente) {
        this.remitente = remitente;
        this.nombre = null;
        this.tipo = null; // Activo o Pensionado
        this.telefono = null; // Número de celular extraído
        this.estadoConversacion = 'inicio'; // Estado inicial
        this.conversacionSuspendida = false;
        this.afiliacion = null;
        this.folio = null;
        this.banco = null;
        this.ultimaInteraccion = new Date();
    }
}


// Función para obtener el saludo dependiendo de la hora del día
function obtenerSaludo() {
    const horaActual = new Date().getHours();
    if (horaActual >= 5 && horaActual < 12) {
        return 'Buenos días ☀️';
    } else if (horaActual >= 12 && horaActual < 18) {
        return 'Buenas tardes 🌤️';
    } else {
        return 'Buenas noches 🌙';
    }
}

// Función para normalizar el texto (eliminar acentos y convertir a minúsculas)
function normalizarTexto(texto) {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

/**
 * Extrae afiliación/pensión y folio a partir de un mensaje en texto libre.
 * Esperamos algo como "12345 678901" o "afiliacion: 12345 folio 678901".
 * Devuelve un objeto { identificador, folio } con `null` si no encuentra ambas piezas.
 */
function extraerAfiliacionFolio(texto) {
    if (!texto) return { identificador: null, folio: null };

    const limpio = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Buscar afiliación después de palabras similares a "afiliacion"
    const afiliacionMatch = limpio.match(/afiliacion[^\d]{0,15}(\d{5,10})/);
    let identificador = afiliacionMatch ? afiliacionMatch[1] : null;

    // Buscar folio después de la palabra "folio"
    const folioMatch = limpio.match(/folio[^\d]{0,15}(\d{5,10})/);
    let folio = folioMatch ? folioMatch[1] : null;

    // fallback final si no se detectaron explícitamente
    if (!identificador || !folio) {
        const numeros = texto.match(/\b\d{5,10}\b/g) || [];
        if (!identificador) identificador = numeros[0] || null;
        if (!folio) folio = numeros[1] || null;
    }

    return { identificador, folio };
}

async function realizarOCRMúltiplesRotaciones(filePath) {
    // Preprocesar la imagen para mejorar OCR
    const preprocessedPath = await preprocessImage(filePath);
    // Leer el archivo original con sharp
    const originalBuffer = fs.readFileSync(preprocessedPath);

    // Asegurar un tamaño mínimo para OCR: si el ancho es menor a 500px, escalar a 1000px de ancho
    const metadata = await sharp(originalBuffer).metadata();
    let bufferToOCR = originalBuffer;
    if (metadata.width < 500) {
        bufferToOCR = await sharp(originalBuffer)
            .resize({ width: 1000 })
            .toBuffer();
    }

    const rotations = [0, 90, 180, 270];
    let bestText = '';
    let bestConfidence = 0;

    for (const angle of rotations) {
        // Rotar la imagen con sharp
        const rotatedBuffer = await sharp(bufferToOCR)
            .rotate(angle)
            .resize({ width: 1000, height: 1000, fit: 'inside' }) // forzar un mínimo de anchura/altura
            .toBuffer();

        // Ejecutar OCR con Tesseract
        const { data } = await Tesseract.recognize(rotatedBuffer, 'spa', {
            tessedit_pageseg_mode: 6,
        });

        const currentText = data.text.trim();
        const currentConfidence = data.confidence; // valor numérico que Tesseract retorna

        console.log(`Rotación ${angle}° → Longitud texto: ${currentText.length}, Confianza: ${currentConfidence}`);

        // Criterio: si esta rotación produce más caracteres legibles o mayor confianza, es “mejor”
        if (currentText.length > bestText.length && currentConfidence >= bestConfidence) {
            bestText = currentText;
            bestConfidence = currentConfidence;
        }
    }

    // Devolver el mejor texto obtenido
    return bestText;
}
// ===== Handler: afiliación + folio manual (solicitante) =====
async function manejarEstadoEsperandoAfiliacionFolioManual(usuario, mensajeNormalizado) {
    const { identificador, folio } = extraerAfiliacionFolio(mensajeNormalizado);
    if (!identificador || !folio) {
        const mensajeFormatoInvalido = `⚠️ El formato de los datos no es válido.

📌 Recuerda: debes escribir primero el número de afiliación, luego un espacio y después el folio. 
Ejemplo correcto: \`12345 678901\`

Si el problema persiste, escribe \`cancelar\` y luego \`menú\` para solicitar hablar con un asesor.`;

        await sock.sendMessage(usuario.remitente, { text: mensajeFormatoInvalido });
        return;
    }

    // Guardar en objeto usuario
    if (usuario.tipo === 'activo') usuario.afiliacion = identificador;
    else usuario.pension = identificador;
    usuario.folio = parseInt(folio, 10);

    // Verificar con la API
    const datosAPI = await consultarDatosUsuarioAPI(
        parseInt(identificador, 10),
        usuario.tipo === 'activo' ? 'A' : 'P',
        parseInt(folio, 10)
    );

    if (!datosAPI) {
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ No se encontró un registro con esos datos. Verifica e intenta nuevamente.'
        });
        return;
    }

    usuario.datosUsuario = datosAPI;
    await sock.sendMessage(usuario.remitente, { text: '✅ Datos verificados correctamente.' });

    // ─── Retomar flujo según el punto en el que quedó ───
    if (usuario.estadoPrevio?.includes('Simulacion')) {
        // Veníamos de una simulación
        await llamarAPISimulacion(usuario);

    } else if (
        usuario.estadoPrevio === 'esperandoCredencialSolicitud' ||
        usuario.estadoPrevio === 'solicitandoCredencial'
    ) {
        // Veníamos del llenado de solicitud corto plazo
        if (usuario.tipo === 'activo') {
            // Activo → pedir banco y estado de cuenta
            usuario.estadoConversacion = 'solicitandoBanco';
            await sock.sendMessage(usuario.remitente, {
                text:
                    'Por favor, indícame en qué banco recibes tu nómina:\n' +
                    '1️⃣ Santander\n' +
                    '2️⃣ BBVA\n' +
                    '3️⃣ CitiBanamex\n' +
                    '4️⃣ Banorte\n' +
                    '5️⃣ Scotiabank\n' +
                    '6️⃣ HSBC\n' +
                    'Responde con el número correspondiente.'
            });
            return;
        } else {
            // Pensionado → llamar simulación directo
            await llamarAPISimulacion(usuario);
        }

    } else if (usuario.estadoPrevio === 'esperandoCredencialSolicitudMedianoPlazo') {
        await manejarLlenadoSolicitudMedianoPlazoConDatos?.(usuario, datosAPI);
        return; // No cambiar a menú; el handler interno ya fijó el nuevo estado
    }

    usuario.estadoConversacion = 'menuPrincipal';
}

/**
 * Continúa el flujo de llenado de Mediano Plazo cuando los datos del solicitante
 * se capturan manualmente (afiliación y folio escritos por el usuario).
 * Su única responsabilidad es preguntar por el número de avales y
 * establecer el nuevo estado de la conversación.
 */
async function manejarLlenadoSolicitudMedianoPlazoConDatos(usuario, datosAPI) {
    try {
        // Guardar los datos validados en la sesión del usuario
        usuario.datosUsuario = datosAPI;

        // Solicitar al usuario el número de avales que registrará
        await sock.sendMessage(usuario.remitente, {
            text:
                '🔢 ¿Cuántos avales deseas registrar?\n' +
                '1️⃣ *Uno*\n' +
                '2️⃣ *Dos*\n' +
                '3️⃣ *Tres*\n\n' +
                'Por favor, responde con el número correspondiente (1‑3).'
        });

        // Cambiar el estado para que el siguiente mensaje sea capturado por el handler correspondiente
        usuario.estadoConversacion = 'esperandoNumeroAvalesMedianoPlazo';
    } catch (err) {
        console.error('manejarLlenadoSolicitudMedianoPlazoConDatos:', err);
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ Hubo un error al continuar con tu solicitud. Inténtalo nuevamente o contacta a un asesor.'
        });
    }
}
// ===== Handler: afiliación + folio manual (aval) =====
async function manejarEstadoEsperandoAfiliacionFolioManualAval(usuario, mensajeNormalizado) {
    const { identificador, folio } = extraerAfiliacionFolio(mensajeNormalizado);
    if (!identificador || !folio) {
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ No detecté dos números válidos. Envía algo como:\n12345 678901'
        });
        return;
    }

    const idx = usuario.pendingAvalIndex || 1;

    // Validar aval como ACTIVO
    const datosAvalAPI = await consultarDatosUsuarioAPI(
        parseInt(identificador, 10),
        'A',
        parseInt(folio, 10)
    );

    if (!datosAvalAPI) {
        await sock.sendMessage(usuario.remitente, {
            text: `⚠️ No se encontró un registro con esos datos para el aval #${idx}. Verifica la información.`
        });
        return;
    }

    if (!usuario.datosAvales) usuario.datosAvales = [];
    usuario.datosAvales[idx - 1] = datosAvalAPI;

    // Continuar con el flujo de avales
    if (idx < usuario.numeroAvales) {
        const siguiente = idx + 1;
        await sock.sendMessage(usuario.remitente, {
            text: `Ahora, por favor envíame la credencial IPE del aval #${siguiente}.`
        });
        usuario.estadoConversacion = `esperandoCredencialAvalMedianoPlazo${siguiente}`;
    } else {
        await manejarLlenadoSolicitudMedianoPlazo(usuario);
    }
}

// ===== Handler: afiliación + folio manual para LLENADO de SOLICITUD (no simulación) =====
async function manejarEstadoEsperandoAfiliacionFolioManualSolicitud(usuario, mensajeNormalizado) {
    const { identificador, folio } = extraerAfiliacionFolio(mensajeNormalizado);
    if (!identificador || !folio) {
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ No detecté dos números válidos. Envía algo como:\n12345 678901'
        });
        return;
    }

    // Guardar en objeto usuario
    if (usuario.tipo === 'activo') usuario.afiliacion = identificador;
    else usuario.pension = identificador;
    usuario.folio = parseInt(folio, 10);

    // Consultar API
    const datosAPI = await consultarDatosUsuarioAPI(
        parseInt(identificador, 10),
        usuario.tipo === 'activo' ? 'A' : 'P',
        parseInt(folio, 10)
    );

    if (!datosAPI) {
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ No se encontró un registro con esos datos. Verifica e intenta nuevamente.'
        });
        return;
    }

    usuario.datosUsuario = datosAPI;
    await sock.sendMessage(usuario.remitente, { text: '✅ Datos verificados correctamente.' });

    // Retomar flujo de llenado corto plazo
    if (usuario.tipo === 'activo') {
        await manejarLlenadoSolicitudCortoPlazoActivos(usuario, datosAPI);
    } else {
        await manejarLlenadoSolicitudCortoPlazoPensionados(usuario, datosAPI);
    }
    // Los handlers de llenado ajustan estadoConversacion según corresponda
}

// ===== Handler: afiliación + folio manual para LLENADO de SOLICITUD (AVAL, corto plazo) =====
async function manejarEstadoEsperandoAfiliacionFolioAvalManualSolicitud(usuario, mensajeNormalizado) {
    const { identificador, folio } = extraerAfiliacionFolio(mensajeNormalizado);
    if (!identificador || !folio) {
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ No detecté dos números válidos. Envía algo como:\n12345 678901'
        });
        return;
    }

    // Guardar afiliación y folio del AVAL en el objeto usuario
    usuario.afiliacionAval = identificador;
    usuario.folioAval = parseInt(folio, 10);

    // Consultar API para validar datos del aval
    const datosAval = await consultarDatosUsuarioAPI(
        parseInt(identificador, 10),
        'A',
        parseInt(folio, 10)
    );

    if (!datosAval) {
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ No se encontró un registro del aval con esos datos. Verifica e intenta nuevamente.'
        });
        return;
    }

    usuario.datosAval = datosAval;
    await sock.sendMessage(usuario.remitente, {
        text: '✅ Datos del aval verificados correctamente.'
    });

    // Continuar con el flujo de llenado según paso actual
    await confirmarSolicitudCortoPlazoConAval(usuario);
}

// Función para hacer OCR y analizar la imagen de la credencial IPE
async function analizarCredencial(filePath) {
    try {
        // 1. Realizar OCR intentando múltiples rotaciones
        const text = await realizarOCRMúltiplesRotaciones(filePath);
        console.log('Texto extraído de la credencial (mejor orientación):', text);

        // 2. Limpieza básica
        let textoLimpio = text
            .replace(/\s\s+/g, ' ')
            .replace(/[“”‘’]/g, "")
            .replace(/[\u2022\u25AA]/g, "")
            .replace(/[\n\r]/g, " ")
            .replace(/[\*\|']/g, "")
            .replace(/\s{2,}/g, ' ')
            .trim();
        let afiliacion = null;

        // Capturar variantes donde OCR lee "Añiliación" en lugar de "Afiliación"
        let altAffMatch = textoLimpio.match(/[Aa]ñiliaci[oó]n\s*?(\d{4,10})/i);
        if (altAffMatch) {
            afiliacion = altAffMatch[1];
        }

        // Capturar variante donde OCR lee "«sión" en lugar de "Afiliación"
        let altAffMatch2 = textoLimpio.match(/[«"]?s[ií]on\s*?(\d{4,10})/i);
        if (!afiliacion && altAffMatch2) {
            afiliacion = altAffMatch2[1];
        }

        console.log('Texto después de limpieza:', textoLimpio);

        // 3. Extraer pensión/afiliación/folio
        const pensionMatch = textoLimpio.match(/Pensi[oó]n\s*(\d{4,6})/i);
        const pension = pensionMatch ? pensionMatch[1] : null;

        // 1) Buscar “filiación” escrito bien, con o sin acento, solo si aún no se encontró afiliacion
        if (!afiliacion) {
            let match = textoLimpio.match(/filiaci[oó]n[:\s]*([0-9]{4,10})/i);
            if (match) {
                afiliacion = match[1];
            }
        }

        // 2) Si no se encontró, buscar “afil+?aci…” 
        if (!afiliacion) {
            let match = textoLimpio.match(/afil+?aci[oó]?n?\D*([0-9]{4,10})/i);
            if (match) {
                afiliacion = match[1];
            }
        }

        // 3) Si aún no se encontró, buscar la variante “lación” (por ej. “lación 12345”)
        if (!afiliacion) {
            let match = textoLimpio.match(/(?:[fifl]+)?laci[oó]n[:\s]*([0-9]{4,10})/i);
            if (match) {
                afiliacion = match[1];
            }
        }

        // Por último, buscar el folio
        let folioMatch = textoLimpio.match(/(?:Folio|Expedic[ií][oó]?n)[\s\S]*?(\d{6})/i);
        let folio = folioMatch ? folioMatch[1] : null;

        // Si no se detectó con “Folio” o “Expedición”, probar un fallback de 6 dígitos sueltos
        if (!folio) {
            const solo6Digitos = textoLimpio.match(/\b(\d{6})\b/);
            if (solo6Digitos) {
                // Evitar confundir el folio con la afiliación o pensión
                if (solo6Digitos[1] !== afiliacion && solo6Digitos[1] !== pension) {
                    folio = solo6Digitos[1];
                }
            }
        }

        console.log(`Afiliación detectada: ${afiliacion}`);
        console.log(`Pensión detectada: ${pension}`);
        console.log(`Folio detectado: ${folio}`);

        return { afiliacion, pension, folio };
    } catch (error) {
        console.error('Error en el análisis de la credencial:', error);
        return { afiliacion: null, pension: null, folio: null };
    }
}


async function preprocessImage(filePath) {
    const preprocessedPath = filePath.replace('.jpg', '_preprocessed.jpg');
    await sharp(filePath)
        .resize({ width: 1000 })
        .grayscale()
        .normalize() // Normaliza la imagen
        .sharpen()   // Aplica nitidez
        .toBuffer()
        .then(data => {
            return sharp(data)
                .threshold(128) // Ajusta el umbral
                .toFile(preprocessedPath);
        });
    return preprocessedPath;
}

async function procesarCredencial(filePath) {
    // Extraer datos de la credencial
    const { afiliacion, pension, folio } = await analizarCredencial(filePath);

    if ((!pension && !afiliacion) || !folio) {
        console.log('No se pudo extraer el número de pensión o afiliación o el folio de la credencial.');
        return null;
    }

    // Determinar el tipo de usuario basado en los datos extraídos
    const identificador = afiliacion || pension;
    const tipoUsuario = afiliacion ? 'activo' : 'pensionado';

    // Consultar la base de datos
    const datosUsuario = await consultarBaseDatos(identificador, folio);

    if (!datosUsuario) {
        console.log('No se encontró un registro en la base de datos con los datos proporcionados.');
        return null;
    }

    console.log('Datos del usuario obtenidos de la base de datos:', datosUsuario);

    return { ...datosUsuario, tipoUsuario };
}

async function manejarEstadoEsperandoTipoPrestamoLlenado(usuario, mensajeNormalizado) {
    if (mensajeNormalizado.includes('1') || mensajeNormalizado.includes('corto plazo')) {
        usuario.tipoPrestamo = 'cortoPlazo';
        await sock.sendMessage(usuario.remitente, {
            text: `Por favor, envíame una foto clara de tu credencial IPE (solicitante) para comenzar con el llenado de la solicitud de *Corto Plazo*.`
        });
        usuario.estadoConversacion = 'esperandoCredencialSolicitud';

    } else if (mensajeNormalizado.includes('2') || mensajeNormalizado.includes('mediano plazo')) {
        usuario.tipoPrestamo = 'medianoPlazo';

        // Primero pedimos la credencial del solicitante
        await sock.sendMessage(usuario.remitente, {
            text: `Para el llenado de la solicitud de *Préstamo a Mediano Plazo*, por favor envíame primero la credencial IPE del solicitante.`
        });
        // Pasamos a un estado que reciba la credencial del solicitante
        usuario.estadoConversacion = 'esperandoCredencialSolicitudMedianoPlazo';

    } else {
        const mensajeInvalido = `😅 No entendí tu respuesta.

⚠️ Por favor, selecciona una opción válida:  
    1️⃣ Corto Plazo  
    2️⃣ Mediano Plazo`;

        await sock.sendMessage(usuario.remitente, { text: mensajeInvalido });
    }
}



async function manejarRecepcionCredencialAvalMedianoN(usuario, msg, avalIndex) {
    try {
        // 1. Descargar la imagen del aval
        const buffer = await downloadWithRetry(msg);
        const fileName = `credencial_IPE_aval${avalIndex}_${Date.now()}.jpg`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, buffer);

        console.log(`Credencial IPE del aval #${avalIndex} guardada en: ${filePath}`);

        // 2. Analizar la credencial con OCR
        const { afiliacion, pension, folio } = await analizarCredencial(filePath);
        const identificadorAval = afiliacion || pension;

        // Si no pudimos leer afiliación o folio del aval
        if (!identificadorAval || !folio) {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No pude leer la credencial del *aval #${avalIndex}*.\n\n` +
                    `✏️ *Escribe en un solo mensaje la afiliación y el folio del aval separados por espacio.*\n` +
                    `Ejemplo:\n12345 678901`
            });
            usuario.pendingAvalIndex = avalIndex;                     // recordar qué aval
            usuario.estadoPrevio = `esperandoCredencialAvalMedianoPlazo${avalIndex}`;
            usuario.estadoConversacion = 'esperandoAfiliacionFolioManualAval';
            return;
        }

        // Bloquear si es pensionado (aval debe ser activo):
        const tipoAval = afiliacion ? 'A' : 'P';
        if (tipoAval === 'P') {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ El aval no puede ser pensionado. Por favor, envía la credencial de un trabajador activo.'
            });
            return; // Detenemos el flujo
        }

        // 3. Llamar a la API con los datos del aval
        const numAfiliacionAval = parseInt(identificadorAval, 10);
        const folioAval = parseInt(folio, 10);
        const datosAvalAPI = await consultarDatosUsuarioAPI(numAfiliacionAval, 'A', folioAval);

        if (!datosAvalAPI) {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No se encontró un registro con los datos del aval #${avalIndex}. Verifica la información.`
            });
            return;
        }

        // 4. Guardar en el array de avales
        if (!usuario.datosAvales) {
            usuario.datosAvales = [];
        }
        usuario.datosAvales[avalIndex - 1] = datosAvalAPI;

        // 5. Verificar si hay que pedir más avales
        if (avalIndex < usuario.numeroAvales) {
            // Pedir la credencial del siguiente aval
            const nextAval = avalIndex + 1;
            await sock.sendMessage(usuario.remitente, {
                text: `Ahora, por favor envíame la credencial IPE del aval #${nextAval}.`
            });
            usuario.estadoConversacion = `esperandoCredencialAvalMedianoPlazo${nextAval}`;
        } else {
            // Ya cubrió todos los avales
            // Pasar a la confirmación final
            await manejarLlenadoSolicitudMedianoPlazo(usuario);
        }
    } catch (error) {
        console.error(`Error en manejarRecepcionCredencialAvalMedianoN(#${avalIndex}):`, error);
        await sock.sendMessage(usuario.remitente, {
            text: `Hubo un error al procesar la credencial del aval #${avalIndex}. Inténtalo de nuevo.`
        });
    }
}


async function manejarLlenadoSolicitudMedianoPlazo(usuario) {
    try {
        const datosUsuario = usuario.datosUsuario || {};
        // Arreglo de avales (1, 2 o 3) que el usuario fue subiendo
        const avales = usuario.datosAvales || [];

        // ----------------------------------------
        // 1. VALIDAR DATOS DEL SOLICITANTE
        // ----------------------------------------
        const camposFaltantes = [];

        // Verificamos campos básicos del solicitante
        if (!datosUsuario.nombre || !datosUsuario.paterno || !datosUsuario.materno) {
            camposFaltantes.push('nombre completo del solicitante');
        }
        if (!datosUsuario.infoDomicilio || !datosUsuario.infoDomicilio.calle) {
            camposFaltantes.push('domicilio del solicitante');
        }
        if (!datosUsuario.infoDomicilio?.colonia) {
            camposFaltantes.push('colonia del solicitante');
        }
        if (!datosUsuario.infoDomicilio?.cp) {
            camposFaltantes.push('código postal del solicitante');
        }
        if (!datosUsuario.infoDomicilio?.municipio) {
            camposFaltantes.push('municipio del solicitante');
        }
        if (!datosUsuario.infoDomicilio?.estado) {
            camposFaltantes.push('estado del solicitante');
        }

        // Afiliación / folio
        const afiliacionSolicitante = datosUsuario.numAfiliacion
            ? String(datosUsuario.numAfiliacion)
            : '';
        const folioSolicitante = usuario.folio ? String(usuario.folio) : '';

        if (!afiliacionSolicitante) {
            camposFaltantes.push('afiliación del solicitante');
        }
        if (!folioSolicitante) {
            camposFaltantes.push('folio del solicitante');
        }

        // ----------------------------------------
        // 2. VALIDAR CADA AVAL
        // ----------------------------------------
        if (avales.length === 0) {
            // Si por regla siempre debe haber al menos 1 aval, puedes forzar un error:
            camposFaltantes.push('al menos 1 aval');
        } else {
            // Revisar cada aval
            avales.forEach((aval, index) => {
                const idx = index + 1; // Aval #1, #2, #3
                if (!aval.nombre || !aval.paterno || !aval.materno) {
                    camposFaltantes.push(`nombre completo del aval #${idx}`);
                }
                if (!aval.infoDomicilio?.calle) {
                    camposFaltantes.push(`domicilio del aval #${idx}`);
                }
                if (!aval.infoDomicilio?.colonia) {
                    camposFaltantes.push(`colonia del aval #${idx}`);
                }
                if (!aval.infoDomicilio?.cp) {
                    camposFaltantes.push(`código postal del aval #${idx}`);
                }
                if (!aval.infoDomicilio?.municipio) {
                    camposFaltantes.push(`municipio del aval #${idx}`);
                }
                if (!aval.infoDomicilio?.estado) {
                    camposFaltantes.push(`estado del aval #${idx}`);
                }

                const afiliacionAval = aval.numAfiliacion ? String(aval.numAfiliacion) : '';
                // Si requieres folioAval, te lo guardaste en aval?. (Al subir credencial, puedes guardarlo en aval.folio)
                // if (!aval.folio) { ... } // Depende si exiges "folioAval".

                if (!afiliacionAval) {
                    camposFaltantes.push(`afiliación del aval #${idx}`);
                }
            });
        }

        if (camposFaltantes.length > 0) {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No se pudo obtener la siguiente información: ${camposFaltantes.join(', ')}. Por favor, verifica los datos o comunícate con soporte.`
            });
            return;
        }

        // ----------------------------------------
        // 3. CONSTRUIR RESUMEN PARA CONFIRMACIÓN
        // ----------------------------------------
        // Datos del solicitante
        const nombreCompletoSolicitante = `${datosUsuario.nombre} ${datosUsuario.paterno} ${datosUsuario.materno}`.trim();
        const domicilioSolicitante = datosUsuario.infoDomicilio.calle;
        const coloniaSolicitante = datosUsuario.infoDomicilio.colonia;
        const codigoPostalSolicitante = datosUsuario.infoDomicilio.cp;
        const municipioSolicitante = datosUsuario.infoDomicilio.municipio;
        const estadoSolicitante = datosUsuario.infoDomicilio.estado;
        const correoSolicitante = datosUsuario.correo || '';
        const telefonoSolicitante = datosUsuario.telefono || '';

        // Construir texto de avales
        let textoAvales = '';
        avales.forEach((aval, index) => {
            const idx = index + 1;
            const nombreCompletoAval = `${aval.nombre} ${aval.paterno} ${aval.materno}`.trim();
            const domicilioAval = aval.infoDomicilio.calle;
            const coloniaAval = aval.infoDomicilio.colonia;
            const cpAval = aval.infoDomicilio.cp;
            const municipioAval = aval.infoDomicilio.municipio;
            const estadoAval = aval.infoDomicilio.estado;
            const correoAval = aval.correo || '';
            const telefonoAval = aval.telefono || '';
            const afiliacionAval = aval.numAfiliacion ? String(aval.numAfiliacion) : '';

            textoAvales += `
👤 *Datos del Aval #${idx}:*
   - Nombre Completo: ${nombreCompletoAval}
   - Afiliación/Pensión: ${afiliacionAval}
   - Domicilio: ${domicilioAval}
   - Colonia: ${coloniaAval}
   - Código Postal: ${cpAval}
   - Municipio: ${municipioAval}
   - Estado: ${estadoAval}
   - Correo: ${correoAval}
   - Celular: ${telefonoAval}
`;
        });

        const mensajeSolicitud = `
📋 *Solicitud de Préstamo a Mediano Plazo*

👨‍💼 *Solicitante*:
• Nombre Completo: ${nombreCompletoSolicitante}
• Afiliación/Pensión: ${afiliacionSolicitante}
• Folio: ${folioSolicitante}
• Domicilio: ${domicilioSolicitante}
• Colonia: ${coloniaSolicitante}
• Código Postal: ${codigoPostalSolicitante}
• Municipio: ${municipioSolicitante}
• Estado: ${estadoSolicitante}
• Correo Electrónico: ${correoSolicitante}
• Celular: ${telefonoSolicitante}

${textoAvales}

✅ *Por favor, confirma si deseas proceder con esta información.* 
Responde *SI* para continuar o *NO* para cancelar.
        `;

        // Mandamos al usuario el resumen
        await sock.sendMessage(usuario.remitente, { text: mensajeSolicitud });

        // Guardamos todo lo necesario en `usuario.datosSolicitudPendiente`
        usuario.datosSolicitudPendiente = {
            datosUsuario,  // solicitante
            avales,        // array con la info de cada aval
            afiliacionSolicitante,
            folioSolicitante
            // (Si requieres algo más, agrégalo)
        };

        // Pasamos al estado de confirmación final (varios avales)
        usuario.estadoConversacion = 'esperandoConfirmacionSolicitudMedianoPlazoConVariosAvales';

    } catch (error) {
        console.error('Error en manejarLlenadoSolicitudMedianoPlazo (multi-avales):', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al procesar tu solicitud de mediano plazo. Inténtalo de nuevo más tarde.'
        });
    }
}



// Función para llenar el PDF de solicitud de mediano plazo (para solicitante con varios avales)
async function llenarSolicitudPDFMedianoPlazo(usuario, datosSolicitudPendiente) {
    try {
        // Extraemos datos: información del solicitante, arreglo de avales, afiliación y folio
        const { datosUsuario, avales, afiliacionSolicitante, folioSolicitante } = datosSolicitudPendiente;

        // Ruta a la plantilla PDF que contiene los campos para solicitante y varios avales
        const pdfTemplatePath = path.join(__dirname, 'PMP2025.pdf');

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

        // =============== CAMPOS PARA AVALES ===============
        // Se recorre el arreglo de avales (1, 2 o 3)
        avales.forEach((aval, index) => {
            const idx = index + 1; // 1, 2, o 3
            const nombreAval = `${aval.nombre} ${aval.paterno} ${aval.materno}`.trim();

            // Se llenan los campos correspondientes a cada aval
            form.getTextField(`NOMBRE_AVAL${idx}`).setText(nombreAval);
            form.getTextField(`AFILIACION_AVAL${idx}`).setText(String(aval.numAfiliacion || ''));
            form.getTextField(`DOMICILIO_AVAL${idx}`).setText(aval.infoDomicilio?.calle || '');
            form.getTextField(`COLONIA_AVAL${idx}`).setText(aval.infoDomicilio?.colonia || '');
            form.getTextField(`CP_AVAL${idx}`).setText(aval.infoDomicilio?.cp || '');
            form.getTextField(`MUNICIPIO_AVAL${idx}`).setText(aval.infoDomicilio?.municipio || '');
            form.getTextField(`ESTADO_AVAL${idx}`).setText(aval.infoDomicilio?.estado || '');
        });

        // Aplanar el formulario (para que los campos no sean editables)
        form.flatten();

        // Serializar el PDF a bytes
        const pdfBytes = await pdfDoc.save();
        // Generar un nombre único para el archivo PDF
        const fileName = `solicitud_mediano_plazo_${afiliacionSolicitante}_${Date.now()}.pdf`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, pdfBytes);

        // Leer el PDF generado en un buffer y enviarlo (esto evita problemas con URLs locales)
        const pdfBuffer = fs.readFileSync(filePath);
        await sock.sendMessage(usuario.remitente, {
            document: pdfBuffer,
            fileName: fileName,
            mimetype: 'application/pdf',
            caption: 'Aquí está tu solicitud de préstamo a mediano plazo completada con tus aval(es). Por favor, revisa la información.'
        });

        // Actualizar el estado del usuario a menú principal
        usuario.estadoConversacion = 'menuPrincipal';
        console.log('Solicitud de préstamo a mediano plazo generada y enviada exitosamente.');

    } catch (error) {
        console.error('Error al generar el PDF de Mediano Plazo:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al generar tu solicitud de préstamo a mediano plazo. Inténtalo de nuevo más tarde.'
        });
    }
}

// Función para manejar la confirmación final de la solicitud de mediano plazo
async function manejarEstadoEsperandoConfirmacionSolicitudMedianoPlazo(usuario, mensajeNormalizado) {
    if (mensajeNormalizado === 'si' || mensajeNormalizado === 'sí') {
        const datosSolicitudPendiente = usuario.datosSolicitudPendiente;
        if (datosSolicitudPendiente) {
            // Se llama a la función que llena el PDF con los datos del solicitante y los avales
            await llenarSolicitudPDFMedianoPlazo(usuario, datosSolicitudPendiente);
            await sock.sendMessage(usuario.remitente, { text: '✅ Tu solicitud de préstamo a mediano plazo ha sido procesada exitosamente. Gracias.' });
        } else {
            await sock.sendMessage(usuario.remitente, { text: '⚠️ No se encontró una solicitud pendiente. Por favor, inicia el proceso nuevamente.' });
        }
        // Se limpia el objeto de datos y se regresa al menú principal
        delete usuario.datosSolicitudPendiente;
        usuario.estadoConversacion = 'menuPrincipal';
    } else if (mensajeNormalizado === 'no') {
        await sock.sendMessage(usuario.remitente, {
    text: `❌ Tu solicitud ha sido cancelada.

📋 Si deseas corregir algún dato o iniciar otro trámite, por favor escribe \`menú\` para regresar al inicio y seleccionar una nueva opción.

👩‍💼 También puedes elegir la opción *Hablar con un Asesor* si necesitas asistencia personalizada.`
});
        delete usuario.datosSolicitudPendiente;
        usuario.estadoConversacion = 'menuPrincipal';
    } else {
        await sock.sendMessage(usuario.remitente, { text: 'Por favor, responde *SI* para confirmar o *NO* para cancelar.' });
    }
}


async function listarCamposFormulario(pdfPath) {
    try {
        const existingPdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();

        if (!form) {
            console.error('El PDF no contiene campos de formulario.');
            return;
        }

        const fields = form.getFields();
        // console.log('Campos encontrados en el formulario:', fields.map(f => f.getName()));
        // fields.forEach(field => {
        //     console.log(`- ${field.getName()}`);
        // });
    } catch (error) {
        console.error('Error al listar los campos del formulario:', error);
    }
}

// Llama a la función con la ruta de tu PDF
listarCamposFormulario(path.join(__dirname, 'PMP2025.pdf'));


async function manejarLlenadoSolicitudCortoPlazoActivos(usuario, datosUsuario) {
    try {
        console.log('DatosUsuario en manejarLlenadoSolicitudCortoPlazoActivos:', datosUsuario);

        // Construir el nombre completo
        const nombre = `${datosUsuario.nombre} ${datosUsuario.paterno} ${datosUsuario.materno}`;

        // Extraer datos del domicilio
        const domicilio = datosUsuario.infoDomicilio.calle;
        const colonia = datosUsuario.infoDomicilio.colonia;
        const codigoPostal = datosUsuario.infoDomicilio.cp;
        const municipio = datosUsuario.infoDomicilio.municipio;
        const estado = datosUsuario.infoDomicilio.estado;

        // Datos de afiliación y folio
        const afiliacion = datosUsuario.numAfiliacion;
        const folio = usuario.folio; // Usamos el folio extraído de la credencial

        // Datos de contacto
        const correo = datosUsuario.correo || null; // Si no existe, será null
        const telefono = usuario.telefono || null;  // Usamos el número de celular obtenido del remitente

        // Datos laborales
        const organismo = datosUsuario.infoLaboral.organismo;
        let dependencia = datosUsuario.infoLaboral.dependencia;
        const empleo = datosUsuario.infoLaboral.empleo;

        // Si la dependencia viene como "Oficinas Centrales", usar el organismo
        if (dependencia && dependencia.trim().toLowerCase() === 'oficinas centrales') {
            dependencia = organismo;
        }

        // QUINCENAS COTIZADAS
        const quincenasCotizadas = datosUsuario.quincenasCotizadas || 0; // <-- NUEVO

        // Verificar campos faltantes
        const camposFaltantes = [];
        if (!nombre) camposFaltantes.push('nombre');
        if (!domicilio) camposFaltantes.push('domicilio');
        if (!colonia) camposFaltantes.push('colonia');
        if (!codigoPostal) camposFaltantes.push('código postal');
        if (!municipio) camposFaltantes.push('municipio');
        if (!estado) camposFaltantes.push('estado');
        if (!dependencia) camposFaltantes.push('dependencia');
        if (!organismo) camposFaltantes.push('organismo');
        if (!empleo) camposFaltantes.push('empleo');

        if (camposFaltantes.length > 0) {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No se pudo obtener la siguiente información necesaria: ${camposFaltantes.join(', ')}. Por favor, comunícate con soporte.`
            });
            return;
        }

        // No es obligatorio tener correo y teléfono, pero podemos informarle al usuario
        /*if (!correo) {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ No se encontró un correo electrónico asociado a tu cuenta. Continuaremos sin este dato.'
            });
        }
        if (!telefono) {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ No se pudo obtener tu número de celular automáticamente. Continuaremos sin este dato.'
            });
        }*/

        // Verificamos si el trabajador cumple los 10 años (240 quincenas)
        if (quincenasCotizadas < 240) { // <-- NUEVO
            // Menos de 10 años => NECESITA AVAL
            await sock.sendMessage(usuario.remitente, {
                text: `🔍 Detectamos que tu antigüedad es menor a 10 años. Para continuar, es necesario un aval en servicio activo. Por favor envía la credencial IPE de tu aval.`
            });
            // Cambiamos el estado para manejar la credencial del aval
            usuario.estadoConversacion = 'esperandoCredencialAvalCortoPlazo'; // <-- NUEVO (crearemos este estado)
            // Guardamos momentáneamente los datos que ya tenemos
            usuario.datosSolicitudPendiente = {
                nombre,
                afiliacion,
                folio,
                domicilio,
                colonia,
                codigoPostal,
                municipio,
                estado,
                correo,
                telefono,
                dependencia,
                organismo,
                empleo,
                quincenasCotizadas
            };
            return;
        }

        // SI TIENE >= 240 QUINCENAS => SIN AVAL
        const mensajeSolicitud = `
📋 *Solicitud de Préstamo a Corto Plazo para Trabajadores Activos*

🔸 *Nombre Completo*: ${nombre}
🔸 *Afiliación*: ${afiliacion}
🔸 *Folio*: ${folio}
🔸 *Domicilio*: ${domicilio}
🔸 *Colonia*: ${colonia}
🔸 *Código Postal*: ${codigoPostal}
🔸 *Municipio*: ${municipio}
🔸 *Estado*: ${estado}
${correo ? `🔸 *Correo Electrónico*: ${correo}` : ''}
${telefono ? `🔸 *Celular*: ${telefono}` : ''}

🔸 *Dependencia*: ${dependencia}
🔸 *Organismo*: ${organismo}
🔸 *Empleo*: ${empleo}

✅ *Por favor, confirma si deseas proceder con esta información.* Responde *SI* para continuar o *NO* para cancelar.
        `;

        await sock.sendMessage(usuario.remitente, { text: mensajeSolicitud });

        // Guardamos la solicitud pendiente
        usuario.datosSolicitudPendiente = {
            nombre,
            afiliacion,
            folio,
            domicilio,
            colonia,
            codigoPostal,
            municipio,
            estado,
            correo,
            telefono,
            dependencia,
            organismo,
            empleo,
            quincenasCotizadas
        };

        usuario.estadoConversacion = 'esperandoConfirmacionSolicitud';
    } catch (error) {
        console.error('Error en manejarLlenadoSolicitudCortoPlazoActivos:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al procesar tu solicitud. Inténtalo de nuevo más tarde.'
        });
    }
}

async function manejarRecepcionCredencialAvalCortoPlazo(usuario, msg) {
    try {
        // 1. Descargar la imagen de la credencial
        const buffer = await downloadWithRetry(msg);
        const fileName = `credencial_IPE_aval_${Date.now()}.jpg`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, buffer);

        console.log(`Credencial IPE del aval (Corto Plazo Activos) guardada en: ${filePath}`);

        // 2. Analizar la credencial con OCR
        const { afiliacion: afiliacionAval, pension: pensionAval, folio: folioAval } = await analizarCredencial(filePath);
        const identificadorAval = afiliacionAval || pensionAval;

        if (!identificadorAval || !folioAval) {
            const mensaje1 = `⚠️ No se pudo leer con claridad la credencial del aval.`;
            const mensaje2 = `✏️ Por favor, escribe en un solo mensaje el número de afiliación y el folio del aval, separados por un espacio.\nEjemplo:\n12345 678901`;

            await sock.sendMessage(usuario.remitente, { text: mensaje1 });
            await sock.sendMessage(usuario.remitente, { text: mensaje2 });

            usuario.estadoPrevio = 'solicitandoCredencialAval';
            usuario.estadoConversacion = 'esperandoAfiliacionFolioAvalManualSolicitud';
            return;
        }

        // 3. Definir el tipo de derechohabiente del aval
        // Si 'afiliacionAval' existe, se asume que es Activo ('A');
        // Si 'pensionAval' existe, sería 'P'. Pero necesitamos bloquear si es 'P'.
        const tipoDerechohabienteAval = afiliacionAval ? 'A' : 'P';

        if (tipoDerechohabienteAval === 'P') {
            // Bloqueamos la continuación porque no puede ser pensionado
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ El aval no puede ser un pensionado. Por favor, envía la credencial de un trabajador activo con la antigüedad requerida.'
            });
            return; // Detenemos el flujo
        }

        // 4. Llamar a la API con los datos del aval
        const numAfiliacionAval = parseInt(identificadorAval);
        const folioNumberAval = parseInt(folioAval);

        const datosAvalAPI = await consultarDatosUsuarioAPI(numAfiliacionAval, tipoDerechohabienteAval, folioNumberAval);
        if (!datosAvalAPI) {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ No se encontró un registro con los datos del aval. Verifica la información o comunícate con soporte.'
            });
            return;
        }

        // 5. Guardamos en usuario los datos del aval
        usuario.datosAval = datosAvalAPI;

        // 6. Ahora continuamos con la confirmación de la solicitud con aval
        await confirmarSolicitudCortoPlazoConAval(usuario);

    } catch (error) {
        console.error('Error en manejarRecepcionCredencialAvalCortoPlazo:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al procesar la credencial del aval. Inténtalo de nuevo más tarde.'
        });
    }
}

async function confirmarSolicitudCortoPlazoConAval(usuario) {
    // Tomamos los datos que guardamos cuando detectamos <240 quincenas
    const datosSolicitante = usuario.datosSolicitudPendiente;
    const datosAval = usuario.datosAval || {};

    const nombreCompletoAval = `${datosAval.nombre} ${datosAval.paterno} ${datosAval.materno}`;
    const domicilioAval = datosAval.infoDomicilio?.calle || '';
    const coloniaAval = datosAval.infoDomicilio?.colonia || '';
    const cpAval = datosAval.infoDomicilio?.cp || '';
    const municipioAval = datosAval.infoDomicilio?.municipio || '';
    const estadoAval = datosAval.infoDomicilio?.estado || '';

    // Construir mensaje
    const mensaje = `
📋 *Solicitud de Préstamo a Corto Plazo (Activo con Aval)*

🙍‍♂️ *Datos del Solicitante*:
• Nombre: ${datosSolicitante.nombre}
• Afiliación: ${datosSolicitante.afiliacion}
• Folio: ${datosSolicitante.folio}
• Domicilio: ${datosSolicitante.domicilio}
• Colonia: ${datosSolicitante.colonia}
• CP: ${datosSolicitante.codigoPostal}
• Municipio: ${datosSolicitante.municipio}
• Estado: ${datosSolicitante.estado}
• Dependencia: ${datosSolicitante.dependencia}
• Organismo: ${datosSolicitante.organismo}
• Empleo: ${datosSolicitante.empleo}

👤 *Datos del Aval*:
• Nombre: ${nombreCompletoAval}
• Afiliación/Pensión: ${datosAval.numAfiliacion || datosAval.numPension || 'N/A'}
• Folio: ${usuario.folioAval || 'N/A'}
• Domicilio: ${domicilioAval}
• Colonia: ${coloniaAval}
• CP: ${cpAval}
• Municipio: ${municipioAval}
• Estado: ${estadoAval}

✅ *Si la información proporcionada es correcta* Enviar *SI* para continuar, o *NO* para hablar con un *Asesor*.
`;

    await sock.sendMessage(usuario.remitente, { text: mensaje });

    // Cambiamos a un estado de confirmación
    usuario.estadoConversacion = 'esperandoConfirmacionSolicitudConAvalActivo';
}
async function manejarEstadoEsperandoConfirmacionSolicitudConAvalActivo(usuario, mensajeNormalizado) {
    if (mensajeNormalizado === 'si' || mensajeNormalizado === 'sí') {
        // Llamar a la función que llena el PDF con solicitante y aval
        await llenarSolicitudPDFActivosConAval(usuario);

        // Ajustar el texto que se envía al usuario, agregando emojis
        await sock.sendMessage(usuario.remitente, {
            text: `🖨️ Recuerda que debe imprimirse en una sola hoja por ambos lados y contar con firmas autógrafas ✍️.`
        });

        // Reiniciamos
        usuario.estadoConversacion = 'menuPrincipal';
        delete usuario.datosSolicitudPendiente;
        delete usuario.datosAval;

    } else if (mensajeNormalizado === 'no') {
        await sock.sendMessage(usuario.remitente, {
            text: `❌ Tu solicitud ha sido cancelada.

📋 Si deseas corregir algún dato o iniciar otro trámite, por favor escribe \`menú\` para regresar al inicio y seleccionar una nueva opción.

👩‍💼 También puedes elegir la opción *Hablar con un Asesor* si necesitas asistencia personalizada.`
        });
        usuario.estadoConversacion = 'menuPrincipal';
        delete usuario.datosSolicitudPendiente;
        delete usuario.datosAval;

    } else {
        await sock.sendMessage(usuario.remitente, {
            text: 'Por favor, responde SI para confirmar o NO para cancelar.'
        });
    }
}

async function llenarSolicitudPDFActivosConAval(usuario) {
    try {
        const datosSolicitante = usuario.datosSolicitudPendiente;
        const datosAval = usuario.datosAval;

        // Ruta al PDF que ya contiene campos para solicitante y aval
        const pdfTemplatePath = path.join(__dirname, 'pcpactivo_con_aval.pdf');

        // Leer y cargar el PDF
        const existingPdfBytes = fs.readFileSync(pdfTemplatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const form = pdfDoc.getForm();

        // =============== CAMPOS DEL SOLICITANTE ===============
        form.getTextField('nombre_solicitante').setText(datosSolicitante.nombre);
        form.getTextField('afiliacion_solicitante').setText(String(datosSolicitante.afiliacion || ''));
        form.getTextField('domicilio_solicitante').setText(datosSolicitante.domicilio || '');
        form.getTextField('colonia_solicitante').setText(datosSolicitante.colonia || '');
        form.getTextField('cp_solicitante').setText(datosSolicitante.codigoPostal || '');
        form.getTextField('municipio_solicitante').setText(datosSolicitante.municipio || '');
        form.getTextField('estado_solicitante').setText(datosSolicitante.estado || '');

        // Datos de contacto del solicitante
        // (Asegúrate de tener campos en el PDF para correo y celular del solicitante si lo deseas)
        form.getTextField('correo_solicitante').setText(datosSolicitante.correo || '');
        form.getTextField('celular_solicitante').setText(datosSolicitante.telefono || '');

        // Datos laborales del solicitante
        form.getTextField('dependencia_solicitante').setText(datosSolicitante.dependencia || '');
        form.getTextField('organismo_solicitante').setText(datosSolicitante.organismo || '');
        form.getTextField('empleo_solicitante').setText(datosSolicitante.empleo || '');

        // =============== CAMPOS DEL AVAL ===============
        const nombreCompletoAval = `${datosAval.nombre || ''} ${datosAval.paterno || ''} ${datosAval.materno || ''}`.trim();
        form.getTextField('nombre_aval').setText(nombreCompletoAval);
        form.getTextField('afiliacion_aval').setText(String(datosAval.numAfiliacion || ''));

        // Domicilio del aval (infoDomicilio)
        form.getTextField('domicilio_aval').setText(datosAval.infoDomicilio?.calle || '');
        form.getTextField('colonia_aval').setText(datosAval.infoDomicilio?.colonia || '');
        form.getTextField('cp_aval').setText(datosAval.infoDomicilio?.cp || '');
        form.getTextField('municipio_aval').setText(datosAval.infoDomicilio?.municipio || '');
        form.getTextField('estado_aval').setText(datosAval.infoDomicilio?.estado || '');

        // Datos de contacto del aval
        // form.getTextField('correo_aval').setText(datosAval.correo || '');
        // form.getTextField('celular_aval').setText(datosAval.telefono || '');

        // Si el aval también tiene datos laborales (depende de tu PDF):
        // form.getTextField('dependencia_aval').setText(datosAval.infoLaboral?.dependencia || '');
        // form.getTextField('organismo_aval').setText(datosAval.infoLaboral?.organismo || '');
        // form.getTextField('empleo_aval').setText(datosAval.infoLaboral?.empleo || '');

        // =============== APLANAR Y GUARDAR ===============
        form.flatten();
        const pdfBytes = await pdfDoc.save();

        // Generar un nombre de archivo único
        const filePath = path.join(archivosDir, `solicitud_cplazo_conaval_${Date.now()}.pdf`);
        fs.writeFileSync(filePath, pdfBytes);

        // Enviar el PDF al usuario
        await sock.sendMessage(usuario.remitente, {
            document: { url: filePath },
            mimetype: 'application/pdf',
            fileName: 'solicitud_cplazo_con_aval.pdf',
            caption: `✅ Tu solicitud de Corto Plazo con Aval se ha generado con éxito.

Por favor, revisa cuidadosamente que toda la información sea correcta. 
Si detectas algún error, comunícate con nosotros para corregirlo.`
        });

    } catch (error) {
        console.error('Error al generar el PDF con aval:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al generar tu solicitud con aval. Inténtalo más tarde.'
        });
    }
}

// Función para manejar el llenado de la solicitud de corto plazo para pensionados
async function manejarLlenadoSolicitudCortoPlazoPensionados(usuario, datosUsuario) {
    try {
        console.log('DatosUsuario en manejarLlenadoSolicitudCortoPlazoPensionados:', datosUsuario);

        // Construir el nombre completo
        const nombre = `${datosUsuario.nombre} ${datosUsuario.paterno} ${datosUsuario.materno}`;

        // Obtener información de domicilio
        const domicilio = datosUsuario.infoDomicilio.calle;
        const colonia = datosUsuario.infoDomicilio.colonia;
        const codigoPostal = datosUsuario.infoDomicilio.cp;
        const municipio = datosUsuario.infoDomicilio.municipio;
        const estado = datosUsuario.infoDomicilio.estado;

        // Obtener número de pensión y folio
        const pension = datosUsuario.numAfiliacion; // Asumimos que es el número de pensión
        const folio = usuario.folio; // Usamos el folio extraído de la credencial

        // Obtener el número de celular del remitente
        const celular = obtenerNumeroCelular(usuario.remitente);

        // Verificar campos faltantes
        const camposFaltantes = [];
        if (!nombre) camposFaltantes.push('nombre');
        if (!domicilio) camposFaltantes.push('domicilio');
        if (!colonia) camposFaltantes.push('colonia');
        if (!codigoPostal) camposFaltantes.push('código postal');
        if (!municipio) camposFaltantes.push('municipio');
        if (!estado) camposFaltantes.push('estado');
        if (!celular) camposFaltantes.push('celular');

        if (camposFaltantes.length > 0) {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No se pudo obtener la siguiente información: ${camposFaltantes.join(', ')}. Por favor, comunícate con soporte.`
            });
            return;
        }

        // Construir el mensaje de solicitud
        const mensajeSolicitud = `
📋 *Solicitud de Préstamo a Corto Plazo para Pensionados*

🔸 *Nombre Completo*: ${nombre}
🔸 *Pensión*: ${pension}
🔸 *Folio*: ${folio}
🔸 *Domicilio*: ${domicilio}
🔸 *Colonia*: ${colonia}
🔸 *Código Postal*: ${codigoPostal}
🔸 *Municipio*: ${municipio}
🔸 *Estado*: ${estado}
🔸 *Celular*: ${celular}

✅ *Por favor, confirma si deseas proceder con esta información.* Responde *SI* para continuar o *NO* para cancelar.
        `;

        // Enviar el mensaje al usuario
        await sock.sendMessage(usuario.remitente, { text: mensajeSolicitud });

        // Guardamos la solicitud pendiente en el objeto usuario
        usuario.datosSolicitudPendiente = {
            nombre,
            pension,
            folio,
            domicilio,
            colonia,
            codigoPostal,
            municipio,
            estado,
            celular
        };

        // Actualizar el estado de la conversación
        usuario.estadoConversacion = 'esperandoConfirmacionSolicitud';
    } catch (error) {
        console.error('Error en manejarLlenadoSolicitudCortoPlazoPensionados:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al procesar tu solicitud. Inténtalo de nuevo más tarde.'
        });
    }
}


async function manejarEstadoEsperandoConfirmacionSolicitud(usuario, mensajeNormalizado) {
    if (mensajeNormalizado === 'si' || mensajeNormalizado === 'sí') {
        const datosUsuario = usuario.datosSolicitudPendiente;

        if (datosUsuario) {
            if (usuario.tipo === 'activo') {
                await llenarSolicitudPDFActivos(usuario, datosUsuario);
            } else {
                await llenarSolicitudPDF(usuario, datosUsuario);
            }

            await sock.sendMessage(usuario.remitente, { text: '✅ Tu solicitud ha sido procesada exitosamente. Gracias.' });
        } else {
            await sock.sendMessage(usuario.remitente, { text: '⚠️ No se encontró una solicitud pendiente. Por favor, inicia el proceso nuevamente.' });
        }
        // Eliminar la solicitud pendiente
        delete usuario.datosSolicitudPendiente;

        usuario.estadoConversacion = 'menuPrincipal';
    } else if (mensajeNormalizado === 'no') {
        await sock.sendMessage(usuario.remitente, {
    text: `❌ Tu solicitud ha sido cancelada.

📋 Si deseas corregir algún dato o iniciar otro trámite, por favor escribe \`menú\` para regresar al inicio y seleccionar una nueva opción.

👩‍💼 También puedes elegir la opción *Hablar con un Asesor* si necesitas asistencia personalizada.`
});

        // Eliminar la solicitud pendiente
        delete usuario.datosSolicitudPendiente;

        usuario.estadoConversacion = 'menuPrincipal';
    } else {
        await sock.sendMessage(usuario.remitente, { text: 'Por favor, responde *SI* para confirmar o *NO* para cancelar.' });
    }
}
async function manejarEstadoEsperandoConfirmacionSolicitudMedianoPlazo(usuario, mensajeNormalizado) {
    if (mensajeNormalizado === 'si' || mensajeNormalizado === 'sí') {
        const datosSolicitudPendiente = usuario.datosSolicitudPendiente;

        if (datosSolicitudPendiente) {
            // Llamar a la función para llenar el PDF del préstamo a mediano plazo
            await llenarSolicitudPDFMedianoPlazo(usuario, datosSolicitudPendiente);

            await sock.sendMessage(usuario.remitente, { text: '✅ Tu solicitud de préstamo a mediano plazo ha sido procesada exitosamente. Gracias.' });
        } else {
            await sock.sendMessage(usuario.remitente, { text: '⚠️ No se encontró una solicitud pendiente. Por favor, inicia el proceso nuevamente.' });
        }
        // Eliminar la solicitud pendiente
        delete usuario.datosSolicitudPendiente;

        usuario.estadoConversacion = 'menuPrincipal';
    } else if (mensajeNormalizado === 'no') {
        await sock.sendMessage(usuario.remitente, {
    text: `❌ Tu solicitud ha sido cancelada.

📋 Si deseas corregir algún dato o iniciar otro trámite, por favor escribe \`menú\` para regresar al inicio y seleccionar una nueva opción.

👩‍💼 También puedes elegir la opción *Hablar con un Asesor* si necesitas asistencia personalizada.`
});

        // Eliminar la solicitud pendiente
        delete usuario.datosSolicitudPendiente;

        usuario.estadoConversacion = 'menuPrincipal';
    } else {
        await sock.sendMessage(usuario.remitente, { text: 'Por favor, responde *SI* para confirmar o *NO* para cancelar.' });
    }
}


async function llenarSolicitudPDF(usuario, datosUsuario) {
    try {
        // Ruta al PDF original con los campos de formulario
        const pdfTemplatePath = path.join(__dirname, 'pcppensionado.pdf');

        // Leer el PDF como bytes
        const existingPdfBytes = fs.readFileSync(pdfTemplatePath);

        // Cargar el PDF
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Obtener el formulario
        const form = pdfDoc.getForm();

        // Asignar los valores a los campos correspondientes
        form.getTextField('nombre').setText(datosUsuario.nombre);
        form.getTextField('pension').setText(datosUsuario.pension.toString());
        form.getTextField('domicilio').setText(datosUsuario.domicilio);
        form.getTextField('colonia').setText(datosUsuario.colonia);
        form.getTextField('codigopostal').setText(datosUsuario.codigoPostal);
        form.getTextField('municipio').setText(datosUsuario.municipio);
        form.getTextField('estado').setText(datosUsuario.estado);
        form.getTextField('celular').setText(datosUsuario.celular);

        // Aplanar el formulario
        form.flatten();

        // Serializar el PDF a bytes
        const pdfBytes = await pdfDoc.save();

        // Guardar el PDF
        const filePath = path.join(archivosDir, `solicitud_${datosUsuario.pension}.pdf`);
        fs.writeFileSync(filePath, pdfBytes);

        // Enviar el PDF al usuario
        await sock.sendMessage(usuario.remitente, {
            document: { url: filePath },
            mimetype: 'application/pdf',
            fileName: `solicitud_${datosUsuario.pension}.pdf`,
            caption: 'Aquí está tu solicitud completada. Por favor, revísala y confirma si todo es correcto.'
        });

        // Eliminar la solicitud pendiente
        await eliminarSolicitudPendiente(usuario.id);

    } catch (error) {
        console.error('Error al generar el PDF:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al generar tu solicitud. Inténtalo de nuevo más tarde.'
        });
    }
}


async function llenarSolicitudPDFActivos(usuario, datosUsuario) {
    try {
        // Ruta al PDF original con los campos de formulario para activos
        const pdfTemplatePath = path.join(__dirname, 'pcpactivo.pdf');

        // Leer el PDF como bytes
        const existingPdfBytes = fs.readFileSync(pdfTemplatePath);

        // Cargar el PDF
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Obtener el formulario
        const form = pdfDoc.getForm();

        // Asignar los valores a los campos correspondientes
        form.getTextField('nombre').setText(datosUsuario.nombre);
        form.getTextField('afiliacion').setText(datosUsuario.afiliacion.toString());
        form.getTextField('domicilio').setText(datosUsuario.domicilio);
        form.getTextField('colonia').setText(datosUsuario.colonia);
        form.getTextField('codigopostal').setText(datosUsuario.codigoPostal);
        form.getTextField('municipio').setText(datosUsuario.municipio);
        form.getTextField('estado').setText(datosUsuario.estado);
        form.getTextField('correo').setText(datosUsuario.correo || '');
        form.getTextField('celular').setText(datosUsuario.telefono || '');

        form.getTextField('dependencia').setText(datosUsuario.dependencia);
        form.getTextField('organismo').setText(datosUsuario.organismo);
        form.getTextField('empleo').setText(datosUsuario.empleo);

        // Aplanar el formulario
        form.flatten();

        // Serializar el PDF a bytes
        const pdfBytes = await pdfDoc.save();

        // Guardar el PDF
        const filePath = path.join(archivosDir, `solicitud_${datosUsuario.afiliacion}.pdf`);
        fs.writeFileSync(filePath, pdfBytes);

        // Enviar el PDF al usuario
        await sock.sendMessage(usuario.remitente, {
            document: { url: filePath },
            mimetype: 'application/pdf',
            fileName: `solicitud_${datosUsuario.afiliacion}.pdf`,
            caption: 'Aquí está tu solicitud completada. Por favor, revísala y confirma si todo es correcto.'
        });

        // Eliminar la solicitud pendiente
        delete usuario.datosSolicitudPendiente;

        // Actualizar el estado de la conversación
        usuario.estadoConversacion = 'menuPrincipal';

    } catch (error) {
        console.error('Error al generar el PDF:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al generar tu solicitud. Inténtalo de nuevo más tarde.'
        });
    }
}


// Función para manejar la recepción de la credencial para la solicitud
async function manejarRecepcionCredencialSolicitud(usuario, msg) {
    try {
        // 1) Descargar la imagen
        const buffer = await downloadWithRetry(msg);
        const fileName = `credencial_IPE_${Date.now()}.jpg`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, buffer);
        console.log(`Credencial IPE guardada en: ${filePath}`);

        // Enviar mensaje de confirmación para evitar que el usuario envíe más mensajes
        await sock.sendMessage(usuario.remitente, {
            text: '✅ Recibí tu credencial, por favor espera mientras la analizo..'
        });

        // 2) Analizar credencial con OCR
        const { afiliacion, pension, folio } = await analizarCredencial(filePath);

        // 3) Verificamos si se extrajo algo válido
        const identificador = (usuario.tipo === 'activo') ? afiliacion : pension;
        if (!identificador || !folio) {
            // ===== OCR FALLÓ → Pedir datos manuales =====
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No pude leer claramente tu credencial.\n\n` +
                    `✏️ *Por favor, escribe en un solo mensaje tu afiliación/pensión y tu folio separados por espacio.*\n` +
                    `Ejemplo:\n12345 678901`
            });
            // Guardamos el flujo del que venimos para retomarlo después
            if (usuario.estadoConversacion === 'solicitandoCredencial') {
                // Estamos en simulación de activo
                usuario.estadoPrevio = 'solicitandoCredencialSimulacionActivo';
            } else {
                // Veníamos del llenado de solicitud corto plazo
                usuario.estadoPrevio = 'esperandoCredencialSolicitud';
            }
            usuario.estadoConversacion = 'esperandoAfiliacionFolioManualSolicitud';
            return;
        }

        // 4) Consultar la API para obtener datos
        const numAfiliacion = parseInt(identificador);
        const folioNumber = parseInt(folio);
        const tipoDerechohabiente = usuario.tipo === 'activo' ? 'A' : 'P';

        const datosUsuarioAPI = await consultarDatosUsuarioAPI(numAfiliacion, tipoDerechohabiente, folioNumber);
        if (!datosUsuarioAPI) {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ No se encontró un registro con esos datos.'
                    + ' Te regreso al menú principal; también puedes elegir la opción 5 para hablar con un asesor.'
            });

            // Volver al menú principal
            usuario.estadoConversacion = 'menuPrincipal';

            // Mostrar menú principal inmediatamente
            const menuMensaje =
                `🤖 *¿En qué más puedo ayudarte, ${usuario.nombre || ''}?*\n\n` +
                `1️⃣ *Requisitos y Formatos*\n` +
                `2️⃣ *Simulación*\n` +
                `3️⃣ *Llenado de Solicitud*\n` +
                `4️⃣ *Comprobante de Préstamo*\n` +
                `5️⃣ *Asesor*\n` +
                `6️⃣ *Preguntas Frecuentes*\n\n` +
                `Por favor, responde con el número o el nombre de la opción que deseas.`;
            await sock.sendMessage(usuario.remitente, { text: menuMensaje });
            return;
        }

        // 5) Guardar info en usuario
        usuario.datosUsuario = datosUsuarioAPI;
        usuario.folio = folioNumber; // almacenar folio en 'usuario' para uso posterior

        // 6) Seguir con la lógica de llenado según sea activo/pensionado
        if (usuario.tipo === 'activo') {
            await manejarLlenadoSolicitudCortoPlazoActivos(usuario, datosUsuarioAPI);
        } else {
            await manejarLlenadoSolicitudCortoPlazoPensionados(usuario, datosUsuarioAPI);
        }

    } catch (error) {
        console.error('Error en manejarRecepcionCredencialSolicitud:', error);
        usuario.estadoConversacion = 'menuPrincipal'; // Reiniciamos el flujo para evitar bucles
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al procesar tu credencial. Te regreso al menú principal; si lo deseas, selecciona la opción 5 para contactar a un asesor.'
        });

        // Volver al menú principal
        usuario.estadoConversacion = 'menuPrincipal';

        // Mostrar menú principal
        const menuMensaje =
            `🤖 *¿En qué más puedo ayudarte, ${usuario.nombre || ''}?*\n\n` +
            `1️⃣ *Requisitos y Formatos*\n` +
            `2️⃣ *Simulación*\n` +
            `3️⃣ *Llenado de Solicitud*\n` +
            `4️⃣ *Comprobante de Préstamo*\n` +
            `5️⃣ *Asesor*\n` +
            `6️⃣ *Preguntas Frecuentes*\n\n` +
            `Por favor, responde con el número o el nombre de la opción que deseas.`;
        await sock.sendMessage(usuario.remitente, { text: menuMensaje });
    }
}

// ==== Simulación: recepción de credencial IPE (Pensionados) ==================
async function manejarRecepcionCredencialSimulacionPensionado(usuario, msg) {
    console.log('🟢 Entrando a manejarRecepcionCredencialSimulacionPensionado');
    let filePath;
    try {
        // 1. Descargar la imagen
        const buffer = await downloadWithRetry(msg);
        const fileName = `credencial_IPE_simulacion_${Date.now()}.jpg`;
        filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, buffer);

        // Enviar mensaje de espera antes de analizar la credencial (pensionados)
        await sock.sendMessage(usuario.remitente, {
            text: '✅ Recibí tu credencial para simulación de pensionados, por favor espera mientras la analizo...'
        });

        // 2. Analizar la credencial
        const { pension, folio } = await analizarCredencial(filePath);
        if (!pension || !folio) {
            // ==== OCR FALLÓ → Pedir datos manuales =====
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No pude leer claramente tu credencial.\n\n` +
                    `✏️ *Por favor, escribe en un solo mensaje tu número de pensión y tu folio separados por espacio.*\n` +
                    `Ejemplo:\n52009 589169`
            });
            usuario.estadoPrevio = 'esperandoCredencialSimulacionPensionado';
            usuario.estadoConversacion = 'esperandoAfiliacionFolioManual';
            return;
        }

        // 3. Llamar a la API
        const datosUsuarioAPI = await consultarDatosUsuarioAPI(
            parseInt(pension, 10),
            'P',
            parseInt(folio, 10)
        );
        if (!datosUsuarioAPI) {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ No encontré un registro con esos datos. Verifica la información o contacta a un asesor.'
            });
            return;
        }

        // 4. Guardar y lanzar simulación
        usuario.datosUsuario = datosUsuarioAPI;
        usuario.folio = parseInt(folio, 10);

        // (Guardado de simulación ahora ocurre dentro de llamarAPISimulacion)

        await llamarAPISimulacion(usuario);
    } catch (error) {
        console.error('Error en manejarRecepcionCredencialSimulacionPensionado:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al procesar tu credencial. Inténtalo nuevamente más tarde.'
        });
    } finally {
        // Limpiar archivo temporal
        try { if (filePath) fs.unlinkSync(filePath); } catch (_) { }
    }
}

async function manejarRecepcionCredencialSolicitudMedianoPlazo(usuario, msg) {
    try {
        // 1. Descargar la imagen de la credencial enviada por el usuario
        const buffer = await downloadWithRetry(msg);
        const fileName = `credencial_IPE_${Date.now()}.jpg`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, buffer);

        console.log(`Credencial IPE (solicitante) guardada en: ${filePath}`);

        // Enviar mensaje de confirmación para evitar que el usuario envíe más mensajes
        await sock.sendMessage(usuario.remitente, {
            text: '✅ Recibí tu credencial, por favor espera mientras la analizo..'
        });

        // 2. Analizar la credencial usando OCR para extraer afiliación/pensión y folio
        const { afiliacion, pension, folio } = await analizarCredencial(filePath);

        // 3. Determinar el identificador (afiliacion si es 'activo', pension si es 'pensionado')
        const identificador = usuario.tipo === 'activo' ? afiliacion : pension;

        if (identificador && folio) {
            console.log('Afiliación/Pensión detectada:', identificador);
            console.log('Folio detectado:', folio);

            // Convertir a números
            const numAfiliacion = parseInt(identificador, 10);
            const folioNumber = parseInt(folio, 10);

            // Determinar el tipo de derechohabiente ('A' o 'P')
            const tipoDerechohabiente = usuario.tipo === 'activo' ? 'A' : 'P';

            // 4. Llamar a la API para obtener datos del solicitante
            const datosUsuarioAPI = await consultarDatosUsuarioAPI(numAfiliacion, tipoDerechohabiente, folioNumber);

            if (datosUsuarioAPI) {
                // 5. Guardar los datos obtenidos en el usuario
                usuario.datosUsuario = datosUsuarioAPI;
                usuario.folio = folioNumber; // Guardamos el folio en el usuario

               // 6. En lugar de pedir la credencial del aval de inmediato, preguntamos cuántos avales registrará
                await sock.sendMessage(usuario.remitente, {
                    text: 
                        '🔢 ¿Cuántos avales deseas registrar?\n' +
                        '1️⃣ *Uno*\n' +
                        '2️⃣ *Dos*\n' +
                        '3️⃣ *Tres*\n\n' +
                        'Por favor, responde con el número correspondiente (1-3).'
                });

                // 7. Cambiar el estado para manejar la respuesta sobre cuántos avales
                usuario.estadoConversacion = 'esperandoNumeroAvalesMedianoPlazo';

            } else {
                // Si la API no encontró registro
                await sock.sendMessage(usuario.remitente, {
                    text: '⚠️ No se encontró un registro con los datos proporcionados. Por favor, verifica tu información o comunícate con soporte.'
                });
            }

        } else {
            // ===== OCR FALLÓ → Pedimos afiliación / folio manual =====
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No pude leer claramente tu credencial.\n\n` +
                    `✏️ *Por favor, escribe en un solo mensaje tu afiliación/pensión y tu folio separados por espacio.*\n` +
                    `Ejemplo:\n12345 678901`
            });
            usuario.estadoPrevio = 'esperandoCredencialSolicitudMedianoPlazo';
            usuario.estadoConversacion = 'esperandoAfiliacionFolioManual';
            return;
        }

    } catch (error) {
        console.error('Error en manejarRecepcionCredencialSolicitudMedianoPlazo:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al procesar tu credencial. Inténtalo de nuevo más tarde.'
        });
    }
}

async function manejarEstadoEsperandoNumeroAvalesMedianoPlazo(usuario, mensajeNormalizado) {
    // Aceptar sólo '1', '2' o '3'
    if (['1', '2', '3'].includes(mensajeNormalizado)) {
        const numeroAvales = parseInt(mensajeNormalizado, 10);

        // Guardar en el usuario la cantidad
        usuario.numeroAvales = numeroAvales;
        // Inicializar un array vacío donde iremos guardando los datos de cada aval
        usuario.datosAvales = [];

        // Pedir la credencial del primer aval
        await sock.sendMessage(usuario.remitente, {
            text: `Perfecto, registrarás *${numeroAvales} aval(es)*.\n\nPor favor, envíame la credencial IPE del primer aval.`
        });

        // Cambiamos al estado “esperandoCredencialAvalMedianoPlazo1”
        usuario.estadoConversacion = 'esperandoCredencialAvalMedianoPlazo1';

    } else {
        // El usuario no respondió con 1,2,3
        await sock.sendMessage(usuario.remitente, {
            text: '⚠️ Por favor, responde con 1, 2 o 3 para indicar cuántos avales registrarás.'
        });
    }
}
async function llenarSolicitudPDFMedianoVariosAvales(usuario) {
    try {
        // Extraemos datos: información del solicitante, arreglo de avales, afiliación y folio
        const { datosUsuario, avales, afiliacionSolicitante, folioSolicitante } = usuario.datosSolicitudPendiente;

        // Ruta a la plantilla PDF que contiene los campos para solicitante y varios avales
        const pdfTemplatePath = path.join(__dirname, 'PMP2025.pdf');

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
        avales.forEach((aval, index) => {
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
        const fileName = `solicitud_mediano_plazo_${afiliacionSolicitante}_${Date.now()}.pdf`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, pdfBytes);

        // Leer el PDF generado en un buffer y enviarlo
        const pdfBuffer = fs.readFileSync(filePath);
        await sock.sendMessage(usuario.remitente, {
            document: pdfBuffer,
            fileName: fileName,
            mimetype: 'application/pdf',
            caption: 'Aquí está tu solicitud de préstamo a mediano plazo completada con tus aval(es). Por favor, revisa la información.'
        });

        // Actualizar el estado del usuario a menú principal
        usuario.estadoConversacion = 'menuPrincipal';
        console.log('Solicitud de préstamo a mediano plazo generada y enviada exitosamente.');

    } catch (error) {
        console.error('Error al generar el PDF de Mediano Plazo:', error);
        await sock.sendMessage(usuario.remitente, {
            text: 'Hubo un error al generar tu solicitud de préstamo a mediano plazo. Inténtalo de nuevo más tarde.'
        });
    }
}

async function manejarEstadoConfirmacionMedianoVariosAvales(usuario, mensajeNormalizado) {
    if (mensajeNormalizado === 'si' || mensajeNormalizado === 'sí') {
        // Llamar a la función que llena el PDF con un número variable de avales
        await llenarSolicitudPDFMedianoVariosAvales(usuario);
        await sock.sendMessage(usuario.remitente, {
            text: '✅ Tu solicitud de préstamo a mediano plazo ha sido procesada exitosamente. ¡Gracias!'
        });

        // Limpiar datos y regresar a menú
        usuario.estadoConversacion = 'menuPrincipal';
        delete usuario.datosUsuario;
        delete usuario.datosAvales;
        delete usuario.numeroAvales;
        delete usuario.folio;

    } else if (mensajeNormalizado === 'no') {
        await sock.sendMessage(usuario.remitente, {
    text: `❌ Tu solicitud ha sido cancelada.

📋 Si deseas corregir algún dato o iniciar otro trámite, por favor escribe \`menú\` para regresar al inicio y seleccionar una nueva opción.

👩‍💼 También puedes elegir la opción *Hablar con un Asesor* si necesitas asistencia personalizada.`
});
        usuario.estadoConversacion = 'menuPrincipal';
        // Limpieza de datos
        delete usuario.datosUsuario;
        delete usuario.datosAvales;
        delete usuario.numeroAvales;
        delete usuario.folio;
    } else {
        await sock.sendMessage(usuario.remitente, {
            text: 'Por favor, responde *SI* para confirmar o *NO* para cancelar.'
        });
    }
}

// Función para enviar encuestas de satisfacción
let isSendingEncuestas = false;

async function sendEncuestas(sockInstance) {
    if (isSendingEncuestas) return; // Evitar múltiples instancias
    isSendingEncuestas = true;

    console.log('Iniciando el envío de encuestas...');

    while (solicitandoEncuestas.length > 0) {
        const contacto = solicitandoEncuestas.shift();
        const { nombre, telefono, mensajePersonalizado } = contacto;
        const archivo = contacto.archivo; // Obtenemos el archivo si existe

        // Normalizar el número de teléfono
        let telefonoNormalizado = telefono.replace(/\D/g, ''); // Eliminar caracteres no numéricos
        if (!telefonoNormalizado.startsWith('521')) {
            telefonoNormalizado = '521' + telefonoNormalizado;
        }
        const jid = `${telefonoNormalizado}@s.whatsapp.net`;

        // Personalizar el mensaje
        const mensaje = mensajePersonalizado;

        try {
            if (archivo) {
                // Verificar si es una imagen y enviar como imagen
                if (archivo.mimetype.startsWith('image/')) {
                    // Leer el archivo de la imagen
                    const buffer = fs.readFileSync(archivo.path);

                    // Enviar la imagen como mensaje (desactivar vista previa de enlaces)
                    await sockInstance.sendMessage(
                        jid,
                        {
                            image: buffer,
                            caption: mensaje,
                            mimetype: archivo.mimetype
                        },
                        { createLinkPreview: false }   // desactivar vista previa de enlaces
                    );

                    console.log(`Encuesta con imagen enviada a ${nombre} (${telefonoNormalizado})`);
                } else {
                    // Si no es imagen, enviar como documento normal (desactivar vista previa de enlaces)
                    const buffer = fs.readFileSync(archivo.path);
                    await sockInstance.sendMessage(
                        jid,
                        {
                            document: buffer,
                            mimetype: archivo.mimetype,
                            fileName: archivo.originalname,
                            caption: mensaje
                        },
                        { createLinkPreview: false }   // desactivar vista previa de enlaces
                    );

                    console.log(`Encuesta con archivo enviada a ${nombre} (${telefonoNormalizado})`);
                }
            } else {
                // Enviar solo el mensaje si no hay archivo
                // Desactivar la vista previa para evitar el require de link-preview-js
                await sockInstance.sendMessage(
                    jid,
                    { text: mensaje },
                    { createLinkPreview: false }   // 👈 evitar dependencia extra
                );
                console.log(`Encuesta enviada a ${nombre} (${telefonoNormalizado})`);
            }
        } catch (error) {
            console.error(`Error al enviar encuesta a ${nombre} (${telefonoNormalizado}):`, error);
        }

        // Esperar 20 segundos antes de enviar el siguiente mensaje
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    console.log('Finalizado el envío de encuestas.');
    isSendingEncuestas = false;
}

let sock; // Definimos `sock` en un contexto más amplio


// 1) Levantar el servidor Express UNA SOLA VEZ
server.listen(port, (err) => {
    if (err) {
        console.error(`Error al intentar escuchar en el puerto ${port}: ${err.message}`);
    } else {
        console.log(`Servidor escuchando en http://localhost:${port}`);
    }
});

// 2) Definir la función “iniciarBot()” SOLO para manejar Baileys
async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({
        auth: state,
        logger, // suppress INFO logs like "Closing open session..."
    });

    // Manejo de eventos de conexión y reconexión robusta
    const { DisconnectReason } = require('@whiskeysockets/baileys')
    const qrcode = require('qrcode-terminal')

        // --- Listener unificado con back-off controlado ---
    sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
        if (qr) qrcode.generate(qr, { small: true });

        if (connection === 'open') {
            console.log('✅ Conectado 👍');
            retry = 0;                         // reinicia back-off global
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;

            console.warn(`Conexión cerrada (código ${code})`);

            if (shouldReconnect) {
                const delay = nextDelay();
                console.log(`Reconectando en ${delay} ms…`);
                safeReinit(delay);             // evita bucles infinitos
            } else {
                console.log('Sesión terminada — no se reconectará.');
            }
        }
    });
    // ---------------------------------------------------

    sock.ev.on('creds.update', saveCreds);


    // Función para suspender una conversación
    function suspenderConversacion(remitente) {
        const usuario = usuarios[remitente];
        if (usuario) {
            usuario.conversacionSuspendida = true;
            // Eliminado el setTimeout para mantener la conversación suspendida indefinidamente
            console.log(`Conversación suspendida con ${remitente} hasta que el asesor la atienda.`);
        }
    }

    // ==== Helpers de envío / presencia ====
    function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function enviarMenuPrincipal(usuario) {
        const nombre = usuario?.nombre || '';
        const menuMensaje =
            `🤖 *¿En qué más puedo ayudarte, ${nombre}?*\n\n` +
            `1️⃣ *Requisitos y Formatos*\n` +
            `2️⃣ *Simulación*\n` +
            `3️⃣ *Llenado de Solicitud*\n` +
            `4️⃣ *Comprobante de Préstamo*\n` +
            `5️⃣ *Asesor*\n` +
            `6️⃣ *Preguntas Frecuentes*\n\n` +
            `Por favor, responde con el número o el nombre de la opción que deseas.`;
        await sock.sendMessage(usuario.remitente, { text: menuMensaje });
    }


    // --- Handler robusto para messages.upsert: procesa TODOS los mensajes del lote ---
    async function processUpsertMessage(msg) {
        // Declaramos la variable para evitar TDZ
        let mensajeNormalizado = '';

        // 🚫 Detectar intento de llamada y responder automáticamente
        if (!msg.message) return;
        if (msg.message?.protocolMessage?.type === 3) {
            const caller = msg.key.remoteJid;

            const hora = new Date().getHours();
            let saludo = 'días';
            if (hora >= 12 && hora < 19) saludo = 'tardes';
            else if (hora >= 19 || hora < 5) saludo = 'noches';

            await sock.sendMessage(caller, {
                text: `📞 Detecté que intentaste realizar una llamada.\nPor este medio solo puedo atenderte por mensajes de texto, pero estaré encantado de ayudarte. 💬\n\nBuenas ${saludo} 🌞\n\n💬 Gracias por comunicarte con el Departamento de Prestaciones Económicas del Instituto de Pensiones del Estado.\n\n👩‍💻 Soy IPEBOT, tu asistente virtual inteligente 🤖 y estoy aquí para ayudarte en lo que necesites.\n\n🔒 *Aviso de Privacidad:*\nYa conoces nuestro Aviso de Privacidad, donde explicamos cómo protegemos y usamos tus datos personales.\nConsulta la política vigente en: https://www.veracruz.gob.mx/ipe/transparencia/sistema-de-datos-personales/\n\n💁‍♂️ ¿Podrías decirme tu nombre para brindarte una mejor atención?`
            });
            return;
        }

        // Variable de texto declarada antes de cualquier uso
        let mensajeTexto = '';
        // --- Captura de adjuntos (imagen o documento) --------------------
        let extraPayload = {};
        if (msg.message?.imageMessage) {
            // Descargar imagen con autenticación de Baileys para evitar 403
            const buffer = await downloadWithRetry(msg);
            const fileName = `${msg.key.id}.jpg`;
            fs.writeFileSync(path.join(mediaDir, fileName), buffer);
            mensajeTexto = '[imagen]';
            extraPayload = {
                fileUrl: `${BASE_URL}/media/${fileName}`,
                mime: 'image/jpeg'
            };
        } else if (msg.message?.documentMessage) {
            // Descargar documento con autenticación de Baileys para evitar 403
            const doc = msg.message.documentMessage;
            const ext = (doc.fileName?.split('.').pop() || 'pdf').toLowerCase();
            const buffer = await downloadWithRetry(msg);
            const fileName = `${msg.key.id}.${ext}`;
            fs.writeFileSync(path.join(mediaDir, fileName), buffer);
            mensajeTexto = `[archivo ${ext}]`;
            extraPayload = {
                fileUrl: `${BASE_URL}/media/${fileName}`,
                mime: doc.mimetype || 'application/octet-stream'
            };
        }

        // Obtener y normalizar el texto solo si aún no fue establecido por un adjunto
        if (!mensajeTexto) {
            mensajeTexto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        }
        mensajeNormalizado = normalizarTexto(mensajeTexto);
        const remitente = msg.key.remoteJid;

        // Ignorar mensajes del bot mismo o mensajes vacíos
        if (msg.key.fromMe || !msg.message) return;

        // Control de acceso: modo público o lista blanca
        // Si PUBLIC_MODE=1 (en variables de entorno), el bot atiende a cualquier número.
        // Si NO está en modo público, se aplica la lista blanca de `numerosPermitidos`.
        const PUBLIC_MODE = process.env.PUBLIC_MODE === '1';
        if (!PUBLIC_MODE) {
            const numerosPermitidos = [
                '5212281248122@s.whatsapp.net',
                '5212288603598@s.whatsapp.net',
                '5212281723701@s.whatsapp.net',
                '5212281981209@s.whatsapp.net',
                '5212282100854@s.whatsapp.net',
                '5212281760476@s.whatsapp.net',
                '5212281330101@s.whatsapp.net',
                '5212283667029@s.whatsapp.net',
                '5212281579734@s.whatsapp.net',
                '5212217352431@s.whatsapp.net',
                '5212283160231@s.whatsapp.net',
                '5212283345271@s.whatsapp.net',
                '5212288384386@s.whatsapp.net',
                '5212281180941@s.whatsapp.net',
                '5212281491000@s.whatsapp.net',
                '5212791240918@s.whatsapp.net',
                '5212281189323@s.whatsapp.net',
                '5212282107163@s.whatsapp.net',
                '5212281460286@s.whatsapp.net',
                '5212281482311@s.whatsapp.net',
                '5212283608063@s.whatsapp.net',
                '5212287549835@s.whatsapp.net',
                '5212283340693@s.whatsapp.net',
                '5212285223734@s.whatsapp.net',
                '5212281821110@s.whatsapp.net',
                '5212281223208@s.whatsapp.net',
                '5212722620655@s.whatsapp.net',
                '5212281388840@s.whatsapp.net',
                '5219721017739@s.whatsapp.net',
                '5212283565237@s.whatsapp.net',
                '5212281699166@s.whatsapp.net',
                '5212283603293@s.whatsapp.net',
                '5212288588652@s.whatsapp.net',
                '5212281264606@s.whatsapp.net',
                // Agrega más números si es necesario
            ];
            if (!numerosPermitidos.includes(remitente)) {
                return;
            }
        }

        // Extraer el número de teléfono desde el JID (remitente)
        const telefono = remitente.split('@')[0]; // Remover la parte '@s.whatsapp.net'

        // Obtener o crear el usuario
        if (!usuarios[remitente]) {
            usuarios[remitente] = new Usuario(remitente);
        }
        const usuario = usuarios[remitente];

        // Asignar el teléfono al usuario
        usuario.telefono = obtenerNumeroCelular(remitente); // Número de celular extraído

        // Guardar el usuario en la base de datos
        const usuarioId = await guardarUsuario(usuario);
        if (usuarioId) {
            usuario.id = usuarioId; // Asignar el ID al objeto usuario
        } else {
            console.error('Error: No se pudo guardar el usuario.');
            return null;
        }

        // Continuar con otras operaciones como guardar interacciones, etc.
        await guardarInteraccion(usuarioId, msg.message.conversation, 'recibido');

        // Actualizar la última interacción
        usuario.ultimaInteraccion = new Date();

        // Verificar si la conversación está suspendida
        if (usuario.conversacionSuspendida) {
            console.log(`Conversación suspendida con ${usuario.remitente}, no se responderá al mensaje.`);

            // Registrar y emitir el texto al dashboard, incluso suspendido
            const textoParaGuardar = mensajeNormalizado || mensajeTexto || '';
            // Pasar remitente y teléfono para evitar consultas extra dentro de guardarMensaje
            extraPayload.remitente = remitente;
            extraPayload.telefono = usuario.telefono || obtenerNumeroCelular(remitente);
            await guardarMensaje(usuarioId, textoParaGuardar, 'in', extraPayload);

            return;   // evitamos la respuesta automática
        }

        // Registrar el mensaje entrante en la tabla "mensajes" y enviarlo al dashboard
        // Pasar remitente/telefono para evitar consultas extra dentro de guardarMensaje
        extraPayload.remitente = remitente;
        extraPayload.telefono = usuario.telefono || obtenerNumeroCelular(remitente);
        await guardarMensaje(usuarioId, mensajeNormalizado, 'in', extraPayload);

        // Log en consola solo si se solicita explícitamente
        if (process.env.VERBOSE_LOG === '1') {
            console.log(`Mensaje recibido de ${remitente}: ${mensajeNormalizado}`);
        }

        // Manejar la recepción de archivos (documentos e imágenes)
        if (usuario.estadoConversacion === 'esperandoCredencialSolicitud') {
            await manejarRecepcionCredencialSolicitud(usuario, msg);
            return;
        }

        if (msg.message?.documentMessage) {
            if (usuario.estadoConversacion === 'solicitandoEstadoCuenta') {
                await manejarRecepcionEstadoCuenta(usuario, msg);
                return;
            }
        }

        // --- Intento de cancelación: soportar múltiples variantes comunes ---
        const CANCEL_KEYWORDS = [
          'cancelar', 'cancela', 'cancel',
          'anular', 'anula',
          'detener', 'deten',
          'parar',
          'stop',
          'terminar',
          'salir',
          'reiniciar', 'reset'
        ];
        const esIntentoCancelar = (t) => {
          const txt = (t || '').toLowerCase();
          return CANCEL_KEYWORDS.some(k => txt.includes(k));
        };
        if (esIntentoCancelar(mensajeNormalizado)) {
            // Estados base donde NO hay flujo que cancelar
            const estadosNoCancelables = new Set([
                'inicio',
                'esperandoNombre',
                'esperandoTipoUsuario',
                'menuPrincipal'
            ]);

            if (estadosNoCancelables.has(usuario.estadoConversacion)) {
                await sock.sendMessage(usuario.remitente, {
                    text: '⚠️ No hay una operación en curso que cancelar. Escribe *menú* para ver opciones.'
                });
                return;
            }

            // Sí hay un flujo activo → limpiar estado temporal
            try {
                delete usuario.tipoPrestamo;
                delete usuario.estadoPrevio;
                delete usuario.datosSolicitudPendiente;
                delete usuario.datosUsuario;
                delete usuario.datosAval;
                delete usuario.datosAvales;
                delete usuario.pendingAvalIndex;
                delete usuario.numeroAvales;
                delete usuario.afiliacionAval;
                delete usuario.folioAval;
                delete usuario.folio;
            } catch (_) {}

            usuario.estadoConversacion = 'menuPrincipal';

            // 1) Aviso de cancelación
            await sock.sendMessage(usuario.remitente, { text: '❌ Operación cancelada.' });

            // 2) Simular que está escribiendo y esperar ~0.8s (opcional)
            try {
                await sock.presenceSubscribe(usuario.remitente);
                await sock.sendPresenceUpdate('composing', usuario.remitente);
                await esperar(800);
                await sock.sendPresenceUpdate('paused', usuario.remitente);
            } catch (_) {}

            // 3) Menú principal
            await enviarMenuPrincipal(usuario);
            return;
        }

        if (mensajeNormalizado.includes('requisitos')) {
            await solicitarTipoPrestamo(usuario);
            return;
        }

        if (mensajeNormalizado.includes('simulacion') || mensajeNormalizado.includes('simulación')) {
            await iniciarSimulacionPrestamo(usuario);
            return;
        }

        if (mensajeNormalizado.includes('asesor')) {
            await transferirAAasesor(usuario);
            return;
        }

        // Manejar los diferentes tipos de mensajes según el estado
        await manejarEstadosDeConversacion(usuario, mensajeNormalizado, msg);
    }

    // Nuevo listener que itera todos los mensajes del upsert y des-encapsula efímeros
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        for (const rawMsg of messages) {
            try {
                // Ignora mensajes sin contenido o de "estados"
                if (!rawMsg?.message) continue;
                if (rawMsg.key?.remoteJid === 'status@broadcast') continue;

                // Desencapsular ephemeral / viewOnce si vienen así
                const content =
                    rawMsg.message?.ephemeralMessage?.message ||
                    rawMsg.message?.viewOnceMessageV2?.message ||
                    rawMsg.message;

                const msg = { ...rawMsg, message: content };

                await processUpsertMessage(msg);
            } catch (err) {
                console.error('Error en processUpsertMessage:', err);
            }
        }
    });

    // Manejar llamadas entrantes mediante el evento 'call'
/*sock.ev.on('call', async (callUpdate) => {
    for (const call of callUpdate) {
        const caller = call.from;

        // Validar si el número está en la lista permitidos
        const numerosPermitidos = [
            '5212281248122@s.whatsapp.net',
            '5212288603598@s.whatsapp.net',
            '5212281723701@s.whatsapp.net',
            '5212281981209@s.whatsapp.net',
            '5212282100854@s.whatsapp.net',
            '5212281760476@s.whatsapp.net',
            '5212281330101@s.whatsapp.net',
            '5212283667029@s.whatsapp.net',
            '5212281579734@s.whatsapp.net',
            '5212217352431@s.whatsapp.net',
            '5212283160231@s.whatsapp.net',
            '5212283345271@s.whatsapp.net',
            '5212288384386@s.whatsapp.net',
            '5212281180941@s.whatsapp.net',
            '5212281491000@s.whatsapp.net',
            '5212791240918@s.whatsapp.net',
            '5212281189323@s.whatsapp.net'
        ];

        if (!numerosPermitidos.includes(caller)) {
            return;
        }

        // Si ya respondimos recientemente, ignorar
        if (llamadasRecientes.has(caller)) {
            return;
        }

        // Marcar como atendido temporalmente
        llamadasRecientes.add(caller);
        setTimeout(() => llamadasRecientes.delete(caller), 80000); 

        const hora = new Date().getHours();
        let saludo = 'días';
        if (hora >= 12 && hora < 19) saludo = 'tardes';
        else if (hora >= 19 || hora < 5) saludo = 'noches';

        await sock.sendMessage(caller, {
            text: `📞 Detecté que intentaste realizar una llamada.\nPor este medio solo puedo atenderte por mensajes de texto, pero estaré encantado de ayudarte. 💬\n\nBuenas ${saludo} 🌞\n\n💬 Gracias por comunicarte con el Departamento de Prestaciones Económicas del Instituto de Pensiones del Estado.\n\n👩‍💻 Soy IPEBOT, tu asistente virtual inteligente 🤖 y estoy aquí para ayudarte en lo que necesites.\n\n🔒 *Aviso de Privacidad:*\nYa conoces nuestro Aviso de Privacidad, donde explicamos cómo protegemos y usamos tus datos personales.\nConsulta la política vigente en: https://www.veracruz.gob.mx/ipe/transparencia/sistema-de-datos-personales/\n\n💁‍♂️ ¿Podrías decirme tu nombre para brindarte una mejor atención?`
        });
    }
});  */


    //
    // Manejar los diferentes estados de conversación
    //
    async function manejarEstadosDeConversacion(usuario, mensajeNormalizado, msg) {
        switch (usuario.estadoConversacion) {
            // Estado inicial, saludo y pedir nombre
            case 'inicio':
                await manejarEstadoInicio(usuario);
                break;

            // Esperar a que el usuario responda con su nombre
            case 'esperandoNombre':
                await manejarEstadoEsperandoNombre(usuario, mensajeNormalizado);
                break;
            case 'confirmandoNombre':
                await manejarEstadoConfirmandoNombre(usuario, mensajeNormalizado);
                break;

            // Pregunta si es activo o pensionado
            case 'esperandoTipoUsuario':
                await manejarEstadoEsperandoTipoUsuario(usuario, mensajeNormalizado);
                break;

            // Menú principal (según lo definido en el flujo)
            case 'menuPrincipal':
                await manejarEstadoMenuPrincipal(usuario, mensajeNormalizado);
                break;

            // Esperando confirmación de si quiere seguir con la simulación
            case 'esperandoConfirmacionSimulacion':
                await manejarEstadoEsperandoConfirmacionSimulacion(usuario, mensajeNormalizado);
                break;


            case 'solicitandoCredencial':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencial(usuario, msg);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía una foto clara de tu credencial IPE para la simulación.'
                    });
                }
                break;

            // Esperando credencial para Simulación de Pensionados
            case 'esperandoCredencialSimulacionPensionado':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencialSimulacionPensionado(usuario, msg);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía una foto clara de tu credencial IPE vigente para continuar con la simulación.'
                    });
                }
                break;

            // Esperando confirmación final al llenar la solicitud (Corto Plazo sin aval)
            case 'esperandoConfirmacionSolicitud':
                await manejarEstadoEsperandoConfirmacionSolicitud(usuario, mensajeNormalizado);
                break;

            // El usuario ya eligió Requisitos/Formatos → pregunta tipo de préstamo (Corto/Mediano)
            case 'esperandoTipoPrestamo':
                await manejarEstadoEsperandoTipoPrestamo(usuario, mensajeNormalizado);
                break;

            // Para simulación de Activos: preguntar en qué banco cobra
            case 'solicitandoBanco':
                await manejarEstadoSolicitandoBanco(usuario, mensajeNormalizado);
                break;

            // Esperando que envíe el estado de cuenta (PDF o imagen) para simulación
            case 'solicitandoEstadoCuenta':
                if (msg.message?.documentMessage || msg.message?.imageMessage) {
                    await manejarRecepcionEstadoCuenta(usuario, msg);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía tu estado de cuenta en formato PDF o una imagen clara.'
                    });
                }
                break;

            // Iniciar el llenado de solicitud
            case 'inicioLlenadoSolicitud':
                await iniciarLlenadoSolicitud(usuario);
                break;

            // Esperar a que elija si la solicitud es Corto Plazo o Mediano Plazo
            case 'esperandoTipoPrestamoLlenado':
                await manejarEstadoEsperandoTipoPrestamoLlenado(usuario, mensajeNormalizado);
                break;

            // =========================
            // Mediano Plazo
            // =========================

            // Esperando la credencial del solicitante para Mediano Plazo
            case 'esperandoCredencialSolicitudMedianoPlazo':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencialSolicitudMedianoPlazo(usuario, msg);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envíame una foto clara de tu credencial IPE para continuar con el llenado de la solicitud.'
                    });
                }
                break;

            // Mediano Plazo con aval único (versión simple)
            case 'esperandoCredencialAvalMedianoPlazo':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencialAvalMedianoPlazo(usuario, msg);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía una foto clara de la credencial IPE de tu aval para continuar.'
                    });
                }
                break;

            // Para múltiples avales: preguntar cuántos avales se van a registrar
            case 'esperandoNumeroAvalesMedianoPlazo':
                await manejarEstadoEsperandoNumeroAvalesMedianoPlazo(usuario, mensajeNormalizado);
                break;

            // Esperando la credencial del Aval #1
            case 'esperandoCredencialAvalMedianoPlazo1':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencialAvalMedianoN(usuario, msg, 1);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía la credencial IPE del primer aval.'
                    });
                }
                break;

            // Esperando la credencial del Aval #2
            case 'esperandoCredencialAvalMedianoPlazo2':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencialAvalMedianoN(usuario, msg, 2);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía la credencial IPE del segundo aval.'
                    });
                }
                break;

            // Esperando la credencial del Aval #3
            case 'esperandoCredencialAvalMedianoPlazo3':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencialAvalMedianoN(usuario, msg, 3);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía la credencial IPE del tercer aval.'
                    });
                }
                break;

            // Confirmación final de la solicitud con varios avales
            case 'esperandoConfirmacionSolicitudMedianoPlazoConVariosAvales':
                await manejarEstadoConfirmacionMedianoVariosAvales(usuario, mensajeNormalizado);
                break;

            // Confirmación final con un solo aval (versión simple)
            case 'esperandoConfirmacionSolicitudMedianoPlazo':
                await manejarEstadoEsperandoConfirmacionSolicitudMedianoPlazo(usuario, mensajeNormalizado);
                break;

            // =========================
            // Corto Plazo con aval (solicitante no cumple 10 años)
            // =========================

            case 'esperandoCredencialAvalCortoPlazo':
                if (msg.message?.imageMessage) {
                    await manejarRecepcionCredencialAvalCortoPlazo(usuario, msg);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envía una foto clara de la credencial IPE de tu aval para continuar.'
                    });
                }
                break;

            // Confirmación final en Corto Plazo si se añade aval
            case 'esperandoConfirmacionSolicitudConAvalActivo':
                await manejarEstadoEsperandoConfirmacionSolicitudConAvalActivo(usuario, mensajeNormalizado);
                break;

            // =========================
            // Comprobante de préstamo
            // =========================

            case 'solicitandoCredencialComprobante':
                if (
                    msg.message?.imageMessage ||
                    (msg.message?.documentMessage && msg.message?.documentMessage.mimetype.startsWith('image/'))
                ) {
                    await manejarRecepcionCredencialComprobante(usuario, msg);
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Por favor, envíame una foto clara de tu credencial IPE para generar el comprobante de tu préstamo.'
                    });
                }
                break;

            // =========================
            // Captura manual de afiliación/folio (solicitante)
            // =========================
            case 'esperandoAfiliacionFolioManual':
                await manejarEstadoEsperandoAfiliacionFolioManual(usuario, mensajeNormalizado);
                break;

            case 'esperandoAfiliacionFolioManualSolicitud':
                await manejarEstadoEsperandoAfiliacionFolioManualSolicitud(usuario, mensajeNormalizado);
                break;

            // =========================
            // Captura manual de afiliación/folio para aval manual en solicitud
            // =========================
            case 'esperandoAfiliacionFolioAvalManualSolicitud':
                await manejarEstadoEsperandoAfiliacionFolioAvalManualSolicitud(usuario, mensajeNormalizado);
                break;

            // =========================
            // Captura manual de afiliación/folio para aval
            // =========================
            case 'esperandoAfiliacionFolioManualAval':
                await manejarEstadoEsperandoAfiliacionFolioManualAval(usuario, mensajeNormalizado);
                break;

            // =========================
            // Captura manual de comprobante
            // =========================
            case 'esperandoNumeroComprobanteManual':
                await manejarEstadoEsperandoNumeroComprobanteManual(usuario, mensajeNormalizado);
                break;

            // Captura manual de número de afiliación/pensión
            case 'esperandoNumeroAfiliacionManual':
                await manejarEstadoEsperandoNumeroAfiliacionManual(usuario, mensajeNormalizado);
                break;


            // =========================
            // Caso por defecto
            // =========================
            default:
                await manejarEstadoPorDefecto(usuario);
                break;
        }
    }



    async function iniciarLlenadoSolicitud(usuario) {
        await sock.sendMessage(usuario.remitente, {
            text: `📝 *Llenado de Solicitud de Préstamo*:\n\nPor favor, indica el tipo de préstamo para el cual deseas llenar la solicitud:\n\n1️⃣ Corto Plazo\n2️⃣ Mediano Plazo`
        });
        usuario.estadoConversacion = 'esperandoTipoPrestamoLlenado';
    }


    // Funciones de manejo de estados y acciones

    async function manejarEstadoInicio(usuario) {
        const saludo = `${obtenerSaludo()}

💬 _Gracias por comunicarte con el *Departamento de Prestaciones Económicas* del *Instituto de Pensiones del Estado*_.

👩‍💻 Soy *IPEBOT*, tu *asistente virtual inteligente* 🤖 y estoy aquí para ayudarte en lo que necesites.

💁‍♂️ *¿Podrías decirme tu nombre para brindarte una mejor atención?*

🔒 *Aviso de Privacidad:*
Ya conoces nuestro Aviso de Privacidad.
Consulta la política vigente en: https://www.veracruz.gob.mx/ipe/transparencia/sistema-de-datos-personales/`;
        await sock.sendMessage(usuario.remitente, { text: saludo });
        usuario.estadoConversacion = 'esperandoNombre';
    }

    // 1. Función para eliminar frases introductorias y limpiar texto (solo letras/espacios)
    function extraerNombre(rawText) {
        if (!rawText) return '';
        let textoOriginal = String(rawText).trim();
        const lower = textoOriginal.toLowerCase();

        // Si es un placeholder de adjunto, no es nombre
        if (lower.includes('[imagen]') || lower.startsWith('[archivo')) return '';

        // Eliminar frases introductorias comunes
        let t = lower
            .replace(/^\s*mi nombre es\s+/i, '')
            .replace(/^\s*me llamo\s+/i, '')
            .replace(/^\s*soy\s+/i, '')
            .replace(/^\s*nombre\s*:?\s*/i, '')
            .replace(/^\s*se llama\s+/i, '')
            .trim();

        // Dejar solo letras (incluyendo acentos y ñ), espacios, apóstrofe y guion
        let limpio = t.replace(/[^a-záéíóúüñ'\-\s]/gi, ' ');
        // Normalizar espacios múltiples
        limpio = limpio.replace(/\s+/g, ' ').trim();
        return limpio;
    }

    // Conectores válidos en nombres hispanos (minúsculas)
    const CONECTORES_NOMBRE = new Set(['de','del','la','las','los','y','da','das','do','dos','van','von','san','santa','mc','mac','al']);

    // Lista corta de nombres comunes (minúsculas) para reducir falsos positivos
    const NOMBRES_COMUNES = new Set([
      'juan','jose','jose luis','maria','maria del carmen','maria guadalupe','luis','carlos','ana','laura','fernando','alejandra','alejandro','david','jorge','roberto','ricardo','daniel','antonio','eduardo','miguel','francisco','raquel','adriana','andrea','sofia','joel','omar','diego','ivan','hector','enrique','ruben','sergio','angel','jesus','israel','marco','martin','alberto','alfredo','gerardo','victor','ulises','oscar','hugo','gabriel','erick','noe','natalia','monica','veronica','patricia','karla','claudia','gloria','teresa','carmen','beatriz','mariana','paola','carolina','yolanda','nora','silvia','leticia','elena','angelica','edgar','cesar','armando','arturo','javier','mauricio','raul','agustin','yasmin','jimena','ximena','valeria','camila','renata','isabella','isabel','patricio','ignacio','nicolas','brenda','lourdes','dulce','fabiola','guillermo','benjamin','leonardo','emilia','emilio','alondra','constanza','belen','mateo','santiago','sebastian','lucia'
    ]);

    // Heurística adicional: marcar como "sospechoso" nombres inusuales
    function esNombreSospechoso(nombre) {
        if (!nombre) return true;
        const tokens = nombre.toLowerCase().split(/\s+/).filter(Boolean);
        const tokensNoCon = tokens.filter(t => !CONECTORES_NOMBRE.has(t));
        // Un solo token largo y no común → sospechoso
        if (tokensNoCon.length === 1) {
            const unico = tokensNoCon[0];
            if (!NOMBRES_COMUNES.has(unico) && unico.length >= 9) return true;
        } else {
            // 2+ tokens y ninguno coincide con nombres comunes → sospechoso (pero aceptable con confirmación)
            const matchComun = tokensNoCon.some(t => NOMBRES_COMUNES.has(t));
            if (!matchComun) return true;
        }
        return false;
    }

    // Valida que el nombre tenga forma razonable (sin números, con vocales, etc.)
    function esNombreValido(nombre) {
        if (!nombre) return { ok: false, motivo: 'vacío' };
        if (/\d/.test(nombre)) return { ok: false, motivo: 'contiene números' };
        if (nombre.length < 3 || nombre.length > 60) return { ok: false, motivo: 'longitud' };
        if (!/^[a-záéíóúüñ'\-\s]+$/i.test(nombre)) return { ok: false, motivo: 'caracteres no válidos' };

        const tokens = nombre.toLowerCase().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return { ok: false, motivo: 'sin tokens' };
        if (tokens.length > 6) return { ok: false, motivo: 'demasiados tokens' };

        const tokensNoConector = tokens.filter(t => !CONECTORES_NOMBRE.has(t));
        if (tokensNoConector.length === 0) return { ok: false, motivo: 'solo conectores' };

        // Reglas por token no conector
        for (const tk of tokensNoConector) {
            if (tk.length < 2) return { ok: false, motivo: 'token muy corto' };
            if (!/[aeiouáéíóúü]/i.test(tk)) return { ok: false, motivo: 'sin vocales' };
            if (/(.)\1{2,}/i.test(tk)) return { ok: false, motivo: 'repeticiones' };
        }

        // Heurística anti-garabatos: mínimo 25% vocales y sin 4 consonantes seguidas
        const lettersOnly = tokensNoConector.join('').replace(/[^a-záéíóúüñ]/gi, '');
        const total = lettersOnly.length;
        const vocales = (lettersOnly.match(/[aeiouáéíóúü]/gi) || []).length;
        if (total === 0 || (vocales / total) < 0.25) return { ok: false, motivo: 'pocas vocales' };
        if (/[bcdfghjklmnñpqrstvwxyz]{4,}/i.test(lettersOnly)) return { ok: false, motivo: 'muchas consonantes seguidas' };

        return { ok: true };
    }

    // 2. Función para capitalizar cada palabra (mantener conectores en minúsculas)
    function capitalizarTodasLasPalabras(str) {
        const tokens = String(str).toLowerCase().trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return '';
        const out = tokens.map((t, idx) => {
            if (idx > 0 && CONECTORES_NOMBRE.has(t)) return t; // conectores en minúsculas salvo al inicio
            // Capitalizar segmentos separados por guion o apóstrofe
            return t.split(/([\-'])/).map(seg => {
                if (seg === '-' || seg === "'") return seg;
                return seg.charAt(0).toUpperCase() + seg.slice(1);
            }).join('');
        });
        return out.join(' ');
    }

    // 3. Uso en manejarEstadoEsperandoNombre
async function manejarEstadoEsperandoNombre(usuario, mensajeTexto) {
  const lowerMsg = (mensajeTexto || '').toLowerCase().trim();

  // No aceptar adjuntos ni placeholders de adjuntos como nombre
  if (!lowerMsg || lowerMsg.includes('[imagen]') || lowerMsg.startsWith('[archivo')) {
    await sock.sendMessage(usuario.remitente, {
      text: '📛 *Solo texto, por favor.* Escribe tu *nombre y apellidos* (sin imágenes ni archivos PDF).'
    });
    return;
  }

  // 1) Limpiar frases tipo "mi nombre es" y quedarnos solo con letras/espacios
  let nombreCrudo = extraerNombre(mensajeTexto);

  // 2) Validación estricta del nombre
  const valid = esNombreValido(nombreCrudo);
  if (!valid.ok) {
    await sock.sendMessage(usuario.remitente, {
      text:
        `👤 *Por favor escribe tu nombre real.*\n` +
        `Ejemplos válidos: _María del Carmen_, _Juan José_.\n` +
        `No se aceptan números, emojis ni cadenas aleatorias.`
    });
    return; // seguimos pidiendo el nombre
  }

  // 3) Si el nombre parece inusual, pedir confirmación explícita
  const sospechoso = esNombreSospechoso(nombreCrudo);
  const nombreFinal = capitalizarTodasLasPalabras(nombreCrudo);

  if (sospechoso) {
    usuario.nombreTentativo = nombreFinal;
    usuario.estadoConversacion = 'confirmandoNombre';
    await sock.sendMessage(usuario.remitente, {
      text: `¿Confirmas que tu nombre es *${nombreFinal}*?\nResponde *SI* para confirmar o *NO* para volver a escribirlo.`
    });
    return;
  }

  // 4) Guardar el nombre y continuar
  usuario.nombre = nombreFinal;
  await sock.sendMessage(usuario.remitente, {
    text:
      `¡Hola, *${usuario.nombre}*! 😊\n` +
      `¿Eres Personal Activo o Pensionista?\n` +
      `Por favor, selecciona una opción:\n` +
      `1️⃣ Personal Activo\n` +
      `2️⃣ Pensionista`
  });
  usuario.estadoConversacion = 'esperandoTipoUsuario';
}
async function manejarEstadoConfirmandoNombre(usuario, mensajeNormalizado) {
  const ans = (mensajeNormalizado || '').trim();

  if (ans === 'si' || ans === 'sí') {
    const nombre = usuario.nombreTentativo || '';
    if (!nombre) {
      usuario.estadoConversacion = 'esperandoNombre';
      await sock.sendMessage(usuario.remitente, { text: 'Escribe tu nombre y apellidos.' });
      return;
    }
    usuario.nombre = nombre;
    delete usuario.nombreTentativo;
    usuario.estadoConversacion = 'esperandoTipoUsuario';
    await sock.sendMessage(usuario.remitente, {
      text:
        `¡Hola, *${usuario.nombre}*! 😊\n` +
        `¿Eres Personal Activo o Pensionista?\n` +
        `Por favor, selecciona una opción:\n` +
        `1️⃣ Personal Activo\n` +
        `2️⃣ Pensionista`
    });
    return;
  }

  if (ans === 'no') {
    delete usuario.nombreTentativo;
    usuario.estadoConversacion = 'esperandoNombre';
    await sock.sendMessage(usuario.remitente, {
      text: 'Entendido. Por favor, escribe tu *nombre*.'
    });
    return;
  }

  await sock.sendMessage(usuario.remitente, {
    text: 'Por favor responde *SI* para confirmar o *NO* para corregir tu nombre.'
  });
}

    async function manejarEstadoEsperandoTipoUsuario(usuario, mensajeNormalizado) {
        const input = (mensajeNormalizado || '').toLowerCase().trim();

        // Tokenizar por separadores no alfanuméricos para evitar matches parciales (ej. "inactivo" vs "activo")
        const tokens = input.split(/\W+/).filter(Boolean);

        // ¿El usuario escribió solo números? (evita que "233" cuente como "2")
        const soloNumeros = /^\d+$/.test(input);

        // Atajo: Asesor
        if ((soloNumeros && input === '5') || tokens.includes('asesor')) {
            await transferirAAasesor(usuario);
            return;
        }

        // Palabras clave por tipo (sin números para evitar includes parciales)
        const activeKeywords = ['activo', 'activa'];
        const pensionistaKeywords = ['pensionado', 'pensionada', 'jubilado', 'jubilada', 'pensionista'];

        let isActive = false;
        let isPensionista = false;

        if (soloNumeros) {
            // Respuestas estrictamente numéricas
            isActive = input === '1';
            isPensionista = input === '2';
        } else {
            // Coincidencia por tokens completos (no por subcadenas)
            isActive = tokens.some(t => activeKeywords.includes(t));
            isPensionista = tokens.some(t => pensionistaKeywords.includes(t));
        }

        if (isActive) {
            usuario.tipo = 'activo';
            await sock.sendMessage(usuario.remitente, {
                text: `🙌 *Gracias por la información, ${usuario.nombre}.*\n\nComo Personal Activo, ¿en qué puedo ayudarte hoy?\n\n1️⃣ *Requisitos y Formatos*\n2️⃣ *Simulación*\n3️⃣ *Llenado de Solicitud*\n4️⃣ *Comprobante de Préstamo*\n5️⃣ *Asesor*\n6️⃣ *Preguntas Frecuentes*`
            });
            usuario.estadoConversacion = 'menuPrincipal';
        } else if (isPensionista) {
            usuario.tipo = 'pensionado';
            await sock.sendMessage(usuario.remitente, {
                text: `🙌 *Gracias por la información, ${usuario.nombre}.*\n\nComo Pensionista, ¿en qué puedo ayudarte hoy?\n\n1️⃣ *Requisitos y Formatos*\n2️⃣ *Simulación*\n3️⃣ *Llenado de Solicitud*\n4️⃣ *Comprobante de Préstamo*\n5️⃣ *Asesor*\n6️⃣ *Preguntas Frecuentes*`
            });
            usuario.estadoConversacion = 'menuPrincipal';
        } else {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ *Por favor, indícame si eres Personal Activo o Pensionista, ${usuario.nombre}.*\n\nResponde con *1* para Personal Activo, *2* para Pensionista, o con *5* para hablar con un Asesor.`
            });
        }
    }



    async function manejarEstadoMenuPrincipal(usuario, mensajeNormalizado) {
        if (mensajeNormalizado.includes('asesor') || mensajeNormalizado === '5') {
            await transferirAAasesor(usuario);
        } else if (mensajeNormalizado.includes('simulacion') || mensajeNormalizado.includes('simulación') || mensajeNormalizado === '2') {
            await iniciarSimulacionPrestamo(usuario);
        } else if (mensajeNormalizado.includes('requisitos') || mensajeNormalizado === '1') {
            await solicitarTipoPrestamo(usuario);
        } else if (mensajeNormalizado.includes('llenado') || mensajeNormalizado.includes('solicitud') || mensajeNormalizado === '3') {
            await iniciarLlenadoSolicitud(usuario);
        } else if (mensajeNormalizado.includes('comprobante') || mensajeNormalizado === '4') {
            await iniciarComprobantePrestamo(usuario);
            //usuario.estadoConversacion = 'menuPrincipal';
        } else if (mensajeNormalizado.includes('faq') || mensajeNormalizado.includes('preguntas') || mensajeNormalizado === '6') {
            await mostrarPreguntasFrecuentes(usuario);
        } else {
            let mensajeOpciones = `🤖 *¿En qué más puedo ayudarte, ${usuario.nombre}?*\n\n`;
            mensajeOpciones += `1️⃣ *Requisitos y Formatos*\n`;
            mensajeOpciones += `2️⃣ *Simulación*\n`;
            mensajeOpciones += `3️⃣ *Llenado de Solicitud*\n`;
            mensajeOpciones += `4️⃣ *Comprobante de Préstamo*\n`;
            mensajeOpciones += `5️⃣ *Asesor*\n`;
            mensajeOpciones += `6️⃣ *Preguntas Frecuentes*\n\n`;
            mensajeOpciones += `Por favor, responde con el número o el nombre de la opción que deseas.`;

            await sock.sendMessage(usuario.remitente, { text: mensajeOpciones });
        }
    }

    async function mostrarPreguntasFrecuentes(usuario) {
        // Preguntas frecuentes con emojis
        const mensajeFAQ = `📚 *Preguntas Frecuentes*

🕐 _¿Cuál es el horario de atención?_  
Nuestro horario de atención es de lunes a viernes, de 8:00 AM a 3:00 PM.

📄 _¿Dónde puedo consultar el estado de cuenta de mi préstamo?_  
Para consultar tu estado de cuenta, comunícate con la *Oficina de Control y Adeudo*:  
Teléfono: (228) 141 0500, extensiones 1108, 1109 o 1110  
Correo electrónico: adeudosipe@veracruz.gob.mx

🔁 _¿Cómo puedo saber si soy candidato para renovar mi préstamo?_  
Debes haber cubierto al menos el 50% del préstamo que tienes actualmente.

💬 _¿Se puede tramitar el préstamo vía WhatsApp?_  
No, no es posible completar el trámite de préstamo por esta vía.

💰 _¿Cuál es el monto máximo del préstamo?_  
El importe varía según la situación de cada derechohabiente (antigüedad, capacidad de pago). Para conocer tu caso específico, te recomendamos consultar con un asesor.
`;

        const mensajeMenu = `⬅️ Puedes escribir \`menú\` para regresar al inicio y ver las opciones disponibles.`;

        await sock.sendMessage(usuario.remitente, { text: mensajeFAQ });
        await sock.sendMessage(usuario.remitente, { text: mensajeMenu });

        // Luego, si deseas que el usuario siga en el menú principal:
        usuario.estadoConversacion = 'menuPrincipal';
    }

    async function manejarEstadoEsperandoConfirmacionSimulacion(usuario, mensajeNormalizado) {
        // Aceptamos "si", "sí" (con tilde) y "no"
        if (mensajeNormalizado === 'sí' || mensajeNormalizado === 'si') {
            if (usuario.tipo === 'activo') {
                // Flujo para trabajadores activos
                usuario.estadoConversacion = 'solicitandoCredencial';
                const mensajeInicio = `✅ ¡Excelente!  ✅
Por favor envíame primero una foto clara y legible de tu *credencial del IPE* (frontal). 
🧠 Estoy listo para analizarla en cuanto la reciba.
❌ Si deseas cancelar esta operación, solo escribe \`cancelar\` y volveremos al inicio.`;
                await sock.sendMessage(usuario.remitente, { text: mensajeInicio });
            } else if (usuario.tipo === 'pensionado') {
                // Flujo para pensionados (nuevo estado específico)
                usuario.estadoConversacion = 'esperandoCredencialSimulacionPensionado';
                const mensajeInicio = `✅ ¡Excelente!  ✅
Por favor envíame primero una foto clara y legible de tu *credencial del IPE* (frontal). 
🧠 Estoy listo para analizarla en cuanto la reciba.
❌ Si deseas cancelar esta operación, solo escribe \`cancelar\` y volveremos al inicio.`;

                await sock.sendMessage(usuario.remitente, { text: mensajeInicio });
            } else {
                // El bot aún no sabe si es activo o pensionado
                await sock.sendMessage(usuario.remitente, {
                    text: '⚠️ *Por favor, indícame si eres trabajador activo o pensionado.*'
                });
                usuario.estadoConversacion = 'esperandoTipoUsuario';
            }
        } else if (mensajeNormalizado === 'no') {
            // El usuario canceló la simulación
            const mensajeEspera = `🕐 No te preocupes.  
Cuando tengas los documentos listos, puedes volver a escribirme para iniciar la simulación.  
Estoy aquí para ayudarte. 😊

⬅️ También puedes escribir \`menú\` para regresar al inicio cuando lo desees.`;

            await sock.sendMessage(usuario.remitente, { text: mensajeEspera });
            usuario.estadoConversacion = 'menuPrincipal';
        } else {
            // Respuesta no reconocida
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ Por favor, responde con *Sí* o *No* para continuar.'
            });
        }
    }

    async function manejarEstadoEsperandoTipoPrestamo(usuario, mensajeNormalizado) {
        // Opción CORTO PLAZO
        if (["1", "corto", "corto plazo"].some(p => mensajeNormalizado.includes(p))) {

            if (usuario.tipo === 'activo') {
                // Requisitos para Activos (texto)
                const respuestaCortoPlazo = `📝 *Requisitos para Préstamo a Corto Plazo Domiciliado: Personal Activo*
    

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

                // Envía el texto de requisitos
                await sock.sendMessage(usuario.remitente, { text: respuestaCortoPlazo });

                // Enviar el PDF PCPA (formato para Activos)
                try {
                    const pdfFilePath = path.join(__dirname, 'Formatos', 'PCPA.pdf');
                    if (!fs.existsSync(pdfFilePath)) {
                        await sock.sendMessage(usuario.remitente, {
                            text: '❌ El archivo *PCPA.pdf* no se encontró en la carpeta *Formatos*.'
                        });
                    } else {
                        const pdfBuffer = fs.readFileSync(pdfFilePath);
                        await sock.sendMessage(usuario.remitente, {
                            document: pdfBuffer,
                            fileName: 'PCPA.pdf',
                            mimetype: 'application/pdf',
                            caption: `📄 *Solicitud de Préstamo a Corto Plazo para Personal Activo*`
                        });
                    }
                } catch (error) {
                    console.error('Error al enviar PCPA.pdf:', error);
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Hubo un error al enviar el formato PCPA. Por favor, inténtalo más tarde.'
                    });
                }

                // Enviar el segundo PDF (DOMI.pdf)
                try {
                    const pdfFilePathDomi = path.join(__dirname, 'Formatos', 'DOMI.pdf');
                    if (!fs.existsSync(pdfFilePathDomi)) {
                        await sock.sendMessage(usuario.remitente, {
                            text: '❌ El archivo *DOMI.pdf* no se encontró en la carpeta *Formatos*.'
                        });
                    } else {
                        const pdfBufferDomi = fs.readFileSync(pdfFilePathDomi);
                        await sock.sendMessage(usuario.remitente, {
                            document: pdfBufferDomi,
                            fileName: 'DOMI.pdf',
                            mimetype: 'application/pdf',
                            caption: `📄 *Formato de Domiciliación*`
                        });
                    }
                } catch (error) {
                    console.error('Error al enviar DOMI.pdf:', error);
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Hubo un error al enviar el formato DOMI. Por favor, inténtalo más tarde.'
                    });
                }
                // Mensaje adicional para volver al menú principal
                await sock.sendMessage(usuario.remitente, {
                    text: "⬅️ Si ya revisaste los requisitos, puedes volver al menú principal escribiendo `menú`."
                });

            } else if (usuario.tipo === 'pensionado') {
                // Requisitos para Pensionados (texto)
                const respuestaCortoPlazoPensionado = `📝 *Requisitos para Préstamo a Corto Plazo Domiciliado Pensionistas*
    
    ▪︎Para este tipo de trámite no requiere de aval.
    
    📑 *Documentos Originales*:
    ▪︎Solicitud de Préstamo Corto Plazo Domiciliado.
    
    📄 *Documentos en Copia*:
    ▪︎Credencial de Afiliación del Instituto de Pensiones.¹
    ▪︎Identificación Oficial.²
    
    ¹ Debe estar vigente y firmada.
    ² Credencial de elector, pasaporte o cartilla militar vigente.`;

                // Envía el texto de requisitos
                await sock.sendMessage(usuario.remitente, { text: respuestaCortoPlazoPensionado });

                // Enviar el PDF PCPP (formato para Pensionados)
                try {
                    const pdfFilePath = path.join(__dirname, 'Formatos', 'PCPP.pdf');
                    if (!fs.existsSync(pdfFilePath)) {
                        await sock.sendMessage(usuario.remitente, {
                            text: '❌ El archivo *PCPP.pdf* no se encontró en la carpeta *Formatos*.'
                        });
                    } else {
                        const pdfBuffer = fs.readFileSync(pdfFilePath);
                        await sock.sendMessage(usuario.remitente, {
                            document: pdfBuffer,
                            fileName: 'PCPP.pdf',
                            mimetype: 'application/pdf',
                            caption: `📄 *Solicitud de Préstamo Corto Plazo Pensionistas*`
                        });
                    }
                } catch (error) {
                    console.error('Error al enviar PCPP.pdf:', error);
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Hubo un error al enviar el formato PCPP. Por favor, inténtalo más tarde.'
                    });
                }
                // Mensaje adicional para volver al menú principal
                await sock.sendMessage(usuario.remitente, {
                    text: "⬅️ Si ya revisaste los requisitos, puedes volver al menú principal escribiendo `menú`."
                });
            }

            // Al terminar, regresas al menú principal
            usuario.estadoConversacion = 'menuPrincipal';
        }
        // Opción MEDIANO PLAZO
        else if (["2", "mediano", "mediano plazo"].some(p => mensajeNormalizado.includes(p))) {

            if (usuario.tipo === 'activo') {
                const respuestaMedianoPlazo = `📝 *Requisitos para Préstamos a Mediano Plazo Domiciliado Personal Activo*
            
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

                await sock.sendMessage(usuario.remitente, { text: respuestaMedianoPlazo });

                // >>> Enviar PMP.pdf
                try {
                    const pdfFilePath = path.join(__dirname, 'Formatos', 'PMP.pdf');
                    if (!fs.existsSync(pdfFilePath)) {
                        await sock.sendMessage(usuario.remitente, {
                            text: '❌ El archivo *PMP.pdf* no se encontró en la carpeta *Formatos*.'
                        });
                    } else {
                        const pdfBuffer = fs.readFileSync(pdfFilePath);
                        await sock.sendMessage(usuario.remitente, {
                            document: pdfBuffer,
                            fileName: 'PMP.pdf',
                            mimetype: 'application/pdf',
                            caption: `📄 *Solicitud de Préstamo a Mediano Plazo Domiciliado*`
                        });
                    }
                } catch (error) {
                    console.error('Error al enviar PMP.pdf:', error);
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Hubo un error al enviar el formato PMP. Por favor, inténtalo más tarde.'
                    });
                }

                // >>> Enviar DOMI.pdf (solo para Activos)
                try {
                    const pdfDomiPath = path.join(__dirname, 'Formatos', 'DOMI.pdf');
                    if (!fs.existsSync(pdfDomiPath)) {
                        await sock.sendMessage(usuario.remitente, {
                            text: '❌ El archivo *DOMI.pdf* no se encontró en la carpeta *Formatos*.'
                        });
                    } else {
                        const pdfBufferDomi = fs.readFileSync(pdfDomiPath);
                        await sock.sendMessage(usuario.remitente, {
                            document: pdfBufferDomi,
                            fileName: 'DOMI.pdf',
                            mimetype: 'application/pdf',
                            caption: `📄 *Formato de Domiciliación*`
                        });
                    }
                } catch (error) {
                    console.error('Error al enviar DOMI.pdf:', error);
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Hubo un error al enviar el formato DOMI. Por favor, inténtalo más tarde.'
                    });
                }
                // Mensaje adicional para volver al menú principal
                await sock.sendMessage(usuario.remitente, {
                    text: "⬅️ Si ya revisaste los requisitos, puedes volver al menú principal escribiendo `menú`."
                });

            } else if (usuario.tipo === 'pensionado') {
                const respuestaMedianoPlazoPensionado = `📝 *Requisitos para Préstamos a Mediano Plazo Domiciliado (Pensionados)*
            
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

                await sock.sendMessage(usuario.remitente, { text: respuestaMedianoPlazoPensionado });

                // >>> Enviar PMP.pdf
                try {
                    const pdfFilePath = path.join(__dirname, 'Formatos', 'PMP.pdf');
                    if (!fs.existsSync(pdfFilePath)) {
                        await sock.sendMessage(usuario.remitente, {
                            text: '❌ El archivo *PMP.pdf* no se encontró en la carpeta *Formatos*.'
                        });
                    } else {
                        const pdfBuffer = fs.readFileSync(pdfFilePath);
                        await sock.sendMessage(usuario.remitente, {
                            document: pdfBuffer,
                            fileName: 'PMP.pdf',
                            mimetype: 'application/pdf',
                            caption: `📄 *Solicitud de Préstamo a Mediano Plazo Domiciliado*`
                        });
                    }
                } catch (error) {
                    console.error('Error al enviar PMP.pdf:', error);
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Hubo un error al enviar el formato PMP. Por favor, inténtalo más tarde.'
                    });
                }

                // >>> Enviar DOMI2.pdf (solo para Pensionados)
                try {
                    const pdfDomi2Path = path.join(__dirname, 'Formatos', 'DOMI.pdf');
                    if (!fs.existsSync(pdfDomi2Path)) {
                        await sock.sendMessage(usuario.remitente, {
                            text: '❌ El archivo *DOMI2.pdf* no se encontró en la carpeta *Formatos*.'
                        });
                    } else {
                        const pdfBufferDomi2 = fs.readFileSync(pdfDomi2Path);
                        await sock.sendMessage(usuario.remitente, {
                            document: pdfBufferDomi2,
                            fileName: 'DOMI2.pdf',
                            mimetype: 'application/pdf',
                            caption: `📄 *Formato de Domiciliación, solo si el aval es Personal Activo*`
                        });
                    }
                } catch (error) {
                    console.error('Error al enviar DOMI2.pdf:', error);
                    await sock.sendMessage(usuario.remitente, {
                        text: 'Hubo un error al enviar el formato DOMI2. Por favor, inténtalo más tarde.'
                    });
                }
                // Mensaje adicional para volver al menú principal
                await sock.sendMessage(usuario.remitente, {
                    text: "⬅️ Si ya revisaste los requisitos, puedes volver al menú principal escribiendo `menú`."
                });
            }

            // Al terminar, regresas al menú principal
            usuario.estadoConversacion = 'menuPrincipal';
        }
        // Si la opción no coincide con 1 o 2
        else {
            const mensajeInvalido = `😅 No entendí tu respuesta.

⚠️ Por favor, selecciona una opción válida:  
    1️⃣ Corto Plazo  
    2️⃣ Mediano Plazo`;

            await sock.sendMessage(usuario.remitente, { text: mensajeInvalido });
        }
    }

    async function manejarEstadoSolicitandoBanco(usuario, mensajeNormalizado) {
        const bancoMapeo = {
            '1': 'Santander',
            'santander': 'Santander',
            '2': 'BBVA',
            'bbva': 'BBVA',
            '3': 'CitiBanamex',
            'citibanamex': 'CitiBanamex',
            'banamex': 'CitiBanamex',
            '4': 'Banorte',
            'banorte': 'Banorte',
            '5': 'Scotiabank',
            'scotiabank': 'Scotiabank',
            'scotia': 'Scotiabank',
            '6': 'HSBC',
            'hsbc': 'HSBC'
        };

        const entrada = mensajeNormalizado.toLowerCase().trim();
        const bancoSeleccionado = bancoMapeo[entrada];

        if (bancoSeleccionado) {
            usuario.banco = bancoSeleccionado;
            usuario.estadoConversacion = 'solicitandoEstadoCuenta';
            await sock.sendMessage(usuario.remitente, {
                text: `✅ Perfecto.  
Por favor, envíame tu estado de cuenta de *${usuario.banco}* en formato PDF.

🧠 Asegúrate de que contenga los movimientos de los últimos 30 días.`
            });
        } else {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ Por favor, selecciona una opción válida:\n' +
                    '1️⃣ Santander\n' +
                    '2️⃣ BBVA\n' +
                    '3️⃣ CitiBanamex\n' +
                    '4️⃣ Banorte\n' +
                    '5️⃣ Scotiabank\n' +
                    '6️⃣ HSBC\n' +
                    'Responde con el número o nombre del banco.'
            });
        }
    }

    async function manejarEstadoSolicitandoEstadoCuenta(usuario, msg) {
        console.log('Entrando a manejarEstadoSolicitandoEstadoCuenta');

        const mimeType = msg.message.documentMessage.mimetype;
        console.log('MimeType del documento recibido:', mimeType);

        if (mimeType === 'application/pdf') {
            const fileName = msg.message.documentMessage.fileName || `estado_cuenta_${Date.now()}.pdf`;
            const buffer = await downloadWithRetry(msg);
            const filePath = path.join(archivosDir, fileName);
            fs.writeFileSync(filePath, buffer);
            console.log(`Estado de cuenta guardado en: ${filePath}`);

            // Ejecutar el script de Python correspondiente al banco seleccionado
            let scriptPython;
            switch (usuario.banco) {
                case 'Santander':
                    scriptPython = 'extract_santander_info.py';
                    break;
                case 'BBVA':
                    scriptPython = 'extract_bbva_info.py';
                    break;
                case 'CitiBanamex':
                    scriptPython = 'extract_citibanamex_info.py';
                    break;
                case 'Banorte':
                    scriptPython = 'extract_banorte_info.py';
                    break;
                case 'Scotiabank':
                    scriptPython = 'extract_scotiabank_info.py';
                    break;
                case 'HSBC':
                    scriptPython = 'extract_hsbc_info.py';
                    break;
                default:
                    await sock.sendMessage(usuario.remitente, { text: '⚠️ Banco no reconocido. Por favor, inténtalo de nuevo.' });
                    return;
            }

            try {
                // Ejecutamos el script de Python utilizando execPromise
                const { stdout, stderr } = await execPromise(`python3 ${scriptPython} "${filePath}"`);

                if (stderr) {
                    console.error(`Error en el análisis: ${stderr}`);
                }

                const resultado = JSON.parse(stdout);
                console.log('Resultado del análisis del estado de cuenta:', resultado);

                // Validar que los datos necesarios estén presentes
                if (!usuario.afiliacion || !usuario.folio) {
                    await sock.sendMessage(usuario.remitente, {
                        text: '⚠️ No se pudieron obtener los datos necesarios para la simulación. Por favor, verifica que hayas enviado correctamente tu credencial IPE.'
                    });
                    return;
                }

                // Crear el objeto JSON con los datos requeridos
                const dataForAPI = {
                    afiliacion: usuario.afiliacion,
                    folio: usuario.folio,
                    total_pagos_nomina: resultado.total_nomina,
                    total_descuentos_domiciliados: resultado.total_domiciliado
                };

                console.log('Datos a enviar para la API de simulación:', dataForAPI);

                // Guardar el objeto JSON localmente
                const jsonFileName = `simulacion_${usuario.afiliacion}_${Date.now()}.json`;
                fs.writeFileSync(jsonFileName, JSON.stringify(dataForAPI, null, 2));
                console.log(`Objeto JSON guardado localmente en ${jsonFileName}.`);

                // Enviar mensaje al usuario confirmando que los datos se han recibido
                await sock.sendMessage(usuario.remitente, {
                    text: '✅ Hemos recibido tus datos y estamos procesando tu simulación. Por favor, espera un momento...'
                });

                // Intentar enviar el objeto JSON a la API de prueba
                try {
                    console.log('Intentando enviar los datos a la API de prueba...');
                    const response = await axios.post('http://localhost:5002/api/simulador', dataForAPI);
                    console.log('Datos enviados a la API exitosamente:', response.data);

                    // Aquí puedes manejar la respuesta de la API si es necesario

                } catch (apiError) {
                    console.error('Error al enviar datos a la API:', apiError.message);
                    console.log('La API no está disponible actualmente. Continuando con el flujo normal del bot.');
                    // Continuar con el flujo normal sin interrumpir
                }

                // Agregar el mensaje en la consola después de intentar enviar los datos a la API
                console.log('Datos enviados para la API de simulación.');

                // Continuar enviando el mensaje de análisis al usuario
                let mensajeResultado = `📋 *Análisis del Estado de Cuenta ${usuario.banco}:*\n\n`;

                mensajeResultado += `🔢 *Número de Cuenta:* ${resultado.account_number}\n`;
                mensajeResultado += `💳 *CLABE:* ${resultado.clabe_number}\n\n`;
                mensajeResultado += `📅 *Pagos de Nómina:* \n${resultado.pagos_nomina.join('\n') || 'No encontrados'}\n\n`;
                mensajeResultado += `💸 *Descuentos Domiciliados:* \n${resultado.descuentos_domiciliados.join('\n') || 'No encontrados'}\n\n`;
                mensajeResultado += `💰 *Total Pagos de Nómina:* $${resultado.total_nomina}\n`;
                mensajeResultado += `💳 *Total Descuentos Domiciliados:* $${resultado.total_domiciliado}\n\n`;

                if (resultado.tiene_portabilidad_nomina) {
                    mensajeResultado += `⚠️ *Portabilidad de Nómina Detectada* ⚠️\n`;
                }

                await sock.sendMessage(usuario.remitente, { text: mensajeResultado });

                // Enviar el PDF de simulación local
                await sock.sendMessage(usuario.remitente, {
                    text: `💰 *Estimado ${usuario.nombre}, hemos procesado tu simulación de préstamo.*\n\nTe hemos adjuntado un archivo PDF con todos los detalles necesarios. Cualquier duda que tengas, no dudes en comunicarte con un asesor.`
                });

                // Ruta del archivo PDF de la simulación para usuarios activos
                const pdfFilePath = path.join(__dirname, 'simulacion_activos.pdf'); // Asegúrate de que este archivo existe

                // Enviar el archivo PDF al usuario
                await sock.sendMessage(usuario.remitente, {
                    document: { url: pdfFilePath },
                    mimetype: 'application/pdf',
                    fileName: 'simulacion_activos.pdf',
                });

                // Reiniciar el estado de la conversación
                usuario.estadoConversacion = 'menuPrincipal';
                console.log('Estado de conversación actualizado a:', usuario.estadoConversacion);

                // Agregar la solicitud a la lista de simulaciones
                solicitandoSimulacion.push({
                    nombre: usuario.nombre,
                    telefono: usuario.remitente,
                    afiliacion: usuario.afiliacion || usuario.pension,
                    folio: usuario.folio,
                    ultimaInteraccion: new Date().toLocaleString()
                });

                await guardarSolicitudSimulacion(
                    usuario.id,
                    usuario.nombre,
                    usuario.remitente,
                    usuario.afiliacion || usuario.pension,
                    usuario.folio
                );

            } catch (error) {
                console.error(`Error ejecutando el script de Python: ${error.message}`);
                await sock.sendMessage(usuario.remitente, { text: 'Hubo un error al procesar el estado de cuenta. Intenta de nuevo más tarde.' });
            }

        } else {
            await sock.sendMessage(usuario.remitente, { text: '⚠️ Por favor, envía un archivo PDF válido como estado de cuenta.' });
        }
    }


    async function manejarEstadoPorDefecto(usuario) {
        await sock.sendMessage(usuario.remitente, {
            text: `🤖 *No he entendido tu solicitud, ${usuario.nombre}.* Por favor, elige una de las siguientes opciones:\n\n- *Requisitos*\n- *Simulación*\n- *Asesor*\n- *Cancelar*`
        });
    }
    // Función para verificar si estamos en horario de 8:00 AM a 3:00 PM (Ciudad de México)
    function estaEnHorarioAsesor() {
        // Obtener fecha/hora actual en zona horaria de la Ciudad de México
        const cdmxTime = new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
        const nowCDMX = new Date(cdmxTime);

        // Obtener día de la semana (0 = domingo, 1 = lunes, ..., 6 = sábado)
        const dayOfWeek = nowCDMX.getDay();

        // Obtener la hora del día (formato 0-23)
        const hour = nowCDMX.getHours();

        // Verificar que sea lunes a viernes (dayOfWeek: 1..5)
        const esDiaHabil = (dayOfWeek >= 1 && dayOfWeek <= 5);

        // Verificar que la hora esté entre 8:00 y 14:59
        const esHoraValida = (hour >= 8 && hour < 15);

        return esDiaHabil && esHoraValida;
    }
    // Funciones auxiliares
    async function transferirAAasesor(usuario) {
        // Verificar si estamos dentro del horario permitido
        if (!estaEnHorarioAsesor()) {
            // Si NO es horario de 8:00 a 15:00, mandar un mensaje de "fuera de horario"
            await sock.sendMessage(usuario.remitente, {
                text: `⏰ *Estimado(a) ${usuario.nombre}:*
El servicio de asesoría en línea está disponible de *lunes a viernes*, de *8:00 a 15:00 hrs*.
Por favor, intenta de nuevo en ese horario.
¡Gracias por tu comprensión!`
            });
            return;
        }

        try {
            // Si SÍ es horario válido, procedemos como siempre
            await sock.sendMessage(usuario.remitente, {
                text: `🤝 *Gracias por tu mensaje, ${usuario.nombre}.*\nTe pondremos en contacto con un asesor pronto. El bot dejará de responder hasta que tu solicitud sea atendida.\n\n💬 Mientras tanto, puedes dejar aquí tu *pregunta o el detalle de tu trámite*. Esto ayudará a agilizar tu atención.`
            });

            // Suspender conversación
            suspenderConversacion(usuario.remitente);

            // Guardar la solicitud de asesor en la base de datos
            await guardarSolicitudAsesor(usuario.id, usuario.nombre, usuario.remitente);

            // Cambiar el estado
            usuario.estadoConversacion = 'conversacionSuspendida';
        } catch (error) {
            console.error('Error en transferirAAasesor:', error);
        }
    }


    async function iniciarSimulacionPrestamo(usuario) {
        if (usuario.tipo === 'activo') {
            // Mostrar los mensajes personalizados para activos
            const mensaje1 = `
📋 *Requisitos para Simulación de Préstamo para Trabajadores Activos*:
Para realizar la simulación de préstamo, necesitamos los siguientes documentos:

1️⃣ *Credencial IPE* (en formato de imagen, foto clara y legible).
2️⃣ *Estado de cuenta en formato PDF* que contenga los movimientos de los últimos 30 días.

Por favor, asegúrate de tener estos documentos antes de iniciar el proceso.
            `;

            const mensaje2 = `¿Los tienes listos? Responde con *Sí* o *No* para continuar.`;

            await sock.sendMessage(usuario.remitente, { text: mensaje1 });
            await sock.sendMessage(usuario.remitente, { text: mensaje2 });
        } else if (usuario.tipo === 'pensionado') {
            const mensaje1 = `
📋 *Requisitos para Simulación de Préstamo para Pensionados*:
Para realizar la simulación de préstamo, necesitamos el siguiente documento:

1️⃣ *Credencial IPE vigente* (en formato de imagen, foto clara y legible).

Por favor, asegúrate de tener este documento antes de iniciar el proceso.
            `;

            const mensaje2 = `¿Lo tienes listo? Responde con *Sí* o *No* para continuar.`;

            await sock.sendMessage(usuario.remitente, { text: mensaje1 });
            await sock.sendMessage(usuario.remitente, { text: mensaje2 });
        } else {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ *Por favor, indícame si eres trabajador activo o pensionado.*`
            });
            usuario.estadoConversacion = 'esperandoTipoUsuario';
            return;
        }

        // Actualizamos el estado a "esperandoConfirmacionSimulacion"
        usuario.estadoConversacion = 'esperandoConfirmacionSimulacion';
    }



    async function solicitarTipoPrestamo(usuario) {
        await sock.sendMessage(usuario.remitente, {
            text: `🔍 *¡Entendido, ${usuario.nombre}!* 
¿Para qué tipo de préstamo necesitas los requisitos? 
    
Por favor elige una opción:
 1️⃣ Corto Plazo
 2️⃣ Mediano Plazo`
        });
        usuario.estadoConversacion = 'esperandoTipoPrestamo';
    }

    // Función para manejar la recepción de credencial simulación
    async function manejarRecepcionCredencial(usuario, msg) {
        const buffer = await downloadWithRetry(msg);
        const fileName = `credencial_IPE_${Date.now()}.jpg`;
        const filePath = path.join(archivosDir, fileName);
        fs.writeFileSync(filePath, buffer);
        console.log(`Credencial IPE guardada en: ${filePath}`);

        // Enviar mensaje de espera antes de analizar la credencial
        await sock.sendMessage(usuario.remitente, {
            text: '✅ Recibí tu credencial, por favor espera mientras la analizo...'
        });

        // Analizamos la credencial
        const { afiliacion, pension, folio } = await analizarCredencial(filePath);

        // Verificamos que se hayan extraído los datos necesarios
        const identificador = usuario.tipo === 'activo' ? afiliacion : pension;

        if (identificador && folio) {
            //await sock.sendMessage(usuario.remitente, {
            //text: `✅ Credencial IPE recibida.\nAfiliación/Pensión: ${identificador}\nFolio: ${folio}`
            //});
            usuario.afiliacion = afiliacion;
            usuario.pension = pension;
            usuario.folio = folio;

            // Determinar tipo de derechohabiente
            const tipoDerechohabiente = usuario.tipo === 'activo' ? 'A' : 'P';

            // Llamar a la API para obtener datos del usuario
            const datosUsuarioAPI = await consultarDatosUsuarioAPI(parseInt(identificador), tipoDerechohabiente, parseInt(folio));

            if (datosUsuarioAPI) {
                // Almacenar los datos obtenidos en el usuario para usarlos más adelante
                usuario.datosUsuario = datosUsuarioAPI;

                if (usuario.tipo === 'activo') {
                    // Para Activos, solicitar banco y estado de cuenta
                    usuario.estadoConversacion = 'solicitandoBanco';
                    await sock.sendMessage(usuario.remitente, {
                        text:
                            'Por favor, indícame en qué banco recibes tu nómina:\n' +
                            '1️⃣ Santander\n' +
                            '2️⃣ BBVA\n' +
                            '3️⃣ CitiBanamex\n' +
                            '4️⃣ Banorte\n' +
                            '5️⃣ Scotiabank\n' +
                            '6️⃣ HSBC\n' +
                            'Responde con el número correspondiente.'
                    });
                } else {
                    // Para Pensionados, llamar directamente a la API de simulación
                    await llamarAPISimulacion(usuario);

                    // Agregar la solicitud a la lista de simulaciones
                    solicitandoSimulacion.push({
                        nombre: usuario.nombre,
                        telefono: usuario.remitente,
                        afiliacion: usuario.afiliacion || usuario.pension,
                        folio: usuario.folio,
                        ultimaInteraccion: new Date().toLocaleString()
                    });



                    // Reiniciar el estado de la conversación
                    usuario.estadoConversacion = 'menuPrincipal';
                    console.log('Estado de conversación actualizado a:', usuario.estadoConversacion);
                }

            } else {
                await sock.sendMessage(usuario.remitente, {
                    text: '⚠️ No se encontró un registro con los datos proporcionados. Por favor, verifica tu información o comunícate con soporte.'
                });
            }

        } else {
            // ==== OCR FALLÓ → pedir afiliación / folio manual ====
            const mensajeErrorOCR = `⚠️ No pude leer con claridad tu credencial del IPE.
Para continuar con la simulación, necesito que me proporciones los siguientes datos manualmente:

✏️ Escribe en un solo mensaje tu número de afiliación y tu folio, separados por un espacio.
Ejemplo:
12345 678901`;

            await sock.sendMessage(usuario.remitente, { text: mensajeErrorOCR });
            usuario.estadoPrevio = 'solicitandoCredencial';
            usuario.estadoConversacion = 'esperandoAfiliacionFolioManual';
            return;
        }
    }

    // Función para manejar la respuesta del usuario sobre el banco
    async function manejarRespuestaBanco(usuario, msg) {
        const texto = msg.message.conversation.trim();
        const opcionesBanco = {
            '1': 'Santander',
            '2': 'BBVA',
            '3': 'CitiBanamex',
            '4': 'Banorte',
            '5': 'Scotiabank',
            '6': 'HSBC'
        };

        const bancoSeleccionado = opcionesBanco[texto];

        if (bancoSeleccionado) {
            usuario.banco = bancoSeleccionado;
            usuario.estadoConversacion = 'solicitandoEstadoCuenta';

            await sock.sendMessage(usuario.remitente, {
                text: `📄 Por favor, envíame tu estado de cuenta de *${usuario.banco}* en formato PDF o imagen para continuar con la simulación.`
            });
        } else {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ Opción no válida. Por favor, selecciona un número del 1 al 6 correspondiente a tu banco.'
            });
        }
    }


    async function manejarRecepcionEstadoCuenta(usuario, msg) {
        console.log('Entrando a manejarRecepcionEstadoCuenta');

        const messageContent = msg.message;
        let mimeType, fileName, buffer;

        if (messageContent.documentMessage) {
            mimeType = messageContent.documentMessage.mimetype;
            fileName = messageContent.documentMessage.fileName || `estado_cuenta_${Date.now()}.pdf`;
            buffer = await downloadMediaMessage(msg, 'buffer', { sock });
        } else if (messageContent.imageMessage) {
            mimeType = 'image/jpeg';
            fileName = `estado_cuenta_${Date.now()}.jpg`;
            buffer = await downloadMediaMessage(msg, 'buffer', { sock });
        } else {
            await sock.sendMessage(usuario.remitente, { text: '⚠️ Por favor, envía un archivo PDF o una imagen válida como estado de cuenta.' });
            return;
        }

        console.log('MimeType del documento recibido:', mimeType);

        if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
            const filePath = path.join(archivosDir, fileName);
            fs.writeFileSync(filePath, buffer);
            console.log(`Estado de cuenta guardado en: ${filePath}`);
            // Enviar mensaje de espera antes de analizar el estado de cuenta
            await sock.sendMessage(usuario.remitente, {
                text: '✅ Recibí tu estado de cuenta, por favor espera mientras lo analizo. Esto puede llevarme algunos segundos...'
            });

            // Ejecutar el script de Python correspondiente al banco seleccionado
            let scriptPython;
            switch (usuario.banco) {
                case 'Santander':
                    scriptPython = 'extract_santander_info.py';
                    break;
                case 'BBVA':
                    scriptPython = 'extract_bbva_info.py';
                    break;
                case 'CitiBanamex':
                    scriptPython = 'extract_citibanamex_info.py';
                    break;
                case 'Banorte':
                    scriptPython = 'extract_banorte_info.py';
                    break;
                case 'Scotiabank':
                    scriptPython = 'extract_scotiabank_info.py';
                    break;
                case 'HSBC':
                    scriptPython = 'extract_hsbc_info.py';
                    break;
                default:
                    await sock.sendMessage(usuario.remitente, { text: '⚠️ Banco no reconocido. Por favor, inténtalo de nuevo.' });
                    return;
            }

            try {
                // Ejecutamos el script de Python utilizando execPromise
                const { stdout, stderr } = await execPromise(`python3 ${scriptPython} "${filePath}"`);

                if (stderr) {
                    console.error(`Error en el análisis: ${stderr}`);
                }

                const resultado = JSON.parse(stdout);
                console.log('Resultado del análisis del estado de cuenta:', resultado);

                // Enviar el análisis del estado de cuenta al usuario
                let mensajeResultado = `📋 *Análisis de tu Estado de Cuenta de ${usuario.banco}:*\n\n`;

                mensajeResultado += `🔢 *Número de Cuenta:* ${resultado.account_number || 'No disponible'}\n`;
                mensajeResultado += `💳 *CLABE:* ${resultado.clabe_number || 'No disponible'}\n\n`;
                mensajeResultado += `📅 *Pagos de Nómina:* \n${resultado.pagos_nomina.join('\n') || 'No encontrados'}\n\n`;
                mensajeResultado += `💸 *Descuentos Domiciliados:* \n${resultado.descuentos_domiciliados.join('\n') || 'No encontrados'}\n\n`;
                mensajeResultado += `💰 *Total Pagos de Nómina:* $${parseFloat(resultado.total_nomina).toFixed(2)}\n`;
                mensajeResultado += `💳 *Total Descuentos Domiciliados:* $${parseFloat(resultado.total_domiciliado).toFixed(2)}\n\n`;

                if (resultado.tiene_portabilidad_nomina) {
                    mensajeResultado += `⚠️ *Portabilidad de Nómina Detectada* ⚠️\n`;
                }

                await sock.sendMessage(usuario.remitente, { text: mensajeResultado });

                // Guardar los datos obtenidos del estado de cuenta en el usuario
                usuario.datosEstadoCuenta = resultado;

                // Llamar a la API de simulación con los datos necesarios
                await llamarAPISimulacion(usuario);

                if (usuario.tipo === 'activo') {
                    // 1. Guardar en el arreglo local 'solicitandoSimulacion'
                    solicitandoSimulacion.push({
                        nombre: usuario.nombre,
                        telefono: usuario.remitente,
                        afiliacion: usuario.afiliacion || usuario.pension,
                        folio: usuario.folio,
                        ultimaInteraccion: new Date().toLocaleString()
                    });

                    // 2. Guardar también en tu tabla solicitudes_simulacion de la BD
                    /*await guardarSolicitudSimulacion(
                        usuario.id,
                        usuario.nombre,
                        usuario.remitente,
                        usuario.afiliacion || usuario.pension,
                        usuario.folio
                    );*/
                }

                // Reiniciar el estado de la conversación
                usuario.estadoConversacion = 'menuPrincipal';
                console.log('Estado de conversación actualizado a:', usuario.estadoConversacion);

            } catch (error) {
                console.error(`Error ejecutando el script de Python: ${error.message}`);
                await sock.sendMessage(usuario.remitente, { text: 'Hubo un error al procesar el estado de cuenta. Intenta de nuevo más tarde.' });
            }

        } else {
            await sock.sendMessage(usuario.remitente, { text: '⚠️ Por favor, envía un archivo PDF o una imagen válida como estado de cuenta.' });
        }
    }

    // Función para enviar el PDF de simulación al usuario
    async function enviarPDFSimulacionPensionados(usuario) {
        console.log('Entrando a enviarPDFSimulacionPensionados');

        // Ruta al archivo PDF de la simulación para pensionados
        const pdfFilePath = path.join(__dirname, 'simulacion_pensionados.pdf');

        // Verificamos si el archivo existe antes de enviarlo
        if (fs.existsSync(pdfFilePath)) {
            console.log('Enviando PDF de simulación a:', usuario.remitente);

            // Enviamos un mensaje al usuario antes de enviar el PDF
            await sock.sendMessage(usuario.remitente, {
                text: `💰 *Estimado ${usuario.nombre}, hemos procesado tu simulación de préstamo para pensionados.*\n\nTe hemos adjuntado un archivo PDF con todos los detalles necesarios. Cualquier duda que tengas, no dudes en comunicarte con un asesor.`
            });

            // Enviamos el archivo PDF al usuario
            await sock.sendMessage(usuario.remitente, {
                document: { url: pdfFilePath },
                mimetype: 'application/pdf',
                fileName: 'simulacion_pensionados.pdf',
            });

        } else {
            console.error('El archivo PDF de simulación no existe en la ruta especificada.');
            await sock.sendMessage(usuario.remitente, { text: 'Hubo un error al encontrar el archivo de simulación. Por favor, inténtalo más tarde.' });
        }
    }

    // Función para procesar la respuesta de la API y enviar el PDF en lugar del mensaje
    async function procesarRespuestaAPI(usuario, apiData) {
        // Comentamos o eliminamos el código que compone y envía el mensaje al usuario
        // Extraer información del JSON
        const tipoUsuario = apiData.actPen.toUpperCase() === 'P' ? 'Pensionado' : 'Activo';
        const nombreCompleto = `${apiData.nombre} ${apiData.paterno} ${apiData.materno}`;
        const saldo = apiData.saldo || 0;
        const adeudo = apiData.adeudo || 0;
        const plazo = apiData.plazo || 'Información no disponible';
        const periodosPagados = apiData.periodosPag || 'Información no disponible';
        const sueldo = apiData.sueldo || 'Información no disponible';
        const fechaAjustada = apiData.fechaAjustada || 'Información no disponible';

        // Componer el mensaje para el usuario
        const mensaje = `✨ *Estimado(a) ${usuario.nombre}*, hemos procesado tu simulación de préstamo. Aquí están los resultados:

    - **Tipo de Usuario:** ${tipoUsuario}
    - **Nombre:** ${nombreCompleto}
    - **Número de ${tipoUsuario === 'Pensionado' ? 'Pensión' : 'Afiliación'}:** ${apiData.numero}
    - **Saldo disponible:** $${parseFloat(saldo).toFixed(2)}
    - **Adeudo actual:** $${parseFloat(adeudo).toFixed(2)}
    - **Plazo:** ${plazo} meses
    - **Períodos pagados:** ${periodosPagados}
    - **Sueldo:** $${typeof sueldo === 'number' ? sueldo.toFixed(2) : sueldo}
    - **Fecha ajustada:** ${fechaAjustada}

    Si tienes alguna duda o necesitas más información, no dudes en contactarnos.

    ¡Gracias por utilizar nuestro servicio!`;

        // Enviar el mensaje al usuario
        await sock.sendMessage(usuario.remitente, { text: mensaje });

        // En su lugar, enviamos el PDF de simulación
        await sock.sendMessage(usuario.remitente, {
            text: `💰 *Estimado(a) ${usuario.nombre}, hemos procesado tu simulación de préstamo.*\n\nTe adjuntamos un archivo PDF con todos los detalles necesarios. Si tienes alguna duda, no dudes en comunicarte con un asesor.`
        });

        // Ruta al archivo PDF de la simulación para usuarios activos
        const pdfFilePath = path.join(__dirname, 'simulacion_activo.pdf'); // Asegúrate de que este archivo existe en esta ruta

        // Enviar el archivo PDF al usuario
        await sock.sendMessage(usuario.remitente, {
            document: { url: pdfFilePath },
            mimetype: 'application/pdf',
            fileName: 'simulacion_activo.pdf',
        });

        // Reiniciar el estado de la conversación
        usuario.estadoConversacion = 'menuPrincipal';
        console.log('Estado de conversación actualizado a:', usuario.estadoConversacion);
    }

    async function iniciarComprobantePrestamo(usuario) {
        const year = new Date().getFullYear();
        await sock.sendMessage(usuario.remitente, {
            text: `🧾 *Comprobante de Préstamo (${year})*

📌 Este comprobante aplica únicamente si seleccionaste la opción de *transferencia* como método de pago.

🪪 Por favor, envíame una *foto clara y legible* de tu credencial del IPE para poder generarlo.

❌ Si deseas cancelar esta operación, solo responde con la palabra *Cancelar*.`
        });
        usuario.estadoConversacion = 'solicitandoCredencialComprobante';
    }

    // Función auxiliar para buscar un archivo recursivamente en una carpeta
    function findFileRecursively(directory, targetFile) {
        const files = fs.readdirSync(directory);
        for (const file of files) {
            const fullPath = path.join(directory, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const found = findFileRecursively(fullPath, targetFile);
                if (found) return found;
            } else if (file === targetFile) {
                return fullPath;
            }
        }
        return null;
    }


    /**
     * Handler para buscar manualmente el comprobante cuando la búsqueda automática falla
     */
    async function manejarEstadoEsperandoNumeroComprobanteManual(usuario, mensajeNormalizado) {
        // Permitir al usuario regresar al menú
        if (mensajeNormalizado === 'menu' || mensajeNormalizado === 'menú') {
            usuario.estadoConversacion = 'menuPrincipal';
            await sock.sendMessage(usuario.remitente, {
                text:
                    `🤖 ¿En qué más puedo ayudarte, ${usuario.nombre}?\n\n` +
                    `1️⃣ Requisitos y Formatos\n` +
                    `2️⃣ Simulación\n` +
                    `3️⃣ Llenado de Solicitud\n` +
                    `4️⃣ Comprobante de Préstamo\n` +
                    `5️⃣ Asesor\n` +
                    `6️⃣ Preguntas Frecuentes\n\n` +
                    `Por favor, responde con el número o el nombre de la opción que deseas.`
            });
            return;
        }
        const nombreComprobante = mensajeNormalizado.trim();
        const rutaBase = path.join(__dirname, 'comprobantes_prestamo');
        console.log(`Búsqueda manual de comprobante "${nombreComprobante}" en: ${rutaBase}`);
        const foundPath = findFileRecursively(rutaBase, nombreComprobante);
        if (!foundPath) {
            await sock.sendMessage(usuario.remitente, {
                text: '⚠️ No encontré tu comprobante. Comunícate con un asesor o regresa al menú.'
            });
            usuario.estadoConversacion = 'menuPrincipal';
            return;
        }
        await sock.sendMessage(usuario.remitente, {
            document: { url: foundPath },
            mimetype: 'application/pdf',
            fileName: nombreComprobante,
            caption: `📄 Aquí está tu comprobante, ${usuario.nombre}.`
        });
        usuario.estadoConversacion = 'menuPrincipal';
    }

    /**
     * Handler para capturar manualmente el número de afiliación o pensión
     * y generar el comprobante automáticamente.
     */
    async function manejarEstadoEsperandoNumeroAfiliacionManual(usuario, mensajeNormalizado) {
        // Permitir al usuario regresar al menú
        if (mensajeNormalizado === 'menu' || mensajeNormalizado === 'menú') {
            usuario.estadoConversacion = 'menuPrincipal';
            await sock.sendMessage(usuario.remitente, {
                text:
                    `🤖 ¿En qué más puedo ayudarte, ${usuario.nombre}?\n\n` +
                    `1️⃣ Requisitos y Formatos\n` +
                    `2️⃣ Simulación\n` +
                    `3️⃣ Llenado de Solicitud\n` +
                    `4️⃣ Comprobante de Préstamo\n` +
                    `5️⃣ Asesor\n` +
                    `6️⃣ Preguntas Frecuentes\n\n` +
                    `Por favor, responde con el número o el nombre de la opción que deseas.`
            });
            return;
        }
        // Extraer solo dígitos
        const match = mensajeNormalizado.match(/\d+/);
        if (!match) {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ El formato de los datos no es válido.

📌 Recuerda: debes escribir primero el número de afiliación, luego un espacio y después el folio.  
Ejemplo correcto: \`12345 678901\`

Si el problema persiste, puedes escribir \`cancelar\` para regresar al inicio.`
            });
            return;
        }
        const identificador = match[0];
        usuario.identificador = identificador;

        // Construir el nombre del comprobante
        const prefijo = usuario.tipo === 'activo' ? 'A' : 'P';
        const comprobanteFileName = `${prefijo}-${identificador}.pdf`;

        // Buscarlo en la carpeta
        const rutaBase = path.join(__dirname, 'comprobantes_prestamo');
        console.log(`Búsqueda automática de comprobante "${comprobanteFileName}" en: ${rutaBase}`);
        const rutaComprobante = findFileRecursively(rutaBase, comprobanteFileName);

        if (rutaComprobante) {
            const mensajeExito = `✅ Comprobante generado correctamente.

📎 Te envío a continuación tu comprobante en formato PDF. Verifica que los datos sean correctos.`;
            const mensajeMenu = `⬅️ Si deseas realizar otro trámite, escribe \`menú\` para regresar al inicio y ver las opciones disponibles.`;

            await sock.sendMessage(usuario.remitente, { text: mensajeExito });
            await sock.sendMessage(usuario.remitente, {
                document: { url: rutaComprobante },
                mimetype: 'application/pdf',
                fileName: comprobanteFileName,
                caption: `📄 Aquí está tu comprobante, ${usuario.nombre}.`
            });
            await sock.sendMessage(usuario.remitente, { text: mensajeMenu });
            usuario.estadoConversacion = 'menuPrincipal';
        } else {
            await sock.sendMessage(usuario.remitente, {
                text: `⚠️ No pudimos localizar tu comprobante de préstamo.

Es posible que aún no se haya generado o que el trámite no esté concluido.  
Para darte seguimiento, te recomendamos regresar al inicio escribiendo \`menú\` y seleccionar la opción *Hablar con un Asesor*.

👩‍💼 Estaremos encantados de ayudarte personalmente.`
            });
            usuario.estadoConversacion = 'esperandoNumeroComprobanteManual';
        }
    }

    async function manejarRecepcionCredencialComprobante(usuario, msg) {
        try {
            const buffer = await downloadWithRetry(msg);
            const fileName = `credencial_IPE_${Date.now()}.jpg`;
            const filePath = path.join(archivosDir, fileName);
            fs.writeFileSync(filePath, buffer);
            console.log(`Credencial IPE guardada en: ${filePath}`);
            // 🚧 Enviar mensaje de espera
            await sock.sendMessage(usuario.remitente, {
                text: '✅ Recibí tu credencial, por favor espera mientras la analizo..'
            });

            // Analizamos la credencial usando OCR
            const { afiliacion, pension } = await analizarCredencial(filePath);

            // Verificamos que se hayan extraído los datos necesarios
            if (afiliacion || pension) {
                usuario.identificador = afiliacion || pension;

                // Validamos que el tipo de usuario coincida con la credencial
                let prefijoComprobante = '';
                if (usuario.tipo === 'activo' && afiliacion) {
                    prefijoComprobante = 'A';
                } else if (usuario.tipo === 'pensionado' && pension) {
                    prefijoComprobante = 'P';
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: `⚠️ Los datos de tu credencial no coinciden con el tipo de usuario indicado. Por favor, verifica la información o comunícate con soporte.`
                    });
                    usuario.estadoConversacion = 'menuPrincipal';
                    return;
                }

                // Construir el nombre del comprobante, por ejemplo "A-123456.pdf" o "P-654321.pdf"
                const comprobanteFileName = `${prefijoComprobante}-${usuario.identificador}.pdf`;

                // Definir la ruta base de búsqueda (por ejemplo, carpeta "comprobantes" en el proyecto)
                const rutaBase = path.join(__dirname, 'comprobantes_prestamo');
                console.log(`Buscando comprobante "${comprobanteFileName}" en: ${rutaBase}`);

                // Buscar el comprobante recursivamente
                const rutaComprobante = findFileRecursively(rutaBase, comprobanteFileName);

               if (rutaComprobante) {
                    const mensajeExito = `✅ Comprobante generado correctamente.

📎 Te envío a continuación tu comprobante en formato PDF. Verifica que los datos sean correctos.`;

                    const mensajeMenu = `⬅️ Si necesitas realizar otro trámite, puedes escribir \`menú\` para regresar al inicio y ver las opciones disponibles.`;

                    await sock.sendMessage(usuario.remitente, { text: mensajeExito });
                    await sock.sendMessage(usuario.remitente, {
                        document: { url: rutaComprobante },
                        mimetype: 'application/pdf',
                        fileName: comprobanteFileName,
                        caption: `📄 Aquí está tu comprobante, ${usuario.nombre}.`
                    });
                    await sock.sendMessage(usuario.remitente, { text: mensajeMenu });

                    usuario.estadoConversacion = 'menuPrincipal';
                } else {
                    await sock.sendMessage(usuario.remitente, {
                        text: `⚠️ No encontré tu comprobante.

Por favor, regresa al menú escribiendo \`menú\` y selecciona la opción *Hablar con un Asesor* para recibir asistencia personalizada.`
                    });
                    usuario.estadoConversacion = 'esperandoNumeroComprobanteManual';
                    return;
                }
            } else {
                // Solicitar manualmente número de afiliación o pensión si OCR falló
                await sock.sendMessage(usuario.remitente, {
                    text:
                        '⚠️ No logré leer tu número de afiliación o pensión de tu credencial.\n\n' +
                        'Por favor, escríbeme tu número de afiliación o pensión para continuar.'
                });
                usuario.estadoConversacion = 'esperandoNumeroAfiliacionManual';
                return;
            }
        } catch (error) {
            console.error('Error en manejarRecepcionCredencialComprobante:', error);
            await sock.sendMessage(usuario.remitente, {
                text: 'Hubo un error al procesar tu solicitud. Inténtalo de nuevo más tarde.'
            });
        }
    }

    app.get('/api/dashboard-data', async (req, res) => {
        try {
            // 1. Usuarios
            const rowsUsuarios = await db.query('SELECT * FROM usuarios');
            const atendidos = rowsUsuarios.map(u => ({
                id: u.id,
                nombre: u.nombre,
                telefono: u.telefono,
                tipo: u.tipo,
                ultimaInteraccion: u.ultima_interaccion
                    ? u.ultima_interaccion.toISOString()
                    : null,
            }));

            // 2. Solicitudes de asesor
            const rowsSolicitudesAsesor = await db.query('SELECT * FROM solicitudes_asesor');
            const solicitudesAsesor = rowsSolicitudesAsesor.map(s => ({
                id: s.id,
                nombre: s.nombre,
                telefono: s.telefono,
                ultimaInteraccion: s.ultima_interaccion
                    ? s.ultima_interaccion.toISOString()
                    : null,
                atendido: s.atendido,
            }));

            // 3. Solicitudes de simulación
            const rowsSolicitudesSimulacion = await db.query('SELECT * FROM solicitudes_simulacion');
            const solicitudesSimulacion = rowsSolicitudesSimulacion.map(sim => ({
                id: sim.id,
                nombre: sim.nombre,
                telefono: sim.telefono,
                afiliacion: sim.afiliacion || '',
                folio: sim.folio || '',
                ultimaInteraccion: sim.ultima_interaccion
                    ? sim.ultima_interaccion.toISOString()
                    : null,
            }));

            // Calcular datos semanales
            const today = new Date();
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                const dateString = date.toISOString().split('T')[0];
                last7Days.push(dateString);
            }

            const countByDate = (dataArray) => {
                const counts = {};
                dataArray.forEach(item => {
                    if (item.ultimaInteraccion) {
                        const date = new Date(item.ultimaInteraccion).toISOString().split('T')[0];
                        counts[date] = (counts[date] || 0) + 1;
                    }
                });
                return counts;
            };

            const atendidosCounts = countByDate(atendidos);
            const solicitudesAsesorCounts = countByDate(solicitudesAsesor);
            const solicitudesSimulacionCounts = countByDate(solicitudesSimulacion);

            const weeklyData = last7Days.map(date => ({
                date,
                atendidos: atendidosCounts[date] || 0,
                solicitandoAsesor: solicitudesAsesorCounts[date] || 0,
                solicitandoSimulacion: solicitudesSimulacionCounts[date] || 0,
            }));

            res.json({
                atendidos,
                solicitandoAsesor: solicitudesAsesor,
                solicitandoSimulacion: solicitudesSimulacion,
                weeklyData,
            });
        } catch (error) {
            console.error('Error al obtener datos del dashboard:', error);
            res.status(500).json({ error: 'Error al obtener datos del dashboard' });
        }
    });

    app.post('/atender/:remitente', async (req, res) => {
        const { remitente } = req.params;
        try {
            // Actualizamos la tabla solicitudes_asesor: se usa el placeholder "?" para SQL Server
            await db.query('UPDATE solicitudes_asesor SET atendido = 1 WHERE telefono = ?', [remitente]);

            // Actualizamos el estado en memoria: si existe el usuario, lo reactivamos
            if (usuarios[remitente]) {
                usuarios[remitente].conversacionSuspendida = false;
                usuarios[remitente].estadoConversacion = 'menuPrincipal';

                // Enviar un mensaje de reactivación a través del bot (si la conexión sock está activa)
                await sock.sendMessage(remitente, {
                    text: '✅ Tu solicitud ha sido atendida. El bot ahora está disponible nuevamente para ayudarte.'
                });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error al marcar como atendido:', error);
            res.status(500).json({ error: 'Error al marcar como atendido' });
        }
    });

    app.post('/api/reactivar-usuario', async (req, res) => {
        try {
            const { remitente } = req.body; // llega { remitente: '521228...@s.whatsapp.net' }
            console.log('Reactivando usuario:', remitente);

            // actualizas DB si quieres
            await db.query('UPDATE solicitudes_asesor SET atendido = 1 WHERE telefono = ?', [remitente]);

            // reactivas conversación en memoria
            if (usuarios[remitente]) {
                usuarios[remitente].conversacionSuspendida = false;
                usuarios[remitente].estadoConversacion = 'menuPrincipal';
            }

            // envías mensaje
            await sock.sendMessage(remitente, { text: '✅ Tu solicitud ha sido atendida. El bot está disponible nuevamente.' });

            res.json({ success: true });
        } catch (error) {
            console.error('Error en reactivar usuario:', error);
            res.status(500).json({ success: false, message: 'No se pudo reactivar al usuario.' });
        }
    });


    // === Configuración: retraso entre envíos de encuestas ===
    const ENCUESTA_DELAY_MS = 10_000; // 10 segundos

    // Nueva Ruta para enviar encuestas
    app.post(
        ['/api/enviar-encuestas', '/api/enviar-encuestas-bot'],   // ← dos rutas válidas
        upload.single('archivo'),
        async (req, res) => {
            try {
                const { contactos, mensaje } = req.body;

                // Normalizar `contactos` a un array seguro (puede venir como string JSON o ya parseado)
                let contactosArr = [];
                if (Array.isArray(contactos)) {
                    contactosArr = contactos;
                } else if (typeof contactos === 'string') {
                    try {
                        contactosArr = JSON.parse(contactos);
                    } catch (e) {
                        console.error('contactos no es JSON válido:', contactos);
                        return res
                            .status(400)
                            .json({ success: false, message: 'Formato de contactos inválido.' });
                    }
                } else {
                    return res
                        .status(400)
                        .json({ success: false, message: 'Campo "contactos" faltante o malformado.' });
                }
                const usarPredeterminado = req.body.enviarArchivoPredeterminado === 'true';
                const rutaPNGPredeterminado = path.join(__dirname, 'encuesta.png');
                let archivoRecibido = req.file;

                console.log('Bot recibiendo encuestas:');
                console.log('contactos:', contactos);
                console.log('mensaje:', mensaje);
                // Si el usuario marcó "PNG predeterminado" y no subió archivo, usamos el de la carpeta del servidor
                if (usarPredeterminado && !archivoRecibido) {
                    archivoRecibido = {
                        path: rutaPNGPredeterminado,
                        originalname: 'encuesta.png',
                        mimetype: 'image/png'
                    };
                }
                if (archivoRecibido) {
                    console.log('Archivo recibido:', archivoRecibido.originalname);
                }

                // Aquí usas “sock” para mandar el mensaje/archivo
                for (const c of contactosArr) {
                    // Normaliza teléfono y garantiza prefijo 521
                    let numero = c.telefono.replace(/\D/g, '');
                    if (!numero.startsWith('521')) numero = '521' + numero;
                    const jid = `${numero}@s.whatsapp.net`;

                    // Personaliza el mensaje
                    const textoFinal = mensaje.replace('{nombre}', c.nombre);

                    if (archivoRecibido) {
                        // Enviar archivo
                        let buffer;
                        if (archivoRecibido?.buffer) {
                            // multer en memoryStorage
                            buffer = archivoRecibido.buffer;
                        } else if (archivoRecibido?.path) {
                            // multer en diskStorage
                            buffer = fs.readFileSync(archivoRecibido.path);
                        } else {
                            console.error('Archivo recibido sin path ni buffer:', archivoRecibido);
                            continue;                      // Evita lanzar excepción y pasa al siguiente contacto
                        }
                        // Dependiendo de si es imagen/pdf, etc.
                        if (archivoRecibido.mimetype === 'application/pdf') {
                            await sock.sendMessage(jid, {
                                document: buffer,
                                mimetype: 'application/pdf',
                                fileName: archivoRecibido.originalname,
                                caption: textoFinal,
                            });
                        } else if (archivoRecibido.mimetype.startsWith('image/')) {
                            await sock.sendMessage(jid, {
                                image: buffer,
                                mimetype: archivoRecibido.mimetype,
                                caption: textoFinal,
                            });
                        } else {
                            // otro tipo
                            // ...
                        }
                    } else {
                        // Enviar solo texto
                        await sock.sendMessage(jid, { text: textoFinal });
                    }

                    // Esperar 10 segundos para evitar bloqueos y ráfagas
                    await new Promise(r => setTimeout(r, ENCUESTA_DELAY_MS));
                }

                res.json({ success: true, message: 'Encuestas enviadas con Baileys desde el bot.' });
            } catch (err) {
                console.error('Error en /api/enviar-encuestas:', err);
                res.status(500).json({ success: false, message: 'Error al enviar encuestas.' });
            }
        });

}
iniciarBot();


