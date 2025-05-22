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

      return {
        productCode,
        description: combinedDescription,
        rawDescription: description,
        specs: specs,
        normalizedSpecs: normalizedSpecs, // Incluir las especificaciones normalizadas
        hasSpecs: hasSpecs,
      };
    } catch (error) {
      console.error(`Error al procesar ${productCode}: ${error.message}`);
      return {
        productCode,
        description: `No se pudo obtener la información para ${productCode}. Error: ${error.message}`,
        rawDescription: "",
        specs: {},
        normalizedSpecs: {},
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

    // Añadir cada categoría de especificación normalizada como columna
    if (info.normalizedSpecs) {
      Object.keys(info.normalizedSpecs).forEach((category) => {
        // Limpiar nombre de categoría para usarlo como nombre de columna
        const columnName = `Spec_${category
          .replace(/\s+/g, "_")
          .replace(/[^\w]/g, "")}`;
        specObj[columnName] = info.normalizedSpecs[category].join("; ");
      });
    }
    // También añadir las especificaciones originales como referencia
    else if (info.specs) {
      Object.keys(info.specs).forEach((category) => {
        // Limpiar nombre de categoría para usarlo como nombre de columna
        const columnName = `Spec_Original_${category
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

  console.log(`\nESPECIFICACIONES EXTRAÍDAS (ORIGINALES):`);
  if (result.hasSpecs) {
    Object.keys(result.specs).forEach((category) => {
      if (result.specs[category].length > 0) {
        console.log(`\n${category}:`);
        const uniqueSpecs = [...new Set(result.specs[category])];
        uniqueSpecs.forEach((spec) => {
          console.log(`  - ${spec}`);
        });
      }
    });
  } else {
    console.log("  No se encontraron especificaciones técnicas");
  }

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
