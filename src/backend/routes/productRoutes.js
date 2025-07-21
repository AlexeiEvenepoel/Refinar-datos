const express = require("express");
const productController = require("../controllers/productController");

const router = express.Router();

// Procesar productos con upload de CSV
router.post("/process", productController.processProducts);

// Obtener progreso del procesamiento
router.get("/progress", productController.getProcessingProgress);

module.exports = router;
