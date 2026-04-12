pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- VARIABLES GLOBALES ---
let cantos = [];
let temaActual = 'Todos'; 
let nivelZoom = 100; 
let pinchZoomando = false;
let distanciaInicial = 0;
let zoomInicial = 100;
let ultimoScroll = 0;
let centroToqueX = 0;
let centroToqueY = 0;
let porcentajeX = 0;
let porcentajeY = 0;
let centroInicialX = 0;
let centroInicialY = 0;
let scrollInicialX = 0;
let scrollInicialY = 0;

// --- ELEMENTOS DEL DOM ---
const contenedorLista = document.getElementById('lista-cantos');
const listaTemas = document.getElementById('lista-temas');
const inputBuscador = document.getElementById('buscador');
const contadorCantos = document.getElementById('contador-cantos');
const contenedorPdf = document.getElementById('contenedor-pdf');
const barraSuperior = document.getElementById('barra-superior');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const sidebar = document.getElementById('sidebar-temas');
const btnResetZoom = document.getElementById('btn-reset-zoom');
const btnLimpiarBusqueda = document.getElementById('btn-limpiar-busqueda');
const contadorDescargas = document.getElementById('contador-descargas');
const NOMBRE_CACHE_PDFS = 'COROFLORIDO-PDFS-v1';

// --- 1. LÓGICA DE BARRA RETRÁCTIL, OVERLAY Y SWIPE ---

// Creamos dinámicamente el "escudo" y lo agregamos al documento
const overlay = document.createElement('div');
overlay.id = 'overlay-sidebar';
document.body.appendChild(overlay);

// Función maestra para abrir y cerrar (controla el menú y el escudo)
function alternarMenu(forzarCierre = false) {
    if (forzarCierre) {
        sidebar.classList.add('oculto');
    } else {
        sidebar.classList.toggle('oculto');
    }
    
    // Si estamos en celular, controlamos el escudo
    if (window.innerWidth <= 768 && !sidebar.classList.contains('oculto')) {
        overlay.classList.add('activo');
        setTimeout(() => overlay.style.opacity = '1', 10); // Efecto suave
    } else {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.classList.remove('activo'), 300); // Espera a que acabe el efecto
    }
}

// 1A. Auto-ocultar al iniciar si es celular
if (window.innerWidth <= 768) {
    sidebar.classList.add('oculto');
}

// 1B. El botón manual
btnToggleSidebar.addEventListener('click', () => alternarMenu());

// 1C. Si tocas el escudo oscuro, se cierra el menú protegiendo los cantos
overlay.addEventListener('click', () => alternarMenu(true));

// 1D. Lógica de Swipe (Deslizar para cerrar)
let toqueInicialX = 0;
let toqueFinalX = 0;

document.addEventListener('touchstart', e => {
    toqueInicialX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', e => {
    toqueFinalX = e.changedTouches[0].screenX;
    
    // Si deslizaste hacia la izquierda por más de 50px
    if (toqueInicialX - toqueFinalX > 50) {
        // Solo cerramos si es celular y el menú está abierto
        if (window.innerWidth <= 768 && !sidebar.classList.contains('oculto')) {
            alternarMenu(true);
        }
    }
}, { passive: true });

// --- 2. CARGAR DATOS ---
fetch('cantos.json')
    .then(res => res.json())
    .then(async datos => {
        cantos = datos.map(c => {
            let arrTemas = [];
            if (Array.isArray(c.temas)) {
                arrTemas = c.temas;
            } else if (typeof c.tema === 'string' && c.tema.trim() !== '') {
                arrTemas = [c.tema.trim()]; 
            }
            return { ...c, temas: arrTemas };
        });

        generarMenuTemas(cantos);
        aplicarFiltros();
        
        await actualizarContadorDescargas(); 
        sincronizarPartituras(); 
    })
    .catch(err => console.error("Error al cargar cantos.json", err));

// --- 3. GENERAR BARRA LATERAL ---
function generarMenuTemas(lista) {
    let temasBrutos = lista.flatMap(c => c.temas);
    let temasUnicos = [...new Set(temasBrutos)].filter(t => t && t.trim() !== '');
    temasUnicos.sort(); 

    let htmlTemas = `
        <li class="item-tema activo" data-tema="Todos">Todos los cantos</li>
        <li class="item-tema" data-tema="Sin Tema">Sin Tema Especificado</li>
    `;

    temasUnicos.forEach(tema => {
        htmlTemas += `<li class="item-tema" data-tema="${tema}">${tema}</li>`;
    });

    listaTemas.innerHTML = htmlTemas;

    document.querySelectorAll('.item-tema').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.item-tema').forEach(i => i.classList.remove('activo'));
            e.target.classList.add('activo');
            
            temaActual = e.target.getAttribute('data-tema');
            aplicarFiltros();
            
            if(window.innerWidth <= 768) {
                alternarMenu(true); // Llama a nuestra nueva función maestra
            }
        });
    });
}

// --- FUNCIÓN PARA QUITAR TILDES ---
function limpiarTexto(texto) {
    return texto
        .normalize("NFD") 
        .replace(/[\u0300-\u036f]/g, "") 
        .toLowerCase()
        .trim();
}

// --- 4. APLICAR FILTROS Y BUSCADOR INTELIGENTE CON RELEVANCIA ---
function aplicarFiltros() {
    const textoBuscado = limpiarTexto(inputBuscador.value);
    const palabrasBusqueda = textoBuscado.split(' ').filter(p => p !== '');
    
    // Paso 1: Filtrar los que coinciden
    let filtrados = cantos.filter(c => {
        const nombreLimpio = limpiarTexto(c.nombre);
        const coincideTexto = palabrasBusqueda.every(palabra => nombreLimpio.includes(palabra));
        
        let coincideTema = false;
        if (temaActual === 'Todos') {
            coincideTema = true;
        } else if (temaActual === 'Sin Tema') {
            coincideTema = (c.temas.length === 0);
        } else {
            coincideTema = c.temas.includes(temaActual);
        }

        return (coincideTexto || palabrasBusqueda.length === 0) && coincideTema;
    });

    // Paso 2: NUEVO SISTEMA DE RANKING (Ordenar por relevancia)
    if (textoBuscado !== '') {
        filtrados.sort((a, b) => {
            const nombreA = limpiarTexto(a.nombre);
            const nombreB = limpiarTexto(b.nombre);
            
            let puntosA = 0;
            let puntosB = 0;

            // Si el canto EMPIEZA exactamente con lo que escribiste, tiene máxima prioridad (+100 puntos)
            if (nombreA.startsWith(textoBuscado)) puntosA += 100;
            // Si al menos la primera palabra coincide con la primera que escribiste (+50 puntos)
            else if (nombreA.split(' ')[0] === palabrasBusqueda[0]) puntosA += 50;

            if (nombreB.startsWith(textoBuscado)) puntosB += 100;
            else if (nombreB.split(' ')[0] === palabrasBusqueda[0]) puntosB += 50;

            // Desempate 1: Ordenar por quién tiene más puntos
            if (puntosA !== puntosB) {
                return puntosB - puntosA; 
            }
            
            // Desempate 2: Si tienen los mismos puntos, orden alfabético normal
            return nombreA.localeCompare(nombreB);
        });
    }

    mostrarCantos(filtrados);
}

// PEGA ESTO EN SU LUGAR:
inputBuscador.addEventListener('input', () => {
    // Mostrar u ocultar la X dependiendo de si hay texto
    if (inputBuscador.value.trim() !== '') {
        btnLimpiarBusqueda.classList.remove('oculto');
    } else {
        btnLimpiarBusqueda.classList.add('oculto');
    }
    aplicarFiltros();
});

btnLimpiarBusqueda.addEventListener('click', () => {
    inputBuscador.value = '';
    btnLimpiarBusqueda.classList.add('oculto');
    aplicarFiltros();
    inputBuscador.focus(); // Regresa el teclado automáticamente
});

// --- 5. RENDERIZAR LISTA PRINCIPAL ---
function mostrarCantos(lista) {
    contenedorLista.innerHTML = '';
    contadorCantos.textContent = `${lista.length} cantos`;

    if (lista.length === 0) {
        contenedorLista.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">No hay cantos que coincidan con la búsqueda.</p>';
        return;
    }

    lista.forEach(canto => {
        const div = document.createElement('div');
        div.className = 'tarjeta-canto';
        
        div.innerHTML = `
            <div>
                <h3>${canto.nombre}</h3>
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px;">
                    ${canto.temas.length > 0 
                        ? canto.temas.map(t => `<span class="tema-etiqueta">${t}</span>`).join('') 
                        : '<span class="tema-etiqueta" style="opacity:0.4;">Sin tema</span>'}
                </div>
            </div>
        `;
        
        div.addEventListener('click', () => abrirVisor(canto));
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

pdfjsLib.getDocument(`Partituras/${canto.archivo}`).promise.then(pdf => {
        contenedorPdf.innerHTML = ''; 
        
        const dpr = window.devicePixelRatio || 1;
        const LIMITE_FISICO_PIXELES = 2500; 

        // 1. CREAMOS LOS ESPACIOS VACÍOS PARA LAS 15 PÁGINAS (Skeleton)
        const arregloCanvases = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page';
            // Le damos una altura promedio para que la barra de scroll exista desde el principio
            canvas.style.minHeight = "800px"; 
            canvas.style.width = `${nivelZoom}%`;
            
            // Guardamos datos secretos en el canvas para saber qué página es
            canvas.dataset.pagina = i;
            canvas.dataset.renderizado = "false"; 
            
            contenedorPdf.appendChild(canvas);
            arregloCanvases.push(canvas);
        }

        // 2. CREAMOS EL "VIGILANTE" (Intersection Observer)
        const observador = new IntersectionObserver((entradas, obs) => {
            entradas.forEach(entrada => {
                // Si el canvas se está acercando a la pantalla...
                if (entrada.isIntersecting) {
                    const canvas = entrada.target;
                    const numPagina = parseInt(canvas.dataset.pagina);

                    // Si ya se dibujó antes, no hacemos nada
                    if (canvas.dataset.renderizado === "true") return;

                    // Lo marcamos y le decimos al vigilante que ya no lo siga
                    canvas.dataset.renderizado = "true";
                    obs.unobserve(canvas);

                    // 3. AHORA SÍ, RENDERIZAMOS ESTA HOJA ESPECÍFICA
                    pdf.getPage(numPagina).then(page => {
                        const viewportRaw = page.getViewport({ scale: 1.0 });
                        let escalaFinal = 1.5; 
                        let dimensionMayorVisual = Math.max(viewportRaw.width, viewportRaw.height);

                        if ((dimensionMayorVisual * escalaFinal * dpr) > LIMITE_FISICO_PIXELES) {
                            escalaFinal = (LIMITE_FISICO_PIXELES / dpr) / dimensionMayorVisual;
                        }

                        const viewport = page.getViewport({ scale: escalaFinal }); 

                        canvas.width = viewport.width * dpr;
                        canvas.height = viewport.height * dpr;
                        canvas.style.height = "auto"; 
                        canvas.style.minHeight = "auto"; // Quitamos la altura falsa

                        const context = canvas.getContext('2d');
                        context.scale(dpr, dpr);
                        
                        page.render({ canvasContext: context, viewport: viewport }).promise.then(() => {
                            page.cleanup(); // Liberamos la memoria interna de pdf.js
                        });
                    });
                }
            });
        }, {
            root: contenedorPdf,
            // LA MAGIA: El vigilante avisa cuando el canvas está a 1200px de entrar a la pantalla
            // (Aproximadamente 1 página y media de anticipación)
            rootMargin: '1200px 0px', 
            threshold: 0.01
        });

        // 4. PONEMOS AL VIGILANTE A OBSERVAR TODOS LOS ESPACIOS VACÍOS
        arregloCanvases.forEach(canvas => observador.observe(canvas));

    }).catch(err => {
        console.error(err);
        contenedorPdf.innerHTML = '<p style="color:red; text-align:center;">Error al cargar el PDF.</p>';
    });
}

// --- 7. CERRAR VISOR ---
function cerrarVisorCompleto() {
    document.getElementById('vista-visor').style.display = 'none';
    document.getElementById('vista-menu').style.display = 'flex';
    
    // LIMPIEZA ACTIVA DE MEMORIA RAM
    const canvases = contenedorPdf.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();
    });
    
    contenedorPdf.innerHTML = ''; 
}

// Evento 1: Clic en la "X" de la interfaz
document.getElementById('btn-cerrar').addEventListener('click', () => {
    // Si cierran con la X, también damos un paso atrás en el historial 
    // para que no tengan que presionarlo doble vez después
    if (window.location.hash === "#visor") {
        history.back();
    } else {
        cerrarVisorCompleto();
    }
});

// Evento 2: NUEVO - Interceptar el botón "Atrás" físico o el gesto del celular
window.addEventListener('popstate', (event) => {
    // Si el usuario presionó Atrás y salimos del estado '#visor', cerramos el PDF
    if (document.getElementById('vista-visor').style.display === 'block') {
        cerrarVisorCompleto();
    }
});

// --- 8. LÓGICA DE ZOOM PROFESIONAL ---
function actualizarZoom() {
    const paginas = document.querySelectorAll('.pdf-page');
    
    if (nivelZoom > 100) {
        contenedorPdf.classList.add('zoom-activo');
        btnResetZoom.style.display = 'flex';
    } else {
        contenedorPdf.classList.remove('zoom-activo');
        btnResetZoom.style.display = 'none';
        contenedorPdf.scrollLeft = 0; 
    }

    paginas.forEach(canvas => {
        canvas.style.width = `${nivelZoom}%`;
        canvas.style.margin = (nivelZoom > 100) ? "20px" : "10px auto";
    });
}

contenedorPdf.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        pinchZoomando = true;
        
        // 1. Distancia inicial para el zoom
        distanciaInicial = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        zoomInicial = nivelZoom;

        // 2. Punto medio de los dedos respecto al contenedor
        const rect = contenedorPdf.getBoundingClientRect();
        centroToqueX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        centroToqueY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        // 3. Posición de scroll actual
        scrollInicialX = contenedorPdf.scrollLeft;
        scrollInicialY = contenedorPdf.scrollTop;

        // 4. Calculamos en qué porcentaje de la hoja estamos tocando
        // Esto es lo que permite que el zoom no "brinque"
        porcentajeX = (scrollInicialX + centroToqueX) / contenedorPdf.scrollWidth;
        porcentajeY = (scrollInicialY + centroToqueY) / contenedorPdf.scrollHeight;
        
        // Guardamos el centro inicial para el movimiento (Pan)
        centroInicialX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
        centroInicialY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
    }
}, { passive: false });

contenedorPdf.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchZoomando) {
        e.preventDefault(); 
        
        // --- A. GESTIÓN DEL ZOOM ---
        const distanciaActual = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        const escala = distanciaActual / distanciaInicial;
        let nuevoZoom = zoomInicial * escala;
        
        if (nuevoZoom < 100) nuevoZoom = 100;
        if (nuevoZoom > 400) nuevoZoom = 400;
        
        nivelZoom = nuevoZoom;
        actualizarZoom(); 

        // --- B. MOVIMIENTO (PAN) INTUITIVO ---
        const rect = contenedorPdf.getBoundingClientRect();
        
        // Calculamos el centro ACTUAL de los dedos en este preciso momento
        const centroActualX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const centroActualY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        // LA CLAVE: El scroll debe ser la posición escalada MENOS el centro actual
        // Esto hace que el punto que tocas se quede "pegado" a tus dedos
        contenedorPdf.scrollLeft = (porcentajeX * contenedorPdf.scrollWidth) - centroActualX;
        contenedorPdf.scrollTop = (porcentajeY * contenedorPdf.scrollHeight) - centroActualY;
    }
}, { passive: false });

contenedorPdf.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        pinchZoomando = false;
    }
});

btnResetZoom.addEventListener('click', () => {
    // 1. Guardamos la posición actual (proporción del scroll)
    const posicionActual = contenedorPdf.scrollTop;
    const alturaTotalActual = contenedorPdf.scrollHeight;
    const proporcion = posicionActual / alturaTotalActual;

    // 2. Reseteamos el zoom
    nivelZoom = 100;
    actualizarZoom();

    // 3. Esperamos un instante a que el navegador recalcule el tamaño de las hojas
    // y aplicamos el scroll a la misma proporción, pero reseteando el horizontal
    setTimeout(() => {
        const nuevaAlturaTotal = contenedorPdf.scrollHeight;
        contenedorPdf.scrollTo({
            top: proporcion * nuevaAlturaTotal,
            left: 0,
            behavior: 'smooth'
        });
    }, 50); // 50ms son suficientes para que el DOM se entere del cambio
});

// --- 9. BARRA AUTO-OCULTABLE ---
contenedorPdf.addEventListener('scroll', () => {
    let scrollActual = contenedorPdf.scrollTop;
    
    if (!pinchZoomando) {
        if (scrollActual > ultimoScroll && scrollActual > 60) barraSuperior.classList.add('barra-oculta');
        else if (scrollActual < ultimoScroll) barraSuperior.classList.remove('barra-oculta');
    }
    ultimoScroll = scrollActual;
});
// --- 10. REGISTRO DEL SERVICE WORKER PARA MODO OFFLINE ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker listo', reg.scope))
            .catch(err => console.warn('Error al registrar SW', err));
    });
}
// --- 11. MOSTRAR/OCULTAR BARRA CON UN TOQUE ---
contenedorPdf.addEventListener('click', (e) => {
    // Solo toggleamos si el usuario no está haciendo zoom con dos dedos
    // y si no hizo clic por error en un botón (como el de reset)
    if (!pinchZoomando && e.target.id !== 'btn-reset-zoom') {
        barraSuperior.classList.toggle('barra-oculta');
    }
});
// --- 12. SINCRONIZACIÓN AUTOMÁTICA EN SEGUNDO PLANO ---
async function actualizarContadorDescargas() {
    if (!('caches' in window) || cantos.length === 0) return;
    
    try {
        const cache = await caches.open(NOMBRE_CACHE_PDFS);
        const requestsGuardados = await cache.keys();
        const urlsGuardadas = requestsGuardados.map(req => decodeURIComponent(new URL(req.url).pathname.split('/').pop()));
        
        let descargados = cantos.filter(c => urlsGuardadas.includes(c.archivo)).length;
        let total = cantos.length;
        
        contadorDescargas.style.display = 'inline-block';
        
        if (descargados >= total) {
            contadorDescargas.textContent = `✓ Disponibles sin internet`;
            contadorDescargas.classList.add('completado');
        } else {
            contadorDescargas.textContent = `Guardando en tu dispositivo: ${descargados} de ${total}`;
            contadorDescargas.classList.remove('completado');
        }
    } catch(e) {
        console.warn("Error al leer caché para el contador", e);
    }
}

async function sincronizarPartituras() {
    setTimeout(async () => {
        const cache = await caches.open(NOMBRE_CACHE_PDFS);

        for (const canto of cantos) {
            const url = `Partituras/${canto.archivo}`;
            const coincidencia = await cache.match(url);
            
            if (!coincidencia) {
                try {
                    await cache.add(url);
                    await actualizarContadorDescargas(); 
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (e) {
                    console.warn(`Error al precargar: ${canto.nombre}`, e);
                }
            }
        }
        await actualizarContadorDescargas();
    }, 3000);
}