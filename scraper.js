const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Inicializar como null y cargarlo dinámicamente después
let pLimit = null;

// Función para cargar p-limit dinámicamente
async function loadPLimit() {
  if (!pLimit) {
    const module = await import("p-limit");
    pLimit = module.default;
  }
  return pLimit;
}

/**
 * Obtiene la URL de la imagen del producto directamente de la página de imagen extendida
 * @param {string} productCode - Código del producto (ej: ACTE70207W)
 * @returns {Promise<{productCode: string, imageUrl: string, imageTitle: string}>}
 */
async function getProductImage(productCode) {
  try {
    console.log(`Obteniendo imagen para producto: ${productCode}`);

    // URL de la página de imagen extendida
    const imageExtUrl = `https://www.deltron.com.pe/modulos/productos/items/image_ext.php?item=${productCode}`;

    try {
      // Realizar la petición HTTP
      const response = await axios.get(imageExtUrl);
      const $ = cheerio.load(response.data);

      // Buscar la imagen dentro del tag center
      let imageUrl = null;
      let imageTitle = null;

      // La imagen suele estar después de &nbsp; y antes de <br>
      $("center img").each(function () {
        const src = $(this).attr("src");
        if (src && !imageUrl) {
          imageUrl = src;
          imageTitle =
            $(this).attr("alt") || `Imagen del producto ${productCode}`;
          return false; // Romper el bucle
        }
      });

      // Si no encontramos la imagen en center, buscar en todo el documento
      if (!imageUrl) {
        $("img").each(function () {
          const src = $(this).attr("src");
          if (
            src &&
            (src.includes(productCode.toLowerCase()) ||
              src.includes("/productos/") ||
              src.includes("/items/"))
          ) {
            imageUrl = src;
            imageTitle =
              $(this).attr("alt") || `Imagen del producto ${productCode}`;
            return false; // Romper el bucle
          }
        });
      }

      // Si aún no encontramos la imagen, generar URL basada en el patrón conocido
      if (!imageUrl) {
        imageUrl = constructDirectImageUrl(productCode);
      }

      return {
        productCode,
        imageUrl: imageUrl || "No encontrada",
        imageTitle: imageTitle || `Producto ${productCode}`,
      };
    } catch (error) {
      console.error(`Error al procesar ${productCode}: ${error.message}`);
      return {
        productCode,
        imageUrl: constructDirectImageUrl(productCode),
        imageTitle: `Producto ${productCode}`,
      };
    }
  } catch (error) {
    console.error(`Error general para ${productCode}: ${error.message}`);
    return {
      productCode,
      imageUrl: "Error",
      imageTitle: "Error",
    };
  }
}

/**
 * Construye una URL directa para la imagen del producto basada en patrones observados
 * @param {string} productCode - Código del producto
 * @returns {string} - URL construida
 */
function constructDirectImageUrl(productCode) {
  const codeLower = productCode.toLowerCase();
  const part1 = codeLower.substring(0, 2);
  const part2 = codeLower.substring(2, 4);

  // Formatos conocidos de URLs de imágenes
  const formats = [
    `https://imagenes.deltron.com.pe/images/productos/items/large/${part1}/${part2}/${codeLower}.jpg`,
    `https://imagenes.deltron.com.pe/images/productos/items/${part1}/${part2}/${codeLower}.jpg`,
    `https://imagenes.deltron.com.pe/images/productos/items/${part1}/${part2}/${codeLower}_1.jpg`,
  ];

  return formats[0]; // Por defecto usar el primer formato
}

/**
 * Sistema de reintentos para peticiones
 * @param {string} code - Código de producto
 * @param {Function} fetchFn - Función a ejecutar
 * @param {number} retryCount - Contador de reintentos
 * @returns {Promise<any>} - Resultado de la función
 */
const getWithRetry = async (code, fetchFn, retryCount = 0) => {
  try {
    return await fetchFn(code);
  } catch (error) {
    const maxRetries = 3;
    if (retryCount < maxRetries) {
      const waitTime = Math.pow(2, retryCount) * 1000; // Espera exponencial
      console.log(`Reintentando ${code} en ${waitTime / 1000} segundos...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return getWithRetry(code, fetchFn, retryCount + 1);
    }
    throw error;
  }
};

/**
 * Procesa un array de códigos de productos en paralelo con límite de concurrencia
 * @param {string[]} productCodes - Códigos de productos a procesar
 * @param {number} concurrencyLevel - Nivel de concurrencia (peticiones simultáneas)
 * @returns {Promise<Array>} - Array con resultados
 */
async function processProductCodes(productCodes, concurrencyLevel = 10) {
  console.log(
    `Procesando ${productCodes.length} productos con concurrencia ${concurrencyLevel}...`
  );

  // Cargar p-limit al inicio de la función
  const pLimit = await loadPLimit();
  const limit = pLimit(concurrencyLevel);

  // Dividir en lotes para mostrar progreso
  const batchSize = 20;
  const batches = [];
  for (let i = 0; i < productCodes.length; i += batchSize) {
    batches.push(productCodes.slice(i, i + batchSize));
  }

  const results = [];
  let processedCount = 0;

  // Procesar por lotes para mejor control de progreso
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(
      `Procesando lote de imágenes ${batchIndex + 1}/${batches.length}...`
    );

    const promises = batch.map((code) =>
      limit(async () => {
        try {
          processedCount++;
          console.log(
            `[${processedCount}/${productCodes.length}] Obteniendo imagen: ${code}`
          );

          const result = await getWithRetry(code, getProductImage);
          console.log(
            `- URL de imagen: ${result.imageUrl.substring(0, 50)}...`
          );

          return result;
        } catch (error) {
          console.error(`Error con ${code}: ${error.message}`);
          return {
            productCode: code,
            imageUrl: constructDirectImageUrl(code),
            imageTitle: `Error: ${code}`,
          };
        }
      })
    );

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Lee los productos refinados del archivo Excel
 * @param {string} excelPath - Ruta al archivo Excel con productos refinados
 * @returns {Array} - Array de productos
 */
function readRefinedProducts(excelPath) {
  console.log(`Leyendo productos refinados de: ${excelPath}`);

  try {
    // Leer el archivo Excel
    const workbook = XLSX.readFile(excelPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const products = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Se han leído ${products.length} productos refinados`);
    return products;
  } catch (error) {
    console.error(`Error leyendo archivo Excel: ${error.message}`);
    return [];
  }
}

/**
 * Guarda los productos con imágenes en un nuevo archivo Excel
 * @param {Array} products - Productos con información
 * @param {Map} imageMap - Mapa de imágenes por código
 * @param {string} outputPath - Ruta del archivo de salida
 */
function saveProductsWithImages(products, imageMap, outputPath) {
  console.log("Generando archivo Excel con productos e imágenes...");

  // Agregar solo la URL de la imagen a cada producto (omitir ImageTitle)
  const productsWithImages = products.map((product) => {
    const imageInfo = imageMap.get(product.ProductCode) || {
      imageUrl: constructDirectImageUrl(product.ProductCode),
    };

    return {
      ...product,
      ImageUrl: imageInfo.imageUrl,
      // ImageTitle ya no se agrega
    };
  });

  // Crear y guardar el archivo Excel
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(productsWithImages);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");

  XLSX.writeFile(workbook, outputPath);

  console.log(`Archivo guardado con éxito en: ${outputPath}`);
  return outputPath;
}

/**
 * Función principal que procesa los productos refinados y agrega las URLs de las imágenes
 * @param {string} refinedProductsPath - Ruta al archivo Excel con productos refinados
 * @param {string} outputPath - Ruta donde guardar el nuevo archivo
 * @param {Object} options - Opciones de procesamiento
 */
async function processRefinedProducts(
  refinedProductsPath,
  outputPath,
  options = {}
) {
  try {
    console.log("Iniciando procesamiento de productos refinados...");
    const concurrencyLevel = options.concurrency || 10;
    console.log(
      `Nivel de concurrencia: ${concurrencyLevel} peticiones simultáneas`
    );

    // Verificar que el archivo de entrada existe
    if (!fs.existsSync(refinedProductsPath)) {
      throw new Error(`Archivo no encontrado: ${refinedProductsPath}`);
    }

    // Asegurar que el directorio de salida existe
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Leer productos refinados
    const products = readRefinedProducts(refinedProductsPath);
    if (products.length === 0) {
      console.error("No se encontraron productos para procesar.");
      return;
    }

    // Extraer códigos de producto
    const productCodes = products
      .map((product) => product.ProductCode)
      .filter((code) => code); // Eliminar códigos vacíos

    console.log(
      `Se han identificado ${productCodes.length} códigos de productos.`
    );

    // Procesar códigos para obtener imágenes con concurrencia
    console.log("Obteniendo imágenes para los productos...");
    const imageResults = await processProductCodes(
      productCodes,
      concurrencyLevel
    );

    // Crear mapa de imágenes para acceso rápido
    const imageMap = new Map();
    imageResults.forEach((result) => {
      imageMap.set(result.productCode, {
        imageUrl: result.imageUrl,
        imageTitle: result.imageTitle,
      });
    });

    // Guardar productos con URLs de imágenes
    saveProductsWithImages(products, imageMap, outputPath);

    // También guardar solo las imágenes en un archivo separado
    const imagesOnlyPath = path.join(
      path.dirname(outputPath),
      "product_images.xlsx"
    );
    saveToExcel(imageResults, imagesOnlyPath);

    console.log("Proceso completado con éxito.");
  } catch (error) {
    console.error("Error en el proceso:", error);
    throw error; // Re-lanzar para manejo superior
  }
}

/**
 * Guarda los resultados de las imágenes en un archivo Excel
 * @param {Array} results - Resultados del procesamiento
 * @param {string} outputFile - Ruta del archivo de salida
 */
function saveToExcel(results, outputFile) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(results);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Images");
  XLSX.writeFile(workbook, outputFile);

  console.log(`Resultados de imágenes guardados en: ${outputFile}`);
  return outputFile;
}

/**
 * Prueba con un solo código de producto para verificar funcionamiento
 * @param {string} code - Código de producto a probar
 */
async function testSingleProduct(code) {
  console.log(`Probando extracción con producto: ${code}`);
  const result = await getProductImage(code);
  console.log("Resultado:");
  console.log(`- Código: ${result.productCode}`);
  console.log(`- Título: ${result.imageTitle}`);
  console.log(`- URL de imagen: ${result.imageUrl}`);
}

/**
 * Determina el mejor nivel de concurrencia para imágenes
 * @param {number} minConcurrency - Mínima concurrencia a probar
 * @param {number} maxConcurrency - Máxima concurrencia a probar
 * @returns {Promise<number>} - Nivel óptimo de concurrencia
 */
async function testImageConcurrencySpeed(
  minConcurrency = 2,
  maxConcurrency = 20
) {
  console.log(
    `Probando velocidad óptima de concurrencia para imágenes (${minConcurrency}-${maxConcurrency})...`
  );

  // Cargar p-limit
  const pLimit = await loadPLimit();

  const results = [];
  const testCodes = [
    "ACTE70207W",
    "ACCFANPCCPLDEX4",
    "ZZTE8080",
    "ACOL50962W",
    "ACTE54705W",
  ];

  for (
    let concurrency = minConcurrency;
    concurrency <= maxConcurrency;
    concurrency += 2
  ) {
    console.log(`Probando concurrencia ${concurrency}...`);

    const limit = pLimit(concurrency);
    const startTime = Date.now();

    const promises = testCodes.map((code) =>
      limit(() => getProductImage(code))
    );

    await Promise.all(promises);

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const average = totalTime / testCodes.length;

    console.log(
      `Concurrencia ${concurrency}: ${average.toFixed(2)}ms por petición`
    );

    results.push({ concurrency, totalTime, average });
  }

  // Encontrar la concurrencia óptima (menor tiempo promedio)
  results.sort((a, b) => a.average - b.average);
  const optimal = results[0].concurrency;

  console.log("\nResultados de las pruebas:");
  results.forEach((r) =>
    console.log(
      `Concurrencia ${r.concurrency}: ${r.average.toFixed(2)}ms por petición`
    )
  );
  console.log(`\nNivel de concurrencia óptimo: ${optimal}`);

  return optimal;
}

// Configuración - Rutas de archivos
const inputPath = "./output/productos_refinados.xlsx";
const outputPath = "./output/productos_con_imagenes.xlsx";

// Función principal
async function main() {
  try {
    const args = process.argv.slice(2);
    const mode = args[0] || "standard";
    const concurrencyArg = args[1];

    if (mode === "test-speed") {
      // Modo prueba de velocidad para imágenes
      console.log(
        "MODO PRUEBA DE VELOCIDAD: Determinando concurrencia óptima para imágenes..."
      );
      const optimalConcurrency = await testImageConcurrencySpeed();
      console.log(
        `Recomendación: Usa node scraper.js full ${optimalConcurrency}`
      );
    } else if (mode === "test") {
      // Hacer una prueba rápida con un código para verificar conexión
      console.log("MODO PRUEBA: Realizando prueba de conexión...");
      await testSingleProduct("ACCFANPCCPLDEX4");
    } else if (mode === "full") {
      // Procesamiento completo con concurrencia específica
      const concurrency = concurrencyArg ? parseInt(concurrencyArg) : 10;
      console.log(
        `MODO COMPLETO: Iniciando procesamiento con concurrencia ${concurrency}...`
      );
      await processRefinedProducts(inputPath, outputPath, { concurrency });
    } else {
      // Modo estándar
      console.log(
        "MODO ESTÁNDAR: Iniciando procesamiento con concurrencia predeterminada..."
      );
      await processRefinedProducts(inputPath, outputPath, { concurrency: 10 });
    }
    console.log("Proceso completado!");
  } catch (error) {
    console.error("Error en el proceso:", error);
  }
}

// Verificar que exista la carpeta output
const outputDir = "./output";
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(console.error);
}

// Exportar funciones para usar como módulo
module.exports = {
  getProductImage,
  constructDirectImageUrl,
  processProductCodes,
  saveToExcel,
  testSingleProduct,
  processRefinedProducts,
  loadPLimit,
  testImageConcurrencySpeed, // Añade esta función a las exportaciones
};
