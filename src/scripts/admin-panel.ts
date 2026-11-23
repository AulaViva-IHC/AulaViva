// Panel del administrador (ver el comentario de src/pages/admin/index.astro).
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { $, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla } from './util';
import { sufijos, tx, type Resumen } from './admin-util';

interface Certificado {
  codigo: string;
  estudiante: string;
  curso: string;
  emitido: string;
  estado: 'valido' | 'anulado';
}

const { principal, secundaria, simular } = sufijos();
const raiz = $<HTMLElement>('[data-panel]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const crearArriba = $<HTMLElement>('[data-accion-crear]');
const anuncio = $<HTMLElement>('[data-anuncio]');
const lista = $<HTMLUListElement>('[data-ultimos]', raiz);
const listaVacia = $<HTMLElement>('[data-ultimos-vacio]', raiz);
const listaError = $<HTMLElement>('[data-ultimos-error]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', listaError);

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
  crearArriba.hidden = region === 'vacio'; // una sola acción amarilla
}

function pintarCifras(r: Resumen): void {
  const valores: Record<string, [number, string]> = {
    cursos: [r.cursos.publicados, tx('panel.cursosDetalle', { programados: r.cursos.programados, deshabilitados: r.cursos.deshabilitados })],
    estudiantes: [r.estudiantes, tx('panel.estudiantesDetalle')],
    inscripciones: [r.inscripciones, tx('panel.inscripcionesDetalle')],
    validos: [r.certificados.validos, tx('panel.validosDetalle', { anulados: r.certificados.anulados })],
  };
  for (const [clave, [valor, detalle]] of Object.entries(valores)) {
    const nodo = $<HTMLElement>(`[data-valor="${clave}"]`, raiz);
    nodo.textContent = String(valor);
    nodo.classList.remove('skeleton');
    $<HTMLElement>(`[data-detalle="${clave}"]`, raiz).textContent = detalle;
  }
}

async function cargarCifras(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  const progreso = reintento ? null : iniciarProgreso(raiz, { automatico: true, texto: tx('panel.cargando') });
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ resumen: Resumen }>(`/api/admin/panel${principal}`);
    if (respuesta.status === 401 || respuesta.status === 403) {
      window.location.assign('/login?volver=/admin');
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', tx('panel.cargado'));
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    const r = datos.resumen;
    const cursos = r.cursos.publicados + r.cursos.programados + r.cursos.deshabilitados;
    if (cursos === 0) {
      mostrar('vacio');
      anunciar(anuncio, tx('panel.vacioAnuncio'));
      return true;
    }
    mostrar('contenido');
    pintarCifras(r);
    anunciar(anuncio, tx('panel.cargado'));
    return true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', tx('panel.errorSigue'));
    return false;
  } finally {
    progreso?.detener();
    raiz.setAttribute('aria-busy', 'false');
  }
}

async function cargarUltimos(reintento = false): Promise<boolean> {
  if (simular === 'cargando') return false;
  const inicio = performance.now();
  const sufijo = secundaria ? `${secundaria}&limite=5` : '?limite=5';
  try {
    const { respuesta, datos } = await pedirJSON<{ certificados: Certificado[] }>(`/api/admin/certificados${sufijo}`);
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', tx('panel.ultimosCargados'));
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    lista.replaceChildren(
      ...datos.certificados.map((c) => {
        const f = plantilla('ultimo');
        $<HTMLElement>('[data-estudiante]', f).textContent = c.estudiante;
        $<HTMLElement>('[data-curso]', f).textContent = c.curso;
        $<HTMLElement>('[data-codigo]', f).textContent = c.codigo;
        $<HTMLElement>('[data-fecha]', f).textContent = c.emitido;
        $<HTMLElement>('[data-estado]', f).append(plantilla(c.estado));
        return f;
      }),
    );
    listaError.hidden = true;
    lista.hidden = datos.certificados.length === 0;
    listaVacia.hidden = datos.certificados.length > 0;
    return true;
  } catch {
    await completarCarga(inicio);
    lista.hidden = true;
    listaError.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', tx('panel.ultimosSigue'));
    return false;
  }
}

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargarCifras(true)) enfocar($<HTMLElement>('[data-titulo-pagina]'));
});

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargarUltimos(true)) enfocar($<HTMLElement>('#ultimos-titulo'));
});

void cargarCifras();
void cargarUltimos();
