<p align="center">
  <img src="https://www.veracruz.gob.mx/ipe/wp-content/uploads/sites/20/2024/12/logo-ip.png" alt="Logo IPE" width="250"/>
</p>

# ChatBot para el Instituto de Pensiones del Estado (IPE)

Este proyecto es un ChatBot desarrollado para el Instituto de Pensiones del Estado de Veracruz. Su objetivo es mejorar la atención y resolver dudas frecuentes de los usuarios de manera automatizada, eficiente y accesible.

## Características principales

El chatbot ofrece los siguientes flujos principales para los usuarios del IPE:

1️⃣ **Requisitos y Formatos**  
Consulta los requisitos, documentos y formatos necesarios para trámites ante el IPE.

2️⃣ **Simulación**  
Permite realizar una simulación personalizada de préstamos y otros servicios ofrecidos por el Instituto.

3️⃣ **Llenado de Solicitud**  
Guía al usuario paso a paso en el llenado de solicitudes de trámites y servicios.

4️⃣ **Comprobante de Préstamo**  
Facilita la obtención de comprobantes de préstamos vigentes o históricos.

5️⃣ **Asesor**  
Ofrece asistencia personalizada conectando al usuario con un asesor humano en caso de requerir atención especializada.

6️⃣ **Preguntas Frecuentes**  
Responde automáticamente a las dudas más comunes sobre trámites, servicios y procesos del IPE.

---

## Estructura del proyecto

Este repositorio está desarrollado en JavaScript (Node.js) y cuenta con la siguiente estructura:

```
ChatBotCore/
├── bot/                    # Lógica de conexión con WhatsApp
│   ├── index.js           # Inicialización del bot
│   ├── messageHandler.js  # Procesamiento de mensajes entrantes
│   ├── eventHandlers.js   # Manejo de eventos de WhatsApp
│   └── whatsappService.js # Servicio de comunicación con WhatsApp
├── config/                # Archivos de configuración
│   ├── constants.js       # Constantes globales (flujos, usuarios, comandos)
│   └── logger.js          # Utilidad de logging con timestamps
├── flows/                 # Flujos conversacionales
│   ├── bienvenidaFlow/    # Flujo de bienvenida y menú principal
│   ├── requisitosFlow/    # Flujo de requisitos y formatos
│   ├── asesorFlow/        # Flujo de conexión con asesor humano
│   ├── preguntasFrecuentesFlow/ # Flujo de preguntas frecuentes
│   └── simulacionFlow/    # Flujo de simulación de préstamos
├── state/                 # Gestión de estado de usuarios
│   └── userState.js       # Persistencia de conversaciones (JSON)
├── utils/                 # Funciones auxiliares
│   ├── flowRouter.js      # Enrutador de flujos conversacionales
│   ├── validations.js     # Funciones de validación
│   └── formatDate.js      # Utilidades de formato de fechas
├── services/              # Servicios externos y APIs
├── archivos/              # Documentos PDF para envío a usuarios
├── tests/                 # Pruebas unitarias
│   ├── README.md          # Documentación de tests
│   └── validations.test.js # Tests de validaciones
├── server.js              # Punto de entrada de la aplicación
└── package.json           # Dependencias y scripts
```

### Flujos conversacionales

Cada flujo maneja una funcionalidad específica y está organizado en:
- **Handler** (`.js`): Lógica del flujo con manejadores de pasos
- **Messages** (`messages.js`): Plantillas de mensajes del flujo

### Estado de usuarios

El chatbot mantiene el estado de cada conversación en `state/userState.json`, incluyendo:
- Flujo actual
- Paso actual
- Datos del usuario (nombre, tipo, etc.)

---

## Instalación y uso

### Requisitos previos

- Node.js v18 o superior
- npm o yarn
- Cuenta de WhatsApp Business (para producción)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/basgomcesar/ChatBotCore.git
cd ChatBotCore

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones
```

### Ejecución

```bash
# Modo desarrollo
npm run dev

# Modo producción
npm start

# Ejecutar tests
npm test
```

---

## Desarrollo

### Agregar un nuevo flujo

1. Crear directorio en `/flows/nombreFlow/`
2. Crear `nombreFlow.js` con el handler
3. Crear `messages.js` con los mensajes
4. Agregar flujo a `config/constants.js`
5. Registrar handler en `utils/flowRouter.js`

### Comandos globales

Los usuarios pueden usar estos comandos en cualquier momento:
- `menu` - Regresar al menú principal
- `inicio` - Reiniciar conversación
- `cancelar` - Cancelar operación actual

### Logging

El proyecto usa un logger personalizado con niveles:
- `logger.info()` - Información general
- `logger.warn()` - Advertencias
- `logger.error()` - Errores
- `logger.debug()` - Debug (requiere `DEBUG=true` en `.env`)

---

## Tecnologías utilizadas

- **[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)** - Cliente de WhatsApp Web
- **Express.js** - Servidor web
- **Socket.io** - Comunicación en tiempo real
- **Node.js** - Runtime de JavaScript
- **Axios** - Cliente HTTP para APIs externas
- **PDF-lib** - Manipulación de documentos PDF

---

## Contribución

Este proyecto sigue las mejores prácticas de desarrollo:
- ✅ Código documentado con JSDoc
- ✅ Validación de entrada de usuario
- ✅ Manejo de errores robusto
- ✅ Pruebas unitarias
- ✅ Estructura modular y escalable

---

## Licencia

Este proyecto es de uso interno para el Instituto de Pensiones del Estado de Veracruz.

---

## Soporte

Para soporte técnico o reportar problemas, contacta al equipo de desarrollo.