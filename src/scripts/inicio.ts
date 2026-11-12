// Inicio del estudiante: carga los datos en dos partes para tener los 5 estados reales.
//   ideal    → todo cargó
//   vacío    → estudiante sin cursos: "Explorar cursos"
//   cargando → skeleton en cada tarjeta
//   error    → no cargó lo principal: qué pasó + "Reintentar"
//   parcial  → lo principal cargó pero "Esta semana" no: "No se pudo cargar esta parte" + "Reconectar"
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import {
  $,
  $$,
  anunciar,
  completarCarga,
  enfocar,
  ESPERA_EXITO_MS,
  esperar,
  fechaCorta,
  pedirJSON,
  plantilla,
  semaforo,
  simulacion,
} from './util';

interface ResumenInicio {
  continuar: {
    titulo: string;
    clase: { id: number; etiqueta: string };
    ruta: { nombre: string; estado: 'completado' | 'en-curso' | 'pendiente' | 'bloqueada' }[];
  } | null;
  certificado: { curso: string; porcentaje: number; completadas: number; total: number } | null;
  otros: { titulo: string; slug: string; porcentaje: number }[];
}
interface Tarea {
  titulo: string;
  curso: string;
  venceEnDias: number;
}

const simular = simulacion();
const raiz = $<HTMLElement>('[data-inicio]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLButtonElement>('[data-accion="reintentar"]', error);
const anuncio = $<HTMLElement>('[data-anuncio-inicio]');

const semana = $<HTMLElement>('[data-semana]');
const semanaCargando = $<HTMLElement>('[data-semana-cargando]', semana);
const semanaLista = $<HTMLUListElement>('[data-semana-lista]', semana);
const semanaVacia = $<HTMLElement>('[data-semana-vacia]', semana);
const semanaError = $<HTMLElement>('[data-semana-error]', semana);
const reconectar = $<HTMLButtonElement>('[data-accion="reconectar"]', semanaError);

/** El parámetro ?simular se pasa a la API solo en desarrollo (lo usa /estados). */
const sufijo = simular ? `?simular=${simular}` : '';

const crear = <K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase?: string, texto?: string) => {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
};

// ─── Mostrar regiones ──────────────────────────────────────────────
function mostrarRegion(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
}

function esqueletos(cargando: boolean): void {
  for (const el of $$<HTMLElement>('[data-esqueleto]', contenido)) el.hidden = !cargando;
  if (cargando) for (const el of $$<HTMLElement>('[data-contenido]', contenido)) el.hidden = true;
}

// ─── Pintar lo principal ───────────────────────────────────────────
const TEXTO_ESTADO = { completado: 'Completado', 'en-curso': 'En curso', pendiente: 'Pendiente', bloqueada: 'Bloqueada' };

function pintarContinuar(datos: NonNullable<ResumenInicio['continuar']>): void {
  $<HTMLElement>('[data-curso]').textContent = datos.titulo;
  $<HTMLElement>('[data-clase]').textContent = datos.clase.etiqueta;
  $<HTMLAnchorElement>('[data-continuar]').href = `/clase/${datos.clase.id}`;

  const ruta = $<HTMLOListElement>('[data-ruta]');
  ruta.replaceChildren(
    ...datos.ruta.map((paso, i) => {
      const li = crear('li', 'paso');
      li.dataset.estado = paso.estado;
      if (i > 0 && datos.ruta[i - 1].estado === 'completado') li.dataset.linea = 'hecha';
      if (paso.estado === 'en-curso') li.setAttribute('aria-current', 'step');
      const circulo = crear('span', 'paso__circulo');
      circulo.setAttribute('aria-hidden', 'true');
      if (paso.estado === 'completado') circulo.append(plantilla('paso-completado'));
      if (paso.estado === 'bloqueada') circulo.append(plantilla('paso-bloqueada'));
      if (paso.estado === 'pendiente') circulo.textContent = String(i + 1);
      const textos = crear('span', 'paso__textos');
      textos.append(crear('span', 'paso__nombre', paso.nombre), crear('span', 'paso__estado', TEXTO_ESTADO[paso.estado]));
      li.append(circulo, textos);
      return li;
    }),
  );
}

function pintarCertificado(datos: ResumenInicio['certificado']): void {
  const bloque = $<HTMLElement>('.certificado [data-contenido]');
  const sin = $<HTMLElement>('[data-cert-vacio]');
  if (!datos) {
    bloque.hidden = true;
    sin.hidden = false;
    return;
  }
  sin.hidden = true;
  bloque.hidden = false;
  $<HTMLElement>('[data-porcentaje]').textContent = `${datos.porcentaje} %`;
  $<HTMLElement>('[data-clases]').textContent = `${datos.completadas} de ${datos.total} clases`;
  $<HTMLElement>('[data-cert-curso]').textContent = datos.curso;
  $<HTMLElement>('[data-anillo]').setAttribute(
    'aria-label',
    `${datos.porcentaje} % completado: ${datos.completadas} de ${datos.total} clases de ${datos.curso}`,
  );
  const avance = $<SVGCircleElement>('[data-anillo-avance]');
  const total = Number(avance.dataset.circunferencia);
  // Se anima en el siguiente cuadro, cuando el anillo ya es visible.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => avance.setAttribute('stroke-dashoffset', String(total * (1 - datos.porcentaje / 100)))),
  );
}

function pintarOtros(otros: ResumenInicio['otros']): void {
  const lista = $<HTMLUListElement>('[data-otros]');
  const sin = $<HTMLElement>('[data-otros-vacio]');
  lista.hidden = otros.length === 0;
  sin.hidden = otros.length > 0;
  lista.replaceChildren(
    ...otros.map((curso) => {
      const li = crear('li', 'otro');
      const fila = crear('div', 'otro__fila');
      fila.append(crear('span', 'otro__titulo', curso.titulo), crear('span', 'otro__porcentaje', `${curso.porcentaje} %`));
      const barra = crear('div', 'barra');
      barra.setAttribute('aria-hidden', 'true');
      const avance = crear('div', 'barra__avance');
      avance.style.width = '0%';
      barra.append(avance);
      requestAnimationFrame(() => requestAnimationFrame(() => (avance.style.width = `${curso.porcentaje}%`)));
      li.append(fila, barra);
      return li;
    }),
  );
}

// ─── Cargar lo principal ───────────────────────────────────────────
// Con reintento: el aviso de error sigue a la vista con "Reintentando…" hasta saber el
// resultado; así el botón muestra el éxito (verde + earcon + vibración) o el error.
async function cargarInicio(reintento = false): Promise<'ok' | 'vacio' | 'error'> {
  raiz.setAttribute('aria-busy', 'true');
  if (!reintento) {
    mostrarRegion('contenido');
    esqueletos(true);
  }
  // Firma de Progreso (Act. 14): carga automática → gotas solo si tarda más de 1 s, sin campanita al final
  // (el reintento ya tiene las gotas de su botón).
  const progreso = reintento ? null : iniciarProgreso(raiz, { automatico: true, texto: 'Cargando tu Inicio' });
  if (simular === 'cargando') return new Promise(() => {}); // se queda cargando (solo /estados)

  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<ResumenInicio>(`/api/inicio${sufijo}`);
    if (respuesta.status === 401) {
      window.location.assign('/login?volver=/inicio');
      return 'error';
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', 'Inicio cargado.');
      await esperar(ESPERA_EXITO_MS); // se alcanza a ver el check verde
      mostrarRegion('contenido');
      ponerEstado(reintentar, 'normal');
    }

    if (!datos.continuar && datos.otros.length === 0) {
      mostrarRegion('vacio');
      anunciar(anuncio, 'Aún no tienes cursos. Explora el catálogo para empezar.');
      return 'vacio';
    }
    esqueletos(false);
    if (datos.continuar) {
      pintarContinuar(datos.continuar);
      $<HTMLElement>('.continuar [data-contenido]').hidden = false;
    }
    pintarCertificado(datos.certificado);
    pintarOtros(datos.otros);
    anunciar(anuncio, 'Tu Inicio está listo.');
    return 'ok';
  } catch {
    await completarCarga(inicio);
    mostrarRegion('error');
    if (reintento) retroalimentar(reintentar, 'error', 'No pudimos cargar tu Inicio. Revisa tu conexión y vuelve a intentarlo.');
    else anunciar(anuncio, 'No pudimos cargar tu Inicio. Pulsa Reintentar.');
    return 'error';
  } finally {
    progreso?.detener(); // el resultado ya se anuncia arriba
    raiz.setAttribute('aria-busy', 'false');
  }
}

// ─── "Esta semana" (independiente: si falla, estado parcial) ────────
function filaTarea(tarea: Tarea): HTMLLIElement {
  const { tono, texto } = semaforo(tarea.venceEnDias);
  const li = crear('li', 'tarea');
  const textos = crear('span', 'tarea__textos');
  textos.append(crear('span', 'tarea__titulo', tarea.titulo), crear('span', 'tarea__curso', tarea.curso));
  const badge = plantilla(`tarea-${tono}`);
  badge.querySelector('[data-badge-texto]')!.textContent = texto;
  li.append(crear('span', 'tarea__fecha', fechaCorta(tarea.venceEnDias)), textos, badge);
  return li;
}

async function cargarSemana(reintento = false): Promise<boolean> {
  semana.setAttribute('aria-busy', 'true');
  if (!reintento) {
    semanaError.hidden = true;
    semanaLista.hidden = true;
    semanaVacia.hidden = true;
    semanaCargando.hidden = false;
  }
  if (simular === 'cargando') return new Promise(() => {});

  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ tareas: Tarea[] }>(`/api/esta-semana${sufijo}`);
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', 'Esta semana cargada.');
      await esperar(ESPERA_EXITO_MS);
      semanaError.hidden = true;
      ponerEstado(reconectar, 'normal');
    }
    semanaLista.replaceChildren(...datos.tareas.slice(0, 4).map(filaTarea));
    semanaLista.hidden = datos.tareas.length === 0;
    semanaVacia.hidden = datos.tareas.length > 0;
    return true;
  } catch {
    await completarCarga(inicio);
    semanaError.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', 'Esta semana sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    return false;
  } finally {
    semanaCargando.hidden = true;
    semana.setAttribute('aria-busy', 'false');
  }
}

// ─── Botones de recuperación ───────────────────────────────────────
// Botones multimodales (§5.8): éxito o error según el resultado.
reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  const resultado = await cargarInicio(true);
  if (resultado === 'error') return; // el botón sigue a la vista y con el foco
  enfocar($<HTMLElement>('[data-titulo-pagina]')); // el botón desapareció: el foco no se pierde
  if (resultado === 'ok') void cargarSemana();
});

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargarSemana(true)) enfocar($<HTMLElement>('#semana-titulo'));
});

// ─── Arranque: las dos partes se piden a la vez ────────────────────
void cargarInicio();
void cargarSemana();
