// MENSAJE DE CONTROL
var logUI = document.getElementById('debug-log');
function log(txt) { 
    if(logUI) {
        logUI.innerHTML += "<br>> " + txt;
        logUI.scrollTop = logUI.scrollHeight;
    }
}

log("Iniciando app.js (v. Final)...");

// VARIABLES GLOBALES
var cantos = [];
var temaActual = 'Todos';

// ELEMENTOS DOM
var contenedorLista = document.getElementById('lista-cantos');
var listaTemas = document.getElementById('lista-temas');
var buscador = document.getElementById('buscador');

// 1. CARGA DE DATOS (XHR TRADICIONAL)
function cargarDatos() {
    log("Cargando cantos.json...");
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'cantos.json', true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            log("Respuesta recibida: " + xhr.status);
            if (xhr.status === 200) {
                try {
                    cantos = JSON.parse(xhr.responseText);
                    log("JSON cargado: " + cantos.length + " cantos.");
                    renderizarMenu();
                    renderizarCantos();
                } catch (e) {
                    log("ERROR JSON: " + e.message);
                }
            } else {
                log("ERROR XHR: " + xhr.status);
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
    // Cerrar menú en móviles tras seleccionar
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar-temas').style.display = 'none';
    }
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
            html += '<div class="tarjeta-canto" onclick="abrirPDF(' + i + ')">' +
                        '<h3>' + c.nombre + '</h3>' +
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
window.abrirPDF = function(index) {
    var canto = cantos[index];
    document.getElementById('vista-menu').style.display = 'none';
    document.getElementById('vista-visor').style.display = 'block';
    document.getElementById('titulo-canto').innerHTML = canto.nombre;
    
    var visor = document.getElementById('contenedor-pdf');
    visor.innerHTML = '<p style="padding:40px; text-align:center;">Descargando partitura...</p>';

    var lib = window.PDFJS || window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (!lib) {
        alert("La librería PDF no se cargó.");
        return;
    }

    // Configuración específica para v1.x y v2.x
    lib.workerSrc = 'js/pdf.worker.min.js';
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';

    // Descarga binaria (ArrayBuffer)
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'Partituras/' + encodeURIComponent(canto.archivo), true);
    xhr.responseType = 'arraybuffer';
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
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
            } else {
                alert("No se pudo obtener el PDF (Status: " + xhr.status + ")");
            }
        }
    };
    xhr.send();
};

function dibujarPagina(pdf, num, canvas) {
    pdf.getPage(num).then(function(page) {
        var viewport = page.getViewport({ scale: 1.3 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        var ctx = canvas.getContext('2d');
        page.render({ canvasContext: ctx, viewport: viewport });
    });
}

document.getElementById('btn-cerrar').onclick = function() {
    document.getElementById('vista-visor').style.display = 'none';
    document.getElementById('vista-menu').style.display = 'block';
};

document.getElementById('btn-toggle-sidebar').onclick = function() {
    var s = document.getElementById('sidebar-temas');
    if (s.style.display === 'block') s.style.display = 'none';
    else s.style.display = 'block';
};

// INICIAR PROCESO
cargarDatos();