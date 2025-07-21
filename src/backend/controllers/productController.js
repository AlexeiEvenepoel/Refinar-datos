const productService = require("../services/productService");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const archiver = require("archiver");

// Configuración de multer para uploads temporales
const upload = multer({
  dest: "./temp/",
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos CSV"), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo
  },
});

class ProductController {
  constructor() {
    this.upload = upload.single("csvFile");
    this.processProducts = this.processProducts.bind(this);
  }

  async processProducts(req, res) {
    try {
      // Manejar el upload del archivo
      this.upload(req, res, async (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            message: "Error al subir archivo",
            error: err.message,
          });
        }

        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "No se proporcionó archivo CSV",
          });
        }

        try {
          const {
            concurrencyTransform = 10,
            concurrencyImages = 20,
            concurrencyDescriptions = 15,
          } = req.body;

          console.log("Iniciando procesamiento de productos...");
          console.log("Archivo recibido:", req.file.originalname);

          // Crear directorio temporal único para este procesamiento
          const sessionId = Date.now().toString();
          const tempDir = `./temp/session_${sessionId}`;
          const outputDir = `${tempDir}/output`;

          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          // Mover el archivo CSV al directorio de sesión
          const csvPath = `${tempDir}/input.csv`;
          fs.renameSync(req.file.path, csvPath);

          // Procesar con el archivo temporal
          await productService.processProducts({
            concurrencyTransform,
            concurrencyImages,
            concurrencyDescriptions,
            inputFile: csvPath,
            outputDir: outputDir,
          });

          // Verificar que los archivos se hayan generado
          const expectedFiles = [
            { path: `${outputDir}/productos.xlsx`, name: "productos.xlsx" },
            { path: `${outputDir}/brands.xlsx`, name: "marcas.xlsx" },
            { path: `${outputDir}/categories.xlsx`, name: "categorias.xlsx" },
          ];

          const existingFiles = expectedFiles.filter((file) =>
            fs.existsSync(file.path)
          );

          if (existingFiles.length === 0) {
            throw new Error("No se generaron archivos de salida");
          }

          // Crear ZIP con los archivos generados
          const zipPath = `${tempDir}/productos_procesados.zip`;

          await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver("zip", { zlib: { level: 9 } });

            output.on("close", () => {
              console.log(`ZIP creado: ${archive.pointer()} bytes`);
              resolve();
            });

            archive.on("error", (err) => {
              reject(err);
            });

            archive.pipe(output);

            // Agregar archivos existentes al ZIP
            existingFiles.forEach(({ path: filePath, name }) => {
              archive.file(filePath, { name });
              console.log(`Agregado al ZIP: ${name}`);
            });

            archive.finalize();
          });

          // Verificar que el ZIP se creó correctamente
          if (!fs.existsSync(zipPath)) {
            throw new Error("Error creando archivo ZIP");
          }

          const zipStats = fs.statSync(zipPath);
          console.log(`ZIP final: ${zipPath} (${zipStats.size} bytes)`);

          // Enviar el ZIP como respuesta
          res.setHeader("Content-Type", "application/zip");
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="productos_procesados.zip"'
          );

          const zipStream = fs.createReadStream(zipPath);
          zipStream.pipe(res);

          // Limpiar archivos temporales después de enviar
          zipStream.on("end", () => {
            setTimeout(() => {
              try {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log(`Archivos temporales limpiados: ${tempDir}`);
              } catch (cleanupError) {
                console.error(
                  "Error limpiando archivos temporales:",
                  cleanupError
                );
              }
            }, 5000); // Esperar 5 segundos antes de limpiar
          });

          zipStream.on("error", (streamError) => {
            console.error("Error enviando ZIP:", streamError);
            res.status(500).json({
              success: false,
              message: "Error enviando archivo procesado",
              error: streamError.message,
            });
          });
        } catch (processingError) {
          console.error("Error procesando productos:", processingError);

          // Limpiar archivo temporal en caso de error
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }

          res.status(500).json({
            success: false,
            message: "Error procesando productos",
            error: processingError.message,
          });
        }
      });
    } catch (error) {
      console.error("Error general:", error);
      res.status(500).json({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      });
    }
  }

  async getProcessingProgress(req, res) {
    // Endpoint para obtener progreso del procesamiento
    // Por ahora retorna un estado básico, se puede expandir con WebSockets
    res.json({
      success: true,
      status: "processing",
      message: "Procesando productos...",
    });
  }
}

module.exports = new ProductController();
