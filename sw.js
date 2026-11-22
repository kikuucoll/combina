/* Service worker de «combina ≈»: permet instal·lar l'app i obrir-la sense connexió.
 * Estratègia «primer la xarxa»: sempre es carrega la versió més nova si hi ha internet;
 * la còpia desada només s'usa sense connexió. Només desa fitxers del mateix lloc. */
var CACHE = 'combina-v3';
var SHELL = ['./', 'index.html', 'css/styles.css', 'js/config.js', 'js/expr.js', 'js/puzzle.js',
  'js/medals.js', 'js/backend.js', 'js/sound.js', 'js/app.js', 'manifest.webmanifest', 'img/icon-192.png', 'fonts/fonts.css', 'privacitat.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); });
  }));
});
