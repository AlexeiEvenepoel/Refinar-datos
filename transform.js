const XLSX = require("xlsx");
const fs = require("fs");
const { getProductImage, processProductCodes } = require("./scraper");
const { getProductDescriptionAndSpecs } = require("./description-scraper");

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
 * Obtiene descripciones y especificaciones para un conjunto de códigos de producto
 * @param {string[]} productCodes - Lista de códigos de producto
 * @returns {Map} - Mapa con las descripciones y especificaciones
 */
async function getDescriptionsForProducts(productCodes) {
  console.log(
    `Obteniendo descripciones para ${productCodes.length} productos...`
  );
  const descriptionMap = new Map();

  for (let i = 0; i < productCodes.length; i++) {
    const code = productCodes[i];
    console.log(
      `Procesando descripción ${i + 1}/${productCodes.length}: ${code}`
    );

    try {
      const result = await getProductDescriptionAndSpecs(code);
      descriptionMap.set(code, result);

      // Mostrar vista previa de la información obtenida
      const preview = result.description.substring(0, 50).replace(/\n/g, " ");
      console.log(`- Descripción obtenida: ${preview}...`);
      console.log(`- Especificaciones: ${result.hasSpecs ? "Sí" : "No"}`);
    } catch (error) {
      console.error(
        `Error obteniendo descripción para ${code}: ${error.message}`
      );
    }

    // Esperar entre peticiones para no sobrecargar el servidor
    if (i < productCodes.length - 1) {
      const delay = 1000; // 1 segundo
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return descriptionMap;
}

/**
 * Procesa los productos y genera tres archivos Excel separados
 * @param {string} inputFilePath Ruta del archivo CSV de entrada
 * @param {string} outputDir Directorio de salida
 */
async function processProducts(inputFilePath, outputDir) {
  try {
    console.log("Iniciando procesamiento de datos...");

    // Leer el archivo
    const workbook = XLSX.readFile(inputFilePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    });

    let currentCategory = "";
    const products = [];
    const productCodes = [];
    const productInfoMap = new Map(); // Para almacenar información para generar descripciones

    // Mapas para mantener las marcas y categorías únicas
    const brandsMap = new Map();
    const categoriesMap = new Map();

    console.log("Extrayendo información básica y códigos de producto...");

    // Primera pasada: extraer todos los datos básicos y los códigos de producto
    for (const row of rawData) {
      // Filtrar filas vacías o no relevantes
      if (!row || row.length < 3 || !row[0]) continue;

      // Ignorar líneas divisorias o de formato
      if (
        row[0].toString().includes("_______________") ||
        row[0].toString().includes("__________________________________")
      ) {
        continue;
      }

      // Detectar líneas de categoría
      if (row[1] && row[1].toString().includes("CODIGO")) {
        if (row[2] && typeof row[2] === "string") {
          currentCategory = row[2].trim();
          if (!categoriesMap.has(currentCategory)) {
            categoriesMap.set(currentCategory, categoriesMap.size + 1);
          }
        }
        continue;
      }

      // Si es una fila de producto, extraer el código
      if (currentCategory && row[1] && !row[1].toString().includes("CODIGO")) {
        const code = row[1] ? row[1].toString().trim() : "";
        if (code) {
          productCodes.push(code);

          // Guardar información para descripción de respaldo
          const fullTitle = row[2] ? row[2].toString() : "Producto sin nombre";
          const brand = row[8] ? row[8].toString().trim() : "Sin marca";
          const rawStock = row[3] ? row[3].toString().trim() : "0";
          const stock = rawStock.startsWith(">")
            ? parseInt(rawStock.substring(1)) || 0
            : parseInt(rawStock) || 0;

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

    // Obtener descripciones mediante scraping
    console.log("Obteniendo descripciones web para los productos...");
    const descriptionsMap = await getDescriptionsForProducts(productCodes);

    // También obtener imágenes
    console.log("Obteniendo imágenes para los productos...");
    const imageResults = await processProductCodes(productCodes);
    const imageMap = new Map();
    for (const result of imageResults) {
      imageMap.set(result.productCode, {
        imageUrl: result.imageUrl,
        imageTitle: result.imageTitle,
      });
    }

    // Reiniciar para la segunda pasada
    currentCategory = "";

    // Segunda pasada: procesar todos los datos con las imágenes y descripciones
    for (const row of rawData) {
      if (!row || row.length < 3 || !row[0]) continue;

      if (
        row[0].toString().includes("_______________") ||
        row[0].toString().includes("__________________________________")
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
          const rawStock = row[3] ? row[3].toString().trim() : "0";
          const stock = rawStock.startsWith(">")
            ? parseInt(rawStock.substring(1)) || 0
            : parseInt(rawStock) || 0;

          const fullTitle = row[2] ? row[2].toString() : "Producto sin nombre";
          const cleanTitle = fullTitle.split("[@@@]")[0].trim();
          const code = row[1] ? row[1].toString().trim() : "";

          let price = 0;
          if (row[4] && row[4].toString().trim() !== "") {
            price = parseFloat(row[4].toString().replace(",", ".")) || 0;
          }

          const brand = row[8] ? row[8].toString().trim() : "Sin marca";

          if (!brandsMap.has(brand)) {
            brandsMap.set(brand, brandsMap.size + 1);
          }

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
              Title: cleanTitle,
              Description: description,
              Price: price,
              CategoryID: categoryId,
              BrandID: brandId,
              Size: "S",
              Featured: Math.random() > 0.7, // 30% de probabilidad
              Stock: stock,
              ProductCode: code,
              ImageUrl: imageInfo.imageUrl,
            });
          }
        } catch (err) {
          console.warn(`Error procesando fila: ${row.join(", ")}`);
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
    console.log(`Procesados ${products.length} productos.`);
    console.log(`Archivo de productos guardado en: ${productsOutputFile}`);
    console.log(
      `Archivo de marcas guardado en: ${brandsOutputFile} (${brands.length} marcas únicas)`
    );
    console.log(
      `Archivo de categorías guardado en: ${categoriesOutputFile} (${categories.length} categorías únicas)`
    );
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Muestra una vista previa en consola de la información para un producto específico
 * @param {string} productCode - Código del producto a previsualizar
 */
async function previewProduct(productCode) {
  console.log(`Probando con código: ${productCode}`);

  try {
    // Obtener descripción mediante scraping
    console.log("Obteniendo información del producto mediante scraping...");
    const descriptionResult = await getProductDescriptionAndSpecs(productCode);

    // Obtener imagen
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
      // Mostrar solamente la descripción original limpia, no todas las especificaciones
      console.log("\nDescription:");
      console.log(
        descriptionResult.rawDescription || descriptionResult.description
      );

      // Mostrar solo las especificaciones técnicas en formato limpio
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

// Modificar la parte de ejecución para soportar el modo de vista previa
const args = process.argv.slice(2);
const mode = args[0];

// Definir la ruta del archivo CSV de entrada
const inputFile = "./csv/DCW_20250510022958.csv";

// Asegurar que existe la carpeta output
const outputDir = "./output";
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Ejecutar según el modo
(async () => {
  try {
    if (mode && mode !== "full") {
      // Modo vista previa: mostrar información de un producto específico
      console.log(`MODO PRODUCTO ESPECÍFICO: Probando con código ${mode}...`);
      await previewProduct(mode);
    } else {
      // Modo completo: procesar todos los productos
      console.log("MODO COMPLETO: Iniciando proceso de transformación...");
      await processProducts(inputFile, outputDir);
      console.log("Proceso completado!");
    }
  } catch (error) {
    console.error("Error en la ejecución:", error);
  }
})();
