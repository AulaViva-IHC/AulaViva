// Notificaciones con los 5 estados reales (ver el comentario de src/pages/notificaciones.astro).
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { $, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, semaforo, simulacion } from './util';

interface Tarea {
  titulo: string;
  curso: string;
  venceEnDias: number;
}
interface Aviso {
  id: string;
  tipo: 'certificado' | 'evaluacion' | 'resultado';
  titulo: string;
  texto: string;
  enlace: string;
  fecha: string;
  leido: boolean;
}

const simular = simulacion();
const sufijo = simular ? `?simular=${simular}` : '';
const raiz = $<HTMLElement>('[data-notificaciones]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const anuncio = $<HTMLElement>('[data-anuncio-notificaciones]');
const listaTareas = $<HTMLUListElement>('[data-tareas]', raiz);
const tareasError = $<HTMLElement>('[data-tareas-error]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', tareasError);
const listaAvisos = $<HTMLUListElement>('[data-avisos]', raiz);
const leerCaja = $<HTMLElement>('[data-leer-caja]', raiz);
const leer = $<HTMLButtonElement>('[data-leer]', raiz);
const leerError = $<HTMLElement>('[data-leer-error]', raiz);

let tareas: Tarea[] | null = null;
let avisos: Aviso[] | null = null;

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
}

/** Vacío solo si las dos partes cargaron y no hay nada. */
function revisarVacio(): void {
  if (tareas && avisos && tareas.length === 0 && avisos.length === 0) {
    mostrar('vacio');
    anunciar(anuncio, 'No tienes avisos.');
  }
}

function pintarTareas(lista: Tarea[]): void {
  listaTareas.replaceChildren(
    ...lista.map((t) => {
      const f = plantilla('tarea');
      $<HTMLElement>('[data-titulo]', f).textContent = t.titulo;
      $<HTMLElement>('[data-curso]', f).textContent = t.curso;
      const { tono, texto } = semaforo(t.venceEnDias); // siempre con texto (§5.7)
      const badge = plantilla(`t-${tono}`);
      $<HTMLElement>('[data-badge-texto]', badge).textContent = texto;
      $<HTMLElement>('[data-badge]', f).append(badge);
      return f;
    }),
  );
  listaTareas.hidden = lista.length === 0;
  $<HTMLElement>('[data-tareas-vacio]').hidden = lista.length > 0;
}

function pintarAvisos(lista: Aviso[]): void {
  listaAvisos.replaceChildren(
    ...lista.map((a) => {
      const f = plantilla('aviso');
      const enlace = $<HTMLAnchorElement>('[data-enlace]', f);
      enlace.href = a.enlace;
      if (!a.leido) enlace.dataset.nuevoAviso = '';
      $<HTMLElement>('[data-icono]', f).append(plantilla(`ic-${a.tipo}`));
      $<HTMLElement>('[data-titulo]', f).textContent = a.titulo;
      $<HTMLElement>('[data-texto]', f).textContent = a.texto;
      $<HTMLElement>('[data-fecha]', f).textContent = a.fecha;
      if (!a.leido) $<HTMLElement>('[data-nuevo]', f).append(plantilla('nuevo'));
      return f;
    }),
  );
  listaAvisos.hidden = lista.length === 0;
  $<HTMLElement>('[data-avisos-vacio]').hidden = lista.length > 0;
  leerCaja.hidden = !lista.some((a) => !a.leido);
}

async function cargarAvisos(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  // Firma de Progreso (Act. 14): carga automática → gotas solo si tarda más de 1 s, sin campanita al final.
  const progreso = reintento ? null : iniciarProgreso(raiz, { automatico: true, texto: 'Cargando tus avisos' });
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ avisos: Aviso[] }>(
      `/api/notificaciones${simular === 'parcial' ? '?simular=ideal' : sufijo}`,
    );
    if (respuesta.status === 401) {
      window.location.assign('/login?volver=/notificaciones');
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', 'Avisos cargados.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    avisos = datos.avisos;
    mostrar('contenido');
    pintarAvisos(avisos);
    const nuevos = avisos.filter((a) => !a.leido).length;
    anunciar(anuncio, nuevos ? `Tienes ${nuevos === 1 ? '1 aviso nuevo' : `${nuevos} avisos nuevos`}.` : 'Sin avisos nuevos.');
    revisarVacio();
    return true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', 'Tus avisos siguen sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    return false;
  } finally {
    progreso?.detener(); // el resultado ya se anuncia arriba
    raiz.setAttribute('aria-busy', 'false');
  }
}

async function cargarTareas(reintento = false): Promise<boolean> {
  if (simular === 'cargando') return false;
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ tareas: Tarea[] }>(`/api/esta-semana${sufijo}`);
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', 'Entregas cargadas.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    tareas = datos.tareas;
    tareasError.hidden = true;
    pintarTareas(tareas);
    revisarVacio();
    return true;
  } catch {
    await completarCarga(inicio);
    listaTareas.hidden = true;
    tareasError.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', 'Las entregas siguen sin cargar. Revisa tu conexión.');
    return false;
  }
}

leer.addEventListener('click', async () => {
  if (estaOcupado(leer)) return;
  procesar(leer);
  leerError.hidden = true;
  const inicio = performance.now();
  let ok = false;
  try {
    const { respuesta } = await pedirJSON(`/api/notificaciones${sufijo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'leidas' }),
    });
    ok = respuesta.ok;
  } catch {
    ok = false;
  }
  await completarCarga(inicio);
  if (!ok) {
    leerError.hidden = false;
    retroalimentar(leer, 'error', 'No se pudieron marcar como leídos. Revisa tu conexión y vuelve a intentarlo.');
    return;
  }
  retroalimentar(leer, 'exito');
  await esperar(ESPERA_EXITO_MS);
  ponerEstado(leer, 'normal');
  if (avisos) pintarAvisos(avisos.map((a) => ({ ...a, leido: true })));
  enfocar($<HTMLElement>('#avisos-titulo')); // el botón desapareció: el foco no se pierde
});

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargarAvisos(true)) enfocar($<HTMLElement>('[data-titulo-pagina]'));
});

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargarTareas(true)) enfocar($<HTMLElement>('#vence-titulo'));
});

void cargarAvisos();
void cargarTareas();
