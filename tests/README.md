# Tests

Este directorio contiene las pruebas unitarias para el proyecto ChatBotCore.

## Estructura

- `validations.test.js` - Pruebas para las funciones de validación

## Ejecutar las pruebas

Para ejecutar todas las pruebas:

```bash
npm test
```

Para ejecutar una prueba específica:

```bash
node tests/validations.test.js
```

## Agregar nuevas pruebas

Las pruebas utilizan un framework de pruebas simple integrado. Para agregar nuevas pruebas:

1. Crea un nuevo archivo con el sufijo `.test.js`
2. Importa los módulos que deseas probar
3. Usa la función `assert()` para verificar las condiciones
4. Ejecuta el archivo con Node.js

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

assert(myFunction() === 'expected', 'Should return expected value');
```
