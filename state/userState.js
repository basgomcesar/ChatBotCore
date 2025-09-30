const fs = require("fs");
const path = require("path");
const { FLOWS } = require("../config/constants"); 

const stateFile = path.join(__dirname, "userState.json");

// Cargar estado inicial desde el JSON (si existe)
let userStates = {};
if (fs.existsSync(stateFile)) {
  try {
    userStates = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (err) {
    console.error("❌ Error leyendo userState.json:", err);
  }
}

// Guardar el estado en el archivo
function saveStates() {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(userStates, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Error guardando userState.json:", err);
  }
}

module.exports = {
  getState: (userId) => {
    return (
      userStates[userId] || {
        flow: FLOWS.BIENVENIDA.NAME,
        step: FLOWS.BIENVENIDA.STEPS.SALUDO_INICIAL,
      }
    );
  },

  setState: (userId, newState) => {
    userStates[userId] = { ...userStates[userId], ...newState };
    saveStates();
  },

  resetState: (userId) => {
    userStates[userId] = {
      flow: FLOWS.BIENVENIDA.NAME,
      step: FLOWS.BIENVENIDA.STEPS.SALUDO_INICIAL,
    };
    saveStates();
  },

  getAllStates: () => userStates,
};
