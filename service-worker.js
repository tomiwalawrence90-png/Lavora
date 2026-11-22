
const CACHE_NAME = "lavora-v11";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./seed.js",
  "./features.js",
  "./features.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/logo.svg",
  "./images/blood-strike.svg",
  "./images/mobile-legends.svg",
  "./images/controller.svg",
  "./images/waves.svg",
  "./images/live-art.svg",
  "./images/chat-art.svg",
  "./images/among-us.jpg",
  "./images/apex-legends.jpg",
  "./images/asphalt-legends-unite.jpg",
  "./images/call-of-duty-mobile.jpg",
  "./images/dota-2.jpg",
  "./images/ea-sports-fc.jpg",
  "./images/efootball.jpg",
  "./images/elden-ring.jpg",
  "./images/fc-mobile.jpg",
  "./images/fortnite.jpg",
  "./images/forza-horizon-5.jpg",
  "./images/free-fire.jpg",
  "./images/genshin-impact.jpg",
  "./images/gta-v.jpg",
  "./images/league-of-legends.jpg",
  "./images/minecraft.jpg",
  "./images/overwatch-2.jpg",
  "./images/pubg-mobile.jpg",
  "./images/rainbow-six-siege.jpg",
  "./images/roblox.jpg",
  "./images/rocket-league.jpg",
  "./images/stardew-valley.jpg",
  "./images/tekken-8.jpg",
  "./images/the-sims-4.jpg",
  "./images/valorant.jpg"
];
// Banners (large) are cached on first view by the fetch handler below.

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(APP_FILES)
    )
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name =>
            name.startsWith("lavora-") &&
            name !== CACHE_NAME
          )
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache =>
            cache.put(request, copy)
          );
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);

        if (cached) {
          return cached;
        }

        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return new Response("Offline", {
          status: 503,
          headers: {
            "Content-Type": "text/plain"
          }
        });
      })
  );
});
