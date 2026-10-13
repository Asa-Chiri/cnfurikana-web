var cacheName = "cnfurikana";
var appShellFiles = [
  "img/icons/128.png",
  "img/icons/144.png",
  "img/icons/192.png",
  "img/icons/256.png",
  "img/icons/512.png",
];
var contentToCache = appShellFiles;
// Installing Service Worker
self.addEventListener("install", function (e) {
  console.log("[Service Worker] Install");
  e.waitUntil(
    caches.open(cacheName).then(function (cache) {
      console.log("[Service Worker] Caching all: app shell and content");
      return cache.addAll(contentToCache);
    })
  );
});

// Keep the existing cache so an installed app retains its offline content.
function cachedResponse(request) {
  return caches
    .open(cacheName)
    .then(function (cache) {
      return cache.match(request);
    })
    .catch(function () {
      // Unavailable cache storage must not prevent an online load.
      return undefined;
    });
}

function cacheResponse(request, response) {
  if (!response.ok) return Promise.resolve(response);
  return caches
    .open(cacheName)
    .then(function (cache) {
      return cache.put(request, response.clone());
    })
    .catch(function () {
      // A full cache must not turn a successful network response into an error.
    })
    .then(function () {
      return response;
    });
}

self.addEventListener("fetch", function (e) {
  var request = e.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  if (request.mode === "navigate") {
    // Revalidate HTML even if it is still fresh in the browser's HTTP cache.
    // Its current asset hashes determine which application version is loaded.
    e.respondWith(
      fetch(request, { cache: "no-cache" })
        .then(function (response) {
          return cacheResponse(request, response);
        })
        .catch(function (error) {
          return cachedResponse(request).then(function (cached) {
            if (cached) return cached;
            throw error;
          });
        })
    );
    return;
  }

  // Built assets have content hashes and can keep using the offline cache first.
  e.respondWith(
    cachedResponse(request).then(function (cached) {
      return (
        cached ||
        fetch(request).then(function (response) {
          return cacheResponse(request, response);
        })
      );
    })
  );
});
