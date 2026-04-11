pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- VARIABLES GLOBALES ---
let cantos = [];
let temaActual = 'Todos'; 
let nivelZoom = 100; 
let pinchZoomando = false;
let distanciaInicial = 0;
let zoomInicial = 100;
let ultimoScroll = 0;

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

// --- 1. LÓGICA DE BARRA RETRÁCTIL ---
btnToggleSidebar.addEventListener('click', () => {
    sidebar.classList.toggle('oculto');
});

// --- 2. CARGAR DATOS ---
fetch('cantos.json?nocache=' + new Date().getTime())
    .then(res => res.json())
    .then(datos => {
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
            
            if(window.innerWidth < 768) {
                sidebar.classList.add('oculto');
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

inputBuscador.addEventListener('input', aplicarFiltros);

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
    
    nivelZoom = 100; 
    actualizarZoom(); 
    contenedorPdf.innerHTML = '<p style="margin-top:80px; text-align:center; color:#555;">Cargando partitura en alta resolución...</p>';

    pdfjsLib.getDocument(`Partituras/${canto.archivo}`).promise.then(pdf => {
        contenedorPdf.innerHTML = ''; 
        
        for (let i = 1; i <= pdf.numPages; i++) {
            pdf.getPage(i).then(page => {
                // MAGIA PARA LA NITIDEZ:
                // Detectamos la calidad de la pantalla (Retina/4K suelen ser 2 o 3)
                const dpr = window.devicePixelRatio || 1;
                // Subimos la escala a 3.0 para asegurar nitidez incluso con zoom
                const escalaBase = 3.0; 
                const viewport = page.getViewport({ scale: escalaBase }); 

                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-page';
                
                // Ajustamos el tamaño interno del canvas (pixeles reales)
                canvas.width = viewport.width * dpr;
                canvas.height = viewport.height * dpr;
                
                // Ajustamos el tamaño visual (lo que ves en pantalla)
                canvas.style.width = `${nivelZoom}%`; 
                canvas.style.height = "auto"; 

                const context = canvas.getContext('2d');
                // Escalamos el contexto para que coincida con el DPR
                context.scale(dpr, dpr);
                
                contenedorPdf.appendChild(canvas);
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                page.render(renderContext);
            });
        }
    }).catch(err => {
        console.error(err);
        contenedorPdf.innerHTML = '<p style="color:red; text-align:center;">Error al cargar el PDF.</p>';
    });
}

// --- 7. CERRAR VISOR ---
document.getElementById('btn-cerrar').addEventListener('click', () => {
    document.getElementById('vista-visor').style.display = 'none';
    document.getElementById('vista-menu').style.display = 'flex';
    contenedorPdf.innerHTML = ''; 
});

// --- 8. LÓGICA DE ZOOM TÁCTIL ---
function actualizarZoom() {
    const paginas = document.querySelectorAll('.pdf-page');
    
    if (nivelZoom > 100) {
        // ESTADO 2: Navegación Libre
        contenedorPdf.classList.add('zoom-activo');
        btnResetZoom.style.display = 'flex';
    } else {
        // ESTADO 1: Estático y cubriendo ancho
        contenedorPdf.classList.remove('zoom-activo');
        btnResetZoom.style.display = 'none';
        
        // Limpiamos cualquier rastro de desplazamiento lateral
        contenedorPdf.scrollLeft = 0; 
    }

    paginas.forEach(canvas => {
        // Aplicamos el tamaño. Al ser 100%, cubrirá el ancho por el align-items center.
        canvas.style.width = `${nivelZoom}%`;
        
        // En Free Roam quitamos el margin auto para que el scroll sea real desde el borde
        if (nivelZoom > 100) {
            canvas.style.margin = "20px"; 
        } else {
            canvas.style.margin = "10px auto";
        }
    });
}

contenedorPdf.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        pinchZoomando = true;
        distanciaInicial = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        zoomInicial = nivelZoom;
    }
}, { passive: false });

contenedorPdf.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchZoomando) {
        e.preventDefault(); 
        
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