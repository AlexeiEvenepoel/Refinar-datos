const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || "development",

  // Configuración de procesamiento
  processing: {
    defaultConcurrency: {
      transform: parseInt(process.env.DEFAULT_CONCURRENCY_TRANSFORM) || 10,
      images: parseInt(process.env.DEFAULT_CONCURRENCY_IMAGES) || 20,
      descriptions:
        parseInt(process.env.DEFAULT_CONCURRENCY_DESCRIPTIONS) || 15,
    },
  },

  // Rutas de archivos
  paths: {
    csvInput: process.env.CSV_INPUT_DIR || "./csv",
    output: process.env.OUTPUT_DIR || "./output",
  },

  // Configuración de scraping
  scraping: {
    timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  },
};

module.exports = config;
