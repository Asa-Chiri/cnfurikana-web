const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");
const workerPath =
  process.env.SERVICE_WORKER_SOURCE || path.join(root, "public/sw.js");
let browser;

before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function fixture(
  t,
  { production = false, initialWorker = workerPath } = {}
) {
  const state = {
    version: "A",
    status: 200,
    requests: [],
    worker: await fs.readFile(
      production ? path.join(root, "dist/sw.js") : initialWorker
    ),
  };
  // Use the application's actual inline registration, not a test-only lifecycle shortcut.
  const index = await fs.readFile(path.join(root, "index.html"), "utf8");
  const registration = index.match(
    /<script>([\s\S]*?serviceWorker[\s\S]*?)<\/script>/
  )[0];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    state.requests.push(`${request.method} ${url.pathname}`);
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/sw.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(state.worker);
    } else if (url.pathname === "/" || url.pathname === "/index.html") {
      response.setHeader("Content-Type", "text/html");
      response.statusCode = state.status;
      if (state.status !== 200) return response.end("Temporarily unavailable");
      if (production)
        return response.end(
          await fs.readFile(path.join(root, "dist/index.html"))
        );
      // HTML can be fresh in the HTTP cache too: online navigations must revalidate it.
      response.setHeader("Cache-Control", "public, max-age=3600");
      response.end(`<!doctype html><html><head><title>Release ${state.version}</title>
        <link rel="stylesheet" href="/assets/style-${state.version}.css"></head>
        <body><main id="version">HTML ${state.version}</main>
        <script src="/assets/bundle-${state.version}.js"></script>${registration}</body></html>`);
    } else if (
      !production &&
      /^\/assets\/bundle-[AB]\.js$/.test(url.pathname)
    ) {
      response.setHeader("Content-Type", "application/javascript");
      response.end(
        `document.querySelector('#version').textContent += ' / JS ${
          url.pathname.includes("-A.") ? "A" : "B"
        }';`
      );
    } else if (
      !production &&
      /^\/assets\/style-[AB]\.css$/.test(url.pathname)
    ) {
      response.setHeader("Content-Type", "text/css");
      response.end(
        `body { --release: ${url.pathname.includes("-A.") ? "A" : "B"}; }`
      );
    } else if (url.pathname === "/echo") {
      response.end(request.method);
    } else {
      const directory = production ? "dist" : "public";
      const file = path.resolve(root, directory, `.${url.pathname}`);
      if (!file.startsWith(path.join(root, directory) + path.sep)) {
        response.writeHead(404).end();
        return;
      }
      try {
        const data = await fs.readFile(file);
        const types = {
          ".js": "application/javascript",
          ".css": "text/css",
          ".png": "image/png",
          ".json": "application/json",
        };
        response.setHeader(
          "Content-Type",
          types[path.extname(file)] || "application/octet-stream"
        );
        response.end(data);
      } catch {
        response.writeHead(404).end("Not found");
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext();
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  t.after(async () => {
    await context.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // The first visit installs the worker; a normal reload starts a controlled visit.
  await page.reload();
  assert.ok(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
  );
  return { state, page, context, origin };
}

async function cached(page, pathname) {
  await page.waitForFunction(async (pathname) => {
    const cache = await caches.open("cnfurikana");
    return Boolean(await cache.match(pathname));
  }, pathname);
}

async function release(page, version) {
  assert.equal(
    await page.locator("#version").textContent(),
    `HTML ${version} / JS ${version}`
  );
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("--release").trim()
    ),
    version
  );
  await cached(page, `/assets/bundle-${version}.js`);
  await cached(page, `/assets/style-${version}.css`);
}

for (const navigation of ["reload", "navigation"]) {
  test(`normal online ${navigation} updates A to B and both releases work offline`, async (t) => {
    const { state, page, context } = await fixture(t);
    await release(page, "A");
    await cached(page, "/");
    await context.setOffline(true);
    const beforeOffline = state.requests.length;
    await page.reload();
    await release(page, "A");
    assert.equal(
      state.requests.length,
      beforeOffline,
      "offline reload must not reach the server"
    );
    t.diagnostic("Controlled A and offline A: HTML, JS and CSS all match A.");

    state.version = "B";
    await context.setOffline(false);
    const beforeOnline = state.requests.filter(
      (request) => request === "GET /"
    ).length;
    if (navigation === "reload") await page.reload();
    else await page.goto(page.url());
    t.diagnostic(
      `Normal online ${navigation} after serving B: ${await page
        .locator("#version")
        .textContent()}`
    );
    await release(page, "B");
    assert.ok(
      state.requests.filter((request) => request === "GET /").length >
        beforeOnline
    );
    await page.waitForFunction(async () =>
      (await (await caches.open("cnfurikana")).match("/"))
        .text()
        .then((html) => html.includes("Release B"))
    );
    await context.setOffline(true);
    const beforeOfflineB = state.requests.length;
    await page.reload();
    await release(page, "B");
    assert.equal(state.requests.length, beforeOfflineB);
    t.diagnostic(
      "Offline B: updated HTML, JS and CSS remain available without server requests."
    );
  });
}

test("HTTP errors do not replace a usable offline document or asset", async (t) => {
  const { state, page, context } = await fixture(t);
  await release(page, "A");
  state.status = 503;
  assert.equal((await page.reload()).status(), 503);
  await context.setOffline(true);
  await page.reload();
  await release(page, "A");
  await context.setOffline(false);
  assert.equal(
    await page.evaluate(async () => (await fetch("/missing.js")).status),
    404
  );
  assert.equal(
    await page.evaluate(async () =>
      Boolean(await (await caches.open("cnfurikana")).match("/missing.js"))
    ),
    false
  );
});

test("legacy worker upgrades after its tabs close and preserves the offline cache", async (t) => {
  const { state, page, context, origin } = await fixture(t, {
    initialWorker: path.join(__dirname, "fixtures/legacy-sw.js"),
  });
  await release(page, "A");
  await cached(page, "/");
  state.version = "B";
  await page.reload();
  await release(page, "A");
  t.diagnostic("Legacy worker stays on A while the server serves B.");

  state.worker = await fs.readFile(workerPath);
  // Deterministically trigger the browser's update check, then keep its normal
  // waiting/activation lifecycle: no skipWaiting, cache clearing or unregister.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await page.waitForFunction(async () =>
    Boolean((await navigator.serviceWorker.getRegistration()).waiting)
  );
  await page.close();
  await context.setOffline(true);
  const returningPage = await context.newPage();
  await returningPage.goto(origin);
  await returningPage.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration.active?.state === "activated" && !registration.waiting;
  });
  await release(returningPage, "A");
  await context.setOffline(false);
  await returningPage.reload();
  await release(returningPage, "B");
  await context.setOffline(true);
  await returningPage.reload();
  await release(returningPage, "B");
  t.diagnostic(
    "After normal worker activation: cached A survives offline, online reload gets B, offline reload retains B."
  );
});

test("POST bypasses caching and unrelated origin caches cannot override the app", async (t) => {
  const { page } = await fixture(t);
  assert.equal(
    await page.evaluate(async () =>
      (await fetch("/echo", { method: "POST", body: "test" })).text()
    ),
    "POST"
  );
  assert.equal(
    await page.evaluate(async () =>
      Boolean(await (await caches.open("cnfurikana")).match("/echo"))
    ),
    false
  );
  await page.evaluate(async () => {
    const foreignCache = await caches.open("another-app");
    await foreignCache.put(
      "/assets/unrelated.js",
      new Response("foreign cached response")
    );
  });
  assert.equal(
    await page.evaluate(
      async () => (await fetch("/assets/unrelated.js")).status
    ),
    404
  );
  // Different port = different origin. Use another local fixture, never a live service.
  const other = await fixture(t);
  await page.evaluate(async (url) => {
    await fetch(url, { mode: "no-cors" });
  }, `${other.origin}/echo`);
  assert.equal(
    await page.evaluate(
      async (url) =>
        Boolean(await (await caches.open("cnfurikana")).match(url)),
      `${other.origin}/echo`
    ),
    false
  );
});

test("built application still annotates Chinese after an offline reload", async (t) => {
  const { page, context, state } = await fixture(t, { production: true });
  await page.locator("input.el-input__inner:not([readonly])").fill("你好");
  await page.waitForFunction(
    () => document.querySelectorAll("ruby rt").length >= 2
  );
  const online = await page.locator("ruby").allTextContents();
  const assetPaths = await page.evaluate(() =>
    [...document.querySelectorAll('script[src], link[rel="stylesheet"]')].map(
      (node) => new URL(node.src || node.href).pathname
    )
  );
  for (const asset of assetPaths) await cached(page, asset);
  await cached(page, "/");
  await context.setOffline(true);
  const requestCount = state.requests.length;
  await page.reload();
  await page.locator("input.el-input__inner:not([readonly])").fill("你好");
  await page.waitForFunction(
    () => document.querySelectorAll("ruby rt").length >= 2
  );
  assert.deepEqual(await page.locator("ruby").allTextContents(), online);
  assert.equal(state.requests.length, requestCount);
});
