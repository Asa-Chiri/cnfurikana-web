# Service worker browser regression

These tests run the real `public/sw.js` and inline registration from `index.html`
in a fresh Chromium context against a loopback-only HTTP server. The release
fixture changes HTML and separate versioned JS/CSS URLs from A to B without
changing the worker or clearing browser caches. HTML deliberately has a fresh
HTTP-cache lifetime. `context.setOffline(true)` controls connectivity; request
counts verify that offline reloads do not reach the server.

Run from the repository root with Node 22.14.0:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm ci --prefix tests/service-worker --ignore-scripts --no-audit --no-fund
cd tests/service-worker
npx playwright install chromium
npm test
```

CI installs Chromium's Linux system dependencies with `--with-deps`. The separate
`service-worker.yml` workflow only runs on pull requests, checks out the exact PR
head, and has no publishing or deployment steps. Its package and lockfile are
isolated from application dependencies and the existing regression suite.

Coverage:

- Controlled A, offline A, normal online reload/navigation to B, and offline B,
  checking HTML, JS, CSS and actual network requests.
- Legacy cache-first behavior, followed by normal worker activation after closing
  its tabs, preservation of cached A offline, then online/offline B.
- HTTP 503/404 responses do not overwrite usable offline content or enter the cache.
- POST and cross-origin requests bypass the worker's cache; unrelated named caches
  cannot supply this application's resources.
- The production build's HTML, worker and assets load offline and produce the same
  Chinese ruby annotations as online.

`fixtures/legacy-sw.js` is the unchanged worker from master commit
`8dd0143da4aceeb83d34c500e3f3a88648850b83`. To reproduce the original failure with
the same A/B assertion (expected nonzero exit):

```sh
SERVICE_WORKER_SOURCE=fixtures/legacy-sw.js node --test --test-name-pattern='normal online reload' service-worker.test.cjs
```

In PowerShell, set `$env:SERVICE_WORKER_SOURCE = 'fixtures/legacy-sw.js'` before
the `node` command and remove that environment variable afterward.

Limits: this is controlled Chromium coverage, not evidence about actual visitors
or live hosting/cache headers. A newly downloaded worker waits until existing
controlled tabs close; the fix does not force activation or reload unsaved work.
Offline navigation requires a previously cached exact URL and its assets. It does
not add first-visit offline support, cache eviction, a network timeout, or
revalidation for non-hashed assets. HTTP errors are displayed online while the
last successful page remains available offline.
