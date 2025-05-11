const fs = require("fs");
const { processProducts, testConcurrencySpeed } = require("./transform");
const {
  processRefinedProducts,
  testImageConcurrencySpeed,
} = require("./scraper");

// Configuración
const inputFile = "./csv/DCW_20250508062928.csv";
const outputDir = "./output";
const productsOutputFile = `${outputDir}/productos_refinados.xlsx`;
const finalOutputFile = `${outputDir}/productos_completos.xlsx`;

// Asegurar que existe la carpeta output
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Función principal unificada
async function processAllData(options = {}) {
  try {
    console.log(
      "=== INICIANDO PROCESO COMPLETO DE TRANSFORMACIÓN Y ENRIQUECIMIENTO DE DATOS ==="
    );

    // 1. Procesar CSV y generar productos refinados
    console.log("\n[FASE 1] Transformación de datos CSV a Excel...");

    try {
      await processProducts(inputFile, outputDir, {
        concurrency: options.concurrencyTransform || 5,
        skipImageProcessing: true, // Importante: saltamos el procesamiento de imágenes aquí
      });
      console.log(
        `✅ [FASE 1] Completada. Archivo generado: ${productsOutputFile}`
      );
    } catch (error) {
      console.error(`❌ [FASE 1] Error: ${error.message}`);
      return; // Detener el proceso si falla la fase 1
    }

    // Verificar que el archivo existe antes de continuar
    if (!fs.existsSync(productsOutputFile)) {
      console.error(
        `❌ Error: No se encontró el archivo ${productsOutputFile}`
      );
      console.error("La Fase 1 no generó el archivo necesario para continuar.");
      return;
    }

    // 2. Obtener imágenes para los productos refinados
    console.log("\n[FASE 2] Obtención de imágenes para productos refinados...");

    try {
      await processRefinedProducts(productsOutputFile, finalOutputFile, {
        concurrency: options.concurrencyImages || 15,
      });
      console.log(
        `✅ [FASE 2] Completada. Archivo generado: ${finalOutputFile}`
      );
    } catch (error) {
      console.error(`❌ [FASE 2] Error: ${error.message}`);
    }

    if (fs.existsSync(finalOutputFile)) {
      console.log("\n=== PROCESO COMPLETO FINALIZADO CON ÉXITO ===");
      console.log(`Archivo final guardado en: ${finalOutputFile}`);
    } else {
      console.error("\n⚠️ PROCESO FINALIZADO CON ADVERTENCIAS");
      console.error("No se generó el archivo final completo.");
    }
  } catch (error) {
    console.error("\n❌ ERROR CRÍTICO EN EL PROCESO:", error);
  }
}

// Ejecutar según argumentos de línea de comandos
async function main() {
  try {
    const args = process.argv.slice(2);
    const mode = args[0] || "standard";

    if (mode === "test-speed") {
      // Probar velocidad óptima para ambos procesos
      console.log(
        "MODO PRUEBA DE VELOCIDAD: Determinando concurrencia óptima..."
      );

      console.log(
        "\n1. Determinando concurrencia óptima para descripciones..."
      );
      const optimalTransform = await testConcurrencySpeed(2, 15);

      console.log("\n2. Determinando concurrencia óptima para imágenes...");
      const optimalImages = await testImageConcurrencySpeed(5, 25);

      console.log(
        `\nRecomendación: Usa node process-all.js full ${optimalTransform} ${optimalImages}`
      );
    } else if (mode === "full") {
      // Modo completo con concurrencia específica
      const concurrencyTransform = args[1] ? parseInt(args[1]) : 5;
      const concurrencyImages = args[2] ? parseInt(args[2]) : 15;

      console.log(
        `MODO COMPLETO: Iniciando proceso con concurrencia ${concurrencyTransform} para transform y ${concurrencyImages} para imágenes...`
      );
      await processAllData({
        concurrencyTransform,
        concurrencyImages,
      });
    } else {
      // Modo estándar
      console.log(
        "MODO ESTÁNDAR: Iniciando proceso con concurrencia predeterminada..."
      );
      await processAllData();
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { processAllData };
