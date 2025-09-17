require('dotenv').config();
const logger = require('./config/logger');
const bot = require('./bot');

async function start() {
  try {
    await bot.init();
    logger.info('Bot iniciado correctamente');
  } catch (error) {
    logger.error('Error al iniciar el bot:', error);
    process.exit(1);
  }
}

start();