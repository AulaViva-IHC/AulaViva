// Crear curso en 4 pasos (solo admin).
// · Stepper "Paso X de 4", transición deslizante, validación al salir de cada campo y al avanzar.
// · Paso 2: módulos y clases colapsables; un solo editor de clase que se mueve a la clase abierta
//   (solo una abierta a la vez). Reordenar arrastrando o con las flechas sobre el asa.
// · Paso 3: reglas sugeridas (14 / 3 intentos) y preguntas de opción múltiple, una abierta a la vez.
// · Paso 4: resumen con "Editar", valores "Sugerido" y "Publicar curso" con el bucle perceptual.
// · Guardar borrador en localStorage; quitar algo se puede deshacer.
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { abrirModal, cerrarModal } from './modal';
import { limpiarError, mostrarError, type Control } from './campo';
import { iniciales } from '../lib/validacion';
import {
  CATEGORIAS,
  EVALUACION_SUGERIDA,
  NIVELES,
  REQUISITO_SUGERIDO,
  clasesSinMedia,
  erroresClase,
  erroresContenido,
  erroresDatosGenerales,
  erroresEvaluacion,
  erroresPregunta,
  erroresPublicacion,
  preguntaCompleta,
  revisarArchivo,
  type ClaseBorrador,
  type CursoBorrador,
  type Errores,
  type ModuloBorrador,
  type NivelId,
  type PreguntaBorrador,
  type TipoArchivo,
} from '../lib/validacion-curso';
import { $, $$, anunciar as anunciarEn, CARGA_MINIMA_MS, completarCarga, esperar, pedirJSON, plantilla } from './util';

// ─── Elementos ─────────────────────────────────────────────────────
const raiz = $<HTMLElement>('[data-crear]');
const form = $<HTMLFormElement>('[data-form-curso]');
const HOY = raiz.dataset.hoy!;
const INSTRUCTOR_SUGERIDO = raiz.dataset.instructorSugerido!;
const INSTRUCTORES: string[] = JSON.parse(raiz.dataset.instructores ?? '[]');
const CLAVE_BORRADOR = 'aulaviva:borradorCurso';
const NOMBRES_PASO = ['Datos generales', 'Contenido', 'Evaluación', 'Revisar y publicar'];
const AYUDA_PASO = [
  ['Un paso, una tarea', 'Cada paso pide solo lo necesario. La categoría se elige entre 4 opciones, no en una lista larga.'],
  ['Pestañas colapsables', 'Solo una clase está abierta a la vez: 6 campos visibles en lugar de todo el temario.'],
  ['Reglas de aprobación', 'Se aprueba con el 100 % del contenido y la nota mínima. Vale el mejor intento.'],
  ['Valores sugeridos', 'Los campos marcados como Sugerido se llenaron solos. Revísalos antes de publicar.'],
];

const anuncio = $<HTMLElement>('[data-anuncio]');
const anunciar = (texto: string) => anunciarEn(anuncio, texto);
const secciones = $$<HTMLElement>('[data-paso]');
const stepper = $$<HTMLLIElement>('[data-paso-stepper]');
const miga = $<HTMLElement>('[data-miga]');
const badgeBorrador = $<HTMLElement>('[data-estado-borrador]');
const btnAnterior = $<HTMLButtonElement>('[data-anterior]');
const btnCancelar = $<HTMLAnchorElement>('[data-cancelar]');
const btnGuardar = $<HTMLButtonElement>('[data-guardar]');
const btnSiguiente = $<HTMLButtonElement>('[data-siguiente]');
const btnPublicar = $<HTMLButtonElement>('[data-publicar]');
const pie = $<HTMLElement>('[data-pie]');
const piePaso = $<HTMLElement>('[data-pie-paso]');
const almacen = $<HTMLElement>('[data-almacen]');
const editorModulo = $<HTMLElement>('[data-editor-modulo]');
const editorClase = $<HTMLElement>('[data-editor-clase]');
const editorPregunta = $<HTMLElement>('[data-editor-pregunta]');
const listaModulos = $<HTMLOListElement>('[data-modulos]');
const listaPreguntas = $<HTMLOListElement>('[data-preguntas]');
const avisoDeshacer = $<HTMLElement>('[data-deshacer]');
const avisoBorrador = $<HTMLElement>('[data-aviso-borrador]');
const avisoRed = $<HTMLElement>('[data-aviso-red]');

const crear = <K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase?: string, texto?: string) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};
let contador = 0;
const nuevoId = (prefijo: string) => `${prefijo}${Date.now().toString(36)}${(contador++).toString(36)}`;

// ─── Estado ────────────────────────────────────────────────────────
const claseNueva = (): ClaseBorrador => ({ id: nuevoId('c'), titulo: '', duracionMin: '', video: null, subtitulos: null, documento: null });
const moduloNuevo = (): ModuloBorrador => ({ id: nuevoId('m'), titulo: '', clases: [claseNueva()] });
const preguntaNueva = (): PreguntaBorrador => ({ id: nuevoId('p'), enunciado: '', opciones: ['', '', '', ''], correcta: null });

function cursoNuevo(): CursoBorrador {
  const primerModulo = moduloNuevo();
  return {
    titulo: '',
    descripcion: '',
    categoria: '',
    nivel: 'basico',
    horas: '',
    imagen: null,
    modulos: [primerModulo],
    evaluacion: { ...EVALUACION_SUGERIDA, preguntas: [preguntaNueva()] },
    instructor: INSTRUCTOR_SUGERIDO,
    requisitos: REQUISITO_SUGERIDO.basico,
    fechaPublicacion: HOY,
  };
}

let curso = cursoNuevo();
let paso = 1;
let pasoMaximo = 1;
let moduloAbierto: string | null = curso.modulos[0].id;
let claseAbierta: string | null = curso.modulos[0].clases[0].id;
let preguntaAbierta: string | null = curso.evaluacion.preguntas[0].id;
let reglasAbiertas = false;
let sucio = false;
let publicado = false;
/** Pasos en los que ya se intentó avanzar: desde entonces los errores se muestran al abrir cada parte. */
const intentado = new Set<number>();

// ─── Utilidades de errores ─────────────────────────────────────────
function pintarError(el: Control | null, mensaje: string | undefined): void {
  if (!el) return;
  if (mensaje) mostrarError(el, mensaje);
  else limpiarError(el);
}
const porRuta = (ruta: string) => form.querySelector<HTMLInputElement>(`[data-ruta="${ruta}"]`);

function marcarSucio(): void {
  if (publicado) return;
  sucio = true;
  badgeBorrador.classList.remove('badge--verde');
  badgeBorrador.classList.add('badge--neutro');
  badgeBorrador.querySelector('[data-badge-texto]')!.textContent = 'Borrador sin guardar';
}

// ═══ Paso 1 · Datos generales ═══════════════════════════════════════
const inTitulo = $<HTMLInputElement>('#titulo');
const inDescripcion = $<HTMLTextAreaElement>('#descripcion');
const inNivel = $<HTMLSelectElement>('#nivel');
const inHoras = $<HTMLInputElement>('#horas');
const radiosCategoria = $$<HTMLInputElement>('input[name="categoria"]');
const contadorDescripcion = $<HTMLElement>('[data-contador]');

function revisarPaso1(ruta: string): void {
  const e = erroresDatosGenerales(curso);
  const el = ruta === 'categoria' ? radiosCategoria[0] : porRuta(ruta);
  pintarError(el, e[ruta]);
}

for (const [el, campo] of [
  [inTitulo, 'titulo'],
  [inDescripcion, 'descripcion'],
  [inHoras, 'horas'],
] as const) {
  el.addEventListener('input', () => {
    curso[campo] = el.value;
    marcarSucio();
    if (el.getAttribute('aria-invalid') === 'true' && !erroresDatosGenerales(curso)[campo]) limpiarError(el);
    if (campo === 'descripcion') contadorDescripcion.textContent = `${el.value.length} / ${el.maxLength}`;
  });
  el.addEventListener('blur', () => {
    if (el.value || intentado.has(1)) revisarPaso1(campo);
  });
}

for (const radio of radiosCategoria) {
  radio.addEventListener('change', () => {
    curso.categoria = radio.value as CursoBorrador['categoria'];
    marcarSucio();
    limpiarError(radiosCategoria[0]);
  });
}

inNivel.addEventListener('change', () => {
  const anterior = curso.nivel;
  curso.nivel = inNivel.value as NivelId;
  // Si el requisito seguía siendo el sugerido, se actualiza al del nuevo nivel.
  if (curso.requisitos === REQUISITO_SUGERIDO[anterior]) curso.requisitos = REQUISITO_SUGERIDO[curso.nivel];
  marcarSucio();
});

// ─── Subir archivos (por ahora solo se guarda el nombre) ───────────
function pintarSubida(input: HTMLInputElement, nombre: string | null): void {
  const etiqueta = input.closest<HTMLElement>('[data-subida]')!;
  const texto = etiqueta.querySelector<HTMLElement>('[data-subida-texto]')!;
  if (!texto.dataset.original) texto.dataset.original = texto.textContent ?? '';
  if (nombre) {
    etiqueta.dataset.lleno = '';
    texto.textContent = `✓ ${nombre}`;
    etiqueta.title = 'Cambiar archivo';
  } else {
    delete etiqueta.dataset.lleno;
    texto.textContent = texto.dataset.original;
    etiqueta.removeAttribute('title');
  }
}

/** Valida el archivo elegido; devuelve el nombre si es válido. */
function leerArchivo(input: HTMLInputElement): string | null | undefined {
  const archivo = input.files?.[0];
  input.value = ''; // permite volver a elegir el mismo archivo
  if (!archivo) return undefined; // canceló: se conserva lo anterior
  const error = revisarArchivo(input.dataset.archivo as TipoArchivo, archivo.name, archivo.size);
  if (error) {
    mostrarError(input, error, { sacudir: true });
    return undefined;
  }
  limpiarError(input);
  return archivo.name;
}

const inImagen = $<HTMLInputElement>('#imagen');
inImagen.addEventListener('change', () => {
  const nombre = leerArchivo(inImagen);
  if (nombre === undefined) return;
  curso.imagen = nombre;
  pintarSubida(inImagen, nombre);
  marcarSucio();
});

function pintarPaso1(): void {
  inTitulo.value = curso.titulo;
  inDescripcion.value = curso.descripcion;
  contadorDescripcion.textContent = `${curso.descripcion.length} / ${inDescripcion.maxLength}`;
  inNivel.value = curso.nivel;
  inHoras.value = curso.horas;
  for (const r of radiosCategoria) r.checked = r.value === curso.categoria;
  pintarSubida(inImagen, curso.imagen);
}

// ═══ Paso 2 · Contenido ═════════════════════════════════════════════
const anuncioMover = (texto: string) => anunciar(texto);

function buscarClase(id: string | null): { modulo: ModuloBorrador; clase: ClaseBorrador; i: number; j: number } | null {
  if (!id) return null;
  for (const [i, modulo] of curso.modulos.entries()) {
    const j = modulo.clases.findIndex((c) => c.id === id);
    if (j >= 0) return { modulo, clase: modulo.clases[j], i, j };
  }
  return null;
}

function resumenClase(clase: ClaseBorrador, ruta: string): { texto: string; error: boolean } {
  if (intentado.has(2) && Object.keys(erroresClase(clase, ruta)).length) {
    return { texto: 'Revisa esta clase: le faltan datos', error: true };
  }
  const partes: string[] = [];
  partes.push(clase.duracionMin ? `${clase.duracionMin} min` : 'sin duración');
  if (clase.video && clase.subtitulos) partes.push('video y subtítulos listos');
  else if (clase.video) partes.push('faltan subtítulos');
  else partes.push('falta el video');
  return { texto: partes.join(' · '), error: false };
}

function asa(tipo: 'modulo' | 'clase', id: string, nombre: string): HTMLButtonElement {
  const b = crear('button', 'asa');
  b.type = 'button';
  b.draggable = true;
  b.dataset.mover = tipo;
  b.dataset.id = id;
  b.setAttribute('aria-label', `Mover ${nombre}. Usa las flechas arriba y abajo.`);
  b.append(plantilla('icono-arrastre'));
  return b;
}

function alternar(expandido: boolean, controla: string): HTMLButtonElement {
  const b = crear('button', 'alternar');
  b.type = 'button';
  b.setAttribute('aria-expanded', String(expandido));
  b.setAttribute('aria-controls', controla);
  return b;
}

function textosAlternar(titulo: string, sub?: { texto: string; error: boolean }): HTMLElement {
  const caja = crear('span', 'alternar__textos');
  caja.append(crear('span', 'alternar__titulo', titulo));
  if (sub) {
    const s = crear('span', 'alternar__sub');
    if (sub.error) {
      s.dataset.error = '';
      s.append(plantilla('icono-alerta'));
    }
    s.append(sub.texto);
    caja.append(s);
  }
  return caja;
}

function pintarModulos(): void {
  almacen.append(editorModulo, editorClase); // se sacan antes de reconstruir
  const filas = curso.modulos.map((modulo, i) => {
    const abierto = modulo.id === moduloAbierto;
    const li = crear('li', 'modulo');
    li.dataset.id = modulo.id;
    li.dataset.tipo = 'modulo';
    const nombre = `Módulo ${i + 1}${modulo.titulo.trim() ? `: ${modulo.titulo.trim()}` : ''}`;
    const cuerpoId = `modulo-cuerpo-${modulo.id}`;
    const cabecera = crear('div', 'cabecera');
    const boton = alternar(abierto, cuerpoId);
    boton.dataset.alternarModulo = modulo.id;
    const conError =
      intentado.has(2) && Object.keys(erroresContenido(curso)).some((k) => k.startsWith(`modulos.${i}.`));

    if (abierto) {
      li.dataset.abierto = '';
      const numero = crear('span', 'numero', String(i + 1));
      numero.setAttribute('aria-hidden', 'true');
      const textos = textosAlternar(nombre);
      textos.querySelector('.alternar__titulo')!.setAttribute('data-titulo-modulo', '');
      const cuenta = crear('span', 'alternar__cuenta', `${modulo.clases.length} ${modulo.clases.length === 1 ? 'clase' : 'clases'}`);
      boton.append(numero, textos, cuenta, plantilla('icono-chevron'));
      cabecera.append(asa('modulo', modulo.id, `módulo ${i + 1}`), boton);
    } else {
      const sub = conError
        ? { texto: 'Revisa este módulo: le faltan datos', error: true }
        : { texto: `${modulo.clases.length} ${modulo.clases.length === 1 ? 'clase' : 'clases'}`, error: false };
      boton.append(textosAlternar(nombre, sub), plantilla('icono-chevron'));
      cabecera.append(asa('modulo', modulo.id, `módulo ${i + 1}`), boton);
    }
    boton.querySelector('svg:last-child')?.classList.add('alternar__flecha');
    li.append(cabecera);

    if (abierto) {
      const cuerpo = crear('div', 'modulo__cuerpo');
      cuerpo.id = cuerpoId;
      cuerpo.style.display = 'contents';
      cuerpo.append(editorModulo);
      const clases = crear('ol', 'clases');
      clases.setAttribute('aria-label', `Clases del módulo ${i + 1}`);
      modulo.clases.forEach((clase, j) => clases.append(filaClase(clase, i, j)));
      const agregar = crearBotonSecundario('Agregar clase');
      agregar.dataset.agregarClase = modulo.id;
      const errorClases = crear('p', 'error-grupo is-visible');
      const msg = intentado.has(2) ? erroresContenido(curso)[`modulos.${i}.clases`] : undefined;
      if (msg) {
        errorClases.append(plantilla('icono-alerta'), msg);
        cuerpo.append(errorClases);
      }
      cuerpo.append(clases, agregar);
      li.append(cuerpo);
    }
    return li;
  });
  listaModulos.replaceChildren(...filas);
  cargarEditorModulo();
  cargarEditorClase();
  pintarCifras();
}

function filaClase(clase: ClaseBorrador, i: number, j: number): HTMLLIElement {
  const abierta = clase.id === claseAbierta;
  const li = crear('li', 'clase');
  li.dataset.id = clase.id;
  li.dataset.tipo = 'clase';
  const codigo = `Clase ${i + 1}.${j + 1}`;
  const editorId = `clase-editor-${clase.id}`;
  const cabecera = crear('div', 'cabecera');
  const boton = alternar(abierta, editorId);
  boton.dataset.alternarClase = clase.id;
  if (abierta) {
    li.dataset.abierto = '';
    boton.append(textosAlternar(codigo), plantilla('badge-editando'), plantilla('icono-chevron'));
  } else {
    const titulo = clase.titulo.trim() ? `${codigo}: ${clase.titulo.trim()}` : `${codigo} (sin título)`;
    boton.append(textosAlternar(titulo, resumenClase(clase, `modulos.${i}.clases.${j}`)), plantilla('icono-chevron'));
  }
  boton.querySelector('svg:last-child')?.classList.add('alternar__flecha');
  cabecera.append(asa('clase', clase.id, codigo.toLowerCase()), boton);
  li.append(cabecera);
  if (abierta) {
    editorClase.id = editorId;
    li.append(editorClase);
  }
  return li;
}

function crearBotonSecundario(texto: string): HTMLButtonElement {
  // Misma variante secundaria que <Boton> (no se crea un estilo nuevo).
  const molde = $<HTMLButtonElement>('[data-agregar-modulo]');
  const b = molde.cloneNode(true) as HTMLButtonElement;
  b.removeAttribute('data-agregar-modulo');
  const contenido = b.querySelector('.boton__contenido')!;
  const icono = contenido.querySelector('svg')!;
  contenido.replaceChildren(icono, texto);
  b.dataset.estado = 'normal';
  return b;
}

const inModuloTitulo = $<HTMLInputElement>('#modulo-titulo');
const inClaseTitulo = $<HTMLInputElement>('#clase-titulo');
const inClaseDuracion = $<HTMLInputElement>('#clase-duracion');
const inClaseArchivos = $$<HTMLInputElement>('[data-editor-clase] [data-archivo]');

function cargarEditorModulo(): void {
  const i = curso.modulos.findIndex((m) => m.id === moduloAbierto);
  if (i < 0) return;
  inModuloTitulo.value = curso.modulos[i].titulo;
  pintarError(inModuloTitulo, intentado.has(2) ? erroresContenido(curso)[`modulos.${i}.titulo`] : undefined);
}

function cargarEditorClase(): void {
  const encontrada = buscarClase(claseAbierta);
  if (!encontrada) return;
  const { clase, i, j } = encontrada;
  inClaseTitulo.value = clase.titulo;
  inClaseDuracion.value = clase.duracionMin;
  const errores = intentado.has(2) ? erroresClase(clase, 'c') : {};
  pintarError(inClaseTitulo, errores['c.titulo']);
  pintarError(inClaseDuracion, errores['c.duracionMin']);
  for (const input of inClaseArchivos) {
    const tipo = input.dataset.archivo as 'video' | 'subtitulos' | 'documento';
    pintarSubida(input, clase[tipo]);
    limpiarError(input);
  }
  inClaseTitulo.setAttribute('aria-label', `Título de la clase ${i + 1}.${j + 1}`);
}

inModuloTitulo.addEventListener('input', () => {
  const modulo = curso.modulos.find((m) => m.id === moduloAbierto);
  if (!modulo) return;
  modulo.titulo = inModuloTitulo.value;
  const i = curso.modulos.indexOf(modulo);
  const titulo = listaModulos.querySelector('[data-titulo-modulo]');
  if (titulo) titulo.textContent = `Módulo ${i + 1}${modulo.titulo.trim() ? `: ${modulo.titulo.trim()}` : ''}`;
  if (inModuloTitulo.getAttribute('aria-invalid') === 'true' && modulo.titulo.trim()) limpiarError(inModuloTitulo);
  marcarSucio();
});
inModuloTitulo.addEventListener('blur', () => {
  const i = curso.modulos.findIndex((m) => m.id === moduloAbierto);
  if (i >= 0 && (inModuloTitulo.value || intentado.has(2))) pintarError(inModuloTitulo, erroresContenido(curso)[`modulos.${i}.titulo`]);
});

for (const [input, campo] of [
  [inClaseTitulo, 'titulo'],
  [inClaseDuracion, 'duracionMin'],
] as const) {
  input.addEventListener('input', () => {
    const encontrada = buscarClase(claseAbierta);
    if (!encontrada) return;
    encontrada.clase[campo] = input.value;
    if (input.getAttribute('aria-invalid') === 'true' && !erroresClase(encontrada.clase, 'c')[`c.${campo}`]) limpiarError(input);
    pintarCifras();
    marcarSucio();
  });
  input.addEventListener('blur', () => {
    const encontrada = buscarClase(claseAbierta);
    if (encontrada && (input.value || intentado.has(2))) pintarError(input, erroresClase(encontrada.clase, 'c')[`c.${campo}`]);
  });
}

for (const input of inClaseArchivos) {
  input.addEventListener('change', () => {
    const encontrada = buscarClase(claseAbierta);
    const nombre = leerArchivo(input);
    if (!encontrada || nombre === undefined) return;
    const tipo = input.dataset.archivo as 'video' | 'subtitulos' | 'documento';
    encontrada.clase[tipo] = nombre;
    pintarSubida(input, nombre);
    pintarCifras();
    marcarSucio();
  });
}

function pintarCifras(): void {
  const clases = curso.modulos.flatMap((m) => m.clases);
  $<HTMLElement>('[data-cifra="modulos"]').textContent = String(curso.modulos.length);
  $<HTMLElement>('[data-cifra="clases"]').textContent = String(clases.length);
  $<HTMLElement>('[data-cifra="media"]').textContent = `${clases.length - clasesSinMedia(curso)} de ${clases.length}`;
}

// Abrir / cerrar, agregar y reordenar (delegación de eventos)
listaModulos.addEventListener('click', (e) => {
  const objetivo = e.target as HTMLElement;
  const btnModulo = objetivo.closest<HTMLButtonElement>('[data-alternar-modulo]');
  const btnClase = objetivo.closest<HTMLButtonElement>('[data-alternar-clase]');
  const btnAgregar = objetivo.closest<HTMLButtonElement>('[data-agregar-clase]');

  if (btnModulo) {
    const id = btnModulo.dataset.alternarModulo!;
    if (moduloAbierto === id) {
      moduloAbierto = null;
      claseAbierta = null;
    } else {
      moduloAbierto = id;
      const modulo = curso.modulos.find((m) => m.id === id)!;
      claseAbierta = modulo.clases.length === 1 ? modulo.clases[0].id : null;
    }
    pintarModulos();
    listaModulos.querySelector<HTMLElement>(`[data-alternar-modulo="${id}"]`)?.focus();
  } else if (btnClase) {
    const id = btnClase.dataset.alternarClase!;
    claseAbierta = claseAbierta === id ? null : id; // solo una clase abierta a la vez
    pintarModulos();
    listaModulos.querySelector<HTMLElement>(`[data-alternar-clase="${id}"]`)?.focus();
  } else if (btnAgregar) {
    const modulo = curso.modulos.find((m) => m.id === btnAgregar.dataset.agregarClase)!;
    const clase = claseNueva();
    modulo.clases.push(clase);
    claseAbierta = clase.id;
    marcarSucio();
    pintarModulos();
    inClaseTitulo.focus();
    anunciar(`Clase ${curso.modulos.indexOf(modulo) + 1}.${modulo.clases.length} agregada.`);
  }
});

$<HTMLButtonElement>('[data-agregar-modulo]').addEventListener('click', () => {
  const modulo = moduloNuevo();
  curso.modulos.push(modulo);
  moduloAbierto = modulo.id;
  claseAbierta = modulo.clases[0].id;
  marcarSucio();
  pintarModulos();
  inModuloTitulo.focus();
  anunciar(`Módulo ${curso.modulos.length} agregado con una clase.`);
});

function moverEn<T>(lista: T[], desde: number, hasta: number): void {
  const [x] = lista.splice(desde, 1);
  lista.splice(hasta, 0, x);
}

function mover(tipo: 'modulo' | 'clase', id: string, hasta: number): void {
  if (tipo === 'modulo') {
    const desde = curso.modulos.findIndex((m) => m.id === id);
    hasta = Math.max(0, Math.min(curso.modulos.length - 1, hasta));
    if (desde < 0 || desde === hasta) return;
    moverEn(curso.modulos, desde, hasta);
    anuncioMover(`Módulo movido a la posición ${hasta + 1} de ${curso.modulos.length}.`);
  } else {
    const encontrada = buscarClase(id);
    if (!encontrada) return;
    const { modulo, j } = encontrada;
    hasta = Math.max(0, Math.min(modulo.clases.length - 1, hasta));
    if (j === hasta) return;
    moverEn(modulo.clases, j, hasta);
    anuncioMover(`Clase movida a la posición ${hasta + 1} de ${modulo.clases.length}.`);
  }
  marcarSucio();
  pintarModulos();
  listaModulos.querySelector<HTMLElement>(`[data-mover="${tipo}"][data-id="${id}"]`)?.focus();
}

function posicion(tipo: 'modulo' | 'clase', id: string): number {
  return tipo === 'modulo' ? curso.modulos.findIndex((m) => m.id === id) : (buscarClase(id)?.j ?? -1);
}

listaModulos.addEventListener('keydown', (e) => {
  const asaEl = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mover]');
  if (!asaEl || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const tipo = asaEl.dataset.mover as 'modulo' | 'clase';
  const id = asaEl.dataset.id!;
  mover(tipo, id, posicion(tipo, id) + (e.key === 'ArrowUp' ? -1 : 1));
});

// Arrastrar y soltar con el asa
let arrastre: { tipo: 'modulo' | 'clase'; id: string } | null = null;
listaModulos.addEventListener('dragstart', (e) => {
  const asaEl = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mover]');
  if (!asaEl) return;
  arrastre = { tipo: asaEl.dataset.mover as 'modulo' | 'clase', id: asaEl.dataset.id! };
  e.dataTransfer?.setData('text/plain', arrastre.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  asaEl.closest('li')?.setAttribute('data-arrastrando', '');
});
listaModulos.addEventListener('dragover', (e) => {
  if (!arrastre) return;
  const li = (e.target as HTMLElement).closest<HTMLLIElement>(`li[data-tipo="${arrastre.tipo}"]`);
  if (!li) return;
  e.preventDefault();
  for (const x of listaModulos.querySelectorAll('[data-destino]')) if (x !== li) x.removeAttribute('data-destino');
  li.setAttribute('data-destino', '');
});
listaModulos.addEventListener('drop', (e) => {
  if (!arrastre) return;
  const li = (e.target as HTMLElement).closest<HTMLLIElement>(`li[data-tipo="${arrastre.tipo}"]`);
  e.preventDefault();
  const datos = arrastre;
  arrastre = null;
  if (!li) return pintarModulos();
  if (datos.tipo === 'clase' && buscarClase(li.dataset.id!)?.modulo !== buscarClase(datos.id)?.modulo) {
    anunciar('Las clases se ordenan dentro de su módulo.');
    return pintarModulos();
  }
  mover(datos.tipo, datos.id, posicion(datos.tipo, li.dataset.id!));
});
listaModulos.addEventListener('dragend', () => {
  arrastre = null;
  for (const x of listaModulos.querySelectorAll('[data-arrastrando], [data-destino]')) {
    x.removeAttribute('data-arrastrando');
    x.removeAttribute('data-destino');
  }
});

// ─── Quitar con "Deshacer" (prevención de errores sin pedir confirmación) ──
let deshacerAccion: (() => void) | null = null;
let deshacerTemporizador = 0;

function ofrecerDeshacer(texto: string, accion: () => void): void {
  deshacerAccion = accion;
  $<HTMLElement>('[data-deshacer-texto]').textContent = texto;
  avisoDeshacer.hidden = false;
  avisoDeshacer.classList.remove('anima-aparecer');
  void avisoDeshacer.offsetWidth;
  avisoDeshacer.classList.add('anima-aparecer');
  window.clearTimeout(deshacerTemporizador);
  deshacerTemporizador = window.setTimeout(() => {
    avisoDeshacer.hidden = true;
    deshacerAccion = null;
  }, 10000);
  anunciar(`${texto} Puedes deshacerlo durante 10 segundos.`);
}

$<HTMLButtonElement>('[data-deshacer-boton]').addEventListener('click', () => {
  deshacerAccion?.();
  deshacerAccion = null;
  avisoDeshacer.hidden = true;
  anunciar('Listo, se deshizo el cambio.');
});

$<HTMLButtonElement>('[data-quitar-clase]').addEventListener('click', () => {
  const encontrada = buscarClase(claseAbierta);
  if (!encontrada) return;
  const { modulo, clase, j } = encontrada;
  modulo.clases.splice(j, 1);
  claseAbierta = null;
  marcarSucio();
  pintarModulos();
  listaModulos.querySelector<HTMLElement>(`[data-alternar-modulo="${modulo.id}"]`)?.focus();
  ofrecerDeshacer(`Quitaste la clase “${clase.titulo.trim() || 'sin título'}”.`, () => {
    modulo.clases.splice(j, 0, clase);
    moduloAbierto = modulo.id;
    claseAbierta = clase.id;
    pintarModulos();
  });
});

$<HTMLButtonElement>('[data-quitar-modulo]').addEventListener('click', () => {
  const i = curso.modulos.findIndex((m) => m.id === moduloAbierto);
  if (i < 0) return;
  const [modulo] = curso.modulos.splice(i, 1);
  moduloAbierto = null;
  claseAbierta = null;
  marcarSucio();
  pintarModulos();
  ofrecerDeshacer(`Quitaste el módulo ${i + 1} con ${modulo.clases.length} ${modulo.clases.length === 1 ? 'clase' : 'clases'}.`, () => {
    curso.modulos.splice(i, 0, modulo);
    moduloAbierto = modulo.id;
    pintarModulos();
  });
});

// ═══ Paso 3 · Evaluación ════════════════════════════════════════════
const inNota = $<HTMLInputElement>('#nota');
const inIntentos = $<HTMLInputElement>('#intentos');
const inTiempo = $<HTMLInputElement>('#tiempo');
const btnCambiarReglas = $<HTMLButtonElement>('[data-cambiar-reglas]');
const camposReglas = $<HTMLElement>('[data-reglas-campos]');
const inEnunciado = $<HTMLTextAreaElement>('#pregunta-enunciado');
const inOpciones = $$<HTMLInputElement>('[data-opcion-texto]');
const radiosCorrecta = $$<HTMLInputElement>('[data-correcta]');

function pintarReglas(): void {
  const ev = curso.evaluacion;
  $<HTMLElement>('[data-reglas-texto]').textContent =
    `Nota mínima ${ev.notaMinima || '—'} de 20 · ${ev.intentos || '—'} ${ev.intentos === '1' ? 'intento' : 'intentos'} · ${ev.tiempoMin || '—'} minutos`;
  const sugerido =
    ev.notaMinima === EVALUACION_SUGERIDA.notaMinima &&
    ev.intentos === EVALUACION_SUGERIDA.intentos &&
    ev.tiempoMin === EVALUACION_SUGERIDA.tiempoMin;
  $<HTMLElement>('[data-reglas-sugerido]').hidden = !sugerido;
  camposReglas.hidden = !reglasAbiertas;
  btnCambiarReglas.setAttribute('aria-expanded', String(reglasAbiertas));
  btnCambiarReglas.textContent = reglasAbiertas ? 'Listo' : 'Cambiar';
}

btnCambiarReglas.addEventListener('click', () => {
  if (reglasAbiertas) {
    // "Listo" solo cierra si los datos son válidos.
    const e = erroresEvaluacion(curso);
    const malos = (['notaMinima', 'intentos', 'tiempoMin'] as const).filter((k) => e[`evaluacion.${k}`]);
    for (const k of ['notaMinima', 'intentos', 'tiempoMin'] as const) pintarError(porRuta(`evaluacion.${k}`), e[`evaluacion.${k}`]);
    if (malos.length) {
      porRuta(`evaluacion.${malos[0]}`)?.focus();
      return;
    }
    reglasAbiertas = false;
  } else {
    reglasAbiertas = true;
    preguntaAbierta = null; // así se ven como máximo 6 campos
    pintarPreguntas();
  }
  pintarReglas();
  if (reglasAbiertas) inNota.focus();
  else btnCambiarReglas.focus();
});

for (const [input, campo] of [
  [inNota, 'notaMinima'],
  [inIntentos, 'intentos'],
  [inTiempo, 'tiempoMin'],
] as const) {
  input.addEventListener('input', () => {
    curso.evaluacion[campo] = input.value;
    if (input.getAttribute('aria-invalid') === 'true' && !erroresEvaluacion(curso)[`evaluacion.${campo}`]) limpiarError(input);
    pintarReglas();
    marcarSucio();
  });
  input.addEventListener('blur', () => pintarError(input, erroresEvaluacion(curso)[`evaluacion.${campo}`]));
}

function buscarPregunta(id: string | null) {
  const i = curso.evaluacion.preguntas.findIndex((p) => p.id === id);
  return i < 0 ? null : { pregunta: curso.evaluacion.preguntas[i], i };
}

function estadoPregunta(p: PreguntaBorrador): 'editando' | 'lista' | 'sin-escribir' | 'incompleta' {
  if (p.id === preguntaAbierta) return 'editando';
  if (preguntaCompleta(p)) return 'lista';
  if (!p.enunciado.trim() && p.opciones.every((o) => !o.trim())) return 'sin-escribir';
  return 'incompleta';
}
const TEXTO_PREGUNTA = { editando: 'Editando', lista: 'Lista', 'sin-escribir': 'Sin escribir', incompleta: 'Incompleta' };

function pintarPreguntas(): void {
  almacen.append(editorPregunta);
  const total = curso.evaluacion.preguntas.length;
  const filas = curso.evaluacion.preguntas.map((p, i) => {
    const abierta = p.id === preguntaAbierta;
    const li = crear('li', 'pregunta');
    li.dataset.id = p.id;
    const editorId = `pregunta-editor-${p.id}`;
    const cabecera = crear('div', 'cabecera');
    const boton = alternar(abierta, editorId);
    boton.dataset.alternarPregunta = p.id;
    if (abierta) {
      li.dataset.abierto = '';
      boton.append(textosAlternar(`Pregunta ${i + 1} de ${total}`), plantilla('badge-editando'), plantilla('icono-chevron'));
    } else {
      const estado = estadoPregunta(p);
      const conError = intentado.has(3) && estado !== 'lista';
      const titulo = p.enunciado.trim() ? `Pregunta ${i + 1}: ${p.enunciado.trim()}` : `Pregunta ${i + 1}`;
      const sub = conError
        ? { texto: 'Revisa esta pregunta: le faltan datos', error: true }
        : { texto: `Opción múltiple · ${TEXTO_PREGUNTA[estado].toLowerCase()}`, error: false };
      boton.append(textosAlternar(titulo, sub), plantilla('icono-chevron'));
    }
    boton.querySelector('svg:last-child')?.classList.add('alternar__flecha');
    cabecera.append(boton);
    li.append(cabecera);
    if (abierta) {
      editorPregunta.id = editorId;
      li.append(editorPregunta);
    }
    return li;
  });
  listaPreguntas.replaceChildren(...filas);
  cargarEditorPregunta();
  pintarListaLateral();
}

function cargarEditorPregunta(): void {
  const encontrada = buscarPregunta(preguntaAbierta);
  if (!encontrada) return;
  const { pregunta } = encontrada;
  inEnunciado.value = pregunta.enunciado;
  inOpciones.forEach((input, k) => (input.value = pregunta.opciones[k]));
  radiosCorrecta.forEach((r, k) => (r.checked = pregunta.correcta === k));
  pintarErroresPregunta(intentado.has(3));
}

function pintarErroresPregunta(mostrar: boolean): void {
  const encontrada = buscarPregunta(preguntaAbierta);
  if (!encontrada) return;
  const e = mostrar ? erroresPregunta(encontrada.pregunta, 'p') : {};
  pintarError(inEnunciado, e['p.enunciado']);
  inOpciones.forEach((input, k) => {
    if (e[`p.opciones.${k}`]) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  });
  const mensajeOpciones =
    e['p.correcta'] ?? e['p.opciones'] ?? [0, 1, 2, 3].map((k) => e[`p.opciones.${k}`]).find(Boolean);
  pintarError(radiosCorrecta[0], mensajeOpciones);
}

function pintarListaLateral(): void {
  const lista = $<HTMLOListElement>('[data-lista-preguntas]');
  lista.replaceChildren(
    ...curso.evaluacion.preguntas.map((p, i) => {
      const li = crear('li');
      const b = crear('button');
      b.type = 'button';
      const estado = estadoPregunta(p);
      b.dataset.estado = estado;
      b.dataset.abrirPregunta = p.id;
      const cuadro = crear('span', 'cuadro', String(i + 1));
      cuadro.setAttribute('aria-hidden', 'true');
      b.append(cuadro, crear('span', '', TEXTO_PREGUNTA[estado]));
      b.setAttribute('aria-label', `Pregunta ${i + 1}: ${TEXTO_PREGUNTA[estado]}`);
      li.append(b);
      return li;
    }),
  );
}

function abrirPregunta(id: string | null, enfocar = true): void {
  preguntaAbierta = id;
  if (id && reglasAbiertas && !Object.keys(erroresEvaluacion(curso)).some((k) => /notaMinima|intentos|tiempoMin/.test(k))) {
    reglasAbiertas = false;
    pintarReglas();
  }
  pintarPreguntas();
  if (enfocar && id) listaPreguntas.querySelector<HTMLElement>(`[data-alternar-pregunta="${id}"]`)?.focus();
}

listaPreguntas.addEventListener('click', (e) => {
  const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-alternar-pregunta]');
  if (!boton) return;
  const id = boton.dataset.alternarPregunta!;
  abrirPregunta(preguntaAbierta === id ? null : id);
});
$<HTMLOListElement>('[data-lista-preguntas]').addEventListener('click', (e) => {
  const boton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-abrir-pregunta]');
  if (!boton) return;
  abrirPregunta(boton.dataset.abrirPregunta!, false);
  inEnunciado.focus();
});

$<HTMLButtonElement>('[data-agregar-pregunta]').addEventListener('click', () => {
  const p = preguntaNueva();
  curso.evaluacion.preguntas.push(p);
  marcarSucio();
  abrirPregunta(p.id, false);
  inEnunciado.focus();
  anunciar(`Pregunta ${curso.evaluacion.preguntas.length} agregada.`);
});

$<HTMLButtonElement>('[data-quitar-pregunta]').addEventListener('click', () => {
  const encontrada = buscarPregunta(preguntaAbierta);
  if (!encontrada) return;
  const { pregunta, i } = encontrada;
  curso.evaluacion.preguntas.splice(i, 1);
  marcarSucio();
  abrirPregunta(null);
  ofrecerDeshacer(`Quitaste la pregunta ${i + 1}.`, () => {
    curso.evaluacion.preguntas.splice(i, 0, pregunta);
    abrirPregunta(pregunta.id);
  });
});

inEnunciado.addEventListener('input', () => {
  const encontrada = buscarPregunta(preguntaAbierta);
  if (!encontrada) return;
  encontrada.pregunta.enunciado = inEnunciado.value;
  if (inEnunciado.getAttribute('aria-invalid') === 'true' && inEnunciado.value.trim()) limpiarError(inEnunciado);
  pintarListaLateral();
  marcarSucio();
});
inEnunciado.addEventListener('blur', () => {
  const encontrada = buscarPregunta(preguntaAbierta);
  if (encontrada && (inEnunciado.value || intentado.has(3))) {
    pintarError(inEnunciado, erroresPregunta(encontrada.pregunta, 'p')['p.enunciado']);
  }
});
inOpciones.forEach((input, k) => {
  input.addEventListener('input', () => {
    const encontrada = buscarPregunta(preguntaAbierta);
    if (!encontrada) return;
    encontrada.pregunta.opciones[k] = input.value;
    if (input.getAttribute('aria-invalid') === 'true' && input.value.trim()) input.removeAttribute('aria-invalid');
    pintarListaLateral();
    marcarSucio();
  });
});
radiosCorrecta.forEach((radio, k) => {
  radio.addEventListener('change', () => {
    const encontrada = buscarPregunta(preguntaAbierta);
    if (!encontrada) return;
    encontrada.pregunta.correcta = k;
    limpiarError(radiosCorrecta[0]);
    pintarListaLateral();
    marcarSucio();
  });
});

// ═══ Paso 4 · Revisar y publicar ════════════════════════════════════
const inInstructor = $<HTMLInputElement>('#instructor');
const inRequisitos = $<HTMLInputElement>('#requisitos');
const inFecha = $<HTMLInputElement>('#fecha');
const avatarInstructor = $<HTMLElement>('[data-avatar-instructor]');
const errorMedia = $<HTMLElement>('[data-error-media]');

function pintarSugeridos(): void {
  $<HTMLElement>('[data-sugerido="instructor"]').hidden = curso.instructor !== INSTRUCTOR_SUGERIDO;
  $<HTMLElement>('[data-sugerido="requisitos"]').hidden = curso.requisitos !== REQUISITO_SUGERIDO[curso.nivel];
  $<HTMLElement>('[data-sugerido="fechaPublicacion"]').hidden = curso.fechaPublicacion !== HOY;
  avatarInstructor.textContent = curso.instructor.trim() ? iniciales(curso.instructor) : '';
}

function pintarPaso4(): void {
  inInstructor.value = curso.instructor;
  inRequisitos.value = curso.requisitos;
  inFecha.value = curso.fechaPublicacion;
  pintarSugeridos();

  const filas = $$<HTMLElement>('[data-resumen]');
  const categoria = CATEGORIAS.find((c) => c.id === curso.categoria)?.texto ?? 'Sin categoría';
  const nivel = NIVELES.find((n) => n.id === curso.nivel)?.texto ?? '';
  const ok1 = Object.keys(erroresDatosGenerales(curso)).length === 0;
  const ok2 = Object.keys(erroresContenido(curso)).length === 0;
  const ok3 = Object.keys(erroresEvaluacion(curso)).length === 0;
  const clases = curso.modulos.reduce((s, m) => s + m.clases.length, 0);
  const sinMedia = clasesSinMedia(curso);
  const ev = curso.evaluacion;

  const textos = [
    ok1 ? `${categoria} · ${nivel} · ${curso.horas} horas` : 'Faltan datos en este paso. Pulsa Editar para completarlos.',
    ok2
      ? `${curso.modulos.length} ${curso.modulos.length === 1 ? 'módulo' : 'módulos'} y ${clases} ${clases === 1 ? 'clase' : 'clases'}` +
        (sinMedia ? ` · ${sinMedia} sin video o subtítulos` : ' con video')
      : 'Faltan datos en este paso. Pulsa Editar para completarlos.',
    ok3
      ? `${ev.preguntas.length} ${ev.preguntas.length === 1 ? 'pregunta' : 'preguntas'} · nota mínima ${ev.notaMinima} · ${ev.intentos} intentos`
      : 'Faltan datos en este paso. Pulsa Editar para completarlos.',
  ];
  const oks = [ok1, ok2 && sinMedia === 0, ok3];
  filas.forEach((fila, i) => {
    fila.dataset.ok = String(oks[i]);
    fila.querySelector('[data-resumen-texto]')!.textContent = textos[i];
  });
}

$$<HTMLButtonElement>('[data-editar]').forEach((b) =>
  b.addEventListener('click', () => irA(Number(b.dataset.editar))),
);

for (const [input, campo] of [
  [inInstructor, 'instructor'],
  [inRequisitos, 'requisitos'],
  [inFecha, 'fechaPublicacion'],
] as const) {
  input.addEventListener('input', () => {
    curso[campo] = input.value;
    if (input.getAttribute('aria-invalid') === 'true' && !erroresPublicacion(curso, HOY, INSTRUCTORES)[campo]) limpiarError(input);
    pintarSugeridos();
    marcarSucio();
  });
  input.addEventListener('blur', () => pintarError(input, erroresPublicacion(curso, HOY, INSTRUCTORES)[campo]));
}

// ═══ Navegación entre pasos ═════════════════════════════════════════
function erroresDelPaso(n: number): Errores {
  if (n === 1) return erroresDatosGenerales(curso);
  if (n === 2) return erroresContenido(curso);
  if (n === 3) return erroresEvaluacion(curso);
  return erroresPublicacion(curso, HOY, INSTRUCTORES);
}

/** Muestra los errores del paso y devuelve el primer elemento a enfocar. */
function mostrarErroresDelPaso(n: number, errores: Errores): HTMLElement | null {
  intentado.add(n);
  const rutas = Object.keys(errores);
  if (n === 1) {
    for (const ruta of ['titulo', 'descripcion', 'categoria', 'nivel', 'horas', 'imagen']) revisarPaso1(ruta);
    const primera = ['titulo', 'descripcion', 'categoria', 'nivel', 'horas', 'imagen'].find((r) => errores[r]);
    return primera === 'categoria' ? radiosCategoria[0] : primera ? porRuta(primera) : null;
  }
  if (n === 2) {
    pintarErrorGeneral('modulos', errores.modulos);
    const primera = rutas.find((r) => r.startsWith('modulos.'));
    if (primera) {
      const [, i, , j] = primera.split('.');
      const modulo = curso.modulos[Number(i)];
      moduloAbierto = modulo.id;
      claseAbierta = j !== undefined && /^\d+$/.test(j) ? modulo.clases[Number(j)].id : claseAbierta;
      if (!buscarClase(claseAbierta) || buscarClase(claseAbierta)!.modulo !== modulo) claseAbierta = null;
    }
    pintarModulos();
    if (!primera) return $<HTMLButtonElement>('[data-agregar-modulo]');
    if (primera.endsWith('.titulo') && primera.split('.').length === 3) return inModuloTitulo;
    if (primera.endsWith('.clases')) return listaModulos.querySelector('[data-agregar-clase]');
    return listaModulos.querySelector<HTMLElement>('.editor-clase [aria-invalid="true"]') ?? inClaseTitulo;
  }
  if (n === 3) {
    pintarErrorGeneral('evaluacion.preguntas', errores['evaluacion.preguntas']);
    const reglaMal = (['notaMinima', 'intentos', 'tiempoMin'] as const).find((k) => errores[`evaluacion.${k}`]);
    if (reglaMal) {
      reglasAbiertas = true;
      preguntaAbierta = null;
      pintarReglas();
      pintarPreguntas();
      for (const k of ['notaMinima', 'intentos', 'tiempoMin']) pintarError(porRuta(`evaluacion.${k}`), errores[`evaluacion.${k}`]);
      return porRuta(`evaluacion.${reglaMal}`);
    }
    const primera = rutas.find((r) => r.startsWith('evaluacion.preguntas.'));
    if (!primera) {
      pintarPreguntas();
      return $<HTMLButtonElement>('[data-agregar-pregunta]');
    }
    preguntaAbierta = curso.evaluacion.preguntas[Number(primera.split('.')[2])].id;
    pintarPreguntas();
    return editorPregunta.querySelector<HTMLElement>('[aria-invalid="true"]') ?? inEnunciado;
  }
  // Paso 4
  for (const campo of ['instructor', 'requisitos', 'fechaPublicacion']) pintarError(porRuta(campo), errores[campo]);
  errorMedia.hidden = !errores.media;
  if (errores.media) $<HTMLElement>('[data-error-media-texto]').textContent = errores.media;
  const primera = ['instructor', 'requisitos', 'fechaPublicacion'].find((r) => errores[r]);
  return primera ? porRuta(primera) : errores.media ? $<HTMLElement>('[data-editar="2"]') : null;
}

function pintarErrorGeneral(ruta: string, mensaje: string | undefined): void {
  const p = $<HTMLElement>(`[data-error-general="${ruta}"]`);
  p.classList.toggle('is-visible', Boolean(mensaje));
  p.querySelector('[data-mensaje]')!.textContent = mensaje ?? '';
}

function pintarStepper(): void {
  stepper.forEach((li, i) => {
    const n = i + 1;
    const estado = n === paso ? 'actual' : n < pasoMaximo || (n <= pasoMaximo && n < paso) || publicado ? 'completado' : 'pendiente';
    li.dataset.estado = publicado ? 'completado' : estado;
    const boton = li.querySelector('button')!;
    boton.disabled = publicado || n > pasoMaximo || n === paso;
    if (n === paso && !publicado) boton.setAttribute('aria-current', 'step');
    else boton.removeAttribute('aria-current');
    li.querySelector('[data-estado-texto]')!.textContent =
      li.dataset.estado === 'completado' ? 'Completado' : li.dataset.estado === 'actual' ? 'En curso' : 'Pendiente';
  });
  stepper[0].parentElement!.setAttribute('aria-label', `Progreso: paso ${paso} de 4`);
}

function pintarPie(): void {
  btnCancelar.hidden = paso !== 1;
  btnAnterior.hidden = paso === 1;
  piePaso.textContent = `Paso ${paso} de 4`;
  btnSiguiente.hidden = paso === 4;
  btnPublicar.hidden = paso !== 4;
  if (paso < 4) $<HTMLElement>('[data-siguiente-texto]').textContent = `Siguiente: ${NOMBRES_PASO[paso]}`;
  miga.textContent = `Crear curso · ${NOMBRES_PASO[paso - 1]}`;
  const [titulo, texto] = AYUDA_PASO[paso - 1];
  $<HTMLElement>('[data-ayuda-titulo]').textContent = titulo;
  $<HTMLElement>('[data-ayuda-texto]').textContent = texto;
  for (const lado of $$<HTMLElement>('[data-lado]')) lado.hidden = Number(lado.dataset.lado) !== paso;
}

function pintarPaso(n: number): void {
  if (n === 1) pintarPaso1();
  if (n === 2) pintarModulos();
  if (n === 3) {
    pintarReglas();
    inNota.value = curso.evaluacion.notaMinima;
    inIntentos.value = curso.evaluacion.intentos;
    inTiempo.value = curso.evaluacion.tiempoMin;
    pintarPreguntas();
  }
  if (n === 4) pintarPaso4();
}

function irA(n: number, enfocar = true): void {
  if (n < 1 || n > 4) return;
  const direccion = n > paso ? 'der' : 'izq';
  avisoRed.hidden = true;
  secciones.forEach((s) => {
    const visible = Number(s.dataset.paso) === n;
    s.hidden = !visible;
    s.classList.remove('anima-entra-der', 'anima-entra-izq');
    if (visible && n !== paso) {
      void s.offsetWidth;
      s.classList.add(`anima-entra-${direccion}`);
    }
  });
  paso = n;
  pasoMaximo = Math.max(pasoMaximo, n);
  pintarPaso(n);
  pintarStepper();
  pintarPie();
  if (enfocar) {
    $<HTMLElement>(`#paso-${n}-titulo`).focus({ preventScroll: true });
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $<HTMLElement>('.crear__stepper').scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  }
  anunciar(`Paso ${n} de 4: ${NOMBRES_PASO[n - 1]}.`);
}

btnSiguiente.addEventListener('click', () => {
  if (estaOcupado(btnSiguiente)) return;
  const errores = erroresDelPaso(paso);
  if (Object.keys(errores).length) {
    const foco = mostrarErroresDelPaso(paso, errores);
    const n = Object.keys(errores).length;
    // Modo "toque": sacudida + aviso assertive, sin earcon (el toque ya se sintió al presionar).
    retroalimentar(btnSiguiente, 'error', `Antes de seguir revisa ${n === 1 ? '1 dato' : `${n} datos`} marcados en rojo.`);
    foco?.focus();
    return;
  }
  irA(paso + 1);
});
btnAnterior.addEventListener('click', () => irA(paso - 1));
stepper.forEach((li, i) =>
  li.querySelector('button')!.addEventListener('click', () => {
    if (i + 1 <= pasoMaximo) irA(i + 1);
  }),
);
form.addEventListener('submit', (e) => e.preventDefault()); // Enter en un campo no publica por accidente

// ═══ Borrador en localStorage ══════════════════════════════════════
interface Guardado {
  version: 1;
  guardadoEn: string;
  paso: number;
  pasoMaximo: number;
  curso: CursoBorrador;
}

function horaCorta(fecha: Date): string {
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(fecha);
}

btnGuardar.addEventListener('click', async () => {
  if (estaOcupado(btnGuardar)) return;
  procesar(btnGuardar);
  const inicio = performance.now();
  let ok = true;
  try {
    const datos: Guardado = { version: 1, guardadoEn: new Date().toISOString(), paso, pasoMaximo, curso };
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(datos));
  } catch {
    ok = false;
  }
  await completarCarga(inicio);
  if (!ok) {
    retroalimentar(btnGuardar, 'error', 'No se pudo guardar el borrador en este navegador. Revisa que no esté en modo privado.');
    badgeBorrador.querySelector('[data-badge-texto]')!.textContent = 'No se pudo guardar';
    return;
  }
  sucio = false;
  // Éxito suave: verde con check + earcon bajo + vibración corta + "Borrador guardado".
  retroalimentar(btnGuardar, 'exito');
  badgeBorrador.classList.remove('badge--neutro');
  badgeBorrador.classList.add('badge--verde');
  badgeBorrador.querySelector('[data-badge-texto]')!.textContent = `Borrador guardado · ${horaCorta(new Date())}`;
  await esperar(1400);
  ponerEstado(btnGuardar, 'normal');
});

function leerBorrador(): Guardado | null {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null') as Guardado | null;
    if (!datos || datos.version !== 1 || !datos.curso?.modulos) return null;
    return datos;
  } catch {
    return null;
  }
}

function aplicarBorrador(datos: Guardado): void {
  curso = datos.curso;
  pasoMaximo = Math.min(4, Math.max(1, datos.pasoMaximo));
  if (curso.fechaPublicacion < HOY) curso.fechaPublicacion = HOY; // una fecha pasada ya no sirve
  moduloAbierto = curso.modulos[0]?.id ?? null;
  claseAbierta = null;
  preguntaAbierta = curso.evaluacion.preguntas[0]?.id ?? null;
  irA(Math.min(4, Math.max(1, datos.paso)), false);
  pintarPaso1();
}

function iniciarAvisoBorrador(datos: Guardado): void {
  const fecha = new Date(datos.guardadoEn);
  const cuando = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(fecha);
  const texto = $<HTMLElement>('[data-aviso-borrador-texto]');
  const accion = $<HTMLButtonElement>('[data-aviso-borrador-accion]');
  texto.textContent = `Recuperamos tu borrador guardado el ${cuando.replace(/\.$/, '')}.`; // "p. m." ya termina en punto
  accion.textContent = 'Empezar de cero';
  avisoBorrador.hidden = false;
  badgeBorrador.classList.replace('badge--neutro', 'badge--verde');
  badgeBorrador.querySelector('[data-badge-texto]')!.textContent = `Borrador guardado · ${horaCorta(fecha)}`;

  accion.onclick = () => {
    // Empezar de cero se puede deshacer: el borrador se borra recién al guardar otro.
    const anterior = datos;
    curso = cursoNuevo();
    pasoMaximo = 1;
    moduloAbierto = curso.modulos[0].id;
    claseAbierta = curso.modulos[0].clases[0].id;
    preguntaAbierta = curso.evaluacion.preguntas[0].id;
    intentado.clear();
    avisoBorrador.hidden = true;
    irA(1);
    pintarPaso1();
    marcarSucio();
    try {
      localStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      /* nada */
    }
    ofrecerDeshacer('Empezaste un curso nuevo y se descartó el borrador.', () => {
      try {
        localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(anterior));
      } catch {
        /* nada */
      }
      aplicarBorrador(anterior);
      iniciarAvisoBorrador(anterior);
      sucio = false;
    });
  };
}

// ═══ Cancelar (firma de Cancelación, Act. 14) ══════════════════════
// Sin cambios pendientes sale directo; con cambios pide confirmación en un modal.
// Al salir suena el "soplido" y se ve la señal antes de cambiar de página.
const btnDescartar = $<HTMLButtonElement>('[data-descartar]');

async function salirCancelando(): Promise<void> {
  sucio = false; // ya se confirmó: el aviso del navegador no vuelve a preguntar
  retroalimentar(null, 'cancelacion', 'Creación del curso cancelada. Volviendo a Cursos.');
  await esperar(450); // se alcanza a oír el soplido completo (~320 ms)
  window.location.assign(btnCancelar.href);
}

btnCancelar.addEventListener('click', (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (sucio && !publicado) abrirModal('modal-cancelar');
  else void salirCancelando();
});

let saliendo = false; // ningún botón se envía dos veces
btnDescartar.addEventListener('click', () => {
  if (saliendo) return;
  saliendo = true;
  cerrarModal('modal-cancelar');
  void salirCancelando();
});

window.addEventListener('beforeunload', (e) => {
  if (sucio && !publicado) {
    e.preventDefault();
  }
});

// ═══ Publicar ═══════════════════════════════════════════════════════
function mostrarAvisoRed(tipo: 'sin-conexion' | 'servidor'): void {
  $<HTMLElement>('[data-aviso-red-titulo]').textContent =
    tipo === 'sin-conexion' ? 'Sin conexión a internet' : 'No pudimos publicar el curso';
  $<HTMLElement>('[data-aviso-red-detalle]').textContent =
    tipo === 'sin-conexion'
      ? 'El curso no se publicó. Tu trabajo sigue aquí; revisa tu conexión e inténtalo de nuevo.'
      : 'El servicio no respondió. Tu trabajo sigue aquí; inténtalo en unos segundos.';
  avisoRed.hidden = false;
  avisoRed.classList.remove('anima-aparecer');
  void avisoRed.offsetWidth;
  avisoRed.classList.add('anima-aparecer');
  anunciar('El curso no se publicó. Pulsa Reintentar.');
}

async function publicar(): Promise<void> {
  if (estaOcupado(btnPublicar) || publicado) return;

  // Antes de enviar: todo debe estar completo (pasos 1 a 3 y lo de este paso).
  for (const n of [1, 2, 3]) {
    if (Object.keys(erroresDelPaso(n)).length) {
      intentado.add(n);
      pintarPaso4();
      retroalimentar(btnPublicar, 'error', `Falta completar el paso ${n}: ${NOMBRES_PASO[n - 1]}. Pulsa Editar en esa sección.`);
      $<HTMLElement>(`[data-editar="${n}"]`).focus();
      return;
    }
  }
  const errores4 = erroresDelPaso(4);
  if (Object.keys(errores4).length) {
    const foco = mostrarErroresDelPaso(4, errores4);
    retroalimentar(btnPublicar, 'error', errores4.media ?? 'Revisa los datos marcados en rojo antes de publicar.');
    foco?.focus();
    return;
  }

  avisoRed.hidden = true;
  errorMedia.hidden = true;
  procesar(btnPublicar);
  anunciar('Publicando el curso…');
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ titulo?: string; errores?: Errores }>('/api/admin/cursos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curso }),
    });
    await completarCarga(inicio);
    if (respuesta.status === 401 || respuesta.status === 403) {
      retroalimentar(btnPublicar, 'error', ''); // el aviso se anuncia aparte
      mostrarAvisoRed('servidor');
      $<HTMLElement>('[data-aviso-red-detalle]').textContent = 'Tu sesión terminó. Guarda el borrador e inicia sesión otra vez.';
      return;
    }
    if (respuesta.status === 422 && datos.errores) {
      const primera = Object.keys(datos.errores)[0];
      retroalimentar(btnPublicar, 'error', datos.errores[primera]);
      const n = primera.startsWith('modulos') ? 2 : primera.startsWith('evaluacion') ? 3 : ['instructor', 'requisitos', 'fechaPublicacion', 'media'].includes(primera) ? 4 : 1;
      if (n === 4) mostrarErroresDelPaso(4, datos.errores)?.focus();
      else {
        irA(n);
        mostrarErroresDelPaso(n, erroresDelPaso(n))?.focus();
      }
      return;
    }
    if (!respuesta.ok) throw new Error('servidor');

    // Éxito: verde con check y luego la pantalla de "Curso publicado".
    publicado = true;
    sucio = false;
    // Visual + earcon + vibración + "Curso publicado" en el mismo instante.
    retroalimentar(btnPublicar, 'exito');
    try {
      localStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      /* nada */
    }
    await esperar(800);
    const fecha = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${curso.fechaPublicacion}T00:00:00Z`),
    );
    $<HTMLElement>('[data-publicado-texto]').textContent =
      curso.fechaPublicacion === HOY
        ? `“${datos.titulo ?? curso.titulo}” ya está en el catálogo. Los estudiantes pueden inscribirse desde hoy.`
        : `“${datos.titulo ?? curso.titulo}” aparecerá en el catálogo el ${fecha}.`;
    secciones.forEach((s) => (s.hidden = true));
    avisoBorrador.hidden = true;
    avisoDeshacer.hidden = true;
    pie.hidden = true;
    const exito = $<HTMLElement>('[data-publicado]');
    exito.hidden = false;
    exito.classList.add('anima-aparecer');
    badgeBorrador.classList.replace('badge--neutro', 'badge--verde');
    badgeBorrador.querySelector('[data-badge-texto]')!.textContent = 'Publicado';
    pintarStepper();
    $<HTMLElement>('#publicado-titulo').focus();
  } catch (e) {
    await completarCarga(inicio);
    retroalimentar(btnPublicar, 'error', ''); // mostrarAvisoRed anuncia qué pasó
    mostrarAvisoRed((e as Error).message === 'sin-conexion' ? 'sin-conexion' : 'servidor');
  }
}

btnPublicar.addEventListener('click', () => void publicar());
const btnReintentar = $<HTMLButtonElement>('[data-reintentar]');
btnReintentar.addEventListener('click', async () => {
  if (estaOcupado(btnReintentar)) return;
  ponerEstado(btnReintentar, 'cargando');
  await esperar(CARGA_MINIMA_MS);
  ponerEstado(btnReintentar, 'normal');
  void publicar();
});

// ═══ Arranque ═══════════════════════════════════════════════════════
const guardado = leerBorrador();
if (guardado) {
  aplicarBorrador(guardado);
  iniciarAvisoBorrador(guardado);
} else {
  pintarPaso1();
  pintarStepper();
  pintarPie();
}
pintarCifras();
