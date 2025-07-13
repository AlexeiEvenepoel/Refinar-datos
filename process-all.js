const fs = require("fs");
const { processProducts, testConcurrencySpeed } = require("./transform");
const {
  processRefinedProducts,
  testImageConcurrencySpeed,
} = require("./scraper");
const { processAllProducts } = require("./description-scraper");

// Configuración
const inputFile = "./csv/DCW_20250711060130.csv";
const outputDir = "./output";
const productsOutputFile = `${outputDir}/productos.xlsx`; // Solo un archivo final de productos
const brandsOutputFile = `${outputDir}/brands.xlsx`;
const categoriesOutputFile = `${outputDir}/categories.xlsx`;

// Nombres de archivos temporales (serán eliminados al final)
const tempRefinedFile = `${outputDir}/.temp_productos_refinados.xlsx`;
const tempWithImagesFile = `${outputDir}/.temp_productos_con_imagenes.xlsx`;

// Asegurar que existe la carpeta output
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Función principal unificada y optimizada
async function processAllData(options = {}) {
  try {
    console.log(
      "=== INICIANDO PROCESO COMPLETO DE TRANSFORMACIÓN Y ENRIQUECIMIENTO DE DATOS ==="
    );

    // 1. Procesar CSV y generar productos refinados (filtrando los sin stock)
    console.log("\n[FASE 1] Transformación de datos CSV a Excel...");

    try {
      await processProducts(inputFile, outputDir, {
        concurrency: options.concurrencyTransform || 10, // Aumentar concurrencia predeterminada
        skipImageProcessing: true, // Saltamos el procesamiento de imágenes aquí
        skipNoStock: true, // Nueva opción para filtrar productos sin stock
        tempFilePath: tempRefinedFile, // Usar archivo temporal
      });
      console.log(
        `✅ [FASE 1] Completada. Archivo generado: ${tempRefinedFile}`
      );
    } catch (error) {
      console.error(`❌ [FASE 1] Error: ${error.message}`);
      return;
    }

    // Verificar que el archivo temporal existe antes de continuar
    if (!fs.existsSync(tempRefinedFile)) {
      console.error(`❌ Error: No se encontró el archivo ${tempRefinedFile}`);
      console.error("La Fase 1 no generó el archivo necesario para continuar.");
      return;
    }

    // 2. Obtener imágenes para los productos refinados
    console.log("\n[FASE 2] Obtención de imágenes para productos refinados...");

    try {
      await processRefinedProducts(tempRefinedFile, tempWithImagesFile, {
        concurrency: options.concurrencyImages || 20, // Aumentar concurrencia predeterminada
        skipFailedImages: true, // Nueva opción para omitir productos sin imagen
      });
      console.log(
        `✅ [FASE 2] Completada. Archivo generado: ${tempWithImagesFile}`
      );
    } catch (error) {
      console.error(`❌ [FASE 2] Error: ${error.message}`);
      // Si falla la fase 2, continuamos con el archivo de la fase 1
      fs.copyFileSync(tempRefinedFile, tempWithImagesFile);
    }

    // 3. Mejorar las descripciones y especificaciones
    console.log("\n[FASE 3] Mejorando descripciones y especificaciones...");

    try {
      // Aumentar concurrencia predeterminada
      const concurrencyDescriptions = options.concurrencyDescriptions || 15;
      console.log(
        `Usando nivel de concurrencia: ${concurrencyDescriptions} para descripciones y especificaciones`
      );

      await processAllProducts(tempWithImagesFile, productsOutputFile, {
        concurrency: concurrencyDescriptions,
        skipNoImage: true, // Nueva opción para omitir productos sin imagen
      });
      console.log(
        `✅ [FASE 3] Completada. Archivo final: ${productsOutputFile}`
      );

      // Mostrar resumen final
      console.log("\n=== PROCESO COMPLETO FINALIZADO CON ÉXITO ===");
      console.log(`Archivos generados:`);
      console.log(`- Productos: ${productsOutputFile}`);
      console.log(`- Marcas: ${brandsOutputFile}`);
      console.log(`- Categorías: ${categoriesOutputFile}`);

      // Eliminar archivos temporales
      if (fs.existsSync(tempRefinedFile)) fs.unlinkSync(tempRefinedFile);
      if (fs.existsSync(tempWithImagesFile)) fs.unlinkSync(tempWithImagesFile);
    } catch (error) {
      console.error(`❌ [FASE 3] Error: ${error.message}`);

      // Si falla la fase 3, usar el archivo de la fase 2 como final
      if (fs.existsSync(tempWithImagesFile)) {
        fs.copyFileSync(tempWithImagesFile, productsOutputFile);
        console.log("\n=== PROCESO FINALIZADO CON ADVERTENCIAS ===");
        console.log(`Archivos generados (sin mejoras en descripciones):`);
        console.log(`- Productos: ${productsOutputFile}`);
        console.log(`- Marcas: ${brandsOutputFile}`);
        console.log(`- Categorías: ${categoriesOutputFile}`);
      }
    }
  } catch (error) {
    console.error("\n❌ ERROR CRÍTICO EN EL PROCESO:", error);
  } finally {
    // Asegurar que los archivos temporales se eliminen incluso en caso de error
    try {
      if (fs.existsSync(tempRefinedFile)) fs.unlinkSync(tempRefinedFile);
      if (fs.existsSync(tempWithImagesFile)) fs.unlinkSync(tempWithImagesFile);
    } catch (e) {
      console.log("Nota: No se pudieron eliminar algunos archivos temporales.");
    }
  }
}

// Ejecutar según argumentos de línea de comandos
async function main() {
  try {
    const args = process.argv.slice(2);
    const mode = args[0] || "standard";

    if (mode === "test-speed") {
      // Probamos con valores más altos para encontrar los límites óptimos
      console.log(
        "MODO PRUEBA DE VELOCIDAD: Determinando concurrencia óptima..."
      );

      console.log(
        "\n1. Determinando concurrencia óptima para descripciones..."
      );
      const optimalTransform = await testConcurrencySpeed(5, 20);

      console.log("\n2. Determinando concurrencia óptima para imágenes...");
      const optimalImages = await testImageConcurrencySpeed(10, 30);

      console.log(
        `\nRecomendación: Usa node process-all.js full ${optimalTransform} ${optimalImages} ${Math.max(
          10,
          optimalTransform
        )}`
      );
    } else if (mode === "full") {
      // Modo completo con concurrencia específica
      const concurrencyTransform = args[1] ? parseInt(args[1]) : 10;
      const concurrencyImages = args[2] ? parseInt(args[2]) : 20;
      const concurrencyDescriptions = args[3] ? parseInt(args[3]) : 15;

      console.log(
        `MODO COMPLETO: Iniciando proceso con concurrencia ${concurrencyTransform} para transform, ${concurrencyImages} para imágenes y ${concurrencyDescriptions} para descripciones...`
      );
      await processAllData({
        concurrencyTransform,
        concurrencyImages,
        concurrencyDescriptions,
      });
    } else {
      // Modo estándar con concurrencia mejorada
      console.log(
        "MODO ESTÁNDAR: Iniciando proceso con concurrencia optimizada..."
      );
      await processAllData({
        concurrencyTransform: 10,
        concurrencyImages: 20,
        concurrencyDescriptions: 15,
      });
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
