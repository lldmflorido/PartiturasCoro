// --- CONFIGURACIÓN INTEGRADA ---
const PROPIETARIO = "lldmflorido"; 
const REPOSITORIO = "PartiturasCoro";

// --- VARIABLES DE ESTADO ---
let tokenActual = "";
let listaCantos = [];
let jsonSha = "";
let modoEdicion = false;

// --- ELEMENTOS DEL DOM ---
const secLogin = document.getElementById('seccion-login');
const secTrabajo = document.getElementById('seccion-trabajo');
const inputToken = document.getElementById('input-token');
const btnAcceder = document.getElementById('btn-acceder');
const msgLogin = document.getElementById('mensaje-login');
const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');

const listaUI = document.getElementById('lista-cantos-gestor');
const buscadorUI = document.getElementById('buscador-gestor');
const formUI = document.getElementById('formulario-canto');
const tituloForm = document.getElementById('titulo-formulario');

const inIndice = document.getElementById('indice-canto');
const inNombre = document.getElementById('nombre-canto');
const inTemas = document.getElementById('temas-canto');
const inArchivo = document.getElementById('archivo-pdf');
const txtArchivoActual = document.getElementById('texto-archivo-actual');
const btnDescargar = document.getElementById('btn-descargar-actual');
const btnGuardar = document.getElementById('btn-guardar');
const msgEstado = document.getElementById('estado-guardado');

// --- UTILIDADES ---
const utf8_to_b64 = str => window.btoa(unescape(encodeURIComponent(str)));
const b64_to_utf8 = str => decodeURIComponent(escape(window.atob(str)));

function mostrarMensaje(elemento, tipo, texto) {
    elemento.className = `mensaje-estado ${tipo}`;
    elemento.textContent = texto;
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    const tokenGuardado = localStorage.getItem('gestorToken');
    if (tokenGuardado) {
        tokenActual = tokenGuardado;
        iniciarSesionSilenciosa();
    }
});

// --- AUTENTICACIÓN ---
btnAcceder.addEventListener('click', async () => {
    const token = inputToken.value.trim();
    if (!token) return mostrarMensaje(msgLogin, 'error', 'Debe ingresar una llave.');
    
    tokenActual = token;
    mostrarMensaje(msgLogin, 'info', 'Verificando credenciales...');
    
    try {
        await cargarListaCantos();
        localStorage.setItem('gestorToken', tokenActual);
        secLogin.classList.add('oculto');
        secTrabajo.classList.remove('oculto');
        btnCerrarSesion.classList.remove('oculto');
    } catch (error) {
        mostrarMensaje(msgLogin, 'error', 'Llave incorrecta o sin permisos.');
        localStorage.removeItem('gestorToken');
    }
});

btnCerrarSesion.addEventListener('click', () => {
    localStorage.removeItem('gestorToken');
    location.reload();
});

async function iniciarSesionSilenciosa() {
    try {
        await cargarListaCantos();
        secLogin.classList.add('oculto');
        secTrabajo.classList.remove('oculto');
        btnCerrarSesion.classList.remove('oculto');
    } catch (error) {
        localStorage.removeItem('gestorToken');
    }
}

// --- LÓGICA DE DATOS ---
async function cargarListaCantos() {
    const url = `https://api.github.com/repos/${PROPIETARIO}/${REPOSITORIO}/contents/cantos.json`;
    const res = await fetch(url, { headers: { "Authorization": `token ${tokenActual}` } });
    
    if (!res.ok) throw new Error("Acceso denegado");
    
    const data = await res.json();
    jsonSha = data.sha;
    listaCantos = JSON.parse(b64_to_utf8(data.content));
    
    renderizarLista();
    prepararFormularioNuevo();
}

function renderizarLista(filtro = "") {
    listaUI.innerHTML = "";
    const termino = filtro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    listaCantos.forEach((canto, index) => {
        const nombreLimpio = canto.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (termino && !nombreLimpio.includes(termino)) return;

        const li = document.createElement('li');
        li.textContent = canto.nombre;
        li.addEventListener('click', () => abrirEditor(index, li));
        listaUI.appendChild(li);
    });
}

buscadorUI.addEventListener('input', (e) => renderizarLista(e.target.value));

function abrirEditor(index, elementoLista) {
    document.querySelectorAll('#lista-cantos-gestor li').forEach(li => li.classList.remove('activo'));
    if(elementoLista) elementoLista.classList.add('activo');

    modoEdicion = true;
    const canto = listaCantos[index];
    
    tituloForm.textContent = "Editando Canto";
    formUI.classList.remove('oculto');
    inIndice.value = index;
    inNombre.value = canto.nombre;
    inTemas.value = canto.temas.join(', ');
    txtArchivoActual.textContent = `Archivo actual: ${canto.archivo}`;
    
    btnDescargar.classList.remove('oculto');
    btnDescargar.onclick = () => {
        const urlDescarga = `https://${PROPIETARIO}.github.io/${REPOSITORIO}/Partituras/${encodeURIComponent(canto.archivo)}`;
        window.open(urlDescarga, '_blank');
    };
}

function prepararFormularioNuevo() {
    modoEdicion = false;
    tituloForm.textContent = "Registrar Nuevo Canto";
    formUI.classList.remove('oculto');
    inIndice.value = "";
    inNombre.value = "";
    inTemas.value = "";
    txtArchivoActual.textContent = "El archivo PDF es obligatorio para nuevos registros.";
    btnDescargar.classList.add('oculto');
}

document.getElementById('btn-nuevo-canto').addEventListener('click', prepararFormularioNuevo);

// --- GUARDADO ---
btnGuardar.addEventListener('click', async () => {
    const nombre = inNombre.value.trim();
    let temasArray = inTemas.value.split(',').map(t => t.trim()).filter(t => t);
    const index = inIndice.value;
    
    if (!nombre) return mostrarMensaje(msgEstado, 'error', 'El nombre es obligatorio.');

    btnGuardar.disabled = true;
    mostrarMensaje(msgEstado, 'info', 'Sincronizando con GitHub...');

    try {
        const baseUrl = `https://api.github.com/repos/${PROPIETARIO}/${REPOSITORIO}/contents`;
        const headers = { "Authorization": `token ${tokenActual}`, "Content-Type": "application/json" };
        let nombreArchivoFisico = "";

        if (inArchivo.files.length > 0) {
            const reader = new FileReader();
            const archivoBase64 = await new Promise((resolve) => {
                reader.readAsDataURL(inArchivo.files[0]);
                reader.onload = () => resolve(reader.result.split(',')[1]);
            });
            nombreArchivoFisico = `${nombre}.pdf`;

            let pdfSha = "";
            if (modoEdicion) {
                const resChequeo = await fetch(`${baseUrl}/Partituras/${encodeURIComponent(nombreArchivoFisico)}`, { headers });
                if (resChequeo.ok) {
                    const dataExistente = await resChequeo.json();
                    pdfSha = dataExistente.sha;
                }
            }

            const resPdf = await fetch(`${baseUrl}/Partituras/${encodeURIComponent(nombreArchivoFisico)}`, {
                method: "PUT",
                headers: headers,
                body: JSON.stringify({
                    message: `Admin: ${nombreArchivoFisico}`,
                    content: archivoBase64,
                    sha: pdfSha || undefined
                })
            });
            if (!resPdf.ok) throw new Error("Error al subir el PDF.");
        } else {
            nombreArchivoFisico = listaCantos[index].archivo;
        }

        if (modoEdicion) {
            listaCantos[index] = { nombre, archivo: nombreArchivoFisico, temas: temasArray };
        } else {
            listaCantos.push({ nombre, archivo: nombreArchivoFisico, temas: temasArray });
        }

        listaCantos.sort((a, b) => a.nombre.localeCompare(b.nombre));

        const resJson = await fetch(`${baseUrl}/cantos.json`, {
            method: "PUT",
            headers: headers,
            body: JSON.stringify({
                message: `Admin: Actualizacion lista`,
                content: utf8_to_b64(JSON.stringify(listaCantos, null, 2)),
                sha: jsonSha
            })
        });

        if (!resJson.ok) throw new Error("Error al actualizar el índice.");
        const jsonResponse = await resJson.json();
        jsonSha = jsonResponse.content.sha;
        
        mostrarMensaje(msgEstado, 'exito', 'Cambios guardados correctamente.');
        renderizarLista();
    } catch (error) {
        mostrarMensaje(msgEstado, 'error', error.message);
    } finally {
        btnGuardar.disabled = false;
    }
});