const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

const appModule = require("../server");
const app = appModule.app || appModule;

async function withServer(run) {
  const server = app.listen(0);
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      console.error = () => {};
    });
  }
}

test("catalog endpoint returns current products and prices", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/catalog`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.products.length, 8);
    assert.equal(data.products.find((product) => product.id === "book-inclusion").price, 10000);
    assert.equal(data.products.find((product) => product.id === "consultation").price, 100000);
    assert.equal(data.products.find((product) => product.id === "consultation").category, "service");
    assert.equal(data.products.find((product) => product.id === "book-happy-woman").price, 4700);
    assert.equal(data.products.find((product) => product.id === "life-state-thermometer").price, 0);
    assert.equal(data.products.every((product) => !product.accessUrl), true);
  });
});

test("checkout requires phone and calculates cart quantities from catalog prices", async () => {
  await withServer(async (baseUrl) => {
    const missingPhoneResponse = await fetch(`${baseUrl}/api/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Buyer",
        email: "buyer@example.com",
        items: [{ id: "book-simpler-life" }]
      })
    });
    assert.equal(missingPhoneResponse.status, 400);

    const response = await fetch(`${baseUrl}/api/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Buyer",
        email: "buyer@example.com",
        phone: "+77000000000",
        items: [{ id: "book-simpler-life", quantity: 2 }]
      })
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.order.total, 19800);
    assert.equal(data.order.items[0].quantity, 2);
  });
});

test("consultation order uses the listed price and has no PDF delivery link", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Buyer",
        email: "buyer@example.com",
        phone: "+77000000000",
        items: [{ id: "consultation" }]
      })
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.order.total, 100000);
    assert.equal("accessLinks" in data.order, false);
  });
});

test("order response does not expose the purchased Drive download links", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Buyer",
        email: "buyer@example.com",
        phone: "+77000000000",
        items: [{ id: "book-simpler-life" }]
      })
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(JSON.stringify(data).includes("drive.google.com"), false);
  });
});

test("email access links match the supplied Drive files", () => {
  const links = appModule.buildAccessLinks([
    appModule.products.find((product) => product.id === "book-child-fears"),
    appModule.products.find((product) => product.id === "book-panic-anger"),
    appModule.products.find((product) => product.id === "life-state-thermometer"),
    appModule.products.find((product) => product.id === "book-simpler-life"),
    appModule.products.find((product) => product.id === "book-happy-woman"),
    appModule.products.find((product) => product.id === "book-your-enemy")
  ]);

  assert.deepEqual(links, [
    "https://drive.google.com/file/d/1qhy0hfRdeLGjxt10aS_ibO5VZ0hohK8p/view?usp=drive_link",
    "https://drive.google.com/file/d/1TpAnd_RgB6x4gemcK46WQW-aZ9k6HRB-/view?usp=drive_link",
    "https://drive.google.com/file/d/1xMtxZ2w3p_2EXg0H_jDH7hNmkxdKDDwe/view?usp=drive_link",
    "https://drive.google.com/file/d/1b4w7qtYAgj2tsdrojP1g0Nfa1mlCvLf2/view?usp=drive_link",
    "https://drive.google.com/file/d/1dvWPiQjtSVu6BZEzPWtKieOIsbQiuLkS/view?usp=drive_link",
    "https://drive.google.com/file/d/1RzTaARGxWeeJRea6-XvBNaxDMZDc-pce/view?usp=drive_link"
  ]);
  const emailText = appModule.buildDeliveryText({
    id: "TS-test-order",
    items: [appModule.products.find((product) => product.id === "book-child-fears")],
    total: 9900,
    accessLinks: [links[0]]
  });
  assert.ok(emailText.includes(links[0]));
});

test("Inclusion order email contains a signed link to the private 40-day program", async () => {
  const originalSecret = process.env.BOOK_ACCESS_SECRET;
  const originalConsoleError = console.error;
  process.env.BOOK_ACCESS_SECRET = "test-book-access-secret";
  console.error = () => {};

  try {
    const orderId = "TS-test-inclusion-order";
    const inclusion = appModule.products.find((product) => product.id === "book-inclusion");
    const [accessLink] = appModule.buildAccessLinks([inclusion], orderId);
    const url = new URL(accessLink);
    assert.equal(url.pathname, "/program/vklyuchenie");
    assert.ok(url.searchParams.get("access"));

    const emailText = appModule.buildDeliveryText({
      id: orderId,
      items: [inclusion],
      total: 10000,
      accessLinks: [accessLink]
    });
    assert.ok(emailText.includes(accessLink));
    assert.equal(emailText.includes("ссылка на книгу «Включение» пока не настроена"), false);

    await withServer(async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/program/vklyuchenie`);
      assert.equal(denied.status, 403);

      const allowed = await fetch(`${baseUrl}/program/vklyuchenie?access=${encodeURIComponent(url.searchParams.get("access"))}`);
      assert.equal(allowed.status, 200);
      assert.match(allowed.headers.get("cache-control"), /no-store/);
      assert.match(await allowed.text(), /Программа/);
    });
  } finally {
    console.error = originalConsoleError;
    if (originalSecret === undefined) delete process.env.BOOK_ACCESS_SECRET;
    else process.env.BOOK_ACCESS_SECRET = originalSecret;
  }
});

test("paid Inclusion delivery notifies the store email with buyer contact details", async () => {
  const envKeys = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REFRESH_TOKEN",
    "GOOGLE_EMAIL",
    "CONTACT_EMAIL",
    "STORE_NOTIFICATION_EMAIL"
  ];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const sentMessages = [];
  const originalFetch = global.fetch;
  Object.assign(process.env, {
    GOOGLE_OAUTH_CLIENT_ID: "test-google-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "test-google-client-secret",
    GOOGLE_OAUTH_REFRESH_TOKEN: "test-google-refresh-token",
    GOOGLE_EMAIL: "timursorabekov@gmail.com",
    CONTACT_EMAIL: "support@example.com",
    STORE_NOTIFICATION_EMAIL: "timursorabekov@gmail.com"
  });
  let oauthRequest;
  global.fetch = async (url, options) => {
    if (url === "https://oauth2.googleapis.com/token") {
      oauthRequest = new URLSearchParams(options.body);
      return Response.json({ access_token: "test-google-access-token" });
    }
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(options.headers.Authorization, "Bearer test-google-access-token");
    const raw = Buffer.from(JSON.parse(options.body).raw, "base64url").toString("utf8");
    const textPart = raw.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--gmail-/);
    const htmlPart = raw.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--gmail-/);
    sentMessages.push({
      raw,
      text: textPart ? Buffer.from(textPart[1].replace(/\s/g, ""), "base64").toString("utf8") : "",
      html: htmlPart ? Buffer.from(htmlPart[1].replace(/\s/g, ""), "base64").toString("utf8") : ""
    });
    return Response.json({ id: "gmail-message-" + sentMessages.length });
  };

  try {
    const inclusion = appModule.products.find((product) => product.id === "book-inclusion");
    const order = {
      id: "TS-paid-inclusion",
      name: "Test Buyer",
      phone: "+77001234567",
      email: "buyer@example.com",
      items: [{ ...inclusion, quantity: 1 }],
      total: inclusion.price,
      accessLinks: ["https://shop.example.com/program/vklyuchenie?access=signed-token"]
    };

    await appModule.sendOrderEmail(order);

    assert.equal(sentMessages.length, 2);
    assert.equal(oauthRequest.get("client_id"), "test-google-client-id");
    assert.equal(oauthRequest.get("client_secret"), "test-google-client-secret");
    assert.equal(oauthRequest.get("refresh_token"), "test-google-refresh-token");
    assert.equal(oauthRequest.get("grant_type"), "refresh_token");
    assert.match(sentMessages[0].raw, /<timursorabekov@gmail\.com>/);
    assert.match(sentMessages[0].raw, /To: timursorabekov@gmail\.com/);
    assert.match(sentMessages[0].raw, /Subject: =\?UTF-8\?B\?/);
    assert.match(sentMessages[0].text, /Test Buyer/);
    assert.match(sentMessages[0].text, /\+77001234567/);
    assert.match(sentMessages[0].text, /buyer@example\.com/);
    assert.match(sentMessages[0].text, /TS-paid-inclusion/);
    assert.equal(sentMessages[0].text.includes("signed-token"), false);
    assert.match(sentMessages[1].raw, /To: buyer@example\.com/);
    assert.match(sentMessages[1].text, /signed-token/);
    assert.match(sentMessages[1].html, /signed-token/);
    assert.ok(order.inclusionOwnerNotifiedAt);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Halyk payment session requests an OAuth token and returns widget parameters", async () => {
  const originalEnv = {
    clientId: process.env.HALYK_EPAY_CLIENT_ID,
    clientSecret: process.env.HALYK_EPAY_CLIENT_SECRET,
    terminalId: process.env.HALYK_EPAY_TERMINAL_ID,
    googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    googleOAuthRefreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    googleEmail: process.env.GOOGLE_EMAIL
  };
  Object.assign(process.env, {
    HALYK_EPAY_CLIENT_ID: "test-client",
    HALYK_EPAY_CLIENT_SECRET: "test-client-secret",
    HALYK_EPAY_TERMINAL_ID: "test-terminal",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GOOGLE_OAUTH_REFRESH_TOKEN: "",
    GOOGLE_EMAIL: ""
  });

  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  let paymentTokenRequest;
  let statusTokenRequest = false;
  console.error = () => {};
  try {
    global.fetch = async (input, options = {}) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        const params = new URLSearchParams(options.body);
        if (params.get("scope") === "payment") {
          paymentTokenRequest = params;
          return Response.json({ access_token: "short-lived-test-token", token_type: "Bearer" });
        }
        statusTokenRequest = true;
        return Response.json({ access_token: "status-test-token", token_type: "Bearer" });
      }
      if (url.includes("/check-status/payment/transaction/")) {
        return Response.json({
          resultCode: "100",
          transaction: {
            invoiceID: decodeURIComponent(url.split("/").pop()),
            amount: 9900,
            currency: "KZT",
            terminalID: "test-terminal",
            statusName: "CHARGE"
          }
        });
      }
      return originalFetch(input, options);
    };

    await withServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Buyer",
          email: "buyer@example.com",
          phone: "+77000000000",
          items: [{ id: "book-simpler-life" }]
        })
      });
      const { order } = await createResponse.json();
      const response = await fetch(`${baseUrl}/api/payment/halyk-epay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id })
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.match(data.scriptUrl, /\/payform\/payment-api\.js$/);
      assert.equal(data.paymentObject.amount, 9900);
      assert.equal(data.paymentObject.currency, "KZT");
      assert.equal(data.paymentObject.terminal, "test-terminal");
      assert.equal(data.paymentObject.auth.access_token, "short-lived-test-token");
      assert.match(data.paymentObject.invoiceId, /^\d{15}$/);
      assert.match(data.paymentObject.backLink, /\/payment\/success\?/);
      assert.match(data.paymentObject.postLink, /\/api\/payment\/callback$/);
      assert.equal(JSON.stringify(data).includes("test-client-secret"), false);
      assert.equal(paymentTokenRequest.get("client_id"), "test-client");
      assert.equal(paymentTokenRequest.get("client_secret"), "test-client-secret");
      assert.equal(paymentTokenRequest.get("amount"), "9900");
      assert.ok(paymentTokenRequest.get("secret_hash"));

      const invalidCallback = await fetch(`${baseUrl}/api/payment/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: data.paymentObject.invoiceId, secret_hash: "invalid" })
      });
      assert.equal(invalidCallback.status, 401);
      assert.equal(statusTokenRequest, false);

      const storedOrder = appModule.orders.get(data.orderId);
      const validCallback = await fetch(`${baseUrl}/api/payment/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: storedOrder.invoiceId,
          secret_hash: paymentTokenRequest.get("secret_hash")
        })
      });
      assert.equal(validCallback.status, 502);
      assert.equal(statusTokenRequest, true);
      assert.equal(storedOrder.status, "paid_pending_email");
      assert.equal(storedOrder.delivered, false);
    });
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    for (const [key, value] of Object.entries({
      HALYK_EPAY_CLIENT_ID: originalEnv.clientId,
      HALYK_EPAY_CLIENT_SECRET: originalEnv.clientSecret,
      HALYK_EPAY_TERMINAL_ID: originalEnv.terminalId,
      GOOGLE_OAUTH_CLIENT_ID: originalEnv.googleOAuthClientId,
      GOOGLE_OAUTH_CLIENT_SECRET: originalEnv.googleOAuthClientSecret,
      GOOGLE_OAUTH_REFRESH_TOKEN: originalEnv.googleOAuthRefreshToken,
      GOOGLE_EMAIL: originalEnv.googleEmail
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
