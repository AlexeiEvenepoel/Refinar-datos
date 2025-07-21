const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Error de validación
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Error de validación",
      error: err.message,
    });
  }

  // Error de archivo no encontrado
  if (err.code === "ENOENT") {
    return res.status(404).json({
      success: false,
      message: "Archivo no encontrado",
      error: "El archivo solicitado no existe",
    });
  }

  // Error genérico del servidor
  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    error:
      process.env.NODE_ENV === "development" ? err.message : "Error interno",
  });
};

module.exports = errorHandler;
