const Storage = {
  async getProducts() {
    const result = await chrome.storage.local.get('products');
    return result.products || [];
  },

  async saveProducts(products) {
    await chrome.storage.local.set({ products });
  },

  async addProduct(product) {
    const products = await this.getProducts();
    const existing = products.findIndex(p => p.asin === product.asin);
    if (existing >= 0) {
      products[existing] = { ...products[existing], ...product };
    } else {
      products.push(product);
    }
    await this.saveProducts(products);
    return products;
  },

  async removeProduct(asin) {
    const products = await this.getProducts();
    const filtered = products.filter(p => p.asin !== asin);
    await this.saveProducts(filtered);
    return filtered;
  },

  async updateProductPrice(asin, newPrice) {
    const products = await this.getProducts();
    const product = products.find(p => p.asin === asin);
    if (!product) return products;

    if (!product.priceHistory) product.priceHistory = [];
    product.priceHistory.push({
      price: newPrice,
      date: new Date().toISOString()
    });

    if (newPrice < product.lowestPrice) {
      product.lowestPrice = newPrice;
    }
    if (newPrice > product.highestPrice) {
      product.highestPrice = newPrice;
    }

    product.currentPrice = newPrice;
    product.lastChecked = new Date().toISOString();

    await this.saveProducts(products);
    return { products, product };
  },

  async getSettings() {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {
      affiliateTag: '',
      checkInterval: 60,
      notificationsEnabled: true,
      dropThreshold: 0
    };
  },

  async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }
};
