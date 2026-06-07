// VARIABLES GLOBALES
var cantos = [];
var temaActual = 'Todos';

// ELEMENTOS DOM
var contenedorLista = document.getElementById('lista-cantos');
var listaTemas = document.getElementById('lista-temas');
var buscador = document.getElementById('buscador');
var sidebar = document.getElementById('sidebar-temas');
var overlay = document.getElementById('overlay-sidebar');

// 1. CARGA DE DATOS (XHR TRADICIONAL)
function cargarDatos() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'cantos.json', true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            try {
                cantos = JSON.parse(xhr.responseText);
                renderizarMenu();
                renderizarCantos();
            } catch (e) {
                console.error("Error al parsear JSON", e);
            }
        }
    };
    xhr.send();
}

// 2. RENDERIZADO DE MENÚ
function renderizarMenu() {
    var temas = ["Todos"];
    for (var i = 0; i < cantos.length; i++) {
        var c = cantos[i];
        var tArr = Array.isArray(c.temas) ? c.temas : (c.tema ? [c.tema] : []);
        for (var j = 0; j < tArr.length; j++) {
            var tLimpio = tArr[j].trim();
            if (tLimpio && temas.indexOf(tLimpio) === -1) temas.push(tLimpio);
        }
    }
    
    var html = "";
    for (var k = 0; k < temas.length; k++) {
        var clase = (temas[k] === temaActual) ? " item-tema activo" : " item-tema";
        html += '<li class="' + clase + '" onclick="filtrarTema(\'' + temas[k] + '\')">' + temas[k] + '</li>';
    }
    if (listaTemas) listaTemas.innerHTML = html;
}

window.filtrarTema = function(t) {
    temaActual = t;
    renderizarMenu();
    renderizarCantos();
    // Cerrar menú tras seleccionar
    cerrarSidebar();
};

// 3. RENDERIZADO DE CANTOS
function renderizarCantos() {
    var filtro = (buscador ? buscador.value : "").toLowerCase();
    var html = "";
    var total = 0;

    for (var i = 0; i < cantos.length; i++) {
        var c = cantos[i];
        var nombre = c.nombre.toLowerCase();
        var cTemas = Array.isArray(c.temas) ? c.temas : (c.tema ? [c.tema] : []);
        
        var coincideTexto = nombre.indexOf(filtro) !== -1;
        var coincideTema = (temaActual === "Todos" || cTemas.indexOf(temaActual) !== -1);

        if (coincideTexto && coincideTema) {
            var etiquetasHTML = "";
            for (var j = 0; j < cTemas.length; j++) {
                etiquetasHTML += '<span class="tema-etiqueta">' + cTemas[j] + '</span> ';
            }

            html += '<div class="tarjeta-canto" onclick="abrirPDF(' + i + ')">' +
                        '<h3>' + c.nombre + '</h3>' +
                        '<div class="contenedor-etiquetas">' + etiquetasHTML + '</div>' +
                    '</div>';
            total++;
        }
    }

    if (contenedorLista) {
        contenedorLista.innerHTML = html || '<p style="padding:20px; text-align:center;">Sin resultados.</p>';
    }
    var counter = document.getElementById('contador-cantos');
    if (counter) counter.innerHTML = total;
}

if (buscador) {
    buscador.onkeyup = function() { renderizarCantos(); };
}

// 4. VISOR DE PDF
function setViewportZoom(enabled) {
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
        if (enabled) {
            meta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes";
        } else {
            meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
        }
    }
}

window.abrirPDF = function(index) {
    var canto = cantos[index];
    document.getElementById('vista-menu').style.display = 'none';
    document.getElementById('vista-visor').style.display = 'block';
    document.getElementById('titulo-canto').innerHTML = canto.nombre;
    
    setViewportZoom(true);

    var visor = document.getElementById('contenedor-pdf');
    visor.innerHTML = '<p style="padding:40px; text-align:center;">Descargando partitura...</p>';

    var lib = window.PDFJS || window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (!lib) {
        alert("La librería PDF no se cargó.");
        return;
    }

    lib.workerSrc = 'js/pdf.worker.min.js';
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'Partituras/' + encodeURIComponent(canto.archivo), true);
    xhr.responseType = 'arraybuffer';
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = new Uint8Array(xhr.response);
            lib.getDocument({data: data}).promise.then(function(pdf) {
                visor.innerHTML = "";
                for (var n = 1; n <= pdf.numPages; n++) {
                    var canvas = document.createElement('canvas');
                    canvas.className = 'pdf-page';
                    canvas.style.width = '100%';
                    canvas.style.marginBottom = '10px';
                    visor.appendChild(canvas);
                    dibujarPagina(pdf, n, canvas);
                }
            }).catch(function(err) {
                alert("Error PDF: " + err.message);
            });
        }
    };
    xhr.send();
};

function dibujarPagina(pdf, num, canvas) {
    pdf.getPage(num).then(function(page) {
        var viewport = page.getViewport(1.3);
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        var ctx = canvas.getContext('2d');
        page.render({ canvasContext: ctx, viewport: viewport });
    });
}

document.getElementById('btn-cerrar').onclick = function() {
    document.getElementById('vista-visor').style.display = 'none';
    document.getElementById('vista-menu').style.display = 'block';
    setViewportZoom(false);
};

// GESTIÓN DE SIDEBAR (MENÚ LATERAL)
function abrirSidebar() {
    if (sidebar) sidebar.style.display = 'block';
    if (overlay) overlay.className = 'activo';
}

function cerrarSidebar() {
    if (sidebar && window.innerWidth <= 768) {
        sidebar.style.display = 'none';
    }
    if (overlay) overlay.className = '';
}

document.getElementById('btn-toggle-sidebar').onclick = function() {
    if (sidebar && sidebar.style.display === 'block') {
        cerrarSidebar();
    } else {
        abrirSidebar();
    }
};

if (overlay) {
    overlay.onclick = cerrarSidebar;
}

var btnCerrarSidebar = document.getElementById('btn-cerrar-sidebar');
if (btnCerrarSidebar) {
    btnCerrarSidebar.onclick = cerrarSidebar;
}

// --- SISTEMA DE TEMAS ---
var btnTema = document.getElementById('btn-selector-tema');
var luna = document.querySelector('.icono-tema-luna');
var sol = document.querySelector('.icono-tema-sol');

function aplicarTema(oscuro) {
    if (oscuro) {
        document.documentElement.classList.add('tema-oscuro');
        if (luna) luna.style.display = 'none';
        if (sol) sol.style.display = 'inline';
    } else {
        document.documentElement.classList.remove('tema-oscuro');
        if (luna) luna.style.display = 'inline';
        if (sol) sol.style.display = 'none';
    }
}

if (btnTema) {
    var temaGuardado = localStorage.getItem('tema-coro');
    var esOscuro = temaGuardado === 'oscuro';
    aplicarTema(esOscuro);

    btnTema.onclick = function() {
        esOscuro = !esOscuro;
        localStorage.setItem('tema-coro', esOscuro ? 'oscuro' : 'claro');
        aplicarTema(esOscuro);
    };
}

// --- DESCARGA OFFLINE (CACHÉ) ---
var btnDescargarTodo = document.getElementById('btn-descargar-todo');
var progresoDescarga = document.getElementById('progreso-descarga');

if (btnDescargarTodo) {
    btnDescargarTodo.onclick = function() {
        if (!cantos || cantos.length === 0) return;
        
        btnDescargarTodo.disabled = true;
        btnDescargarTodo.innerHTML = "Descargando...";
        progresoDescarga.style.display = "block";
        progresoDescarga.innerHTML = "0 / " + cantos.length;
        
        var descargados = 0;
        
        function descargarSiguiente(index) {
            if (index >= cantos.length) {
                btnDescargarTodo.innerHTML = "¡Descarga Completa!";
                btnDescargarTodo.style.background = "#2e7d32"; // verde
                setTimeout(function() {
                    btnDescargarTodo.innerHTML = "Descargar Todas (Offline)";
                    btnDescargarTodo.style.background = "var(--color-acento)";
                    btnDescargarTodo.disabled = false;
                    progresoDescarga.style.display = "none";
                }, 4000);
                return;
            }
            
            var urlPdf = 'Partituras/' + encodeURIComponent(cantos[index].archivo);
            
            // fetch pasará por el Service Worker y será cacheado
            fetch(urlPdf, { cache: 'no-cache' }).then(function(res) {
                descargados++;
                progresoDescarga.innerHTML = descargados + " / " + cantos.length;
                descargarSiguiente(index + 1);
            }).catch(function(err) {
                console.error("Error al descargar " + urlPdf, err);
                descargados++; // Continuar aunque falle
                progresoDescarga.innerHTML = descargados + " / " + cantos.length;
                descargarSiguiente(index + 1);
            });
        }
        
        descargarSiguiente(0);
    };
}

// INICIAR PROCESO
cargarDatos();