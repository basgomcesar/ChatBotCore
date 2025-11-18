# Guía de Contribución

¡Gracias por tu interés en contribuir al ChatBot del IPE! Esta guía te ayudará a entender cómo colaborar efectivamente en el proyecto.

## 📋 Tabla de Contenidos

- [Código de Conducta](#código-de-conducta)
- [Empezando](#empezando)
- [Estructura del Código](#estructura-del-código)
- [Estándares de Código](#estándares-de-código)
- [Proceso de Contribución](#proceso-de-contribución)
- [Pruebas](#pruebas)
- [Reportar Bugs](#reportar-bugs)

## 🤝 Código de Conducta

Este proyecto se adhiere a un código de conducta profesional. Se espera que todos los colaboradores:

- Sean respetuosos y considerados
- Acepten críticas constructivas
- Se enfoquen en lo mejor para el proyecto
- Mantengan la confidencialidad de datos sensibles

## 🚀 Empezando

### Requisitos Previos

- Node.js v18 o superior
- npm v8 o superior
- Git
- Editor de código (recomendado: VSCode)

### Configuración del Entorno

```bash
# 1. Clonar el repositorio
git clone https://github.com/basgomcesar/ChatBotCore.git
cd ChatBotCore

# 2. Instalar dependencias
npm install

# 3. Crear archivo de configuración
cp .env.example .env

# 4. Ejecutar pruebas
npm test
```

## 📁 Estructura del Código

### Organización de Archivos

```
flows/
  nombreFlow/
    nombreFlow.js      # Handler del flujo
    messages.js        # Plantillas de mensajes
```

### Convenciones de Nombres

- **Archivos**: camelCase (ej: `userState.js`)
- **Directorios**: camelCase (ej: `bienvenidaFlow/`)
- **Constantes**: UPPER_CASE (ej: `FLOWS`, `USUARIOS`)
- **Funciones**: camelCase (ej: `isValidName()`)
- **Variables**: camelCase (ej: `userName`)

## 📝 Estándares de Código

### Documentación JSDoc

Todos los módulos y funciones públicas deben incluir documentación JSDoc:

```javascript
/**
 * Descripción breve de la función
 * @param {string} param1 - Descripción del parámetro
 * @param {number} param2 - Descripción del parámetro
 * @returns {boolean} Descripción del valor de retorno
 */
function myFunction(param1, param2) {
  // implementación
}
```

### Estilo de Código

- Usar comillas dobles para strings (`"texto"`)
- Indentación de 2 espacios
- Punto y coma al final de cada declaración
- Usar `const` por defecto, `let` cuando sea necesario
- No usar `var`

### Manejo de Errores

```javascript
try {
  // código que puede fallar
} catch (error) {
  logger.error("Descripción del error:", error);
  // manejar el error apropiadamente
}
```

### Logging

Usar el logger del proyecto:

```javascript
const logger = require('./config/logger');

logger.info('Mensaje informativo');
logger.warn('Advertencia');
logger.error('Error', errorObject);
logger.debug('Debug info'); // Solo en modo debug
```

## 🔄 Proceso de Contribución

### 1. Crear una Rama

```bash
git checkout -b feature/nombre-descriptivo
# o
git checkout -b fix/descripcion-del-bug
```

### 2. Hacer Cambios

- Escribe código limpio y bien documentado
- Sigue las convenciones establecidas
- Agrega pruebas para nuevas funcionalidades

### 3. Probar Cambios

```bash
# Ejecutar pruebas
npm test

# Verificar sintaxis
node -c archivo.js
```

### 4. Commit

Usa mensajes descriptivos:

```bash
git commit -m "Add: nueva funcionalidad de X"
git commit -m "Fix: corregir error en Y"
git commit -m "Update: mejorar documentación de Z"
```

Tipos de commits:
- `Add`: Nueva funcionalidad
- `Fix`: Corrección de bug
- `Update`: Mejora de funcionalidad existente
- `Refactor`: Refactorización de código
- `Docs`: Cambios en documentación
- `Test`: Agregar o modificar pruebas

### 5. Push y Pull Request

```bash
git push origin feature/nombre-descriptivo
```

Luego crea un Pull Request en GitHub con:
- Título descriptivo
- Descripción detallada de los cambios
- Referencias a issues relacionados

## 🧪 Pruebas

### Ejecutar Pruebas

```bash
npm test
```

### Escribir Nuevas Pruebas

1. Crea un archivo en `/tests/` con sufijo `.test.js`
2. Importa el módulo a probar
3. Escribe casos de prueba usando `assert()`

Ejemplo:

```javascript
const { myFunction } = require('../utils/myModule');

function assert(condition, testName) {
  if (condition) {
    console.log(`✅ PASSED: ${testName}`);
  } else {
    console.error(`❌ FAILED: ${testName}`);
  }
}

console.log('=== Testing myFunction ===');
assert(myFunction('input') === 'expected', 'Should return expected value');
```

### Cobertura de Pruebas

- Funciones de validación: 100%
- Flujos críticos: Mínimo 80%
- Utilidades: Mínimo 70%

## 🐛 Reportar Bugs

### Antes de Reportar

1. Verifica que el bug no haya sido reportado
2. Intenta reproducir el bug en la última versión
3. Recopila información relevante

### Información a Incluir

- Descripción clara del problema
- Pasos para reproducir
- Comportamiento esperado vs actual
- Versión de Node.js y npm
- Sistema operativo
- Logs relevantes (si aplica)

### Formato de Reporte

```markdown
**Descripción del Bug**
Descripción clara y concisa del problema.

**Pasos para Reproducir**
1. Ir a '...'
2. Hacer clic en '...'
3. Observar error

**Comportamiento Esperado**
Descripción de lo que debería suceder.

**Capturas de Pantalla**
Si aplica, agregar capturas de pantalla.

**Ambiente**
- Node.js: [versión]
- npm: [versión]
- SO: [sistema operativo]
```

## 📚 Recursos Adicionales

- [Documentación de Node.js](https://nodejs.org/docs/)
- [Guía de JavaScript](https://developer.mozilla.org/es/docs/Web/JavaScript)
- [Baileys Documentation](https://github.com/WhiskeySockets/Baileys)

## ❓ ¿Preguntas?

Si tienes preguntas sobre cómo contribuir, contacta al equipo de desarrollo.

---

¡Gracias por contribuir al ChatBot del IPE! 🚀
