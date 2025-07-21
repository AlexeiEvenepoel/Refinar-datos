const { processAllData } = require("../../../legacy/process-all");

class ProductService {
  async processProducts(options = {}) {
    // Ensure all concurrency values are valid numbers (not strings)
    const concurrencyTransform = Math.max(
      1,
      parseInt(options.concurrencyTransform) || 10
    );
    const concurrencyImages = Math.max(
      1,
      parseInt(options.concurrencyImages) || 20
    );
    const concurrencyDescriptions = Math.max(
      1,
      parseInt(options.concurrencyDescriptions) || 15
    );

    const processedOptions = {
      concurrencyTransform,
      concurrencyImages,
      concurrencyDescriptions,
      // Remove the spread operator to avoid overriding with string values
      inputFile: options.inputFile,
      outputDir: options.outputDir,
    };

    console.log("Opciones de procesamiento validadas:", processedOptions);
    console.log("Tipos:", {
      concurrencyTransform: typeof concurrencyTransform,
      concurrencyImages: typeof concurrencyImages,
      concurrencyDescriptions: typeof concurrencyDescriptions,
    });

    return await processAllData(processedOptions);
  }
}

module.exports = new ProductService();
