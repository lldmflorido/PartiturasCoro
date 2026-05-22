// --- ESTADO DEL SISTEMA ---
var listaCantos = [];
var resolviendoConfirmacion = null;
var directorioRaiz = null; // Handle de la carpeta del proyecto

// --- ELEMENTOS PRINCIPALES ---
var cuerpoTabla = document.getElementById('cuerpo-tabla-cantos');
var buscadorUI = document.getElementById('buscador-gestor');
var btnVincular = document.getElementById('btn-vincular-carpeta');
var estadoCarpeta = document.getElementById('estado-carpeta');
var btnNuevo = document.getElementById('btn-nuevo-canto');

// --- MODAL DE FORMULARIO ---
var modalFormulario = document.getElementById('modal-formulario');
var inIndice = document.getElementById('indice-canto');
var inNombre = document.getElementById('nombre-canto');
var inTemas = document.getElementById('temas-canto');
var inArchivo = document.getElementById('input-archivo-pdf');
var txtArchivoActual = document.getElementById('nombre-archivo-actual');
var contArchivoActual = document.getElementById('contenedor-archivo-actual');
var tituloForm = document.getElementById('titulo-modal');

// --- UTILIDADES ---
var obtenerFechaActual = function() { return new Date().toISOString().split('T')[0]; };

// --- VINCULACIÓN DE CARPETA (File System Access API) ---
btnVincular.addEventListener('click', async function() {
    try {
        directorioRaiz = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
        
        // Verificar si es la carpeta correcta buscando cantos.json
        try {
            const handleJson = await directorioRaiz.getFileHandle('cantos.json');
            const file = await handleJson.getFile();
            const contenido = await file.text();
            listaCantos = JSON.parse(contenido);
            
            estadoCarpeta.textContent = "Carpeta vinculada: " + directorioRaiz.name;
            estadoCarpeta.style.color = "#28a745";
            btnVincular.textContent = "Cambiar Carpeta";
            btnNuevo.disabled = false;
            
            renderizarTabla();
        } catch (e) {
            alert("La carpeta seleccionada no parece ser la raíz del proyecto (no se encontró cantos.json o está corrupto).");
            directorioRaiz = null;
        }
    } catch (err) {
        console.error("Error al vincular carpeta:", err);
    }
});

// --- RENDERIZADO DE TABLA ---
function renderizarTabla(filtro) {
    if (filtro === undefined) filtro = "";
    cuerpoTabla.innerHTML = "";
    var termino = filtro.toLowerCase();
    
    var normalizar = function(texto) {
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    };
    
    var terminoNormalizado = normalizar(termino);

    listaCantos.forEach(function(canto, index) {
        var nombreNormalizado = normalizar(canto.nombre);
        if (termino && nombreNormalizado.indexOf(terminoNormalizado) === -1) return;

        var tr = document.createElement('tr');
        var fechaMostrar = canto.fecha || "---";
        var temasFormat = (canto.temas || []).map(function(t) { 
            return '<span class="etiqueta-tema">' + t + '</span>'; 
        }).join('');

        tr.innerHTML = 
            '<td><strong>' + canto.nombre + '</strong></td>' +
            '<td>' + temasFormat + '</td>' +
            '<td style="color:#666;">' + fechaMostrar + '</td>' +
            '<td style="color:#666; font-family: monospace;">' + (canto.archivo || '---') + '</td>' +
            '<td class="col-acciones">' +
                '<button class="btn-accion editar" onclick="abrirModalEdicion(' + index + ')">Editar</button>' +
                '<button class="btn-accion eliminar" onclick="solicitarEliminacion(' + index + ')">Eliminar</button>' +
            '</td>';
        cuerpoTabla.appendChild(tr);
    });
}

buscadorUI.addEventListener('input', function(e) { renderizarTabla(e.target.value); });

// --- GESTIÓN DE MODALES ---
btnNuevo.addEventListener('click', function() {
    inIndice.value = "";
    inNombre.value = "";
    inTemas.value = "";
    inArchivo.value = "";
    contArchivoActual.classList.add('oculto');
    tituloForm.textContent = "Nuevo Canto";
    modalFormulario.classList.remove('oculto');
});

window.abrirModalEdicion = function(index) {
    var canto = listaCantos[index];
    inIndice.value = index;
    inNombre.value = canto.nombre;
    inTemas.value = (canto.temas || []).join(', ');
    inArchivo.value = "";
    txtArchivoActual.textContent = canto.archivo || "Ninguno";
    contArchivoActual.classList.remove('oculto');
    tituloForm.textContent = "Editar Canto";
    modalFormulario.classList.remove('oculto');
};

document.getElementById('btn-cerrar-formulario').addEventListener('click', function() { modalFormulario.classList.add('oculto'); });
document.getElementById('btn-cancelar-formulario').addEventListener('click', function() { modalFormulario.classList.add('oculto'); });

// --- GUARDADO DIRECTO ---
document.getElementById('btn-guardar-directo').addEventListener('click', async function() {
    if (!directorioRaiz) return alert("Primero vincula la carpeta del proyecto.");

    var nombre = inNombre.value.trim();
    var temasStr = inTemas.value.trim();
    var index = inIndice.value;
    var fileInput = inArchivo.files[0];

    if (!nombre || !temasStr) {
        alert("Por favor completa Título y Temas.");
        return;
    }

    if (index === "" && !fileInput) {
        alert("Para un canto nuevo es obligatorio subir el PDF.");
        return;
    }

    var temasArray = temasStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    var nombreArchivo = "";

    try {
        // 1. Gestionar el archivo PDF si se seleccionó uno nuevo
        if (fileInput) {
            nombreArchivo = fileInput.name;
            const partiturasDir = await directorioRaiz.getDirectoryHandle('Partituras', { create: true });
            const fileHandle = await partiturasDir.getFileHandle(nombreArchivo, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(fileInput);
            await writable.close();
        } else if (index !== "") {
            nombreArchivo = listaCantos[parseInt(index)].archivo;
        }

        // 2. Actualizar la lista en memoria
        if (index === "") {
            listaCantos.push({
                nombre: nombre,
                archivo: nombreArchivo,
                temas: temasArray,
                fecha: obtenerFechaActual()
            });
        } else {
            var idx = parseInt(index);
            listaCantos[idx].nombre = nombre;
            listaCantos[idx].temas = temasArray;
            listaCantos[idx].archivo = nombreArchivo;
            if (!listaCantos[idx].fecha) listaCantos[idx].fecha = obtenerFechaActual();
        }

        // 3. Ordenar
        listaCantos.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });

        // 4. GUARDAR cantos.json AUTOMÁTICAMENTE
        await guardarJson();

        alert("¡Canto guardado y cantos.json actualizado!");
        modalFormulario.classList.add('oculto');
        renderizarTabla(buscadorUI.value);
        
    } catch (err) {
        console.error("Error al guardar:", err);
        alert("Error al guardar los cambios: " + err.message);
    }
});

async function guardarJson() {
    if (!directorioRaiz) return;
    const handleJson = await directorioRaiz.getFileHandle('cantos.json', { create: true });
    const writable = await handleJson.createWritable();
    await writable.write(JSON.stringify(listaCantos, null, 2));
    await writable.close();
}

// --- ELIMINAR ---
function solicitarEliminacion(index) {
    var canto = listaCantos[index];
    pedirConfirmacion('¿Eliminar "' + canto.nombre + '" y actualizar cantos.json?')
        .then(async function(confirmado) {
            if (confirmado) {
                listaCantos.splice(index, 1);
                await guardarJson();
                renderizarTabla(buscadorUI.value);
            }
        });
}

// --- SISTEMA DE CONFIRMACIÓN ---
function pedirConfirmacion(mensaje) {
    return new Promise(function(resolve) {
        document.getElementById('texto-confirmacion').textContent = mensaje;
        document.getElementById('modal-confirmacion').classList.remove('oculto');
        resolviendoConfirmacion = resolve;
    });
}

document.getElementById('btn-cancelar-confirmacion').addEventListener('click', function() {
    document.getElementById('modal-confirmacion').classList.add('oculto');
    if (resolviendoConfirmacion) resolviendoConfirmacion(false);
});

document.getElementById('btn-aceptar-confirmacion').addEventListener('click', function() {
    document.getElementById('modal-confirmacion').classList.add('oculto');
    if (resolviendoConfirmacion) resolviendoConfirmacion(true);
});

// Exponer funciones globales
window.abrirModalEdicion = abrirModalEdicion;
window.solicitarEliminacion = solicitarEliminacion;