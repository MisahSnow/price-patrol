document.addEventListener('DOMContentLoaded', async () => {
  // DOM elements
  const productList = document.getElementById('productList');
  const dropList = document.getElementById('dropList');
  const emptyState = document.getElementById('emptyState');
  const emptyDrops = document.getElementById('emptyDrops');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeSettings = document.getElementById('closeSettings');
  const refreshBtn = document.getElementById('refreshBtn');
  const saveSettingsBtn = document.getElementById('saveSettings');

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
    });
  });

  // Settings panel
  settingsBtn.addEventListener('click', () => settingsPanel.classList.add('visible'));
  closeSettings.addEventListener('click', () => settingsPanel.classList.remove('visible'));

  // Load and render products
  async function loadProducts() {
    const products = await chrome.runtime.sendMessage({ type: 'GET_PRODUCTS' });
    renderProducts(products || []);
    renderDrops(products || []);
  }

  function renderProducts(products) {
    productList.innerHTML = '';

    if (!products.length) {
      emptyState.classList.add('visible');
      return;
    }

    emptyState.classList.remove('visible');

    products.forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';

      const priceDiff = product.originalPrice - product.currentPrice;
      const dropPercent = product.originalPrice > 0
        ? ((priceDiff / product.originalPrice) * 100).toFixed(1)
        : 0;

      let badgeHTML = '';
      if (priceDiff > 0) {
        badgeHTML = `<span class="price-drop-badge">-${dropPercent}%</span>`;
      } else if (priceDiff < 0) {
        const upPercent = ((-priceDiff / product.originalPrice) * 100).toFixed(1);
        badgeHTML = `<span class="price-up-badge">+${upPercent}%</span>`;
      }

      let originalHTML = '';
      if (product.currentPrice !== product.originalPrice) {
        originalHTML = `<span class="product-original">${product.currency}${product.originalPrice.toFixed(2)}</span>`;
      }

      const lastChecked = product.lastChecked
        ? timeAgo(new Date(product.lastChecked))
        : 'never';

      card.innerHTML = `
        <div class="product-image">
          ${product.image ? `<img src="${product.image}" alt="">` : ''}
        </div>
        <div class="product-info">
          <div class="product-title">${escapeHtml(product.title)}</div>
          <div class="product-meta">
            <span class="product-price">${product.currency}${product.currentPrice.toFixed(2)}</span>
            ${originalHTML}
            ${badgeHTML}
          </div>
        </div>
        <div class="product-actions">
          <button class="remove-btn" data-asin="${product.asin}" title="Remove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <span class="last-checked">${lastChecked}</span>
        </div>
      `;

      // Click to open product page
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.remove-btn')) return;
        const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        const tag = settings?.affiliateTag || '';
        let url = product.url;
        if (tag) {
          try {
            const u = new URL(url);
            u.searchParams.set('tag', tag);
            url = u.toString();
          } catch {}
        }
        chrome.tabs.create({ url });
      });

      productList.appendChild(card);
    });

    // Remove button handlers
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const asin = btn.dataset.asin;
        await chrome.runtime.sendMessage({ type: 'REMOVE_PRODUCT', asin });
        loadProducts();
        showToast('Product removed');
      });
    });
  }

  function renderDrops(products) {
    dropList.innerHTML = '';

    const drops = products
      .filter(p => p.currentPrice < p.originalPrice)
      .sort((a, b) => {
        const aDrop = (a.originalPrice - a.currentPrice) / a.originalPrice;
        const bDrop = (b.originalPrice - b.currentPrice) / b.originalPrice;
        return bDrop - aDrop;
      });

    if (!drops.length) {
      emptyDrops.classList.add('visible');
      return;
    }

    emptyDrops.classList.remove('visible');

    drops.forEach(product => {
      const dropPercent = ((product.originalPrice - product.currentPrice) / product.originalPrice * 100).toFixed(0);
      const card = document.createElement('div');
      card.className = 'drop-card';

      const lastDrop = product.priceHistory?.length > 1
        ? timeAgo(new Date(product.priceHistory[product.priceHistory.length - 1].date))
        : 'recently';

      card.innerHTML = `
        <div class="drop-info">
          <div class="drop-title">${escapeHtml(product.title)}</div>
          <div class="drop-prices">
            <span class="product-original">${product.currency}${product.originalPrice.toFixed(2)}</span>
            <span class="drop-arrow">&rarr;</span>
            <span class="product-price">${product.currency}${product.currentPrice.toFixed(2)}</span>
          </div>
          <div class="drop-date">Last updated ${lastDrop}</div>
        </div>
        <div class="drop-percent">-${dropPercent}%</div>
      `;

      card.addEventListener('click', async () => {
        const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        const tag = settings?.affiliateTag || '';
        let url = product.url;
        if (tag) {
          try {
            const u = new URL(url);
            u.searchParams.set('tag', tag);
            url = u.toString();
          } catch {}
        }
        chrome.tabs.create({ url });
      });

      dropList.appendChild(card);
    });
  }

  // Load settings
  async function loadSettings() {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (settings) {
      document.getElementById('affiliateTag').value = settings.affiliateTag || '';
      document.getElementById('checkInterval').value = settings.checkInterval || 60;
      document.getElementById('notificationsEnabled').checked = settings.notificationsEnabled !== false;
      document.getElementById('dropThreshold').value = settings.dropThreshold || 0;
    }
  }

  // Save settings
  saveSettingsBtn.addEventListener('click', async () => {
    const settings = {
      affiliateTag: document.getElementById('affiliateTag').value.trim(),
      checkInterval: parseInt(document.getElementById('checkInterval').value),
      notificationsEnabled: document.getElementById('notificationsEnabled').checked,
      dropThreshold: parseFloat(document.getElementById('dropThreshold').value) || 0
    };

    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    settingsPanel.classList.remove('visible');
    showToast('Settings saved!');
  });

  // Refresh prices
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('spinning');
    await chrome.runtime.sendMessage({ type: 'CHECK_PRICES_NOW' });
    await loadProducts();
    refreshBtn.classList.remove('spinning');
    showToast('Prices updated!');
  });

  // Utilities
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // Initialize
  await loadProducts();
  await loadSettings();
});
