var cacheName = "cnfurikana";
var appShellFiles = [
  "img/icons/128.png",
  "img/icons/144.png",
  "img/icons/192.png",
  "img/icons/256.png",
  "img/icons/512.png"
];
var contentToCache = appShellFiles;
// Installing Service Worker
self.addEventListener("install", function(e) {
  console.log("[Service Worker] Install");
  e.waitUntil(
    caches.open(cacheName).then(function(cache) {
      console.log("[Service Worker] Caching all: app shell and content");
      return cache.addAll(contentToCache);
    })
  );
});

// Fetching content using Service Worker
self.addEventListener("fetch", function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      console.log("[Service Worker] Fetching resource: " + e.request.url);
      return (
        r ||
        fetch(e.request).then(function(response) {
          return caches.open(cacheName).then(function(cache) {
            console.log(
              "[Service Worker] Caching new resource: " + e.request.url
            );
            cache.put(e.request, response.clone());
            return response;
          });
        })
      );
    })
  );
});
