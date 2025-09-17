const axios = require('axios');

const API_URL = process.env.BACKEND_API_URL;

async function getUser(userId) {
  try {
    const response = await axios.get(`${API_URL}/users/${userId}`);
    return response.data;
  } catch (error) {
    // Manejo de errores y conversión
    console.error('Error consultando usuario:', error.message);
    return { name: 'Invitado' };
  }
}

module.exports = { getUser };