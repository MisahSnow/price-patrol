(() => {
  function extractProductInfo() {
    const info = {
      title: '',
      price: null,
      currency: '$',
      image: '',
      asin: '',
      url: window.location.href,
      domain: window.location.hostname
    };

    // Extract ASIN
    const asinPatterns = [
      /\/dp\/([A-Z0-9]{10})/,
      /\/gp\/product\/([A-Z0-9]{10})/
    ];
    for (const pattern of asinPatterns) {
      const match = window.location.href.match(pattern);
      if (match) {
        info.asin = match[1];
        break;
      }
    }

    // Extract title
    const titleEl = document.getElementById('productTitle');
    if (titleEl) {
      info.title = titleEl.textContent.trim();
    }

    // Extract price - try multiple selectors
    const priceSelectors = [
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#priceblock_saleprice',
      '.a-price-whole',
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      'span.a-price span.a-offscreen'
    ];

    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent.trim();
        if (text) {
          const priceMatch = text.replace(/[^0-9.,]/g, '');
          const normalized = priceMatch.replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
          const price = parseFloat(normalized);
          if (!isNaN(price) && price > 0) {
            info.price = price;
            const currMatch = text.match(/^([^\d\s]+)/);
            if (currMatch) info.currency = currMatch[1];
            break;
          }
        }
      }
    }

    // Extract image
    const imgEl = document.getElementById('landingImage') ||
                  document.getElementById('imgBlkFront') ||
                  document.querySelector('#imageBlock img') ||
                  document.querySelector('#main-image-container img');
    if (imgEl) {
      info.image = imgEl.src || imgEl.getAttribute('data-old-hires') || '';
    }

    return info;
  }

  function createTrackButton(productInfo) {
    // Remove existing button if any
    const existing = document.getElementById('price-patrol-btn');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'price-patrol-btn';

    const btn = document.createElement('button');
    btn.className = 'pp-track-btn';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>
      <span>Track Price</span>
    `;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="pp-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke-dasharray="30 60"></circle>
        </svg>
        <span>Adding...</span>
      `;

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'ADD_PRODUCT',
          product: {
            asin: productInfo.asin,
            title: productInfo.title,
            currentPrice: productInfo.price,
            originalPrice: productInfo.price,
            lowestPrice: productInfo.price,
            highestPrice: productInfo.price,
            currency: productInfo.currency,
            image: productInfo.image,
            url: productInfo.url,
            domain: productInfo.domain,
            dateAdded: new Date().toISOString(),
            lastChecked: new Date().toISOString(),
            priceHistory: [{
              price: productInfo.price,
              date: new Date().toISOString()
            }]
          }
        });

        btn.classList.add('pp-tracked');
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Tracking!</span>
        `;
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>Try Again</span>
        `;
      }
    });

    container.appendChild(btn);

    // Insert near the price or buy box
    const buyBox = document.getElementById('rightCol') ||
                   document.getElementById('buyBoxAccordion') ||
                   document.getElementById('desktop_buybox');
    if (buyBox) {
      buyBox.prepend(container);
    } else {
      const priceDiv = document.getElementById('corePrice_feature_div') ||
                       document.getElementById('corePriceDisplay_desktop_feature_div');
      if (priceDiv) {
        priceDiv.parentElement.insertBefore(container, priceDiv.nextSibling);
      }
    }
  }

  // Check if product is already tracked
  async function checkIfTracked(asin) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_PRODUCT',
        asin
      });
      return response?.tracked || false;
    } catch {
      return false;
    }
  }

  async function init() {
    const productInfo = extractProductInfo();
    if (!productInfo.asin || !productInfo.price) return;

    const isTracked = await checkIfTracked(productInfo.asin);

    createTrackButton(productInfo);

    if (isTracked) {
      const btn = document.querySelector('.pp-track-btn');
      if (btn) {
        btn.classList.add('pp-tracked');
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Tracking</span>
        `;
      }
    }
  }

  // Run when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
