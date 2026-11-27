// Lista de cursos del administrador (ver el comentario de src/pages/admin/cursos/index.astro).
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { abrirModal, cerrarModal } from './modal';
import { limpiarError, mostrarError } from './campo';
import { $, $$, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla } from './util';
import { confirmacionActiva, guardarEnUrl, iniciarResumen, sufijos, tx } from './admin-util';
import { abrirTarjetaSam, sesionDelFlujo, terminarFlujoSam } from './sam';

type Estado = 'publicado' | 'programado' | 'deshabilitado';
type Accion = 'deshabilitar' | 'habilitar' | 'eliminar';

interface Curso {
  id: number;
  slug: string;
  titulo: string;
  categoria: string;
  nivel: string;
  instructor: string;
  totalClases: number;
  inscritos: number;
  estado: Estado;
  publicacion: string | null;
  creadoPorAdmin: boolean;
}

const { principal, simular } = sufijos();
const sufijoEscritura = simular ? '?simular=ideal' : '';
const catalogo = JSON.parse($<HTMLElement>('#catalogo-admin').textContent ?? '{}') as {
  categorias: Record<string, string>;
  niveles: Record<string, string>;
};

const raiz = $<HTMLElement>('[data-cursos]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const filas = $<HTMLElement>('[data-filas]', raiz);
const caption = $<HTMLElement>('[data-caption]', raiz);
const chips = $$<HTMLButtonElement>('[data-filtro]', raiz);
const sinResultados = $<HTMLElement>('[data-sin-resultados]', raiz);
const limpiar = $<HTMLElement>('[data-limpiar]', raiz);
const crearArriba = $<HTMLElement>('[data-accion-crear]');
const anuncio = $<HTMLElement>('[data-anuncio]');

let cursos: Curso[] = [];
let actual: Curso | null = null;
const ESTADOS: Estado[] = ['publicado', 'programado', 'deshabilitado'];
const pedido = new URLSearchParams(window.location.search).get('estado') as Estado | null;
let filtro: Estado | '' = pedido && ESTADOS.includes(pedido) ? pedido : '';

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
  // Una sola acción amarilla (Hick): en el vacío, "Crear curso" está en el centro.
  crearArriba.hidden = region === 'vacio';
}

function nombreFiltro(estado: Estado | ''): string {
  return chips.find((c) => c.dataset.filtro === estado)?.firstChild?.textContent?.trim() ?? '';
}

function pintar(): void {
  const visibles = cursos.filter((c) => !filtro || c.estado === filtro);
  filas.replaceChildren(
    ...visibles.map((c) => {
      const f = plantilla('fila');
      const fila = $<HTMLTableRowElement>('tr', f);
      fila.dataset.cursoId = String(c.id);
      if (c.estado === 'deshabilitado') fila.classList.add('fila--apagada');
      $<HTMLElement>('[data-titulo]', f).textContent = c.titulo;
      const detalle = [catalogo.categorias[c.categoria] ?? c.categoria, catalogo.niveles[c.nivel] ?? c.nivel, c.instructor];
      if (c.creadoPorAdmin) detalle.push(tx('cursos.nuevo'));
      $<HTMLElement>('[data-detalle]', f).textContent = detalle.join(' · ');
      $<HTMLElement>('[data-clases]', f).textContent = String(c.totalClases);
      $<HTMLElement>('[data-inscritos]', f).textContent = String(c.inscritos);

      const badge = plantilla(c.estado);
      if (c.estado === 'programado') {
        $<HTMLElement>('[data-badge-texto]', badge).textContent = tx('cursos.estadoProgramado', { fecha: c.publicacion ?? '' });
      }
      $<HTMLElement>('[data-estado]', f).append(badge);

      const acciones = $<HTMLElement>('[data-acciones]', f);
      if (c.estado === 'publicado') {
        const ver = plantilla('ver');
        const enlace = $<HTMLAnchorElement>('[data-ver]', ver);
        enlace.href = `/cursos/${c.slug}`;
        enlace.setAttribute('aria-label', tx('cursos.verNombre', { curso: c.titulo }));
        acciones.append(ver);
      }
      // §5.3: con inscritos solo se deshabilita; sin inscritos se puede eliminar.
      const accion: Accion = c.estado === 'deshabilitado' ? 'habilitar' : c.inscritos > 0 ? 'deshabilitar' : 'eliminar';
      const boton = plantilla(accion);
      const b = $<HTMLButtonElement>('[data-accion-curso]', boton);
      b.dataset.id = String(c.id);
      b.setAttribute('aria-label', tx('cursos.accionNombre', { accion: tx(`cursos.${accion}`), curso: c.titulo }));
      acciones.append(boton);
      return f;
    }),
  );
  for (const nodo of $$<HTMLElement>('[data-contar]', raiz)) {
    const estado = nodo.dataset.contar;
    nodo.textContent = String(cursos.filter((c) => !estado || c.estado === estado).length);
  }
  for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.filtro === filtro));
  caption.textContent = filtro
    ? `${nombreFiltro(filtro)}: ${tx('cursos.cargados', { n: visibles.length })}`
    : tx('cursos.cargados', { n: cursos.length });
  sinResultados.hidden = visibles.length > 0;
  $<HTMLElement>('[data-sin-resultados-texto]', sinResultados).textContent = tx('cursos.filtroVacio', { filtro: nombreFiltro(filtro) });
  $<HTMLElement>('.tabla-adm__envoltura', raiz).hidden = visibles.length === 0;
}

async function cargar(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  const progreso = reintento ? null : iniciarProgreso(raiz, { automatico: true, texto: tx('cursos.cargando') });
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ cursos: Curso[] }>(`/api/admin/cursos${principal}`);
    if (respuesta.status === 401 || respuesta.status === 403) {
      window.location.assign('/login?volver=/admin/cursos');
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', tx('cursos.cargados', { n: datos.cursos.length }));
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    cursos = datos.cursos;
    if (cursos.length === 0) {
      mostrar('vacio');
      anunciar(anuncio, tx('cursos.vacioAnuncio'));
      return true;
    }
    mostrar('contenido');
    pintar();
    anunciar(anuncio, caption.textContent ?? '');
    samAlVerElCurso();
    return true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', tx('cursos.errorSigue'));
    return false;
  } finally {
    progreso?.detener();
    raiz.setAttribute('aria-busy', 'false');
  }
}

// ─── Act. 20 · B5: el administrador ve en la lista el curso que acaba de publicar ───
// Con una prueba SAM del flujo B y el curso ya publicado (crear-curso.ts guardó su id), el flujo
// termina aquí: se resalta la fila y se abre la tarjeta SAM.
function samAlVerElCurso(): void {
  const sesion = sesionDelFlujo('B');
  if (!sesion?.publicadoId || sesion.fin || !document.querySelector('[data-sam="B"]')) return;
  const curso = cursos.find((c) => c.id === sesion.publicadoId);
  if (!curso) return;
  terminarFlujoSam('B');
  if (filtro && curso.estado !== filtro) {
    filtro = '';
    guardarEnUrl({ estado: '' });
    pintar();
  }
  const fila = filas.querySelector<HTMLElement>(`tr[data-curso-id="${curso.id}"]`);
  fila?.classList.add('fila--sam');
  const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  fila?.scrollIntoView({ block: 'center', behavior: suave ? 'smooth' : 'auto' });
  // Un momento para que vea su curso en la lista antes de la tarjeta.
  window.setTimeout(() => abrirTarjetaSam(), 1200);
}

for (const chip of chips) {
  chip.addEventListener('click', () => {
    filtro = (chip.dataset.filtro ?? '') as Estado | '';
    guardarEnUrl({ estado: filtro });
    pintar();
    anunciar(anuncio, caption.textContent ?? '');
  });
}
limpiar.addEventListener('click', () => {
  filtro = '';
  guardarEnUrl({ estado: '' });
  pintar();
  retroalimentar(limpiar, 'cancelacion', tx('cursos.filtroQuitado'));
  enfocar(chips[0]);
});

// ─── Cambiar el estado de un curso ──────────────────────────────────

async function enviar(id: number, accion: Accion, confirmacion = ''): Promise<{ ok: boolean; status: number; curso?: Curso | null }> {
  try {
    const { respuesta, datos } = await pedirJSON<{ curso?: Curso | null }>(`/api/admin/cursos/estado${sufijoEscritura}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion, confirmacion }),
    });
    return { ok: respuesta.ok, status: respuesta.status, curso: datos.curso };
  } catch {
    return { ok: false, status: 0 };
  }
}

function mensajeError(status: number): string {
  if (status === 401 || status === 403) return tx('comun.sesionTerminada');
  if (status === 409) return tx('cursos.tieneInscritos');
  if (status === 0) return tx('comun.sinConexion');
  return tx('cursos.accionError');
}

/** Tras un cambio, el foco va al título de la fila (el botón pulsado cambió o desapareció). */
function enfocarFila(id: number): void {
  enfocar(filas.querySelector<HTMLElement>(`[data-curso-id="${id}"] [data-titulo]`) ?? $<HTMLElement>('[data-titulo-pagina]'));
}

function aplicar(id: number, nuevo: Curso | null | undefined): void {
  if (nuevo === null) cursos = cursos.filter((c) => c.id !== id);
  else if (nuevo) cursos = cursos.map((c) => (c.id === id ? { ...c, ...nuevo, publicacion: c.publicacion } : c));
}

filas.addEventListener('click', async (e) => {
  const boton = (e.target as Element).closest<HTMLButtonElement>('[data-accion-curso]');
  if (!boton || estaOcupado(boton)) return;
  actual = cursos.find((c) => c.id === Number(boton.dataset.id)) ?? null;
  if (!actual) return;
  const accion = boton.dataset.accionCurso as Accion;

  if (accion === 'habilitar') {
    // Se puede deshacer: directo, sin modal (BotonMultimodal completo).
    const curso = actual;
    procesar(boton);
    const inicio = performance.now();
    const r = await enviar(curso.id, 'habilitar');
    await completarCarga(inicio);
    if (!r.ok) {
      retroalimentar(boton, 'error', mensajeError(r.status));
      return;
    }
    retroalimentar(boton, 'exito', tx('cursos.habilitadoAnuncio', { curso: curso.titulo }));
    await esperar(ESPERA_EXITO_MS);
    aplicar(curso.id, r.curso);
    pintar();
    enfocarFila(curso.id);
    return;
  }

  if (accion === 'deshabilitar') {
    $<HTMLElement>('[data-deshabilitar-texto]').textContent = tx('cursos.deshabilitarTexto', { curso: actual.titulo, n: actual.inscritos });
    ponerEstado(deshabilitar, 'normal');
    abrirModal('modal-deshabilitar', $<HTMLElement>('#modal-deshabilitar [data-cancelar-modal]'));
    return;
  }

  // Eliminar: confirmación activa
  $<HTMLElement>('[data-eliminar-texto]').textContent = tx('cursos.eliminarTexto', { curso: actual.titulo });
  palabra.value = '';
  casilla.checked = false;
  coincide.hidden = true;
  limpiarError(palabra);
  ponerEstado(eliminar, 'normal');
  confirmacion.reiniciar();
  confirmacion.actualizar();
  abrirModal('modal-eliminar', palabra);
});

// Cancelar (cualquiera de los dos modales): firma de Cancelación (Act. 14)
for (const boton of $$<HTMLElement>('[data-cancelar-modal]')) {
  boton.addEventListener('click', () => {
    const dialogo = boton.closest<HTMLDialogElement>('dialog');
    if (!dialogo || dialogo.querySelector('[data-estado="cargando"], [data-estado="exito"]')) return;
    dialogo.close();
    retroalimentar(boton, 'cancelacion', tx('cursos.cancelado'));
  });
}

const deshabilitar = $<HTMLButtonElement>('[data-confirmar-deshabilitar]');
deshabilitar.addEventListener('click', async () => {
  if (!actual || estaOcupado(deshabilitar)) return;
  const curso = actual;
  procesar(deshabilitar);
  const inicio = performance.now();
  const r = await enviar(curso.id, 'deshabilitar');
  await completarCarga(inicio);
  if (!r.ok) {
    retroalimentar(deshabilitar, 'error', mensajeError(r.status));
    return;
  }
  retroalimentar(deshabilitar, 'exito', tx('cursos.deshabilitadoAnuncio', { curso: curso.titulo }));
  await esperar(ESPERA_EXITO_MS);
  cerrarModal('modal-deshabilitar');
  aplicar(curso.id, r.curso);
  pintar();
  enfocarFila(curso.id);
});

const eliminar = $<HTMLButtonElement>('[data-confirmar-eliminar]');
const palabra = $<HTMLInputElement>('#confirmar-eliminar');
const casilla = $<HTMLInputElement>('#modal-eliminar [data-casilla]');
const coincide = $<HTMLElement>('#modal-eliminar [data-coincide]');
const PALABRA = tx('cursos.eliminarPalabra');

const confirmacion = confirmacionActiva({
  boton: eliminar,
  etiqueta: $<HTMLElement>('[data-eliminar-boton-texto]', eliminar),
  faltan: $<HTMLElement>('#modal-eliminar [data-faltan]'),
  accion: tx('cursos.eliminar'),
  textoListo: tx('cursos.eliminarBoton'),
  pendientes: () => {
    const lista: string[] = [];
    if (palabra.value.trim() !== PALABRA) lista.push(tx('cursos.faltaPalabra'));
    if (!casilla.checked) lista.push(tx('cursos.faltaCasilla'));
    return lista;
  },
});

palabra.addEventListener('input', () => {
  const ok = palabra.value.trim() === PALABRA;
  coincide.hidden = !ok;
  if (ok) limpiarError(palabra);
  confirmacion.actualizar();
});
palabra.addEventListener('blur', () => {
  if (palabra.value && palabra.value.trim() !== PALABRA) mostrarError(palabra, tx('cursos.eliminarNoCoincide'));
});
casilla.addEventListener('change', () => confirmacion.actualizar());
$<HTMLDialogElement>('#modal-eliminar').addEventListener('close', () => confirmacion.reiniciar());

eliminar.addEventListener('click', async () => {
  if (!actual || estaOcupado(eliminar)) return;
  if (eliminar.getAttribute('aria-disabled') === 'true' || !confirmacion.habilitado()) {
    const faltan = $<HTMLElement>('#modal-eliminar [data-faltan]');
    retroalimentar(eliminar, 'error', faltan.textContent || tx('cursos.accionError'));
    confirmacion.actualizar();
    (palabra.value.trim() !== PALABRA ? palabra : casilla).focus();
    return;
  }
  const curso = actual;
  procesar(eliminar);
  const inicio = performance.now();
  const r = await enviar(curso.id, 'eliminar', palabra.value.trim());
  await completarCarga(inicio);
  if (!r.ok) {
    retroalimentar(eliminar, 'error', mensajeError(r.status));
    window.setTimeout(() => confirmacion.reiniciar(), 360);
    window.setTimeout(() => confirmacion.actualizar(), 380);
    return;
  }
  retroalimentar(eliminar, 'exito', tx('cursos.eliminadoAnuncio', { curso: curso.titulo }));
  await esperar(ESPERA_EXITO_MS);
  cerrarModal('modal-eliminar');
  aplicar(curso.id, null);
  if (cursos.length === 0) mostrar('vacio');
  else pintar();
  enfocar($<HTMLElement>('[data-titulo-pagina]')); // la fila ya no existe
});

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargar(true)) enfocar($<HTMLElement>('[data-titulo-pagina]'));
});

iniciarResumen((r) => ({ estudiantes: r.estudiantes, inscripciones: r.inscripciones, validos: r.certificados.validos }));
void cargar();
