const state = {
  products: [],
  cart: new Map()
};

const productList = document.getElementById('product-list');
const selectedSummary = document.getElementById('selected-summary');
const cartCount = document.getElementById('cart-count');
const checkoutForm = document.getElementById('checkout-form');
const checkoutMessage = document.getElementById('checkout-message');
const submitButton = checkoutForm.querySelector('[type="submit"]');
const priceFormatter = new Intl.NumberFormat('ru-KZ', {
  style: 'currency',
  currency: 'KZT',
  maximumFractionDigits: 0
});
let halykScriptPromise;

function getCartItems() {
  return state.products
    .filter((product) => state.cart.has(product.id))
    .map((product) => ({ ...product, quantity: state.cart.get(product.id) }));
}

function displayPrice(price) {
  return price === 0 ? 'Бесплатно' : priceFormatter.format(price);
}

async function loadProducts() {
  try {
    const response = await fetch('/api/catalog');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось загрузить каталог.');
    }

    state.products = data.products || [];
    renderProducts();
    updateSummary();
  } catch (error) {
    productList.innerHTML = `<p class="checkout-message error">${error.message || 'Не удалось загрузить каталог.'}</p>`;
  }
}

function renderProducts() {
  productList.innerHTML = state.products
    .map((product) => {
      const quantity = state.cart.get(product.id) || 0;
      const categoryLabel = product.category === 'free'
        ? 'Бесплатное руководство'
        : product.category === 'service'
          ? 'Услуга'
          : 'PDF-книга';
      return `
        <article class="product-card ${quantity ? 'in-cart' : ''}">
          <div>
            <span class="badge">${categoryLabel}</span>
            <h3>${product.title}</h3>
            <p>${product.description.replace(/\n/g, '<br>')}</p>
          </div>
          <div class="product-meta">
            <strong>${displayPrice(product.price)}</strong>
            <button type="button" data-action="add" data-id="${product.id}" class="mini-btn">
              ${quantity ? `В корзине · ${quantity} шт.` : 'В корзину'}
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

function updateSummary() {
  const items = getCartItems();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  cartCount.textContent = count;
  if (!items.length) {
    selectedSummary.innerHTML = '<p class="empty-message">Корзина пока пуста. Добавьте книги из каталога.</p>';
    selectedSummary.classList.add('empty');
    return;
  }

  selectedSummary.classList.remove('empty');
  selectedSummary.innerHTML = `
    <div class="summary-title">Товары в заказе</div>
    <div class="cart-items">
      ${items
        .map(
          (item) => `
            <div class="cart-item">
              <div class="cart-item-info">
                <strong>${item.title}</strong>
                <span>${displayPrice(item.price)} за шт.</span>
              </div>
              <div class="cart-item-controls" aria-label="Количество: ${item.title}">
                <button type="button" data-action="decrease" data-id="${item.id}" aria-label="Уменьшить количество: ${item.title}">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-action="increase" data-id="${item.id}" aria-label="Увеличить количество: ${item.title}">+</button>
                <button type="button" data-action="remove" data-id="${item.id}" class="remove-item">Удалить</button>
              </div>
              <strong class="cart-item-total">${displayPrice(item.price * item.quantity)}</strong>
            </div>
          `
        )
        .join('')}
    </div>
    <div class="summary-total">
      <span>Итого</span>
      <strong>${priceFormatter.format(total)}</strong>
    </div>
  `;
}

function changeQuantity(productId, change) {
  const quantity = (state.cart.get(productId) || 0) + change;
  if (quantity <= 0) {
    state.cart.delete(productId);
  } else if (quantity <= 99) {
    state.cart.set(productId, quantity);
  }

  renderProducts();
  updateSummary();
}

function loadHalykWidget(scriptUrl) {
  if (window.halyk && typeof window.halyk.showPaymentWidget === 'function') {
    return Promise.resolve();
  }
  if (halykScriptPromise) return halykScriptPromise;

  halykScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      if (window.halyk && typeof window.halyk.showPaymentWidget === 'function') {
        resolve();
      } else {
        halykScriptPromise = null;
        reject(new Error('Не удалось загрузить платёжный виджет Halyk.'));
      }
    };
    script.onerror = () => {
      halykScriptPromise = null;
      reject(new Error('Не удалось подключиться к платёжному виджету Halyk.'));
    };
    document.head.appendChild(script);
  });

  return halykScriptPromise;
}

async function openHalykPayment(paymentData) {
  await loadHalykWidget(paymentData.scriptUrl);
  window.halyk.showPaymentWidget(paymentData.paymentObject, (result) => {
    if (result?.success) {
      window.location.assign(paymentData.paymentObject.backLink);
      return;
    }
    checkoutMessage.textContent = 'Оплата не завершена. Можно попробовать ещё раз.';
    checkoutMessage.classList.add('error');
  });
}

productList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="add"]');
  if (button) {
    changeQuantity(button.dataset.id, 1);
  }
});

selectedSummary.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === 'increase') changeQuantity(id, 1);
  if (action === 'decrease') changeQuantity(id, -1);
  if (action === 'remove') changeQuantity(id, -(state.cart.get(id) || 0));
});

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  checkoutMessage.textContent = '';
  checkoutMessage.classList.remove('error', 'success');

  const items = getCartItems();
  if (!items.length) {
    checkoutMessage.textContent = 'Добавьте хотя бы один товар в корзину.';
    checkoutMessage.classList.add('error');
    return;
  }

  const formData = new FormData(checkoutForm);
  const payload = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    items: items.map((item) => ({ id: item.id, quantity: item.quantity }))
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Подготовка заказа…';

  try {
    const response = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось создать заказ.');
    }

    if (data.order.total === 0) {
      checkoutMessage.textContent = `Бесплатный заказ ${data.order.id} сформирован.`;
      checkoutMessage.classList.add('success');
      state.cart.clear();
      renderProducts();
      updateSummary();
      return;
    }

    const paymentResponse = await fetch('/api/payment/halyk-epay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: data.order.id })
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) {
      throw new Error(payment.error || 'Не удалось подготовить оплату.');
    }

    await openHalykPayment(payment);
  } catch (error) {
    checkoutMessage.textContent = error.message || 'Ошибка оформления заказа.';
    checkoutMessage.classList.add('error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Перейти к оплате';
  }
});

function trackVisit() {
  const page = window.location.pathname;
  const marker = `site-visit:${page}`;
  try {
    if (sessionStorage.getItem(marker)) return;
  } catch (error) {
    console.error('Не удалось проверить отметку посещения:', error);
  }

  const userAgent = navigator.userAgent;
  const device = /iPad|Tablet|PlayBook|Silk/i.test(userAgent)
    ? 'tablet'
    : /Mobi|Android|iPhone|iPod/i.test(userAgent)
      ? 'mobile'
      : 'desktop';
  const params = new URLSearchParams(window.location.search);

  fetch('/api/analytics/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page,
      referrer: document.referrer,
      source: params.get('utm_source') || '',
      device
    })
  }).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    try {
      sessionStorage.setItem(marker, '1');
    } catch (error) {
      console.error('Не удалось сохранить отметку посещения:', error);
    }
  }).catch((error) => console.error('Не удалось записать посещение сайта:', error));
}

trackVisit();
loadProducts();
