const NOMBRE_CACHE = 'COROFLORIDO-v2';
const ARCHIVOS_BASE = [
    './',
    './index.html',
    './css/estilos.css',
    './js/app.js',
    './manifest.json',
    './icono.png',
    './cantos.json',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// Instalación: Guarda los archivos esenciales en el teléfono
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(NOMBRE_CACHE)
            .then(cache => cache.addAll(ARCHIVOS_BASE))
            .then(() => self.skipWaiting())
    );
});

// Activación: Limpia versiones viejas del caché
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== NOMBRE_CACHE) return caches.delete(key);
                })
            );
        })
    );
});

// Estrategia: "Network First" (Intenta internet, si falla usa el caché)
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});