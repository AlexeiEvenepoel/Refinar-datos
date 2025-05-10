const XLSX = require("xlsx");
const fs = require("fs");
const { getProductImage, processProductCodes } = require("./scraper"); // Importamos las funciones del scraper

/**
 * Genera una descripción para el producto basada en su información
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
    const productCodes = []; // Para almacenar los códigos de productos

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

      // Detectar líneas de categoría (contienen "CODIGO" en la segunda columna)
      if (row[1] && row[1].toString().includes("CODIGO")) {
        // Extraer la categoría de la tercera columna (índice 2)
        if (row[2] && typeof row[2] === "string") {
          currentCategory = row[2].trim();
          // Añadir a mapa de categorías si no existe
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
        }
      }
    }

    console.log(
      `Se han identificado ${productCodes.length} códigos de productos.`
    );
    console.log("Obteniendo imágenes para todos los productos...");

    // Llamamos al servicio del scraper para obtener todas las imágenes
    const imageResults = await processProductCodes(productCodes);

    // Convertir los resultados a un mapa para acceso fácil
    const imageMap = new Map();
    for (const result of imageResults) {
      imageMap.set(result.productCode, {
        imageUrl: result.imageUrl,
        imageTitle: result.imageTitle,
      });
    }

    console.log(`Se obtuvieron ${imageMap.size} imágenes de productos.`);
    console.log("Procesando datos completos de productos...");

    // Reiniciar para la segunda pasada
    currentCategory = "";

    // Segunda pasada: procesar todos los datos con las imágenes
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

      // Actualizar categoría actual si es línea de categoría
      if (row[1] && row[1].toString().includes("CODIGO")) {
        if (row[2] && typeof row[2] === "string") {
          currentCategory = row[2].trim();
        }
        continue;
      }

      // Si es una fila de producto (verificamos que tenga un código y que no sea una fila de cabecera)
      if (currentCategory && row[1] && !row[1].toString().includes("CODIGO")) {
        try {
          const rawStock = row[3] ? row[3].toString().trim() : "0";
          const stock = rawStock.startsWith(">")
            ? parseInt(rawStock.substring(1)) || 0
            : parseInt(rawStock) || 0;

          const fullTitle = row[2] ? row[2].toString() : "Producto sin nombre";
          const cleanTitle = fullTitle.split("[@@@]")[0].trim();
          const code = row[1] ? row[1].toString().trim() : "";

          // El precio está en la columna 4 (índice 4), o si está vacía en columna 5 (índice 5)
          let price = 0;
          if (row[4] && row[4].toString().trim() !== "") {
            price = parseFloat(row[4].toString().replace(",", ".")) || 0;
          }

          const brand = row[8] ? row[8].toString().trim() : "Sin marca";

          // Añadir marca al mapa si no existe
          if (!brandsMap.has(brand)) {
            brandsMap.set(brand, brandsMap.size + 1);
          }

          if (cleanTitle && cleanTitle !== "" && price > 0) {
            // Obtener información de la imagen
            const imageInfo = imageMap.get(code) || {
              imageUrl: "",
              imageTitle: `Producto ${code}`,
            };

            // Generar descripción basada en la información del producto
            const productInfo = {
              title: cleanTitle,
              fullTitle: fullTitle,
              category: currentCategory,
              brand: brand,
              stock: stock,
              code: code,
            };

            const description = generateDescription(productInfo);

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
              ImageUrl: imageInfo.imageUrl, // Nueva columna con URL de imagen
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

// Configuración
const inputFile = "csv/DCW_20250509062026.csv";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = "./output";

// Asegurar que existe la carpeta output
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Ejecutar (ahora es async)
(async () => {
  console.log("Iniciando proceso de transformación...");
  await processProducts(inputFile, outputDir);
  console.log("Proceso completado!");
})();
