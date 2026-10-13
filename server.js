require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { createHmac, randomInt, randomUUID, timingSafeEqual } = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const HALYK_PRODUCTION = (process.env.HALYK_EPAY_MODE || 'production').toLowerCase() !== 'test';
const HALYK_OAUTH_URL = process.env.HALYK_EPAY_OAUTH_URL || (
  HALYK_PRODUCTION
    ? 'https://epay-oauth.homebank.kz/oauth2/token'
    : 'https://testoauth.homebank.kz/epay2/oauth2/token'
);
const HALYK_STATUS_URL = process.env.HALYK_EPAY_STATUS_URL || (
  HALYK_PRODUCTION
    ? 'https://epay-api.homebank.kz/check-status/payment/transaction'
    : 'https://test-epay-api.epayment.kz/check-status/payment/transaction'
);
const HALYK_WIDGET_URL = process.env.HALYK_EPAY_WIDGET_URL || (
  HALYK_PRODUCTION
    ? 'https://epay.homebank.kz/payform/payment-api.js'
    : 'https://test-epay.epayment.kz/payform/payment-api.js'
);

const products = [
  {
    id: 'book-simpler-life',
    title: 'Когда жизнь проще простого',
    category: 'book',
    price: 9900,
    description: 'Книга помогает быстро вернуть спокойствие, убрать стресс и очистить голову от лишних мыслей. Простые практики подходят каждому и дают лёгкость, ясность и желание жить.',
    slug: 'kogda-zhizn-proshche-prostogo',
    accessUrl: 'https://drive.google.com/file/d/1b4w7qtYAgj2tsdrojP1g0Nfa1mlCvLf2/view?usp=drive_link'
  },
  {
    id: 'book-panic-anger',
    title: 'ИСТЕРИКИ, КРИКИ, ПАНИКА, ЗЛОСТЬ, ГНЕВ',
    category: 'book',
    price: 9900,
    description: 'Простые упражнения помогают снизить тревогу, очистить мысли и вернуть энергию всего за 30 минут. Метод включает систему уровней состояния, технику «20 проблем», дыхательные практики и фиксацию побед. Подходит для ежедневного применения без подготовки.',
    slug: 'isteriki-kriki-panika-zlost-gnev',
    accessUrl: 'https://drive.google.com/file/d/1TpAnd_RgB6x4gemcK46WQW-aZ9k6HRB-/view?usp=drive_link'
  },
  {
    id: 'book-child-fears',
    title: 'Ребёнок боится ночью — и не только ночью',
    category: 'book',
    price: 9900,
    description: '21-дневная программа, которая помогает ребёнку научиться справляться со страхом и тревогой. Простые упражнения. Реальные результаты. Навык, который остаётся на всю жизнь.',
    slug: 'rebenok-boitsya-nochyu',
    accessUrl: 'https://drive.google.com/file/d/1qhy0hfRdeLGjxt10aS_ibO5VZ0hohK8p/view?usp=drive_link'
  },
  {
    id: 'book-your-enemy',
    title: 'Кто твой враг?',
    category: 'book',
    price: 11900,
    description: 'Как за 7, 21 или 40 дней превратить страх в союзника и вернуть контроль над жизнью. Твой мозг врёт тебе про опасность каждый день. Тысячи раз. Результат — тревога, апатия, потеря вкуса к жизни. Эта система — аварийный тормоз.',
    slug: 'kto-tvoy-vrag',
    accessUrl: 'https://drive.google.com/file/d/1RzTaARGxWeeJRea6-XvBNaxDMZDc-pce/view?usp=drive_link'
  },
  {
    id: 'book-inclusion',
    title: 'Включение',
    category: 'book',
    price: 10000,
    description: 'Эта книга — не про мотивацию, позитивное мышление или «возьми себя в руки». Это пошаговая система возвращения к себе и состоянию, которое было в детстве, до того, как тебя научили бояться.\n\nВы узнаете, почему 90% людей живут на автопилоте; как выученная беспомощность превращает вас в щуку, которая умирает от голода, окружённая едой; как Термометр состояния (от −6 до +6) показывает, где вы теряете, а где приобретаете; и какие 4 инструмента включают вас за 40 дней.\n\nАдреналин — это потеря. Эндорфин — это приобретение. Перестаньте быть белкой в колесе. Станьте белкой на дереве.',
    slug: 'vklyuchenie'
  },
  {
    id: 'book-happy-woman',
    title: '70 способов стать счастливой женщиной',
    category: 'book',
    price: 4700,
    description: 'Простая практическая книга о том, как вернуть гармонию, уверенность и радость в повседневную жизнь.',
    slug: '70-sposobov-stat-schastlivoy-zhenshchinoy',
    accessUrl: 'https://drive.google.com/file/d/1dvWPiQjtSVu6BZEzPWtKieOIsbQiuLkS/view?usp=drive_link'
  },
  {
    id: 'consultation',
    title: 'Личная консультация',
    category: 'service',
    price: 100000,
    description: 'Индивидуальная консультация по личной стратегии, внутренним блокам и целям.',
    slug: 'lichnaya-konsultaciya'
  },
  {
    id: 'life-state-thermometer',
    title: 'Градусник состояний жизни',
    category: 'free',
    price: 0,
    description: 'Практическое руководство, которое поможет определить своё текущее состояние, понять причины внутреннего спада и научиться управлять эмоциями, энергией и качеством жизни с помощью простых ежедневных инструментов.',
    slug: 'gradusnik-sostoyaniy-zhizni',
    accessUrl: 'https://drive.google.com/file/d/1xMtxZ2w3p_2EXg0H_jDH7hNmkxdKDDwe/view?usp=drive_link'
  }
];

const orders = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/program/vklyuchenie', (req, res) => {
  if (!isValidInclusionAccessToken(req.query.access)) {
    return res.status(403).send('Ссылка недействительна. Откройте ссылку из письма после покупки.');
  }

  res.set('Cache-Control', 'private, no-store');
  return res.sendFile(path.join(__dirname, 'programs', 'vklyuchenie.html'), (error) => {
    if (error && !res.headersSent) {
      console.error('Inclusion program page could not be served:', error);
      res.status(500).send('Не удалось открыть программу. Попробуйте позже.');
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));

function formatPrice(value) {
  return Number(value).toLocaleString('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  });
}

function getProductById(id) {
  return products.find((product) => product.id === id);
}

function getHalykCredentials() {
  return {
    clientId: process.env.HALYK_EPAY_CLIENT_ID?.trim(),
    clientSecret: process.env.HALYK_EPAY_CLIENT_SECRET?.trim(),
    terminalId: process.env.HALYK_EPAY_TERMINAL_ID?.trim()
  };
}

function isHalykConfigured() {
  const { clientId, clientSecret, terminalId } = getHalykCredentials();
  return Boolean(clientId && clientSecret && terminalId);
}

function generateInvoiceId() {
  let invoiceId;
  do {
    invoiceId = `${String(Date.now() % 1_000_000_000).padStart(9, '0')}${randomInt(100_000, 1_000_000)}`;
  } while ([...orders.values()].some((order) => order.invoiceId === invoiceId));
  return invoiceId;
}

function signOrderState(order, purpose) {
  const { clientSecret } = getHalykCredentials();
  if (!clientSecret) {
    throw new Error('Halyk ePay ClientSecret is not configured.');
  }
  return createHmac('sha256', clientSecret)
    .update(`timur-shop:${purpose}:${order.id}:${order.invoiceId}`)
    .digest('hex');
}

function safeEqual(leftValue, rightValue) {
  if (typeof leftValue !== 'string' || typeof rightValue !== 'string' || !leftValue || !rightValue) {
    return false;
  }
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function getInclusionAccessSignature(orderId) {
  const secret = process.env.BOOK_ACCESS_SECRET?.trim() || getHalykCredentials().clientSecret;
  if (!secret) {
    throw new Error('Set BOOK_ACCESS_SECRET or configure HALYK_EPAY_CLIENT_SECRET to protect program links.');
  }
  return createHmac('sha256', secret).update(`inclusion:${orderId}`).digest('hex');
}

function createInclusionAccessLink(orderId) {
  const link = new URL('/program/vklyuchenie', PUBLIC_BASE_URL);
  link.searchParams.set('access', `${orderId}.${getInclusionAccessSignature(orderId)}`);
  return link.toString();
}

function isValidInclusionAccessToken(token) {
  if (typeof token !== 'string') return false;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return false;

  const orderId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^TS-[a-zA-Z0-9-]+$/.test(orderId)) return false;

  try {
    return safeEqual(signature, getInclusionAccessSignature(orderId));
  } catch (error) {
    console.error('Inclusion program access is not configured:', error.message);
    return false;
  }
}

async function readHalykResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function getHalykErrorMessage(body, fallback) {
  return body.error_description || body.error || body.message || fallback;
}

async function createHalykAccessToken(order, scope) {
  const { clientId, clientSecret, terminalId } = getHalykCredentials();
  const postLink = `${PUBLIC_BASE_URL}/api/payment/callback`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope,
    client_id: clientId,
    client_secret: clientSecret,
    terminal: terminalId
  });

  if (order) {
    params.set('invoiceID', order.invoiceId);
    params.set('secret_hash', signOrderState(order, 'callback'));
    params.set('amount', String(order.total));
    params.set('currency', 'KZT');
    params.set('postLink', postLink);
    params.set('failurePostLink', postLink);
  }

  const response = await fetch(HALYK_OAUTH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: params,
    signal: AbortSignal.timeout(15000)
  });
  const body = await readHalykResponse(response);
  if (!response.ok || typeof body.access_token !== 'string' || !body.access_token) {
    const detail = getHalykErrorMessage(body, `HTTP ${response.status}`);
    throw new Error(`Halyk ePay token request failed: ${detail}`);
  }
  return body;
}

async function getHalykTransaction(order) {
  const { terminalId } = getHalykCredentials();
  const auth = await createHalykAccessToken(null, 'webapi usermanagement email_send verification statement statistics payment');
  const response = await fetch(`${HALYK_STATUS_URL.replace(/\/$/, '')}/${encodeURIComponent(order.invoiceId)}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${auth.access_token}`
    },
    signal: AbortSignal.timeout(15000)
  });
  const transactionResponse = await readHalykResponse(response);
  if (!response.ok) {
    throw new Error(`Halyk ePay status request failed: ${getHalykErrorMessage(transactionResponse, `HTTP ${response.status}`)}`);
  }

  const transaction = transactionResponse.transaction;
  if (!transaction) {
    return { state: 'pending' };
  }

  const invoiceId = String(transaction.invoiceID || transaction.invoiceId || '');
  const amount = Number(transaction.amount);
  const currency = String(transaction.currency || '').toUpperCase();
  const transactionTerminal = String(transaction.terminalID || transaction.terminal || '');
  if (
    (invoiceId && invoiceId !== order.invoiceId) ||
    amount !== order.total ||
    currency !== 'KZT' ||
    (transactionTerminal && transactionTerminal !== terminalId)
  ) {
    throw new Error('Halyk ePay transaction data does not match the order.');
  }

  const resultCode = String(transactionResponse.resultCode || '');
  const statusName = String(transaction.statusName || '').toUpperCase();
  if (resultCode === '100' && statusName === 'CHARGE') {
    return { state: 'paid' };
  }
  if (resultCode === '102') {
    return { state: 'unpaid' };
  }
  if (
    resultCode === '107' ||
    (resultCode === '100' && ['NEW', 'FINGERPRINT', 'AUTH'].includes(statusName))
  ) {
    return { state: 'pending' };
  }
  return { state: 'failed' };
}

async function deliverPaidOrder(order) {
  if (order.emailSentAt) return;
  if (order.emailDeliveryPromise) return order.emailDeliveryPromise;

  order.emailDeliveryPromise = (async () => {
    try {
      await sendOrderEmail(order);
      order.status = 'paid';
      order.delivered = true;
      order.emailSentAt = new Date().toISOString();
    } catch (error) {
      order.status = 'paid_pending_email';
      throw error;
    } finally {
      delete order.emailDeliveryPromise;
    }
  })();

  return order.emailDeliveryPromise;
}

async function refreshOrderPayment(order) {
  if (order.emailSentAt) {
    return { state: 'paid', delivered: true };
  }
  if (!isHalykConfigured()) {
    throw new Error('Halyk ePay credentials are not configured.');
  }

  const result = await getHalykTransaction(order);
  if (result.state === 'paid') {
    order.status = 'paid';
    order.paidAt = order.paidAt || new Date().toISOString();
    await deliverPaidOrder(order);
    return { state: 'paid', delivered: true };
  }
  if (result.state === 'failed' || result.state === 'unpaid') {
    order.status = result.state;
  }
  return { state: result.state, delivered: false };
}

function buildDeliveryText(order) {
  const itemsText = order.items
    .map((item) => `- ${item.title}${item.quantity > 1 ? ` × ${item.quantity}` : ''} (${formatPrice(item.price * (item.quantity || 1))})`)
    .join('\n');
  const missingLinks = order.items
    .filter((item) => item.category === 'book' && !item.accessUrl && item.id !== 'book-inclusion')
    .map((item) => item.title);
  const accessText = order.accessLinks.length
    ? `Доступ к материалам: ${order.accessLinks.join('\n')}${missingLinks.length ? `\n\nСсылка на книгу «${missingLinks.join('», «')}» пока не настроена. Пожалуйста, свяжитесь с поддержкой.` : ''}`
    : order.items.some((item) => item.category === 'book')
      ? `Ссылка на книгу «${missingLinks.join('», «')}» пока не настроена. Пожалуйста, свяжитесь с поддержкой.`
      : 'Для согласования времени личной консультации свяжитесь с нами по контактам на сайте.';

  return `Здравствуйте!\n\nСпасибо за покупку в магазине Timur Shorabekov.\n\nВаш заказ: ${order.id}\n${itemsText}\n\nИтог: ${formatPrice(order.total)}\n\n${accessText}\n\nЕсли у вас возникнут вопросы, напишите на email: ${process.env.CONTACT_EMAIL || 'timursorabekov@gmail.com'}\n`;
}

function buildInclusionNotificationText(order) {
  const itemsText = order.items
    .filter((item) => item.id === 'book-inclusion')
    .map((item) => `- ${item.title}${item.quantity > 1 ? ` × ${item.quantity}` : ''} (${formatPrice(item.price * (item.quantity || 1))})`)
    .join('\n');

  return `Новая оплаченная покупка «Включение»\n\nЗаказ: ${order.id}\nИмя: ${order.name}\nТелефон: ${order.phone}\nEmail покупателя: ${order.email}\n\nТовар:\n${itemsText}\n\nИтого заказа: ${formatPrice(order.total)}\n`;
}

async function sendOrderEmail(order) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Email не отправлен: настройте SMTP_HOST, SMTP_USER и SMTP_PASS.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: { user, pass }
  });
  const missingLinks = order.items
    .filter((item) => item.category === 'book' && !item.accessUrl && item.id !== 'book-inclusion')
    .map((item) => item.title);

  if (
    order.items.some((item) => item.id === 'book-inclusion') &&
    !order.inclusionOwnerNotifiedAt
  ) {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to: process.env.STORE_NOTIFICATION_EMAIL || process.env.CONTACT_EMAIL || 'timursorabekov@gmail.com',
      subject: `Оплачена «Включение» — заказ ${order.id}`,
      text: buildInclusionNotificationText(order)
    });
    order.inclusionOwnerNotifiedAt = new Date().toISOString();
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to: order.email,
    subject: `Ваши материалы — заказ ${order.id}`,
    text: buildDeliveryText(order),
    html: `<p>Здравствуйте!</p><p>Спасибо за покупку в магазине Timur Shorabekov.</p><p><strong>Заказ:</strong> ${order.id}</p>${order.items.map((item) => `<p>- ${item.title}${item.quantity > 1 ? ` × ${item.quantity}` : ''} (${formatPrice(item.price * (item.quantity || 1))})</p>`).join('')}<p><strong>Итог:</strong> ${formatPrice(order.total)}</p>${order.accessLinks.length ? `<p>Доступ к материалам:</p>${order.accessLinks.map((link) => `<p><a href="${link}">${link}</a></p>`).join('')}` : order.items.some((item) => item.category === 'book') ? `<p>Ссылка на книгу «${missingLinks.join('», «')}» пока не настроена. Пожалуйста, свяжитесь с поддержкой.</p>` : '<p>Для согласования времени личной консультации свяжитесь с нами по контактам на сайте.</p>'}${order.accessLinks.length && missingLinks.length ? `<p>Ссылка на книгу «${missingLinks.join('», «')}» пока не настроена. Пожалуйста, свяжитесь с поддержкой.</p>` : ''}<p>Если у вас возникнут вопросы, напишите: ${process.env.CONTACT_EMAIL || 'timursorabekov@gmail.com'}</p>`
  });

  return true;
}

function buildAccessLinks(items, orderId) {
  return [...new Set(items
    .map((item) => item.accessUrl || (item.id === 'book-inclusion' && orderId
      ? createInclusionAccessLink(orderId)
      : null))
    .filter(Boolean))];
}

app.get('/api/catalog', (req, res) => {
  res.json({
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      price: product.price,
      category: product.category,
      description: product.description,
      formattedPrice: formatPrice(product.price)
    }))
  });
});

app.post('/api/create-order', async (req, res) => {
  const { name, email, phone, items } = req.body || {};

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof email !== 'string' || !email.trim() ||
    typeof phone !== 'string' || !phone.trim() ||
    !Array.isArray(items) || items.length === 0
  ) {
    return res.status(400).json({ error: 'Заполните имя, телефон, email и выберите хотя бы один товар.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Укажите корректный email.' });
  }

  const selectedProducts = [];
  for (const item of items) {
    const product = getProductById(item?.id);
    const quantity = Number(item?.quantity ?? 1);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: 'Проверьте товары и их количество в корзине.' });
    }
    const existing = selectedProducts.find((selected) => selected.id === product.id);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > 99) {
        return res.status(400).json({ error: 'В корзине можно заказать не более 99 экземпляров одного товара.' });
      }
    } else {
      selectedProducts.push({ ...product, quantity });
    }
  }

  const total = selectedProducts.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
  const orderId = `TS-${Date.now()}-${randomUUID().slice(0, 6)}`;

  const order = {
    id: orderId,
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    items: selectedProducts,
    total,
    status: 'pending',
    createdAt: new Date().toISOString(),
    accessLinks: buildAccessLinks(selectedProducts, orderId),
    delivered: false
  };

  orders.set(orderId, order);

  if (total === 0) {
    try {
      await sendOrderEmail(order);
      order.status = 'fulfilled';
      order.delivered = true;
      order.emailSentAt = new Date().toISOString();
    } catch (error) {
      console.error('Free order email send failed:', error);
      order.status = 'email_pending';
      return res.status(502).json({
        error: 'Бесплатный заказ создан, но письмо не отправлено. Проверьте настройки почты и обратитесь в поддержку.',
        orderId
      });
    }
  }

  return res.json({
    ok: true,
    order: {
      id: order.id,
      total: order.total,
      status: order.status,
      items: order.items.map(({ id, title, price, quantity }) => ({ id, title, price, quantity }))
    },
    payment: {
      orderId,
      amount: total,
      currency: 'KZT',
      description: 'Оплата продукта / курса / консультации',
      testMode: !HALYK_PRODUCTION
    }
  });
});

app.post('/api/payment/halyk-epay', async (req, res) => {
  const { orderId } = req.body || {};
  const order = orders.get(orderId);

  if (!order) {
    return res.status(404).json({ error: 'Заказ не найден.' });
  }

  if (order.total === 0) {
    return res.status(400).json({ error: 'Заказ бесплатный — оплата не требуется.' });
  }

  if (!isHalykConfigured()) {
    return res.status(503).json({
      error: 'Оплата не настроена: добавьте Client ID, Client Secret и Terminal ID Halyk ePay в переменные окружения сервера.'
    });
  }

  order.invoiceId = order.invoiceId || generateInvoiceId();
  const { terminalId } = getHalykCredentials();
  let auth;
  try {
    auth = await createHalykAccessToken(order, 'payment');
  } catch (error) {
    console.error('Halyk ePay payment token request failed:', error);
    return res.status(502).json({
      error: 'Банк не выдал токен для оплаты. Проверьте Client ID, Client Secret и Terminal ID Halyk ePay.'
    });
  }

  const paymentState = signOrderState(order, 'return');
  const successUrl = new URL('/payment/success', PUBLIC_BASE_URL);
  successUrl.searchParams.set('orderId', order.id);
  successUrl.searchParams.set('invoiceId', order.invoiceId);
  successUrl.searchParams.set('state', paymentState);
  const failureUrl = new URL('/payment/failure', PUBLIC_BASE_URL);
  failureUrl.searchParams.set('orderId', order.id);

  const paymentObject = {
    invoiceId: order.invoiceId,
    backLink: successUrl.toString(),
    failureBackLink: failureUrl.toString(),
    postLink: `${PUBLIC_BASE_URL}/api/payment/callback`,
    failurePostLink: `${PUBLIC_BASE_URL}/api/payment/callback`,
    language: 'rus',
    description: `Оплата заказа ${order.id}`.slice(0, 125),
    accountId: order.id,
    data: JSON.stringify({ orderId: order.id }),
    terminal: terminalId,
    amount: order.total,
    currency: 'KZT',
    email: order.email,
    phone: order.phone,
    auth
  };

  return res.json({
    ok: true,
    scriptUrl: HALYK_WIDGET_URL,
    paymentObject,
    orderId: order.id,
    amount: order.total,
    currency: 'KZT',
    demoMode: !HALYK_PRODUCTION
  });
});

app.post('/api/payment/callback', async (req, res) => {
  const invoiceId = String(req.body.invoiceId || req.body.invoiceID || req.body.invoice_id || '');
  const providedHash = String(req.body.secret_hash || req.body.secretHash || '');
  const order = [...orders.values()].find((candidate) => candidate.invoiceId === invoiceId);
  if (!order) {
    return res.status(404).json({ error: 'Заказ по номеру платежа не найден.' });
  }
  if (!safeEqual(signOrderState(order, 'callback'), providedHash)) {
    return res.status(401).json({ error: 'Подпись уведомления Halyk ePay не прошла проверку.' });
  }

  try {
    const result = await refreshOrderPayment(order);
    return res.json({ ok: true, invoiceId, status: result.state });
  } catch (error) {
    console.error('Halyk ePay callback processing failed:', error);
    return res.status(502).json({ error: 'Не удалось проверить платёж или отправить письмо. Банк может повторить уведомление.' });
  }
});

app.get('/api/order/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Заказ не найден.' });
  }

  return res.json({
    order: {
      id: order.id,
      status: order.status,
      total: order.total,
      delivered: order.delivered,
      emailSentAt: order.emailSentAt
    }
  });
});

app.get('/api/order/:id/payment-status', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Заказ не найден.' });
  }

  const { invoiceId, state } = req.query;
  if (
    invoiceId !== order.invoiceId ||
    !safeEqual(signOrderState(order, 'return'), String(state || ''))
  ) {
    return res.status(403).json({ error: 'Не удалось проверить ссылку возврата после оплаты.' });
  }

  try {
    const result = await refreshOrderPayment(order);
    return res.json({ orderId: order.id, status: result.state, delivered: result.delivered });
  } catch (error) {
    console.error('Halyk ePay return status check failed:', error);
    return res.status(502).json({ error: 'Не удалось подтвердить оплату. Письмо будет отправлено после подтверждения банка.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, name: 'timur-shorabekov-store' });
});

app.get('/payment/success', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Проверка оплаты</title><body style="font:16px Arial,sans-serif;max-width:640px;margin:12vh auto;padding:24px;color:#172033"><h1>Проверяем оплату</h1><p id="payment-status">Банк подтвердит платёж, после чего мы отправим ссылку на материалы на вашу почту.</p><p><a href="/">Вернуться в магазин</a></p><script>const q=new URLSearchParams(location.search),orderId=q.get('orderId'),invoiceId=q.get('invoiceId'),state=q.get('state'),status=document.getElementById('payment-status');async function check(){if(!orderId||!invoiceId||!state){status.textContent='Не удалось определить заказ. Если вы оплатили, проверьте почту или обратитесь в поддержку.';return}try{const p=new URLSearchParams({invoiceId,state}),r=await fetch('/api/order/'+encodeURIComponent(orderId)+'/payment-status?'+p),d=await r.json();if(!r.ok)throw new Error(d.error);if(d.status==='paid'&&d.delivered){status.textContent='Оплата подтверждена. Письмо со ссылкой на материалы отправлено на вашу почту.';return}if(d.status==='failed'||d.status==='unpaid'){status.textContent='Банк не подтвердил оплату. Вернитесь в магазин и попробуйте ещё раз.';return}status.textContent='Платёж проверяется. Обновим статус автоматически; письмо придёт после подтверждения банка.';setTimeout(check,3000)}catch(e){status.textContent=e.message||'Пока не удалось проверить оплату. Обратитесь в поддержку, если деньги списались.'}}check()</script></body></html>`);
});

app.get('/payment/failure', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Оплата не завершена</title><body style="font:16px Arial,sans-serif;max-width:640px;margin:12vh auto;padding:24px;color:#172033"><h1>Оплата не завершена</h1><p>Платёж не был подтверждён. Проверьте данные карты или попробуйте оформить заказ ещё раз.</p><p><a href="/#order">Вернуться к оформлению заказа</a></p></body></html>`);
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer() {
  return app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  products,
  orders,
  startServer,
  buildAccessLinks,
  sendOrderEmail,
  buildDeliveryText,
  buildInclusionNotificationText
};
