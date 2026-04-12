// --- CONFIGURACIÓN INTEGRADA ---
const PROPIETARIO = "lldmflorido"; 
const REPOSITORIO = "PartiturasCoro";

// --- ESTADO DEL SISTEMA ---
let tokenActual = "";
let listaOriginal = []; // La lista real en GitHub
let listaLocal = [];    // La lista con tus ediciones en vivo
let cambiosPendientes = []; // Carrito de compras de las ediciones
let jsonSha = "";
let resolviendoConfirmacion = null;

// --- ELEMENTOS PRINCIPALES ---
const secLogin = document.getElementById('seccion-login');
const secTrabajo = document.getElementById('seccion-trabajo');
const controlesCabecera = document.getElementById('controles-cabecera');
const cuerpoTabla = document.getElementById('cuerpo-tabla-cantos');
const buscadorUI = document.getElementById('buscador-gestor');

// --- BOTONES GLOBALES ---
const btnSincronizar = document.getElementById('btn-sincronizar');
const badgeCambios = document.getElementById('contador-cambios');

// --- MODAL DE FORMULARIO ---
const modalFormulario = document.getElementById('modal-formulario');
const inIndice = document.getElementById('indice-canto');
const inNombre = document.getElementById('nombre-canto');
const inTemas = document.getElementById('temas-canto');
const inArchivo = document.getElementById('archivo-pdf');
const txtArchivoActual = document.getElementById('texto-archivo-actual');
const tituloForm = document.getElementById('titulo-modal');

// --- UTILIDADES ---
const utf8_to_b64 = str => window.btoa(unescape(encodeURIComponent(str)));
const b64_to_utf8 = str => decodeURIComponent(escape(window.atob(str)));
const obtenerFechaActual = () => new Date().toISOString().split('T')[0];

function mostrarMensajeLogin(texto) {
    const msg = document.getElementById('mensaje-login');
    msg.textContent = texto;
    msg.className = "mensaje-estado error";
}

// --- INICIALIZACIÓN Y LOGIN ---
document.addEventListener('DOMContentLoaded', () => {
    const tokenGuardado = localStorage.getItem('gestorToken');
    if (tokenGuardado) {
        tokenActual = tokenGuardado;
        iniciarSistema();
    }
});

document.getElementById('btn-acceder').addEventListener('click', () => {
    const token = document.getElementById('input-token').value.trim();
    if (!token) return mostrarMensajeLogin('Debe ingresar una llave.');
    tokenActual = token;
    iniciarSistema();
});

document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
    localStorage.removeItem('gestorToken');
    location.reload();
});

async function iniciarSistema() {
    try {
        const url = `https://api.github.com/repos/${PROPIETARIO}/${REPOSITORIO}/contents/cantos.json`;
        const res = await fetch(url, { headers: { "Authorization": `token ${tokenActual}` } });
        if (!res.ok) throw new Error("Credenciales inválidas");
        
        const data = await res.json();
        jsonSha = data.sha;
        listaOriginal = JSON.parse(b64_to_utf8(data.content));
        
        // Clonar la lista para trabajar localmente sin afectar la original
        listaLocal = JSON.parse(JSON.stringify(listaOriginal)); 
        
        localStorage.setItem('gestorToken', tokenActual);
        secLogin.classList.add('oculto');
        secTrabajo.classList.remove('oculto');
        controlesCabecera.classList.remove('oculto');
        
        renderizarTabla();
    } catch (error) {
        mostrarMensajeLogin('Llave incorrecta o sin permisos.');
        localStorage.removeItem('gestorToken');
    }
}

// --- RENDERIZADO DE TABLA PRINCIPAL ---
function renderizarTabla(filtro = "") {
    cuerpoTabla.innerHTML = "";
    const termino = filtro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    listaLocal.forEach((canto, index) => {
        if (canto._eliminado) return;

        const nombreLimpio = canto.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (termino && !nombreLimpio.includes(termino)) return;

        const tr = document.createElement('tr');
        
        const fechaMostrar = canto.fecha || "No registrada";
        const temasFormat = canto.temas.map(t => `<span class="etiqueta-tema">${t}</span>`).join('');
        
        let indicadorCambio = "";
        const cambioRelacionado = cambiosPendientes.find(c => c.indiceTemporal === index);
        if (cambioRelacionado) {
            indicadorCambio = `<span style="color:#d4af37; font-weight:bold; font-size:11px; display:block;">(Modificado localmente)</span>`;
        }

        tr.innerHTML = `
            <td><strong>${canto.nombre}</strong> ${indicadorCambio}</td>
            <td>${temasFormat}</td>
            <td style="color:#666; font-size:13px;">${fechaMostrar}</td>
            <td style="color:#666; font-size:13px;">${canto.archivo}</td>
            <td class="col-acciones">
                <button class="btn-accion descargar" onclick="descargarPdfDirecto(${index})">Descargar</button>
                <button class="btn-accion editar" onclick="abrirModalEdicion(${index})">Editar</button>
                <button class="btn-accion eliminar" onclick="solicitarEliminacion(${index})">Eliminar</button>
            </td>
        `;
        cuerpoTabla.appendChild(tr);
    });

    actualizarBadgeSincronizacion();
}

buscadorUI.addEventListener('input', (e) => renderizarTabla(e.target.value));

function actualizarBadgeSincronizacion() {
    const total = cambiosPendientes.length;
    badgeCambios.textContent = `${total} Cambios Pendientes`;
    
    if (total > 0) {
        btnSincronizar.disabled = false;
        badgeCambios.style.backgroundColor = "#fff3cd";
        badgeCambios.style.color = "#856404";
    } else {
        btnSincronizar.disabled = true;
        badgeCambios.style.backgroundColor = "#e8f5e9";
        badgeCambios.style.color = "#2e7d32";
        badgeCambios.textContent = "Sistema Actualizado";
    }
}

// --- SISTEMA DE CONFIRMACIÓN (REUTILIZABLE) ---
function pedirConfirmacion(mensaje) {
    return new Promise((resolve) => {
        document.getElementById('texto-confirmacion').textContent = mensaje;
        document.getElementById('modal-confirmacion').classList.remove('oculto');
        resolviendoConfirmacion = resolve;
    });
}

document.getElementById('btn-cancelar-confirmacion').addEventListener('click', () => {
    document.getElementById('modal-confirmacion').classList.add('oculto');
    if (resolviendoConfirmacion) resolviendoConfirmacion(false);
});

document.getElementById('btn-aceptar-confirmacion').addEventListener('click', () => {
    document.getElementById('modal-confirmacion').classList.add('oculto');
    if (resolviendoConfirmacion) resolviendoConfirmacion(true);
});

// --- LÓGICA DE ELIMINACIÓN LOCAL ---
async function solicitarEliminacion(index) {
    const canto = listaLocal[index];
    const confirmado = await pedirConfirmacion(`¿Está completamente seguro de que desea eliminar el canto "${canto.nombre}"? Esta acción borrará la entrada del índice (El PDF físico se mantendrá por seguridad).`);
    
    if (confirmado) {
        // En vez de borrar el índice y desajustar el array, lo marcamos
        listaLocal[index]._eliminado = true;
        
        cambiosPendientes.push({
            tipo: 'ELIMINAR',
            indiceTemporal: index,
            nombreOriginal: canto.nombre
        });
        
        renderizarTabla(buscadorUI.value);
    }
}

// --- APERTURA DE MODALES DE REGISTRO/EDICIÓN ---
document.getElementById('btn-nuevo-canto').addEventListener('click', () => {
    inIndice.value = "";
    inNombre.value = "";
    inTemas.value = "";
    inArchivo.value = "";
    tituloForm.textContent = "Registrar Nuevo Canto";
    txtArchivoActual.textContent = "Obligatorio adjuntar PDF para un canto nuevo.";
    modalFormulario.classList.remove('oculto');
});

function abrirModalEdicion(index) {
    const canto = listaLocal[index];
    inIndice.value = index;
    inNombre.value = canto.nombre;
    inTemas.value = canto.temas.join(', ');
    inArchivo.value = "";
    
    tituloForm.textContent = "Editando Canto";
    txtArchivoActual.textContent = `Documento vinculado: ${canto.archivo}`;
    modalFormulario.classList.remove('oculto');
}

// Cerrar Modal
document.getElementById('btn-cerrar-formulario').addEventListener('click', () => modalFormulario.classList.add('oculto'));
document.getElementById('btn-cancelar-formulario').addEventListener('click', () => modalFormulario.classList.add('oculto'));

// --- GUARDADO LOCAL (EN LA RAM) ---
function leerBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
    });
}

document.getElementById('btn-guardar-local').addEventListener('click', async () => {
    const nombre = inNombre.value.trim();
    let temasArray = inTemas.value.split(',').map(t => t.trim()).filter(t => t);
    const index = inIndice.value;
    const esNuevo = index === "";

    // VALIDACIONES ESTRICTAS DE SEGURIDAD
    if (!nombre || temasArray.length === 0) {
        return pedirConfirmacion("Debe completar el Título y al menos un Tema.");
    }

    if (esNuevo && inArchivo.files.length === 0) {
        return pedirConfirmacion("SEGURIDAD: Es estrictamente obligatorio adjuntar un archivo PDF para registrar un canto nuevo.");
    }

    // Convertir el archivo a Base64 inmediatamente si seleccionaron uno
    let base64PDF = null;
    let nombreArchivoFisico = "";

    if (inArchivo.files.length > 0) {
        base64PDF = await leerBase64(inArchivo.files[0]);
        nombreArchivoFisico = `${nombre}.pdf`; // Fuerza que lleve la extensión pdf
    } else {
        nombreArchivoFisico = listaLocal[index].archivo; // Mantiene el archivo anterior
    }

    // Validar nombre de archivo duplicado (Solo alerta, no bloquea estrictamente porque pueden estar sobrescribiendo)
    const conflictoNombre = listaLocal.find((c, i) => i.toString() !== index && c.archivo === nombreArchivoFisico && !c._eliminado);
    if (conflictoNombre && inArchivo.files.length > 0) {
        const confirmarSobrescritura = await pedirConfirmacion(`Ya existe otro canto usando el archivo "${nombreArchivoFisico}". ¿Desea sobrescribirlo de todas formas?`);
        if(!confirmarSobrescritura) return;
    }

    // REGISTRAR EL CAMBIO LOCALMENTE
    if (esNuevo) {
        const nuevoCanto = {
            nombre: nombre,
            archivo: nombreArchivoFisico,
            temas: temasArray,
            fecha: obtenerFechaActual()
        };
        // Lo añadimos temporalmente a la lista local
        const nuevoIndice = listaLocal.push(nuevoCanto) - 1;
        
        cambiosPendientes.push({
            tipo: 'NUEVO',
            indiceTemporal: nuevoIndice,
            archivoB64: base64PDF,
            nombreArchivoFinal: nombreArchivoFisico
        });
    } else {
        // Si es edición
        listaLocal[index].nombre = nombre;
        listaLocal[index].temas = temasArray;
        listaLocal[index].archivo = nombreArchivoFisico;
        // Si no tenía fecha, se la ponemos. Si tenía, se la dejamos.
        if(!listaLocal[index].fecha) listaLocal[index].fecha = obtenerFechaActual();

        // Eliminar cambio de edición previo si ya existía en este mismo índice (para no hacer envíos duplicados)
        cambiosPendientes = cambiosPendientes.filter(c => c.indiceTemporal !== parseInt(index));

        cambiosPendientes.push({
            tipo: 'EDITAR',
            indiceTemporal: parseInt(index),
            archivoB64: base64PDF, // Será null si no subieron PDF nuevo, lo cual es válido
            nombreArchivoFinal: nombreArchivoFisico
        });
    }

    modalFormulario.classList.add('oculto');
    renderizarTabla(buscadorUI.value);
});


// --- SINCRONIZACIÓN BATCH AL SERVIDOR (LA MAGIA FINAL) ---
btnSincronizar.addEventListener('click', async () => {
    const confirmado = await pedirConfirmacion(`¿Está seguro de enviar ${cambiosPendientes.length} modificaciones al servidor? Los cambios se verán reflejados en todos los dispositivos.`);
    if (!confirmado) return;

    const modalCarga = document.getElementById('modal-carga');
    const barraProgreso = document.getElementById('barra-progreso');
    const textoCarga = document.getElementById('texto-carga');
    
    modalCarga.classList.remove('oculto');
    btnSincronizar.disabled = true;

    try {
        const baseUrl = `https://api.github.com/repos/${PROPIETARIO}/${REPOSITORIO}/contents`;
        const headers = { "Authorization": `token ${tokenActual}`, "Content-Type": "application/json" };

        let completados = 0;
        
        // 1. SUBIR LOS PDFs NECESARIOS
        for (const cambio of cambiosPendientes) {
            textoCarga.textContent = `Procesando: Elemento ${completados + 1} de ${cambiosPendientes.length}`;
            
            // Si hay un archivo en Base64 cargado, hay que subirlo a la carpeta Partituras
            if ((cambio.tipo === 'NUEVO' || cambio.tipo === 'EDITAR') && cambio.archivoB64) {
                
                // Necesitamos revisar si el archivo ya existe físicamente para obtener su SHA y sobreescribir
                let pdfSha = "";
                const resChequeo = await fetch(`${baseUrl}/Partituras/${encodeURIComponent(cambio.nombreArchivoFinal)}`, { headers });
                if (resChequeo.ok) {
                    const dataExistente = await resChequeo.json();
                    pdfSha = dataExistente.sha;
                }

                // Subir el PDF
                const resPdf = await fetch(`${baseUrl}/Partituras/${encodeURIComponent(cambio.nombreArchivoFinal)}`, {
                    method: "PUT",
                    headers: headers,
                    body: JSON.stringify({
                        message: `AdminBatch: Subida de partitura ${cambio.nombreArchivoFinal}`,
                        content: cambio.archivoB64,
                        sha: pdfSha || undefined
                    })
                });

                if (!resPdf.ok) throw new Error(`Fallo al subir el archivo: ${cambio.nombreArchivoFinal}`);
            }

            // Nota de Seguridad: Para los ELIMINAR, dejamos el archivo físico huérfano en el repositorio. 
            // Solo lo eliminamos del cantos.json para evitar desastres si borran el canto equivocado.

            completados++;
            barraProgreso.style.width = `${(completados / (cambiosPendientes.length + 1)) * 100}%`;
        }

        // 2. CONSTRUIR Y SUBIR EL JSON FINAL
        textoCarga.textContent = "Actualizando el índice general...";
        
        // Limpiamos la lista para GitHub: quitamos los eliminados y la propiedad temporal
        const listaFinalParaSubir = listaLocal
            .filter(c => !c._eliminado)
            .map(c => {
                // Hacemos una copia limpia sin la bandera _eliminado
                const copiaLimpa = { ...c };
                delete copiaLimpa._eliminado;
                return copiaLimpa;
            });

        // Ordenamos alfabéticamente
        listaFinalParaSubir.sort((a, b) => a.nombre.localeCompare(b.nombre));

        const resJson = await fetch(`${baseUrl}/cantos.json`, {
            method: "PUT",
            headers: headers,
            body: JSON.stringify({
                message: `AdminBatch: Actualización masiva de repertorio`,
                content: utf8_to_b64(JSON.stringify(listaFinalParaSubir, null, 2)),
                sha: jsonSha
            })
        });

        if (!resJson.ok) throw new Error("Fallo al actualizar cantos.json");
        const dataJsonNuevo = await resJson.json();
        jsonSha = dataJsonNuevo.content.sha;

        // ÉXITO TOTAL
        barraProgreso.style.width = "100%";
        textoCarga.textContent = "¡Sincronización completada con éxito!";
        
        setTimeout(() => {
            modalCarga.classList.add('oculto');
            cambiosPendientes = [];
            listaLocal = listaFinalParaSubir; // Actualizamos nuestro estado base
            listaOriginal = JSON.parse(JSON.stringify(listaLocal)); // Sincronizamos la original
            renderizarTabla();
        }, 2000);

    } catch (error) {
        console.error(error);
        textoCarga.textContent = `Error crítico: ${error.message}. Por seguridad el proceso se detuvo.`;
        textoCarga.style.color = "var(--peligro)";
        barraProgreso.style.backgroundColor = "var(--peligro)";
        
        setTimeout(() => {
            modalCarga.classList.add('oculto');
            btnSincronizar.disabled = false;
        }, 5000);
    }
});

function descargarPdfDirecto(index) {
    const canto = listaLocal[index];
    if (!canto || !canto.archivo) return;

    // Construimos la URL de GitHub Pages (Producción)
    const url = `https://${PROPIETARIO}.github.io/${REPOSITORIO}/Partituras/${encodeURIComponent(canto.archivo)}`;
    
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.target = "_blank";
    enlace.download = canto.archivo;
    
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
}