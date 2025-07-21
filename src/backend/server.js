const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config/config");
const errorHandler = require("./middleware/errorHandler");
const productRoutes = require("./routes/productRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Routes
app.use("/api/products", productRoutes);

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: "1.0.0",
  });
});

// Error handling middleware (debe ir al final)
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${config.port}`);
  console.log(`📁 Entorno: ${config.nodeEnv}`);
  console.log(`📂 Archivos CSV: ${config.paths.csvInput}`);
  console.log(`📤 Archivos de salida: ${config.paths.output}`);
});
