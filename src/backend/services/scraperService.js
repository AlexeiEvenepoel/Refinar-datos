const {
  getProductDescriptionAndSpecs,
} = require("../../../legacy/description-scrape");
const { getProductImage } = require("../../../legacy/scraper");

class ScraperService {
  async getProductInfo(productCode) {
    try {
      const [description, image] = await Promise.all([
        getProductDescriptionAndSpecs(productCode),
        getProductImage(productCode),
      ]);

      return {
        productCode,
        description,
        image,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(
        `Error obteniendo información del producto ${productCode}: ${error.message}`
      );
    }
  }
}

module.exports = new ScraperService();
