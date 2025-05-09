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
 * Guarda los resultados en un archivo Excel
 * @param {Array} results - Resultados del procesamiento
 */
function saveToExcel(results) {
  const outputDir = "./output";

  // Asegurar que existe la carpeta output
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(results);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Images");

  const outputFile = path.join(outputDir, "product_images.xlsx");
  XLSX.writeFile(workbook, outputFile);

  console.log(`Resultados guardados en: ${outputFile}`);
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

// Array de códigos de producto para procesar
const productCodes = [
  "ACCFANPCCPLDEX4",
  "MBGBH610MKD4",
  "MBMXB760M-F",
  "ME16KF436C18BB2",
  "TBLENZAC50084PE",
];

// Función principal
async function main() {
  try {
    // Primero hacer una prueba con un solo producto
    await testSingleProduct("ACCFANPCCPLDEX4");

    console.log("\n\nIniciando procesamiento de todos los productos...");
    const results = await processProductCodes(productCodes);

    // Guardar resultados en Excel
    saveToExcel(results);

    console.log("Proceso completado con éxito.");
  } catch (error) {
    console.error("Error en el proceso:", error);
  }
}

// Ejecutar el script
main().catch(console.error);
