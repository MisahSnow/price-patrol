importScripts('../utils/storage.js', '../utils/amazon.js');

// Set up alarm for periodic price checks
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await Storage.getSettings();
  chrome.alarms.create('priceCheck', {
    periodInMinutes: settings.checkInterval || 60
  });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep the message channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case 'ADD_PRODUCT':
      return await addProduct(message.product);

    case 'REMOVE_PRODUCT':
      return await Storage.removeProduct(message.asin);

    case 'CHECK_PRODUCT':
      return await checkProduct(message.asin);

    case 'GET_PRODUCTS':
      return await Storage.getProducts();

    case 'GET_SETTINGS':
      return await Storage.getSettings();

    case 'SAVE_SETTINGS':
      await Storage.saveSettings(message.settings);
      // Update alarm interval
      chrome.alarms.clear('priceCheck');
      chrome.alarms.create('priceCheck', {
        periodInMinutes: message.settings.checkInterval || 60
      });
      return { success: true };

    case 'CHECK_PRICES_NOW':
      await checkAllPrices();
      return { success: true };

    default:
      return { error: 'Unknown message type' };
  }
}

async function addProduct(product) {
  const products = await Storage.addProduct(product);
  updateBadge(products);
  return { success: true, products };
}

async function checkProduct(asin) {
  const products = await Storage.getProducts();
  const tracked = products.some(p => p.asin === asin);
  return { tracked };
}

// Check all tracked product prices
async function checkAllPrices() {
  const products = await Storage.getProducts();
  const settings = await Storage.getSettings();

  for (const product of products) {
    try {
      const newPrice = await fetchProductPrice(product);
      if (newPrice !== null && newPrice !== product.currentPrice) {
        const oldPrice = product.currentPrice;
        const { product: updatedProduct } = await Storage.updateProductPrice(product.asin, newPrice);

        // Notify if price dropped
        if (newPrice < oldPrice) {
          const dropPercent = Amazon.calculateDrop(oldPrice, newPrice);
          const meetsThreshold = !settings.dropThreshold || parseFloat(dropPercent) >= settings.dropThreshold;

          if (settings.notificationsEnabled && meetsThreshold) {
            const affiliateUrl = Amazon.buildProductUrl(product.asin, product.domain, settings.affiliateTag);
            chrome.notifications.create(`price-drop-${product.asin}`, {
              type: 'basic',
              iconUrl: product.image || '../icons/icon128.png',
              title: '🔥 Price Drop Alert!',
              message: `${product.title.substring(0, 60)}...\n${product.currency}${oldPrice.toFixed(2)} → ${product.currency}${newPrice.toFixed(2)} (${dropPercent}% off!)`,
              priority: 2
            });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to check price for ${product.asin}:`, err);
    }

    // Small delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Fetch current price from Amazon product page
async function fetchProductPrice(product) {
  try {
    const url = `https://${product.domain}/dp/${product.asin}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const priceSelectors = [
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      'span.a-price span.a-offscreen'
    ];

    for (const selector of priceSelectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const price = Amazon.parsePrice(el.textContent);
        if (price !== null && price > 0) return price;
      }
    }

    return null;
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  }
}

// Handle notification clicks - open the product with affiliate link
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('price-drop-')) {
    const asin = notificationId.replace('price-drop-', '');
    const products = await Storage.getProducts();
    const settings = await Storage.getSettings();
    const product = products.find(p => p.asin === asin);

    if (product) {
      const url = Amazon.buildProductUrl(product.asin, product.domain, settings.affiliateTag);
      chrome.tabs.create({ url });
    }
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'priceCheck') {
    checkAllPrices();
  }
});

// Update badge with tracked product count
async function updateBadge(products) {
  if (!products) products = await Storage.getProducts();
  const count = products.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
}

// Initialize badge on startup
updateBadge();
