const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const fs = require("fs");

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
 * Extrae la descripción y especificaciones del producto desde la página web de Deltron
 * @param {string} productCode - Código del producto
 * @returns {Promise<{productCode: string, description: string, specs: Object}>}
 */
async function getProductDescriptionAndSpecs(productCode, cache) {
  // Usar caché si está disponible
  if (cache && cache.has(productCode)) {
    return cache.get(productCode);
  }

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

      // 2. Extraer las especificaciones técnicas de manera más robusta
      const specs = {};
      const normalizedSpecs = {}; // Para guardar especificaciones normalizadas

      // Capturar datos de la tabla con estructura completa
      // Buscar todas las tablas de especificaciones en diferentes contenedores posibles
      const specTables = [
        $("#esp_tecnicas table"),
        $("#contenedorHtml table[tbn='3']"),
        $("table[tbn='3']"),
        $("#contenedorHtml table"),
      ];

      // Definir categorías estándar y sus posibles variantes
      const categoryMap = {
        // Categorías principales estándar
        DISPOSITIVO: ["DISPOSITIVO", "TIPO", "TIPO DE DISPOSITIVO", "EQUIPO"],
        MARCA: ["MARCA", "FABRICANTE", "BRAND"],
        MODELO: ["MODELO", "MODEL", "NUMERO DE MODELO"],
        "NUMERO DE PARTE": [
          "NUMERO DE PARTE",
          "PART NUMBER",
          "PART NO",
          "PN",
          "P/N",
        ],
        CARACTERISTICAS: [
          "CARACTERISTICAS",
          "FEATURES",
          "ESPECIFICACIONES",
          "SPECS",
        ],
        COLOR: ["COLOR", "COLORES", "COLOUR"],
        PUERTOS: ["PUERTOS", "PORTS", "CONECTORES", "CONECTIVIDAD"],
        DIMENSIONES: ["DIMENSIONES", "DIMENSIONS", "TAMAÑO", "SIZE"],
        PESO: ["PESO", "WEIGHT"],
        INCLUYE: ["INCLUYE", "INCLUIDO", "CONTENIDO", "CONTENIDO DEL PAQUETE"],
      };

      // Función para normalizar el nombre de la categoría
      const normalizeCategory = (category) => {
        const catUpper = category.toUpperCase().trim();
        for (const [standard, variants] of Object.entries(categoryMap)) {
          if (variants.includes(catUpper)) {
            return standard;
          }
        }
        return category.trim(); // Si no coincide con ninguna categoría estándar
      };

      // Procesar cada tabla posible hasta encontrar una con datos
      let foundSpecTable = false;

      for (const tableSelector of specTables) {
        if (tableSelector.length > 0 && !foundSpecTable) {
          foundSpecTable = true;

          // Procesar cada fila de la tabla
          tableSelector.find("tr").each(function () {
            const row = $(this);

            // Buscar la celda de categoría (con atributo fircol="y")
            const categoryCell = row.find('td[fircol="y"]');

            if (categoryCell.length > 0) {
              // Extraer y normalizar el nombre de la categoría
              const rawCategory = categoryCell.text().trim();
              const normalizedCategory = normalizeCategory(rawCategory);

              // Inicializar arrays para esta categoría si no existen
              if (!specs[rawCategory]) {
                specs[rawCategory] = [];
              }

              if (!normalizedSpecs[normalizedCategory]) {
                normalizedSpecs[normalizedCategory] = [];
              }

              // Determinar el número de filas que abarca esta categoría
              const rowspan = parseInt(categoryCell.attr("rowspan")) || 1;

              // Extraer valores de la primera fila
              const valueCells = row.find('td:not([fircol="y"])');
              if (valueCells.length > 0) {
                const specValue = valueCells
                  .map(function () {
                    return $(this).text().trim();
                  })
                  .get()
                  .join(" ")
                  .trim();

                if (specValue) {
                  specs[rawCategory].push(specValue);
                  normalizedSpecs[normalizedCategory].push(specValue);
                }
              }

              // Si rowspan > 1, buscar las siguientes filas que pertenecen a esta categoría
              if (rowspan > 1) {
                let nextRow = row.next();
                for (let i = 1; i < rowspan && nextRow.length > 0; i++) {
                  const nextValueCells = nextRow.find("td");
                  if (nextValueCells.length > 0) {
                    const nextSpecValue = nextValueCells
                      .map(function () {
                        return $(this).text().trim();
                      })
                      .get()
                      .join(" ")
                      .trim();

                    if (nextSpecValue) {
                      specs[rawCategory].push(nextSpecValue);
                      normalizedSpecs[normalizedCategory].push(nextSpecValue);
                    }
                  }
                  nextRow = nextRow.next();
                }
              }
            }
          });
        }
      }

      // Si no se encontraron especificaciones, intentar un enfoque alternativo
      if (Object.keys(specs).length === 0) {
        // Buscar cualquier tabla que pueda tener especificaciones
        $("table").each(function () {
          const table = $(this);

          // Si la tabla tiene filas con un patrón que parece de especificaciones
          if (table.find("tr").length > 2) {
            table.find("tr").each(function () {
              const row = $(this);
              const cells = row.find("td");

              // Si hay al menos 2 celdas, asumir que la primera es categoría y la segunda es valor
              if (cells.length >= 2) {
                const category = $(cells[0]).text().trim();
                const value = $(cells[1]).text().trim();

                if (category && value) {
                  const normalizedCategory = normalizeCategory(category);

                  if (!specs[category]) {
                    specs[category] = [];
                  }

                  if (!normalizedSpecs[normalizedCategory]) {
                    normalizedSpecs[normalizedCategory] = [];
                  }

                  specs[category].push(value);
                  normalizedSpecs[normalizedCategory].push(value);
                }
              }
            });
          }
        });
      }

      // 3. Formatear las especificaciones como texto para concatenar con la descripción
      let formattedSpecs = "";
      let hasSpecs = false;

      // Primero filtremos categorías compuestas
      const filteredCategories = Object.keys(normalizedSpecs).filter(
        (category) => {
          // Filtrar categorías con nombres demasiado largos (probablemente compuestos)
          if (category.length > 25) return false;

          // Filtrar categorías que contienen otras categorías completas
          for (const standardCat of Object.keys(categoryMap)) {
            if (
              category !== standardCat &&
              category.includes(standardCat) &&
              category.length > standardCat.length + 5
            ) {
              return false;
            }
          }

          return true;
        }
      );

      // Usar solo las especificaciones normalizadas filtradas para la salida
      filteredCategories.forEach((category) => {
        if (normalizedSpecs[category].length > 0) {
          hasSpecs = true;
          formattedSpecs += `\n\n${category}:\n`;

          // Filtrar valores duplicados y valores que contienen múltiples datos concatenados
          const uniqueValues = [...new Set(normalizedSpecs[category])].filter(
            (value) => {
              // Filtrar valores que parecen estar concatenados (tienen múltiples líneas o son muy largos)
              return !value.includes("\n") && value.length < 100;
            }
          );

          formattedSpecs += uniqueValues
            .map((value) => `- ${value}`)
            .join("\n");
        }
      });

      // 4. Crear descripción combinada si hay especificaciones
      let combinedDescription = description;
      if (hasSpecs) {
        combinedDescription += `\n\nESPECIFICACIONES TÉCNICAS:${formattedSpecs}`;
      }

      // Al final, guardar en caché
      const result = {
        productCode,
        description: combinedDescription,
        rawDescription: description,
        specs: specs,
        normalizedSpecs: normalizedSpecs,
        hasSpecs: hasSpecs,
      };

      if (cache) cache.set(productCode, result);
      return result;
    } catch (error) {
      console.error(`Error al procesar ${productCode}: ${error.message}`);
      // Manejar errores y guardar en caché
      const errorResult = {
        productCode,
        description: `No se pudo obtener la información para ${productCode}. Error: ${error.message}`,
        rawDescription: "",
        specs: {},
        normalizedSpecs: {},
        hasSpecs: false,
      };

      if (cache) cache.set(productCode, errorResult);
      return errorResult;
    }
  } catch (error) {
    console.error(`Error general para ${productCode}: ${error.message}`);
    return {
      productCode,
      description: "Error al procesar la solicitud.",
      rawDescription: "",
      specs: {},
      normalizedSpecs: {},
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

  // Actualizar descripciones de los productos y mantener solo los campos requeridos
  const enhancedProducts = products.map((product) => {
    const productInfo = productInfoMap.get(product.ProductCode);

    const normalizedProduct = {
      ProductCode: product.ProductCode,
      Title: product.Title,
      Description:
        productInfo && productInfo.description
          ? productInfo.description
          : product.Description,
      Price: product.Price,
      CategoryID: product.CategoryID,
      BrandID: product.BrandID,
      Featured: false, // Siempre en inglés FALSE, no FALSO
      Stock: product.Stock,
      ImageUrl: product.ImageUrl,
    };

    return normalizedProduct;
  });

  // Crear y guardar el archivo Excel con configuración para manejar caracteres especiales
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(enhancedProducts);

  // Configurar codificación para mantener acentos y caracteres especiales
  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");

  // Opciones para codificación UTF-8
  const writeOpts = {
    bookType: "xlsx",
    type: "buffer",
    bookSST: false,
    codepage: 65001, // UTF-8
  };

  XLSX.writeFile(workbook, outputPath, writeOpts);

  console.log(`Archivo guardado con éxito en: ${outputPath}`);
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

  console.log(`\nESPECIFICACIONES NORMALIZADAS:`);
  if (result.hasSpecs && result.normalizedSpecs) {
    // Mostrar solo categorías estándar y filtrar compuestas
    const filteredCats = Object.keys(result.normalizedSpecs).filter(
      (cat) =>
        (cat.length < 25 && !cat.includes("DISPOSITIVO")) ||
        cat === "DISPOSITIVO"
    );

    filteredCats.forEach((category) => {
      if (result.normalizedSpecs[category].length > 0) {
        console.log(`\n${category}:`);
        // Filtrar valores duplicados y combinados
        const uniqueSpecs = [
          ...new Set(result.normalizedSpecs[category]),
        ].filter((spec) => spec.length < 100);
        uniqueSpecs.forEach((spec) => {
          console.log(`  - ${spec}`);
        });
      }
    });
  } else {
    console.log("  No se encontraron especificaciones normalizadas");
  }
}

/**
 * Procesa todos los productos del Excel
 * @param {string} inputPath - Ruta del archivo de entrada
 * @param {string} outputPath - Ruta del archivo de salida
 * @param {Object} options - Opciones de procesamiento
 */
async function processAllProducts(inputPath, outputPath, options = {}) {
  console.log("Iniciando procesamiento completo de productos...");
  const concurrencyLevel = options.concurrency || 15;
  console.log(
    `Nivel de concurrencia: ${concurrencyLevel} peticiones simultáneas`
  );

  // Leer productos del Excel
  const products = readProductsFromExcel(inputPath);
  if (products.length === 0) {
    console.error("No se encontraron productos para procesar.");
    return;
  }

  // Filtrar productos sin imagen si la opción está activada
  const skipNoImage = !!options.skipNoImage;
  let filteredProducts = products;

  if (skipNoImage) {
    console.log("⚠️ FILTRO ACTIVADO: Omitiendo productos sin imagen");
    filteredProducts = products.filter((product) => {
      return (
        product.ImageUrl &&
        product.ImageUrl !== "" &&
        product.ImageUrl !== "No encontrada" &&
        product.ImageUrl !== "Error" &&
        !product.ImageUrl.includes("no_image.jpg")
      );
    });
    console.log(
      `Filtrados ${
        products.length - filteredProducts.length
      } productos sin imagen.`
    );
  }

  // Extraer códigos de producto
  const productCodes = filteredProducts
    .map((product) => product.ProductCode)
    .filter((code) => code);

  console.log(`Procesando ${productCodes.length} productos...`);

  // Cargar p-limit
  const pLimit = await loadPLimit();
  const limit = pLimit(concurrencyLevel);

  // Agregar caché para descripciones
  const descriptionCache = new Map();

  const productInfoMap = new Map();

  // Dividir en lotes para mostrar progreso
  const batchSize = 20;
  const batches = [];
  for (let i = 0; i < productCodes.length; i += batchSize) {
    batches.push(productCodes.slice(i, i + batchSize));
  }

  let processedCount = 0;

  // Procesar por lotes para mejor control de progreso
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(
      `Procesando lote ${batchIndex + 1}/${batches.length} de productos...`
    );

    const promises = batch.map((code) =>
      limit(async () => {
        try {
          processedCount++;
          console.log(
            `[${processedCount}/${productCodes.length}] Procesando producto: ${code}`
          );

          const result = await getProductDescriptionAndSpecs(
            code,
            descriptionCache
          );
          productInfoMap.set(code, result);

          // Mostrar resumen del resultado
          const descriptionPreview = result.description
            .substring(0, 50)
            .replace(/\n/g, " ");
          console.log(`- Información obtenida: ${descriptionPreview}...`);
          console.log(
            `- Tiene especificaciones: ${result.hasSpecs ? "Sí" : "No"}`
          );

          return { code, success: true };
        } catch (error) {
          console.error(`Error procesando ${code}: ${error.message}`);
          // Registrar producto con error pero continuar con los demás
          productInfoMap.set(code, {
            productCode: code,
            description: `Error al procesar: ${error.message}`,
            rawDescription: "",
            specs: {},
            normalizedSpecs: {},
            hasSpecs: false,
          });
          return { code, success: false, error: error.message };
        }
      })
    );

    await Promise.all(promises);
  }

  // Guardar solo el archivo final (no specs separado)
  saveProductsWithInfo(filteredProducts, productInfoMap, outputPath);
  console.log(`Archivo final guardado en: ${outputPath}`);

  console.log("Procesamiento completo finalizado.");
  return outputPath;
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
