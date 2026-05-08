// --- CONFIGURACIÓN INTEGRADA ---
var PROPIETARIO = "lldmflorido"; 
var REPOSITORIO = "PartiturasCoro";
var URL_BRIDGE_DRIVE = "https://script.google.com/macros/s/AKfycbx6vT6DYYth2mDXw5W2GLquK-HOmbCYZE2TRoAbjRmBibnWFv4lV-mgPh_hFLJ4i-NzOA/exec";

// --- ESTADO DEL SISTEMA ---
var tokenActual = "";
var listaOriginal = []; 
var listaLocal = [];    
var cambiosPendientes = []; 
var jsonSha = "";
var resolviendoConfirmacion = null;

// --- ELEMENTOS PRINCIPALES ---
var secLogin = document.getElementById('seccion-login');
var secTrabajo = document.getElementById('seccion-trabajo');
var controlesCabecera = document.getElementById('controles-cabecera');
var cuerpoTabla = document.getElementById('cuerpo-tabla-cantos');
var buscadorUI = document.getElementById('buscador-gestor');

// --- BOTONES GLOBALES ---
var btnSincronizar = document.getElementById('btn-sincronizar');
var badgeCambios = document.getElementById('contador-cambios');

// --- MODAL DE FORMULARIO ---
var modalFormulario = document.getElementById('modal-formulario');
var inIndice = document.getElementById('indice-canto');
var inNombre = document.getElementById('nombre-canto');
var inTemas = document.getElementById('temas-canto');
var inArchivo = document.getElementById('archivo-pdf');
var txtArchivoActual = document.getElementById('texto-archivo-actual');
var tituloForm = document.getElementById('titulo-modal');

// --- UTILIDADES ---
var utf8_to_b64 = function(str) { return window.btoa(unescape(encodeURIComponent(str))); };
var b64_to_utf8 = function(str) { return decodeURIComponent(escape(window.atob(str))); };
var obtenerFechaActual = function() { return new Date().toISOString().split('T')[0]; };

// Helper para llamadas API con XHR (Para Safari 9)
function apiCall(method, url, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader("Authorization", "token " + tokenActual);
    if (method === "PUT") xhr.setRequestHeader("Content-Type", "application/json");
    
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
                var response = null;
                try { response = JSON.parse(xhr.responseText); } catch(e) {}
                callback(null, response);
            } else {
                callback(new Error("Error API: " + xhr.status));
            }
        }
    };
    xhr.send(body ? JSON.stringify(body) : null);
}

function mostrarMensajeLogin(texto) {
    var msg = document.getElementById('mensaje-login');
    msg.textContent = texto;
    msg.className = "mensaje-estado error";
}

// --- INICIALIZACIÓN Y LOGIN ---
document.addEventListener('DOMContentLoaded', function() {
    var tokenGuardado = localStorage.getItem('gestorToken');
    if (tokenGuardado) {
        tokenActual = tokenGuardado;
        iniciarSistema();
    }
});

document.getElementById('btn-acceder').addEventListener('click', function() {
    var token = document.getElementById('input-token').value.trim();
    if (!token) return mostrarMensajeLogin('Debe ingresar una llave.');
    tokenActual = token;
    iniciarSistema();
});

document.getElementById('btn-cerrar-sesion').addEventListener('click', function() {
    localStorage.removeItem('gestorToken');
    location.reload();
});

function iniciarSistema() {
    var url = 'https://api.github.com/repos/' + PROPIETARIO + '/' + REPOSITORIO + '/contents/cantos.json';
    apiCall("GET", url, null, function(err, data) {
        if (err) {
            mostrarMensajeLogin('Llave incorrecta o sin permisos.');
            localStorage.removeItem('gestorToken');
            return;
        }
        jsonSha = data.sha;
        listaOriginal = JSON.parse(b64_to_utf8(data.content));
        listaLocal = JSON.parse(JSON.stringify(listaOriginal)); 
        
        localStorage.setItem('gestorToken', tokenActual);
        secLogin.classList.add('oculto');
        secTrabajo.classList.remove('oculto');
        controlesCabecera.classList.remove('oculto');
        
        renderizarTabla();
    });
}

// --- RENDERIZADO DE TABLA PRINCIPAL ---
function renderizarTabla(filtro) {
    if (filtro === undefined) filtro = "";
    cuerpoTabla.innerHTML = "";
    var termino = filtro.toLowerCase();
    if (termino.normalize) {
        termino = termino.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    listaLocal.forEach(function(canto, index) {
        if (canto._eliminado) return;

        var nombreLimpio = canto.nombre.toLowerCase();
        if (nombreLimpio.normalize) {
            nombreLimpio = nombreLimpio.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        }
        
        if (termino && nombreLimpio.indexOf(termino) === -1) return;

        var tr = document.createElement('tr');
        var fechaMostrar = canto.fecha || "No registrada";
        var temasFormat = canto.temas.map(function(t) { return '<span class="etiqueta-tema">' + t + '</span>'; }).join('');
        
        var indicadorCambio = "";
        for (var i = 0; i < cambiosPendientes.length; i++) {
            if (cambiosPendientes[i].indiceTemporal === index) {
                indicadorCambio = '<span style="color:#d4af37; font-weight:bold; font-size:11px; display:block;">(Modificado localmente)</span>';
                break;
            }
        }

        tr.innerHTML = '<td><strong>' + canto.nombre + '</strong> ' + indicadorCambio + '</td>' +
            '<td>' + temasFormat + '</td>' +
            '<td style="color:#666; font-size:13px;">' + fechaMostrar + '</td>' +
            '<td style="color:#666; font-size:13px;">' + canto.archivo + '</td>' +
            '<td class="col-acciones">' +
                '<button class="btn-accion descargar" onclick="descargarPdfDirecto(' + index + ')">Descargar</button>' +
                '<button class="btn-accion editar" onclick="abrirModalEdicion(' + index + ')">Editar</button>' +
                '<button class="btn-accion eliminar" onclick="solicitarEliminacion(' + index + ')">Eliminar</button>' +
            '</td>';
        cuerpoTabla.appendChild(tr);
    });

    actualizarBadgeSincronizacion();
}

buscadorUI.addEventListener('input', function(e) { renderizarTabla(e.target.value); });

function actualizarBadgeSincronizacion() {
    var total = cambiosPendientes.length;
    badgeCambios.textContent = total + ' Cambios Pendientes';
    
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

// --- LÓGICA DE ELIMINACIÓN LOCAL ---
function solicitarEliminacion(index) {
    var canto = listaLocal[index];
    pedirConfirmacion('¿Está completamente seguro de que desea eliminar el canto "' + canto.nombre + '"? Esta acción borrará la entrada del índice.')
        .then(function(confirmado) {
            if (confirmado) {
                listaLocal[index]._eliminado = true;
                cambiosPendientes.push({
                    tipo: 'ELIMINAR',
                    indiceTemporal: index,
                    nombreOriginal: canto.nombre
                });
                renderizarTabla(buscadorUI.value);
            }
        });
}

// --- APERTURA DE MODALES ---
document.getElementById('btn-nuevo-canto').addEventListener('click', function() {
    inIndice.value = "";
    inNombre.value = "";
    inTemas.value = "";
    inArchivo.value = "";
    tituloForm.textContent = "Registrar Nuevo Canto";
    txtArchivoActual.textContent = "Obligatorio adjuntar PDF para un canto nuevo.";
    modalFormulario.classList.remove('oculto');
});

window.abrirModalEdicion = function(index) {
    var canto = listaLocal[index];
    inIndice.value = index;
    inNombre.value = canto.nombre;
    inTemas.value = canto.temas.join(', ');
    inArchivo.value = "";
    tituloForm.textContent = "Editando Canto";
    txtArchivoActual.textContent = "Documento vinculado: " + canto.archivo;
    modalFormulario.classList.remove('oculto');
};

document.getElementById('btn-cerrar-formulario').addEventListener('click', function() { modalFormulario.classList.add('oculto'); });
document.getElementById('btn-cancelar-formulario').addEventListener('click', function() { modalFormulario.classList.add('oculto'); });

// --- GUARDADO LOCAL ---
function leerBase64(file) {
    return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result.split(',')[1]); };
        reader.readAsDataURL(file);
    });
}

document.getElementById('btn-guardar-local').addEventListener('click', function() {
    var nombre = inNombre.value.trim();
    var temasArray = inTemas.value.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; });
    var index = inIndice.value;
    var esNuevo = (index === "");

    if (!nombre || temasArray.length === 0) {
        return pedirConfirmacion("Debe completar el Título y al menos un Tema.");
    }

    if (esNuevo && inArchivo.files.length === 0) {
        return pedirConfirmacion("SEGURIDAD: Es estrictamente obligatorio adjuntar un archivo PDF.");
    }

    var base64PDF = null;
    var nombreArchivoFisico = "";

    var promesaArchivo = Promise.resolve();
    if (inArchivo.files.length > 0) {
        promesaArchivo = leerBase64(inArchivo.files[0]).then(function(b64) {
            base64PDF = b64;
            nombreArchivoFisico = nombre + ".pdf";
        });
    } else {
        nombreArchivoFisico = listaLocal[index].archivo;
    }

    promesaArchivo.then(function() {
        var conflictoNombre = null;
        for (var i = 0; i < listaLocal.length; i++) {
            if (i.toString() !== index && listaLocal[i].archivo === nombreArchivoFisico && !listaLocal[i]._eliminado) {
                conflictoNombre = listaLocal[i];
                break;
            }
        }
        if (conflictoNombre && inArchivo.files.length > 0) {
            return pedirConfirmacion('Ya existe otro canto usando el archivo "' + nombreArchivoFisico + '". ¿Sobrescribir?');
        }
        return Promise.resolve(true);
    }).then(function(proceder) {
        if (!proceder) return;
        if (esNuevo) {
            var nuevoCanto = { nombre: nombre, archivo: nombreArchivoFisico, temas: temasArray, fecha: obtenerFechaActual() };
            var nuevoIndice = listaLocal.push(nuevoCanto) - 1;
            cambiosPendientes.push({ tipo: 'NUEVO', indiceTemporal: nuevoIndice, archivoB64: base64PDF, nombreArchivoFinal: nombreArchivoFisico });
        } else {
            listaLocal[index].nombre = nombre;
            listaLocal[index].temas = temasArray;
            listaLocal[index].archivo = nombreArchivoFisico;
            if(!listaLocal[index].fecha) listaLocal[index].fecha = obtenerFechaActual();
            cambiosPendientes = cambiosPendientes.filter(function(c) { return c.indiceTemporal !== parseInt(index); });
            cambiosPendientes.push({ tipo: 'EDITAR', indiceTemporal: parseInt(index), archivoB64: base64PDF, nombreArchivoFinal: nombreArchivoFisico });
        }
        modalFormulario.classList.add('oculto');
        renderizarTabla(buscadorUI.value);
    });
});

// --- SINCRONIZACIÓN BATCH ---
btnSincronizar.addEventListener('click', function() {
    pedirConfirmacion('¿Está seguro de enviar ' + cambiosPendientes.length + ' modificaciones?')
        .then(function(confirmado) {
            if (!confirmado) return;

            var modalCarga = document.getElementById('modal-carga');
            var barraProgreso = document.getElementById('barra-progreso');
            var textoCarga = document.getElementById('texto-carga');
            modalCarga.classList.remove('oculto');
            btnSincronizar.disabled = true;

            var baseUrl = 'https://api.github.com/repos/' + PROPIETARIO + '/' + REPOSITORIO + '/contents';
            var indexCambio = 0;

            function procesarSiguiente() {
                if (indexCambio >= cambiosPendientes.length) {
                    actualizarIndiceFinal();
                    return;
                }
                var cambio = cambiosPendientes[indexCambio];
                indexCambio++;
                textoCarga.textContent = 'Procesando: Elemento ' + indexCambio + ' de ' + cambiosPendientes.length;
                
                if ((cambio.tipo === 'NUEVO' || cambio.tipo === 'EDITAR') && cambio.archivoB64) {
                    var pdfUrl = baseUrl + '/Partituras/' + encodeURIComponent(cambio.nombreArchivoFinal);
                    apiCall("GET", pdfUrl, null, function(err, data) {
                        var sha = data ? data.sha : undefined;
                        var body = {
                            message: 'AdminBatch: Subida de partitura ' + cambio.nombreArchivoFinal,
                            content: cambio.archivoB64,
                            sha: sha
                        };
                        apiCall("PUT", pdfUrl, body, function(err2) {
                            if (err2) {
                                alert("Error al subir PDF: " + cambio.nombreArchivoFinal);
                                finalizarError(err2);
                            } else {
                                barraProgreso.style.width = ((indexCambio / (cambiosPendientes.length + 1)) * 100) + '%';
                                procesarSiguiente();
                            }
                        });
                    });
                } else {
                    procesarSiguiente();
                }
            }

            function actualizarIndiceFinal() {
                textoCarga.textContent = "Actualizando el índice general...";
                var listaFinal = listaLocal.filter(function(c) { return !c._eliminado; }).map(function(c) {
                    var copy = {};
                    for (var k in c) { if (k !== '_eliminado') copy[k] = c[k]; }
                    return copy;
                });
                listaFinal.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });

                var body = {
                    message: 'AdminBatch: Actualización masiva',
                    content: utf8_to_b64(JSON.stringify(listaFinal, null, 2)),
                    sha: jsonSha
                };
                apiCall("PUT", baseUrl + '/cantos.json', body, function(err, data) {
                    if (err) finalizarError(err);
                    else {
                        jsonSha = data.content.sha;
                        barraProgreso.style.width = "100%";
                        textoCarga.textContent = "¡Éxito!";
                        setTimeout(function() {
                            modalCarga.classList.add('oculto');
                            cambiosPendientes = [];
                            listaLocal = listaLocal.filter(function(c) { return !c._eliminado; });
                            listaOriginal = JSON.parse(JSON.stringify(listaLocal));
                            renderizarTabla();
                        }, 2000);
                    }
                });
            }

            function finalizarError(err) {
                textoCarga.textContent = "Error: " + err.message;
                setTimeout(function() { modalCarga.classList.add('oculto'); btnSincronizar.disabled = false; }, 5000);
            }

            procesarSiguiente();
        });
});

window.descargarPdfDirecto = function(index) {
    var canto = listaLocal[index];
    if (!canto || !canto.archivo) return;
    var url = 'https://' + PROPIETARIO + '.github.io/' + REPOSITORIO + '/Partituras/' + encodeURIComponent(canto.archivo);
    window.open(url, "_blank");
};

window.solicitarEliminacion = solicitarEliminacion;
window.abrirModalEdicion = abrirModalEdicion;
window.descargarPdfDirecto = descargarPdfDirecto;