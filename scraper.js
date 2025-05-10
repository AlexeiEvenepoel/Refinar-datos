const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

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
 * Procesa un array de códigos de productos
 * @param {string[]} productCodes - Códigos de productos a procesar
 * @returns {Promise<Array>} - Array con resultados
 */
async function processProductCodes(productCodes) {
  console.log(`Procesando ${productCodes.length} productos...`);
  const results = [];

  // Procesar cada producto con un pequeño delay para evitar sobrecarga
  for (let i = 0; i < productCodes.length; i++) {
    const code = productCodes[i];
    console.log(`Procesando producto ${i + 1}/${productCodes.length}: ${code}`);

    const result = await getProductImage(code);
    results.push(result);

    console.log(`- Título: ${result.imageTitle}`);
    console.log(`- URL de imagen: ${result.imageUrl}`);
    console.log("------------------------");

    // Esperar entre peticiones para no sobrecargar el servidor
    if (i < productCodes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 segundo entre peticiones
    }
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
 */
async function processRefinedProducts(refinedProductsPath, outputPath) {
  try {
    console.log("Iniciando procesamiento de productos refinados...");

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

    // Procesar códigos para obtener imágenes
    console.log("Obteniendo imágenes para los productos...");
    const imageResults = await processProductCodes(productCodes);

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

// Configuración - Rutas de archivos
const inputPath = "./output/productos_refinados.xlsx";
const outputPath = "./output/productos_con_imagenes.xlsx";

// Función principal
async function main() {
  try {
    // Hacer una prueba rápida con un código para verificar conexión
    console.log("Realizando prueba de conexión...");
    await testSingleProduct("ACCFANPCCPLDEX4");

    // Procesar todos los productos refinados
    console.log("\nIniciando procesamiento completo...");
    await processRefinedProducts(inputPath, outputPath);
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
};
