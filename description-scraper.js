const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const fs = require("fs");

/**
 * Extrae la descripción del producto desde la página web de Deltron
 * @param {string} productCode - Código del producto
 * @returns {Promise<{productCode: string, description: string}>}
 */
async function getProductDescription(productCode) {
  try {
    console.log(`Obteniendo descripción para producto: ${productCode}`);

    // URL de la página del producto
    const productUrl = `https://www.deltron.com.pe/modulos/productos/items/producto.php?item_number=${productCode}`;

    try {
      // Realizar la petición HTTP
      const response = await axios.get(productUrl);
      const $ = cheerio.load(response.data);

      // Buscar la descripción en el panel activo
      let description = "";

      // La descripción está dentro del primer <p> del div con id="home"
      const firstP = $("#home > div > p:first-of-type");
      if (firstP.length > 0) {
        description = firstP.html() || "";
        // Limpiar el HTML y convertirlo a texto plano
        description = description
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/?[^>]+(>|$)/g, "")
          .trim();
      }

      // Si la descripción está vacía, verificar si hay información en consideraciones
      if (!description) {
        // Buscar todas las etiquetas p después de "Consideraciones"
        const considerations = [];
        let foundConsiderations = false;

        $("#home > div > h2, #home > div > p").each(function () {
          const elem = $(this);
          if (elem.is("h2") && elem.text().includes("Consideraciones")) {
            foundConsiderations = true;
            return; // continuar al siguiente elemento
          }

          if (foundConsiderations && elem.is("p")) {
            const text = elem.text().trim();
            if (text && !text.includes("Foto referencial")) {
              considerations.push(text);
            }
          }
        });

        if (considerations.length > 0) {
          description = `Información del producto: ${considerations.join(
            ". "
          )}`;
        } else {
          description = "No hay descripción disponible para este producto.";
        }
      }

      return {
        productCode,
        description,
      };
    } catch (error) {
      console.error(`Error al procesar ${productCode}: ${error.message}`);
      return {
        productCode,
        description: `No se pudo obtener la descripción para ${productCode}. Error: ${error.message}`,
      };
    }
  } catch (error) {
    console.error(`Error general para ${productCode}: ${error.message}`);
    return {
      productCode,
      description: "Error al procesar la solicitud.",
    };
  }
}

/**
 * Lee productos del archivo Excel
 * @param {string} excelPath - Ruta al archivo Excel
 * @returns {Array} - Array de productos
 */
function readProductsFromExcel(excelPath) {
  try {
    console.log(`Leyendo productos de: ${excelPath}`);
    const workbook = XLSX.readFile(excelPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const products = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Se han leído ${products.length} productos`);
    return products;
  } catch (error) {
    console.error(`Error leyendo archivo Excel: ${error.message}`);
    return [];
  }
}

/**
 * Guarda los productos con descripciones actualizadas
 * @param {Array} products - Productos con información
 * @param {Map} descriptionMap - Mapa de descripciones por código
 * @param {string} outputPath - Ruta del archivo de salida
 */
function saveProductsWithDescriptions(products, descriptionMap, outputPath) {
  console.log("Generando archivo Excel con productos y descripciones...");

  // Actualizar descripciones de los productos
  const productsWithDescriptions = products.map((product) => {
    const descInfo = descriptionMap.get(product.ProductCode);

    if (descInfo && descInfo.description) {
      // Solo sobrescribir la descripción si obtuvimos una nueva
      return {
        ...product,
        Description: descInfo.description,
      };
    }
    return product;
  });

  // Crear y guardar el archivo Excel
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(productsWithDescriptions);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");

  XLSX.writeFile(workbook, outputPath);

  console.log(`Archivo guardado con éxito en: ${outputPath}`);
  return outputPath;
}

/**
 * Prueba con un solo código de producto para verificar funcionamiento
 * @param {string} code - Código de producto a probar
 */
async function testSingleProduct(code) {
  console.log(`Probando extracción de descripción para producto: ${code}`);
  const result = await getProductDescription(code);
  console.log("Resultado:");
  console.log(`- Código: ${result.productCode}`);
  console.log(`- Descripción: ${result.description}`);
}

// Función principal
async function main() {
  try {
    // Hacer una prueba con el código específico
    console.log("Realizando prueba con código específico...");
    await testSingleProduct("ZZTE8080");

    // También probar con otro código que sí tiene descripción
    console.log("\nProbando con un producto que tiene descripción...");
    await testSingleProduct("ACTE70207W");

    /*
    // Para procesar todos los productos, descomentar este bloque
    const inputPath = "./output/productos_refinados.xlsx";
    const outputPath = "./output/productos_con_descripciones_web.xlsx";
    
    // Leer productos
    const products = readProductsFromExcel(inputPath);
    if (products.length === 0) {
      console.error("No se encontraron productos para procesar.");
      return;
    }

    // Extraer códigos de producto
    const productCodes = products
      .map((product) => product.ProductCode)
      .filter((code) => code);

    console.log(`Procesando ${productCodes.length} productos...`);
    
    const descriptionMap = new Map();
    
    // Procesar cada producto
    for (let i = 0; i < productCodes.length; i++) {
      const code = productCodes[i];
      console.log(`Procesando producto ${i + 1}/${productCodes.length}: ${code}`);
      
      const result = await getProductDescription(code);
      descriptionMap.set(code, result);
      
      console.log(`- Descripción obtenida: ${result.description.substring(0, 50)}...`);
      
      // Esperar entre peticiones para no sobrecargar el servidor
      if (i < productCodes.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 segundo entre peticiones
      }
    }
    
    // Guardar productos con descripciones actualizadas
    saveProductsWithDescriptions(products, descriptionMap, outputPath);
    */
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
  getProductDescription,
  readProductsFromExcel,
  saveProductsWithDescriptions,
  testSingleProduct,
};
