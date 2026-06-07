const CACHE_SISTEMA = 'COROFLORIDO-v19'; // Cambia esto para actualizar diseño/lógica
const CACHE_PARTITURAS = 'COROFLORIDO-PDFS-v1'; // Solo cambia si hay un cambio masivo de archivos

const ARCHIVOS_BASE = [
    './',
    './index.html',
    './css/estilos.css',
    './js/app.js',
    './js/pdf.min.js',
    './js/pdf.worker.min.js',
    './manifest.json',
    './icono.png',
    './cantos.json'
];

// Instalación: Solo guardamos el "esqueleto" de la app
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_SISTEMA)
            .then(cache => cache.addAll(ARCHIVOS_BASE))
            .then(() => self.skipWaiting())
    );
});

// Activación: Limpia versiones viejas de SISTEMA, pero RESPETA las PARTITURAS
self.addEventListener('activate', event => {
    const cachesPermitidas = [CACHE_SISTEMA, CACHE_PARTITURAS];
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (!cachesPermitidas.includes(key)) return caches.delete(key);
                })
            );
        })
    );
});

// Estrategia: Cache First para PDFs (Ahorro total de datos), Network First para el resto
self.addEventListener('fetch', event => {
    const url = event.request.url;

    if (url.includes('.pdf')) {
        // Para PDFs: Si ya está en caché se usa, sino se descarga y SE GUARDA
        event.respondWith(
            caches.match(event.request).then(function(res) {
                if (res) return res;
                return fetch(event.request).then(function(networkRes) {
                    return caches.open(CACHE_PARTITURAS).then(function(cache) {
                        cache.put(event.request, networkRes.clone());
                        return networkRes;
                    });
                });
            })
        );
    } else {
        // Para lo demás: Intenta internet para estar actualizado
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
    }
});

// Escuchar mensaje para forzar actualización inmediata (SKIP_WAITING)
self.addEventListener('message', function(event) {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});