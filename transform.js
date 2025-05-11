const XLSX = require("xlsx");
const fs = require("fs");
const { getProductImage, processProductCodes } = require("./scraper");
const { getProductDescriptionAndSpecs } = require("./description-scraper");

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
 * Genera una descripción para el producto basada en su información (plantilla de respaldo)
 * @param {Object} productInfo Información del producto
 * @returns {string} Descripción generada
 */
function generateDescription(productInfo) {
  const { title, category, brand, stock, code, fullTitle } = productInfo;

  // Extraer características del título después de [@@@] si existe
  let features = [];
  if (fullTitle && fullTitle.includes("[@@@]")) {
    const featureText = fullTitle.split("[@@@]")[1];
    if (featureText) {
      // Dividir por comas, puntos o saltos de línea para obtener características
      features = featureText
        .split(/[,.]\s*/)
        .map((f) => f.trim())
        .filter((f) => f.length > 3); // Filtrar elementos muy cortos
    }
  }

  // Crear la primera parte de la descripción
  let description = `${title} de la marca ${brand}. `;

  // Agregar información de categoría
  description += `Pertenece a la categoría ${category}. `;

  // Agregar información de disponibilidad basada en el stock
  if (stock > 20) {
    description += "Alta disponibilidad en stock. ";
  } else if (stock > 10) {
    description += "Buena disponibilidad en stock. ";
  } else if (stock > 0) {
    description += `Solo quedan ${stock} unidades disponibles. `;
  } else {
    description += "Producto temporalmente sin stock. ";
  }

  // Agregar código de producto
  description += `Código de producto: ${code}. `;

  // Agregar características si existen
  if (features.length > 0) {
    description += "Características principales: ";
    // Limitar a máximo 5 características para no hacer la descripción muy larga
    const limitedFeatures = features.slice(0, 5);
    description += limitedFeatures.join(". ") + ".";
  }

  return description;
}

/**
 * Formatea las especificaciones técnicas en un formato limpio y legible
 * @param {Object} specs - Objeto con las especificaciones del producto
 * @returns {string} - Texto formateado de especificaciones
 */
function formatSpecifications(specs) {
  if (!specs || Object.keys(specs).length === 0) {
    return "";
  }

  let formattedSpecs = "\n\nESPECIFICACIONES TÉCNICAS:\n";

  // Procesar categorías para eliminar duplicidades
  const processedCategories = new Set();

  // Ignorar la primera categoría que contiene todas las especificaciones juntas
  const categories = Object.keys(specs).filter(
    (cat) =>
      !cat.includes("DISPOSITIVOMARCAMODELONUMERO DE PARTECARACTERISTICAS")
  );

  // Procesar cada categoría individualmente
  categories.forEach((category) => {
    if (!processedCategories.has(category) && specs[category].length > 0) {
      processedCategories.add(category);

      formattedSpecs += `\n${category}:\n`;

      // Filtrar especificaciones duplicadas usando Set
      const uniqueSpecs = [...new Set(specs[category])];

      uniqueSpecs.forEach((spec) => {
        formattedSpecs += `  - ${spec}\n`;
      });
    }
  });

  return formattedSpecs;
}

// Función para capitalizar la primera letra de un texto
function capitalizeFirstLetter(string) {
  if (!string) return string;
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Procesa los productos y genera tres archivos Excel separados
 * @param {string} inputFilePath Ruta del archivo CSV de entrada
 * @param {string} outputDir Directorio de salida
 * @param {Object} options Opciones de procesamiento
 */
async function processProducts(inputFilePath, outputDir, options = {}) {
  try {
    console.log("Iniciando procesamiento de datos...");
    const concurrencyLevel = options.concurrency || 5;
    console.log(
      `Nivel de concurrencia: ${concurrencyLevel} peticiones simultáneas`
    );

    // Cargar p-limit al inicio de la función
    const pLimit = await loadPLimit();

    // Opciones específicas para archivo CSV no estándar
    const workbook = XLSX.readFile(inputFilePath, {
      type: "string",
      raw: true,
      cellDates: true,
      codepage: 65001, // UTF-8
      dateNF: "yyyy-mm-dd",
      strip: false,
      blankrows: false,
    });

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
    });

    console.log(`Filas leídas en CSV: ${rawData.length}`);

    // Para diagnóstico, mostrar las primeras 10 filas
    console.log("Muestra de las primeras filas del CSV:");
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      console.log(`Fila ${i}: ${JSON.stringify(rawData[i])}`);
    }

    let currentCategory = "";
    const products = [];
    const productCodes = [];
    const productInfoMap = new Map(); // Para almacenar información para generar descripciones

    // Mapas para mantener las marcas y categorías únicas
    const brandsMap = new Map();
    const categoriesMap = new Map();

    console.log("Extrayendo información básica y códigos de producto...");

    // Encontrar la fila donde comienza la información de productos
    let startRow = 0;

    // Buscar la línea que contiene "CODIGO" que marca el inicio de datos
    for (let i = 0; i < rawData.length; i++) {
      if (
        rawData[i] &&
        rawData[i][1] &&
        rawData[i][1].toString().includes("CODIGO")
      ) {
        startRow = i;
        break;
      }
    }

    console.log(`Fila de inicio de datos encontrada: ${startRow}`);

    // Primera pasada: extraer todos los datos básicos y los códigos de producto
    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];

      // Saltarse filas vacías
      if (!row || row.length < 3) continue;

      // Ignorar líneas divisorias o de formato
      if (
        row[0] &&
        (row[0].toString().includes("_______________") ||
          row[0].toString().includes("__________________________________"))
      ) {
        continue;
      }

      // Detectar líneas de categoría (encabezados de grupo)
      if (row[1] && row[1].toString().includes("CODIGO")) {
        if (row[2] && typeof row[2] === "string") {
          currentCategory = row[2].trim();
          console.log(`  > Nueva categoría detectada: ${currentCategory}`);
          if (!categoriesMap.has(currentCategory)) {
            categoriesMap.set(currentCategory, categoriesMap.size + 1);
          }
        }
        continue;
      }

      // Si es una fila de producto, extraer el código
      if (currentCategory && row[1] && !row[1].toString().includes("CODIGO")) {
        // Limpiar el código de comillas si las tiene
        let code = row[1]
          ? row[1]
              .toString()
              .replace(/^"(.*)"$/, "$1")
              .trim()
          : "";

        if (code) {
          productCodes.push(code);

          // Guardar información para descripción de respaldo
          const fullTitle = row[2]
            ? row[2].toString().replace(/^"(.*)"$/, "$1")
            : "Producto sin nombre";
          const brand = row[8]
            ? row[8]
                .toString()
                .replace(/^"(.*)"$/, "$1")
                .trim()
            : "Sin marca";

          // Manejar diferentes formatos de stock
          const rawStock = row[3] ? row[3].toString().trim() : "0";
          let stock = 0;

          if (rawStock.startsWith(">")) {
            stock = parseInt(rawStock.substring(1)) || 0;
          } else {
            stock = parseInt(rawStock) || 0;
          }

          if (!brandsMap.has(brand)) {
            brandsMap.set(brand, brandsMap.size + 1);
          }

          productInfoMap.set(code, {
            title: fullTitle.split("[@@@]")[0].trim(),
            fullTitle: fullTitle,
            category: currentCategory,
            brand: brand,
            stock: stock,
            code: code,
          });
        }
      }
    }

    console.log(
      `Se han identificado ${productCodes.length} códigos de productos.`
    );

    // Cache para guardar resultados ya obtenidos
    const cache = new Map();

    // Sistema de reintentos
    const maxRetries = 3;
    const getWithRetry = async (code, retriesFn, retryCount = 0) => {
      try {
        // Verificar caché primero
        if (cache.has(code)) {
          return cache.get(code);
        }

        const result = await retriesFn(code);

        // Guardar en caché
        cache.set(code, result);
        return result;
      } catch (error) {
        if (retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000; // Espera exponencial
          console.log(`Reintentando ${code} en ${waitTime / 1000} segundos...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          return getWithRetry(code, retriesFn, retryCount + 1);
        }
        throw error;
      }
    };

    // Obtener descripciones mediante scraping en paralelo con control de concurrencia
    console.log("Obteniendo descripciones web para los productos...");
    console.log(
      `Procesamiento en paralelo con ${concurrencyLevel} peticiones simultáneas`
    );

    const limit = pLimit(concurrencyLevel);
    const descriptionsMap = new Map();

    // Dividir en lotes para mostrar progreso
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < productCodes.length; i += batchSize) {
      batches.push(productCodes.slice(i, i + batchSize));
    }

    let processedCount = 0;

    // Procesar por lotes para mejor control de progreso
    for (const [batchIndex, batch] of batches.entries()) {
      console.log(`Procesando lote ${batchIndex + 1}/${batches.length}...`);

      const promises = batch.map((code) =>
        limit(async () => {
          try {
            processedCount++;
            console.log(
              `[${processedCount}/${productCodes.length}] Procesando: ${code}`
            );

            const result = await getWithRetry(
              code,
              getProductDescriptionAndSpecs
            );

            // Formatear descripción
            if (
              result.rawDescription &&
              result.specs &&
              Object.keys(result.specs).length > 0
            ) {
              result.description =
                result.rawDescription + formatSpecifications(result.specs);
            }

            descriptionsMap.set(code, result);

            // Mostrar vista previa
            const preview = result.description
              .substring(0, 30)
              .replace(/\n/g, " ");
            console.log(
              `- ${code}: ${preview}... (Specs: ${
                result.hasSpecs ? "Sí" : "No"
              })`
            );

            return { code, success: true };
          } catch (error) {
            console.error(`Error con ${code}: ${error.message}`);
            return { code, success: false, error: error.message };
          }
        })
      );

      await Promise.all(promises);
    }

    // Inicializar imageMap independientemente de si se procesan imágenes o no
    const imageMap = new Map();

    // Obtener imágenes (solo si no se especifica skipImageProcessing)
    if (!options.skipImageProcessing) {
      console.log("Obteniendo imágenes para los productos...");

      // Usar un nivel de concurrencia posiblemente mayor para imágenes
      const imageLimit = pLimit(concurrencyLevel + 2);
      const imagePromises = productCodes.map((code) =>
        imageLimit(() => getWithRetry(code, getProductImage))
      );

      const imageResults = await Promise.all(imagePromises);
      for (const result of imageResults) {
        imageMap.set(result.productCode, {
          imageUrl: result.imageUrl,
          imageTitle: result.imageTitle,
        });
      }
    } else {
      console.log(
        "Saltando procesamiento de imágenes (se procesarán en una fase posterior)"
      );
      // Dejar imageMap con URLs de placeholder
      for (const code of productCodes) {
        imageMap.set(code, {
          imageUrl: "", // Placeholder vacío
          imageTitle: `Producto ${code}`,
        });
      }
    }

    // Segunda pasada: procesar todos los datos con imágenes y descripciones
    console.log("Procesando productos completos...");
    currentCategory = "";

    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length < 3) continue;

      if (
        row[0] &&
        (row[0].toString().includes("_______________") ||
          row[0].toString().includes("__________________________________"))
      ) {
        continue;
      }

      if (row[1] && row[1].toString().includes("CODIGO")) {
        if (row[2] && typeof row[2] === "string") {
          currentCategory = row[2].trim();
        }
        continue;
      }

      if (currentCategory && row[1] && !row[1].toString().includes("CODIGO")) {
        try {
          const code = row[1]
            ? row[1]
                .toString()
                .replace(/^"(.*)"$/, "$1")
                .trim()
            : "";
          if (!code) continue;

          const rawStock = row[3] ? row[3].toString().trim() : "0";
          const stock = rawStock.startsWith(">")
            ? parseInt(rawStock.substring(1)) || 0
            : parseInt(rawStock) || 0;

          const fullTitle = row[2]
            ? row[2].toString().replace(/^"(.*)"$/, "$1")
            : "Producto sin nombre";
          const cleanTitle = fullTitle.split("[@@@]")[0].trim();

          let price = 0;
          if (row[4] && row[4].toString().trim() !== "") {
            price = parseFloat(row[4].toString().replace(",", ".")) || 0;
          }

          const brand = row[8]
            ? row[8]
                .toString()
                .replace(/^"(.*)"$/, "$1")
                .trim()
            : "Sin marca";

          if (cleanTitle && cleanTitle !== "" && price > 0) {
            // Obtener imagen
            const imageInfo = imageMap.get(code) || {
              imageUrl: "",
              imageTitle: `Producto ${code}`,
            };

            // Obtener descripción del scraping o generarla desde plantilla
            let description;
            if (
              descriptionsMap.has(code) &&
              descriptionsMap.get(code).description !==
                `No se pudo obtener la información para ${code}.` &&
              descriptionsMap.get(code).description !==
                "Error al procesar la solicitud."
            ) {
              description = descriptionsMap.get(code).description;
            } else {
              // Generar descripción mediante plantilla si no se encontró en web
              const productInfo = productInfoMap.get(code);
              description = generateDescription(productInfo);
            }

            // Usar IDs para marca y categoría
            const brandId = brandsMap.get(brand);
            const categoryId = categoriesMap.get(currentCategory);

            products.push({
              Title: capitalizeFirstLetter(cleanTitle), // Primera letra en mayúscula
              Description: description,
              Price: price,
              CategoryID: categoryId,
              BrandID: brandId,
              Size: "S",
              Featured: false, // Siempre false en inglés
              Stock: stock,
              ProductCode: code,
              ImageUrl: imageInfo.imageUrl,
            });
          }
        } catch (err) {
          console.warn(`Error procesando fila: ${err.message}`);
        }
      }
    }

    console.log(`Procesados ${products.length} productos completos.`);
    console.log("Generando archivos Excel...");

    // Crear archivo de productos
    const productsWorkbook = XLSX.utils.book_new();
    const productsWorksheet = XLSX.utils.json_to_sheet(products);
    XLSX.utils.book_append_sheet(
      productsWorkbook,
      productsWorksheet,
      "Productos"
    );
    const productsOutputFile = `${outputDir}/productos_refinados.xlsx`;
    XLSX.writeFile(productsWorkbook, productsOutputFile);

    // Crear archivo de marcas
    const brands = Array.from(brandsMap).map(([name, id]) => ({
      ID: id,
      Name: name,
    }));
    const brandsWorkbook = XLSX.utils.book_new();
    const brandsWorksheet = XLSX.utils.json_to_sheet(brands);
    XLSX.utils.book_append_sheet(brandsWorkbook, brandsWorksheet, "Marcas");
    const brandsOutputFile = `${outputDir}/brands.xlsx`;
    XLSX.writeFile(brandsWorkbook, brandsOutputFile);

    // Crear archivo de categorías
    const categories = Array.from(categoriesMap).map(([name, id]) => ({
      ID: id,
      Name: name,
    }));
    const categoriesWorkbook = XLSX.utils.book_new();
    const categoriesWorksheet = XLSX.utils.json_to_sheet(categories);
    XLSX.utils.book_append_sheet(
      categoriesWorkbook,
      categoriesWorksheet,
      "Categorias"
    );
    const categoriesOutputFile = `${outputDir}/categories.xlsx`;
    XLSX.writeFile(categoriesWorkbook, categoriesOutputFile);

    console.log(`Archivo de productos guardado en: ${productsOutputFile}`);
    console.log(
      `Archivo de marcas guardado en: ${brandsOutputFile} (${brands.length} marcas únicas)`
    );
    console.log(
      `Archivo de categorías guardado en: ${categoriesOutputFile} (${categories.length} categorías únicas)`
    );
  } catch (error) {
    console.error("Error:", error);
    throw error; // Re-lanzar el error para que se propague
  }
}

/**
 * Muestra una vista previa en consola de la información para un producto específico
 * @param {string} productCode - Código del producto a previsualizar
 */
async function previewProduct(productCode) {
  console.log(`Probando con código: ${productCode}`);

  try {
    // Utilizamos directamente la función del módulo description-scraper.js
    console.log("Obteniendo información del producto mediante scraping...");
    const descriptionResult = await getProductDescriptionAndSpecs(productCode);

    // Utilizamos directamente la función del módulo scraper.js
    console.log("Obteniendo imagen para el producto...");
    const imageResult = await getProductImage(productCode);

    // Mostrar los resultados en formato similar al Excel
    console.log("\n==================================================");
    console.log("      VISTA PREVIA DEL FORMATO DE EXCEL");
    console.log("==================================================\n");

    // Información básica
    console.log("ProductCode:", productCode);
    console.log("ImageUrl:", imageResult.imageUrl || "No disponible");

    // Verificar si la descripción se obtuvo correctamente
    if (
      descriptionResult.description !==
        `No se pudo obtener la información para ${productCode}.` &&
      descriptionResult.description !== "Error al procesar la solicitud."
    ) {
      // Mostrar descripción y especificaciones en formato limpio
      console.log("\nDescription:");
      console.log(descriptionResult.rawDescription);

      if (descriptionResult.hasSpecs) {
        console.log("\nESPECIFICACIONES TÉCNICAS:");

        // Procesar categorías para eliminar duplicidades
        const processedCategories = new Set();

        // Ignorar la primera categoría que contiene todas las especificaciones juntas
        const categories = Object.keys(descriptionResult.specs).filter(
          (cat) =>
            !cat.includes(
              "DISPOSITIVOMARCAMODELONUMERO DE PARTECARACTERISTICAS"
            )
        );

        // Procesar cada categoría individualmente
        categories.forEach((category) => {
          if (
            !processedCategories.has(category) &&
            descriptionResult.specs[category].length > 0
          ) {
            processedCategories.add(category);

            console.log(`\n${category}:`);

            // Filtrar especificaciones duplicadas usando Set
            const uniqueSpecs = [...new Set(descriptionResult.specs[category])];
            uniqueSpecs.forEach((spec) => {
              console.log(`  - ${spec}`);
            });
          }
        });
      }
    } else {
      console.log(
        "\nNo se encontró descripción en la web. Se generaría una descripción mediante plantilla."
      );
      console.log(
        "Para generar una descripción completa, se requeriría información adicional del producto."
      );
    }

    console.log("\n==================================================");
    console.log(
      "Esta información se guardará en el archivo Excel de productos."
    );
    console.log("==================================================");
  } catch (error) {
    console.error(
      `Error al obtener vista previa del producto ${productCode}:`,
      error.message
    );
  }
}

/**
 * Determina el mejor nivel de concurrencia para el entorno actual
 * @param {number} minConcurrency Mínima concurrencia a probar
 * @param {number} maxConcurrency Máxima concurrencia a probar
 * @param {string} sampleCode Código de producto para pruebas
 * @returns {Promise<number>} Nivel óptimo de concurrencia
 */
async function testConcurrencySpeed(
  minConcurrency = 2,
  maxConcurrency = 15,
  sampleCode = "ACTE70207W"
) {
  console.log(
    `Probando velocidad óptima de concurrencia (${minConcurrency}-${maxConcurrency})...`
  );

  // Cargar p-limit al inicio de la función
  const pLimit = await loadPLimit();

  const results = [];
  const numRequests = 10;

  for (
    let concurrency = minConcurrency;
    concurrency <= maxConcurrency;
    concurrency++
  ) {
    console.log(`Probando nivel de concurrencia: ${concurrency}`);
    const start = Date.now();

    const limit = pLimit(concurrency);
    const promises = Array(numRequests)
      .fill()
      .map(() => limit(() => getProductDescriptionAndSpecs(sampleCode)));

    await Promise.all(promises);
    const elapsed = Date.now() - start;
    const average = elapsed / numRequests;

    console.log(
      `Tiempo promedio por petición: ${average.toFixed(
        2
      )}ms (concurrencia ${concurrency})`
    );
    results.push({ concurrency, average });

    // Esperar un poco entre pruebas
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Encontrar el nivel de concurrencia más rápido
  results.sort((a, b) => a.average - b.average);
  const optimal = results[0].concurrency;

  console.log("Resultados de la prueba de velocidad:");
  results.forEach((r) =>
    console.log(
      `Concurrencia ${r.concurrency}: ${r.average.toFixed(2)}ms por petición`
    )
  );
  console.log(`\nNivel de concurrencia óptimo: ${optimal}`);

  return optimal;
}

// Exportar las funciones necesarias
module.exports = {
  processProducts,
  previewProduct,
  testConcurrencySpeed,
  generateDescription,
  formatSpecifications,
};

// Ejecutar según el modo (solo si se llama directamente)
if (require.main === module) {
  (async () => {
    try {
      if (mode === "test-speed") {
        // Modo prueba de velocidad: determina la concurrencia óptima
        console.log(
          "MODO PRUEBA DE VELOCIDAD: Determinando concurrencia óptima..."
        );
        const optimalConcurrency = await testConcurrencySpeed();
        console.log(
          `Recomendación: Usa node transform.js full ${optimalConcurrency}`
        );
      } else if (mode === "full") {
        // Modo completo con concurrencia opcional
        const concurrency = concurrencyArg ? parseInt(concurrencyArg) : 5;
        console.log(
          `MODO COMPLETO: Iniciando proceso de transformación con concurrencia ${concurrency}...`
        );
        await processProducts(inputFile, outputDir, { concurrency });
        console.log("Proceso completado!");
      } else if (mode === "standard") {
        // Modo estándar (completo con configuración predeterminada)
        console.log("MODO ESTÁNDAR: Iniciando proceso de transformación...");
        await processProducts(inputFile, outputDir, { concurrency: 5 });
        console.log("Proceso completado!");
      } else {
        // Modo vista previa: mostrar información de un producto específico
        console.log(`MODO PRODUCTO ESPECÍFICO: Probando con código ${mode}...`);
        await previewProduct(mode);
      }
    } catch (error) {
      console.error("Error en la ejecución:", error);
    }
  })();
}
