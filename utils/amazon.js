const Amazon = {
  extractASIN(url) {
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/,
      /\/gp\/product\/([A-Z0-9]{10})/,
      /\/ASIN\/([A-Z0-9]{10})/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  },

  buildAffiliateUrl(url, affiliateTag) {
    if (!affiliateTag) return url;
    try {
      const u = new URL(url);
      u.searchParams.set('tag', affiliateTag);
      return u.toString();
    } catch {
      return url;
    }
  },

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'www.amazon.com';
    }
  },

  buildProductUrl(asin, domain, affiliateTag) {
    const base = `https://${domain}/dp/${asin}`;
    if (affiliateTag) {
      return `${base}?tag=${affiliateTag}`;
    }
    return base;
  },

  parsePrice(priceText) {
    if (!priceText) return null;
    const cleaned = priceText.replace(/[^0-9.,]/g, '');
    const normalized = cleaned.replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
    const price = parseFloat(normalized);
    return isNaN(price) ? null : price;
  },

  parseCurrency(priceText) {
    if (!priceText) return '$';
    const match = priceText.match(/^([^\d\s]+)/);
    return match ? match[1] : '$';
  },

  formatPrice(price, currency = '$') {
    return `${currency}${price.toFixed(2)}`;
  },

  calculateDrop(originalPrice, currentPrice) {
    if (!originalPrice || originalPrice === 0) return 0;
    return ((originalPrice - currentPrice) / originalPrice * 100).toFixed(1);
  }
};
