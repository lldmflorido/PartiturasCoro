// CONFIGURACIÓN PARA PDF.js LEGACY (ES5)
var pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- VARIABLES GLOBALES ---
var cantos = [];
var temaActual = 'Todos'; 
var nivelZoom = 100; 
var pinchZoomando = false;
var distanciaInicial = 0;
var zoomInicial = 100;
var ultimoScroll = 0;
var centroToqueX = 0;
var centroToqueY = 0;
var porcentajeX = 0;
var porcentajeY = 0;
var centroInicialX = 0;
var centroInicialY = 0;
var scrollInicialX = 0;
var scrollInicialY = 0;

// --- ELEMENTOS DEL DOM ---
var contenedorLista = document.getElementById('lista-cantos');
var listaTemas = document.getElementById('lista-temas');
var inputBuscador = document.getElementById('buscador');
var contadorCantos = document.getElementById('contador-cantos');
var contenedorPdf = document.getElementById('contenedor-pdf');
var barraSuperior = document.getElementById('barra-superior');
var btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
var sidebar = document.getElementById('sidebar-temas');
var btnResetZoom = document.getElementById('btn-reset-zoom');
var btnLimpiarBusqueda = document.getElementById('btn-limpiar-busqueda');
var contadorDescargas = document.getElementById('contador-descargas');
var NOMBRE_CACHE_PDFS = 'COROFLORIDO-PDFS-v1';

// --- 1. LÓGICA DE BARRA RETRÁCTIL, OVERLAY Y SWIPE ---

var overlay = document.createElement('div');
overlay.id = 'overlay-sidebar';
document.body.appendChild(overlay);

function alternarMenu(forzarCierre) {
    if (forzarCierre) {
        sidebar.classList.add('oculto');
    } else {
        sidebar.classList.toggle('oculto');
    }
    
    if (window.innerWidth <= 768 && !sidebar.classList.contains('oculto')) {
        overlay.classList.add('activo');
        setTimeout(function() { overlay.style.opacity = '1'; }, 10);
    } else {
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.classList.remove('activo'); }, 300);
    }
}

if (window.innerWidth <= 768) {
    sidebar.classList.add('oculto');
}

btnToggleSidebar.addEventListener('click', function() { alternarMenu(); });

overlay.addEventListener('click', function() { alternarMenu(true); });

var toqueInicialX = 0;
var toqueFinalX = 0;

document.addEventListener('touchstart', function(e) {
    toqueInicialX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', function(e) {
    toqueFinalX = e.changedTouches[0].screenX;
    if (toqueInicialX - toqueFinalX > 50) {
        if (window.innerWidth <= 768 && !sidebar.classList.contains('oculto')) {
            alternarMenu(true);
        }
    }
}, { passive: true });

// --- 2. CARGAR DATOS (Usando XMLHttpRequest para Safari 9) ---
var xhr = new XMLHttpRequest();
xhr.open('GET', 'cantos.json', true);
xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
        if (xhr.status === 200) {
            try {
                var datos = JSON.parse(xhr.responseText);
                cantos = datos.map(function(c) {
                    var arrTemas = [];
                    if (Array.isArray(c.temas)) {
                        arrTemas = c.temas;
                    } else if (typeof c.tema === 'string' && c.tema.trim() !== '') {
                        arrTemas = [c.tema.trim()]; 
                    }
                    var obj = {};
                    for (var key in c) { obj[key] = c[key]; }
                    obj.temas = arrTemas;
                    return obj;
                });
                generarMenuTemas(cantos);
                aplicarFiltros();
                actualizarContadorDescargas(); 
                sincronizarPartituras();
            } catch (e) {
                console.error("Error procesando JSON", e);
                document.getElementById('lista-cantos').innerHTML = '<p style="padding:20px;">Error en el formato de datos.</p>';
            }
        } else {
            console.error("Error cargando cantos.json", xhr.status);
            document.getElementById('lista-cantos').innerHTML = '<p style="padding:20px;">No se pudo cargar la lista (Error: ' + xhr.status + ').</p>';
        }
    }
};
xhr.send();

// --- 3. GENERAR BARRA LATERAL ---
function generarMenuTemas(lista) {
    var temasBrutos = [];
    lista.forEach(function(c) {
        c.temas.forEach(function(t) { temasBrutos.push(t); });
    });
    
    var temasUnicos = temasBrutos.filter(function(item, pos) {
        return temasBrutos.indexOf(item) == pos && item && item.trim() !== '';
    });
    temasUnicos.sort(); 

    var htmlTemas = '<li class="item-tema activo" data-tema="Todos">Todos los cantos</li>' +
                    '<li class="item-tema" data-tema="Sin Tema">Sin Tema Especificado</li>';

    temasUnicos.forEach(function(tema) {
        htmlTemas += '<li class="item-tema" data-tema="' + tema + '">' + tema + '</li>';
    });

    listaTemas.innerHTML = htmlTemas;

    var items = document.querySelectorAll('.item-tema');
    for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('click', function(e) {
            var allItems = document.querySelectorAll('.item-tema');
            for (var j = 0; j < allItems.length; j++) {
                allItems[j].classList.remove('activo');
            }
            e.target.classList.add('activo');
            
            temaActual = e.target.getAttribute('data-tema');
            aplicarFiltros();
            
            if(window.innerWidth <= 768) {
                alternarMenu(true);
            }
        });
    }
}

// --- FUNCIÓN PARA QUITAR TILDES ---
function limpiarTexto(texto) {
    if (!texto) return "";
    var s = texto.toLowerCase().trim();
    // Fallback for normalize if not available
    if (s.normalize) {
        s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } else {
        // Manual replacement for common Spanish accents
        var map = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n'};
        s = s.replace(/[áéíóúüñ]/g, function(m) { return map[m]; });
    }
    return s;
}

// --- 4. APLICAR FILTROS Y BUSCADOR INTELIGENTE ---
function aplicarFiltros() {
    var textoBuscado = limpiarTexto(inputBuscador.value);
    var palabrasBusqueda = textoBuscado.split(' ').filter(function(p) { return p !== ''; });
    
    var filtrados = cantos.filter(function(c) {
        var nombreLimpio = limpiarTexto(c.nombre);
        var coincideTexto = palabrasBusqueda.every(function(palabra) {
            return nombreLimpio.indexOf(palabra) !== -1;
        });
        
        var coincideTema = false;
        if (temaActual === 'Todos') {
            coincideTema = true;
        } else if (temaActual === 'Sin Tema') {
            coincideTema = (c.temas.length === 0);
        } else {
            coincideTema = (c.temas.indexOf(temaActual) !== -1);
        }

        return (coincideTexto || palabrasBusqueda.length === 0) && coincideTema;
    });

    if (textoBuscado !== '') {
        filtrados.sort(function(a, b) {
            var nombreA = limpiarTexto(a.nombre);
            var nombreB = limpiarTexto(b.nombre);
            
            var puntosA = 0;
            var puntosB = 0;

            if (nombreA.indexOf(textoBuscado) === 0) puntosA += 100;
            else if (nombreA.split(' ')[0] === palabrasBusqueda[0]) puntosA += 50;

            if (nombreB.indexOf(textoBuscado) === 0) puntosB += 100;
            else if (nombreB.split(' ')[0] === palabrasBusqueda[0]) puntosB += 50;

            if (puntosA !== puntosB) {
                return puntosB - puntosA; 
            }
            return nombreA.localeCompare(nombreB);
        });
    }

    mostrarCantos(filtrados);
}

inputBuscador.addEventListener('input', function() {
    if (inputBuscador.value.trim() !== '') {
        btnLimpiarBusqueda.classList.remove('oculto');
    } else {
        btnLimpiarBusqueda.classList.add('oculto');
    }
    aplicarFiltros();
});

btnLimpiarBusqueda.addEventListener('click', function() {
    inputBuscador.value = '';
    btnLimpiarBusqueda.classList.add('oculto');
    aplicarFiltros();
    inputBuscador.focus();
});

// --- 5. RENDERIZAR LISTA PRINCIPAL ---
function mostrarCantos(lista) {
    contenedorLista.innerHTML = '';
    contadorCantos.textContent = lista.length + ' cantos';

    if (lista.length === 0) {
        contenedorLista.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">No hay cantos que coincidan con la búsqueda.</p>';
        return;
    }

    lista.forEach(function(canto) {
        var div = document.createElement('div');
        div.className = 'tarjeta-canto';
        
        var temasHTML = '';
        if (canto.temas.length > 0) {
            temasHTML = canto.temas.map(function(t) { return '<span class="tema-etiqueta">' + t + '</span>'; }).join('');
        } else {
            temasHTML = '<span class="tema-etiqueta" style="opacity:0.4;">Sin tema</span>';
        }

        div.innerHTML = '<div>' +
                            '<h3>' + canto.nombre + '</h3>' +
                            '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px;">' +
                                temasHTML +
                            '</div>' +
                        '</div>';
        
        div.addEventListener('click', function() { abrirVisor(canto); });
        contenedorLista.appendChild(div);
    });
}

// --- 6. ABRIR PDF ---
function abrirVisor(canto) {
    document.getElementById('vista-menu').style.display = 'none';
    document.getElementById('vista-visor').style.display = 'block';
    document.getElementById('titulo-canto').textContent = canto.nombre;
    barraSuperior.classList.remove('barra-oculta');
    
    history.pushState({ visorAbierto: true }, null, "#visor");
    
    nivelZoom = 100; 
    actualizarZoom(); 
    contenedorPdf.innerHTML = '<p style="margin-top:80px; text-align:center; color:#555;">Cargando partitura en alta resolución...</p>';

    pdfjsLib.getDocument('Partituras/' + canto.archivo).promise.then(function(pdf) {
        contenedorPdf.innerHTML = ''; 
        
        var dpr = window.devicePixelRatio || 1;
        var LIMITE_FISICO_PIXELES = 2000; // Un poco más bajo para el iPad Mini 1

        var arregloCanvases = [];
        for (var i = 1; i <= pdf.numPages; i++) {
            var canvas = document.createElement('canvas');
            canvas.className = 'pdf-page';
            canvas.style.minHeight = "800px"; 
            canvas.style.width = nivelZoom + '%';
            
            canvas.setAttribute('data-pagina', i);
            canvas.setAttribute('data-renderizado', "false"); 
            
            contenedorPdf.appendChild(canvas);
            arregloCanvases.push(canvas);
        }

        var observador = new IntersectionObserver(function(entradas) {
            entradas.forEach(function(entrada) {
                var canvas = entrada.target;
                var numPagina = parseInt(canvas.getAttribute('data-pagina'));

                if (entrada.isIntersecting) {
                    // --- LA PÁGINA ENTRA EN VISTA: RENDERIZAR ---
                    if (canvas.getAttribute('data-renderizado') === "true") return;

                    pdf.getPage(numPagina).then(function(page) {
                        var viewportRaw = page.getViewport({ scale: 1.0 });
                        // Optimización: Escala más baja para ahorrar RAM en iPad viejo
                        var escalaFinal = (window.innerWidth < 1000) ? 1.2 : 1.5; 
                        var dimensionMayorVisual = Math.max(viewportRaw.width, viewportRaw.height);

                        if ((dimensionMayorVisual * escalaFinal * dpr) > LIMITE_FISICO_PIXELES) {
                            escalaFinal = (LIMITE_FISICO_PIXELES / dpr) / dimensionMayorVisual;
                        }

                        var viewport = page.getViewport({ scale: escalaFinal }); 
                        canvas.width = viewport.width * dpr;
                        canvas.height = viewport.height * dpr;
                        canvas.style.minHeight = "auto";

                        var context = canvas.getContext('2d');
                        context.scale(dpr, dpr);
                        
                        var renderTask = page.render({ canvasContext: context, viewport: viewport });
                        renderTask.promise.then(function() {
                            canvas.setAttribute('data-renderizado', "true");
                            // Liberar memoria de la página individual
                            if (page.cleanup) page.cleanup();
                        });
                    });
                } else {
                    // --- LA PÁGINA SALE DE VISTA: DESTRUIR PARA AHORRAR RAM ---
                    // Solo destruimos si ya estaba renderizada y estamos lejos
                    if (canvas.getAttribute('data-renderizado') === "true") {
                        canvas.width = 0;
                        canvas.height = 0;
                        canvas.style.minHeight = "800px"; // Mantiene el hueco del scroll
                        canvas.setAttribute('data-renderizado', "false");
                        // Forzar limpieza general del motor PDF
                        pdf.cleanup();
                    }
                }
            });
        }, {
            root: contenedorPdf,
            rootMargin: '600px 0px', // Margen más pequeño para ser más estrictos con la RAM
            threshold: 0.01
        });

        arregloCanvases.forEach(function(canvas) { observador.observe(canvas); });

    }).catch(function(err) {
        console.error(err);
        contenedorPdf.innerHTML = '<p style="color:red; text-align:center;">Error al cargar el PDF.</p>';
    });
}

// --- 7. CERRAR VISOR ---
function cerrarVisorCompleto() {
    document.getElementById('vista-visor').style.display = 'none';
    document.getElementById('vista-menu').style.display = 'block'; // Cambiado de flex por compatibilidad
    
    var canvases = contenedorPdf.querySelectorAll('canvas');
    for (var i = 0; i < canvases.length; i++) {
        canvases[i].width = 0;
        canvases[i].height = 0;
        canvases[i].parentNode.removeChild(canvases[i]);
    }
    
    contenedorPdf.innerHTML = ''; 
}

document.getElementById('btn-cerrar').addEventListener('click', function() {
    if (window.location.hash === "#visor") {
        history.back();
    } else {
        cerrarVisorCompleto();
    }
});

window.addEventListener('popstate', function(event) {
    if (document.getElementById('vista-visor').style.display === 'block') {
        cerrarVisorCompleto();
    }
});

// --- 8. LÓGICA DE ZOOM ---
function actualizarZoom() {
    var paginas = document.querySelectorAll('.pdf-page');
    
    if (nivelZoom > 100) {
        contenedorPdf.classList.add('zoom-activo');
        btnResetZoom.style.display = 'block'; // Cambiado de flex
    } else {
        contenedorPdf.classList.remove('zoom-activo');
        btnResetZoom.style.display = 'none';
        contenedorPdf.scrollLeft = 0; 
    }

    for (var i = 0; i < paginas.length; i++) {
        paginas[i].style.width = nivelZoom + '%';
        paginas[i].style.margin = (nivelZoom > 100) ? "20px" : "10px auto";
    }
}

contenedorPdf.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
        pinchZoomando = true;
        distanciaInicial = Math.sqrt(
            Math.pow(e.touches[0].pageX - e.touches[1].pageX, 2) +
            Math.pow(e.touches[0].pageY - e.touches[1].pageY, 2)
        );
        zoomInicial = nivelZoom;

        var rect = contenedorPdf.getBoundingClientRect();
        centroToqueX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        centroToqueY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        scrollInicialX = contenedorPdf.scrollLeft;
        scrollInicialY = contenedorPdf.scrollTop;

        porcentajeX = (scrollInicialX + centroToqueX) / contenedorPdf.scrollWidth;
        porcentajeY = (scrollInicialY + centroToqueY) / contenedorPdf.scrollHeight;
        
        centroInicialX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
        centroInicialY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
    }
}, { passive: false });

contenedorPdf.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2 && pinchZoomando) {
        e.preventDefault(); 
        
        var distanciaActual = Math.sqrt(
            Math.pow(e.touches[0].pageX - e.touches[1].pageX, 2) +
            Math.pow(e.touches[0].pageY - e.touches[1].pageY, 2)
        );
        var escala = distanciaActual / distanciaInicial;
        var nuevoZoom = zoomInicial * escala;
        
        if (nuevoZoom < 100) nuevoZoom = 100;
        if (nuevoZoom > 400) nuevoZoom = 400;
        
        nivelZoom = nuevoZoom;
        actualizarZoom(); 

        var rect = contenedorPdf.getBoundingClientRect();
        var centroActualX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        var centroActualY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        contenedorPdf.scrollLeft = (porcentajeX * contenedorPdf.scrollWidth) - centroActualX;
        contenedorPdf.scrollTop = (porcentajeY * contenedorPdf.scrollHeight) - centroActualY;
    }
}, { passive: false });

contenedorPdf.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) {
        pinchZoomando = false;
    }
});

btnResetZoom.addEventListener('click', function() {
    var posicionActual = contenedorPdf.scrollTop;
    var alturaTotalActual = contenedorPdf.scrollHeight;
    var proporcion = posicionActual / alturaTotalActual;

    nivelZoom = 100;
    actualizarZoom();

    setTimeout(function() {
        var nuevaAlturaTotal = contenedorPdf.scrollHeight;
        contenedorPdf.scrollLeft = 0;
        contenedorPdf.scrollTop = proporcion * nuevaAlturaTotal;
    }, 50); 
});

// --- 9. BARRA AUTO-OCULTABLE ---
contenedorPdf.addEventListener('scroll', function() {
    var scrollActual = contenedorPdf.scrollTop;
    if (!pinchZoomando) {
        if (scrollActual > ultimoScroll && scrollActual > 60) barraSuperior.classList.add('barra-oculta');
        else if (scrollActual < ultimoScroll) barraSuperior.classList.remove('barra-oculta');
    }
    ultimoScroll = scrollActual;
});

// --- 10. SERVICE WORKER (Desactivado o simplificado para iOS 9) ---
// iOS 9 no soporta Service Workers, así que simplemente no se registrará.

// --- 11. MOSTRAR/OCULTAR BARRA ---
contenedorPdf.addEventListener('click', function(e) {
    if (!pinchZoomando && e.target.id !== 'btn-reset-zoom') {
        barraSuperior.classList.toggle('barra-oculta');
    }
});

// --- 12. SINCRONIZACIÓN CACHÉ (Desactivado para iOS 9) ---
function actualizarContadorDescargas() {
    if (!('caches' in window)) return;
    // ... logic for caches ...
}

function sincronizarPartituras() {
    if (!('caches' in window)) return;
    // ... logic for caches ...
}