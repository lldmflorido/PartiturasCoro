const CACHE_SISTEMA = 'COROFLORIDO-v8'; // Cambia esto para actualizar diseño/lógica
const CACHE_PARTITURAS = 'COROFLORIDO-PDFS-v1'; // Solo cambia si hay un cambio masivo de archivos

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
        // Para PDFs: Si ya está en caché, no uses internet nunca
        event.respondWith(
            caches.match(event.request).then(res => res || fetch(event.request))
        );
    } else {
        // Para lo demás: Intenta internet para estar actualizado
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
    }
});