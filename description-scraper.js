const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const fs = require("fs");

/**
 * Extrae la descripción y especificaciones del producto desde la página web de Deltron
 * @param {string} productCode - Código del producto
 * @returns {Promise<{productCode: string, description: string, specs: Object}>}
 */
async function getProductDescriptionAndSpecs(productCode) {
  try {
    console.log(`Obteniendo información para producto: ${productCode}`);

    // URL de la página del producto
    const productUrl = `https://www.deltron.com.pe/modulos/productos/items/producto.php?item_number=${productCode}`;

    try {
      // Realizar la petición HTTP
      const response = await axios.get(productUrl);
      const $ = cheerio.load(response.data);

      // 1. Extraer la descripción del panel activo
      let description = "";
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
        const considerations = [];
        let foundConsiderations = false;

        $("#home > div > h2, #home > div > p").each(function () {
          const elem = $(this);
          if (elem.is("h2") && elem.text().includes("Consideraciones")) {
            foundConsiderations = true;
            return;
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

      // 2. Extraer las especificaciones técnicas de la tabla
      const specs = {};
      let currentCategory = "";

      // Buscar la tabla de especificaciones en el div con id "esp_tecnicas"
      $("#esp_tecnicas table tr").each(function () {
        const row = $(this);

        // Buscar celdas con atributo fircol="y" (encabezados de categoría)
        const headerCell = row.find('td[fircol="y"]');
        if (headerCell.length > 0) {
          currentCategory = headerCell.text().trim();
          specs[currentCategory] = [];
        }

        // Obtener las celdas de datos (no encabezados)
        const dataCells = row.find('td:not([fircol="y"])');
        if (dataCells.length > 0 && currentCategory) {
          const specText = dataCells
            .map(function () {
              return $(this).text().trim();
            })
            .get()
            .join(" ")
            .trim();

          if (specText) {
            specs[currentCategory].push(specText);
          }
        }
      });

      // 3. Formatear las especificaciones como texto para concatenar con la descripción
      let formattedSpecs = "";
      let hasSpecs = false;

      Object.keys(specs).forEach((category) => {
        if (specs[category].length > 0) {
          hasSpecs = true;
          formattedSpecs += `\n\n${category}:\n`;
          formattedSpecs += specs[category].join("\n");
        }
      });

      // 4. Crear descripción combinada si hay especificaciones
      let combinedDescription = description;
      if (hasSpecs) {
        combinedDescription += `\n\nESPECIFICACIONES TÉCNICAS:${formattedSpecs}`;
      }

      return {
        productCode,
        description: combinedDescription,
        rawDescription: description,
        specs: specs,
        hasSpecs: hasSpecs,
      };
    } catch (error) {
      console.error(`Error al procesar ${productCode}: ${error.message}`);
      return {
        productCode,
        description: `No se pudo obtener la información para ${productCode}. Error: ${error.message}`,
        rawDescription: "",
        specs: {},
        hasSpecs: false,
      };
    }
  } catch (error) {
    console.error(`Error general para ${productCode}: ${error.message}`);
    return {
      productCode,
      description: "Error al procesar la solicitud.",
      rawDescription: "",
      specs: {},
      hasSpecs: false,
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
 * Guarda los productos con descripciones y especificaciones actualizadas
 * @param {Array} products - Productos con información
 * @param {Map} productInfoMap - Mapa de información por código
 * @param {string} outputPath - Ruta del archivo de salida
 */
function saveProductsWithInfo(products, productInfoMap, outputPath) {
  console.log(
    "Generando archivo Excel con productos, descripciones y especificaciones..."
  );

  // Actualizar descripciones de los productos
  const enhancedProducts = products.map((product) => {
    const productInfo = productInfoMap.get(product.ProductCode);

    if (productInfo && productInfo.description) {
      return {
        ...product,
        Description: productInfo.description,
      };
    }
    return product;
  });

  // Crear y guardar el archivo Excel
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(enhancedProducts);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");

  XLSX.writeFile(workbook, outputPath);

  console.log(`Archivo guardado con éxito en: ${outputPath}`);
  return outputPath;
}

/**
 * También guarda las especificaciones en un archivo separado para referencia
 * @param {Map} productInfoMap - Mapa de información por código
 * @param {string} outputPath - Ruta del archivo de salida
 */
function saveSpecificationsToExcel(productInfoMap, outputPath) {
  console.log(
    "Generando archivo Excel con especificaciones técnicas detalladas..."
  );

  // Convertir el mapa a un array de objetos con formato plano para Excel
  const specsArray = Array.from(productInfoMap).map(([code, info]) => {
    // Crear objeto base con el código
    const specObj = {
      ProductCode: code,
      Description: info.rawDescription || "",
    };

    // Añadir cada categoría de especificación como columna
    if (info.specs) {
      Object.keys(info.specs).forEach((category) => {
        // Limpiar nombre de categoría para usarlo como nombre de columna
        const columnName = `Spec_${category
          .replace(/\s+/g, "_")
          .replace(/[^\w]/g, "")}`;
        specObj[columnName] = info.specs[category].join("; ");
      });
    }

    return specObj;
  });

  // Crear y guardar el archivo Excel
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(specsArray);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Especificaciones");

  XLSX.writeFile(workbook, outputPath);

  console.log(`Archivo de especificaciones guardado en: ${outputPath}`);
  return outputPath;
}

/**
 * Prueba con un solo código de producto para verificar funcionamiento
 * @param {string} code - Código de producto a probar
 */
async function testSingleProduct(code) {
  const result = await getProductDescriptionAndSpecs(code);

  // Muestra solo la información clave en un formato limpio
  console.log(`\nRESULTADO DE LA EXTRACCIÓN:`);
  console.log(`- Código: ${result.productCode}`);
  console.log(`- Descripción original: ${result.rawDescription}`);

  console.log(`\nESPECIFICACIONES EXTRAÍDAS:`);

  if (result.hasSpecs) {
    // Procesar categorías para eliminar duplicidades
    const processedCategories = new Set();

    // Ignorar la primera categoría que contiene todas las especificaciones juntas
    const categories = Object.keys(result.specs).filter(
      (cat) =>
        !cat.includes("DISPOSITIVOMARCAMODELONUMERO DE PARTECARACTERISTICAS")
    );

    // Procesar cada categoría individualmente
    categories.forEach((category) => {
      if (
        !processedCategories.has(category) &&
        result.specs[category].length > 0
      ) {
        processedCategories.add(category);

        console.log(`\n${category}:`);

        // Filtrar especificaciones duplicadas usando Set
        const uniqueSpecs = [...new Set(result.specs[category])];
        uniqueSpecs.forEach((spec) => {
          console.log(`  - ${spec}`);
        });
      }
    });
  } else {
    console.log("  No se encontraron especificaciones técnicas");
  }
}

/**
 * Procesa todos los productos del Excel
 * @param {string} inputPath - Ruta del archivo de entrada
 * @param {string} outputPath - Ruta del archivo de salida
 */
async function processAllProducts(inputPath, outputPath) {
  console.log("Iniciando procesamiento completo de productos...");

  // Leer productos del Excel
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

  const productInfoMap = new Map();

  // Procesar cada producto
  for (let i = 0; i < productCodes.length; i++) {
    const code = productCodes[i];
    console.log(`Procesando producto ${i + 1}/${productCodes.length}: ${code}`);

    const result = await getProductDescriptionAndSpecs(code);
    productInfoMap.set(code, result);

    // Mostrar resumen del resultado
    const descriptionPreview = result.description
      .substring(0, 50)
      .replace(/\n/g, " ");
    console.log(`- Información obtenida: ${descriptionPreview}...`);
    console.log(`- Tiene especificaciones: ${result.hasSpecs ? "Sí" : "No"}`);

    // Esperar entre peticiones para no sobrecargar el servidor
    if (i < productCodes.length - 1) {
      const delay = 1000; // 1 segundo entre peticiones
      console.log(
        `Esperando ${delay / 1000} segundos antes de la siguiente petición...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Guardar productos con descripciones y especificaciones
  saveProductsWithInfo(products, productInfoMap, outputPath);

  // También guardar las especificaciones en un archivo separado para referencia
  const specsPath = outputPath.replace(".xlsx", "_specs.xlsx");
  saveSpecificationsToExcel(productInfoMap, specsPath);

  console.log("Procesamiento completo finalizado.");
}

// Función principal
async function main() {
  try {
    const args = process.argv.slice(2);
    const mode = args[0] || "test";

    if (mode === "test") {
      // Hacer pruebas con códigos específicos
      console.log(
        "MODO DE PRUEBA: Realizando prueba con códigos específicos..."
      );

      // Probar con un producto que no tiene descripción pero puede tener especificaciones
      console.log("\n=== PRUEBA 1: Producto sin descripción ===");
      await testSingleProduct("ZZTE8080");

      // Probar con un producto que sí tiene descripción
      console.log("\n=== PRUEBA 2: Producto con descripción ===");
      await testSingleProduct("ACTE70207W");
    } else if (mode === "full") {
      // Procesar todos los productos
      console.log("MODO COMPLETO: Procesando todos los productos...");
      const inputPath = "./output/productos_refinados.xlsx";
      const outputPath = "./output/productos_con_descripciones_web.xlsx";
      await processAllProducts(inputPath, outputPath);
    } else {
      // Probar con un código específico proporcionado
      console.log(`MODO PRODUCTO ESPECÍFICO: Probando con código ${mode}...`);
      await testSingleProduct(mode);
    }
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
  getProductDescriptionAndSpecs,
  readProductsFromExcel,
  saveProductsWithInfo,
  testSingleProduct,
  processAllProducts,
};
