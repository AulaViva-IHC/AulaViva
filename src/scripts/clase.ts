// Clase: índice del curso + progreso (/api/indice, aparte → cargando y parcial reales)
// y "Marcar como completada" con el bucle perceptual completo (Act. 10) y §5.8:
//   presionar (< 50 ms, escucha global) → "Guardando…" con giro y micro barra (50 ms)
//   → éxito: verde con check, earcon y vibración de éxito, "Clase marcada…" por aria-live (~200 ms)
//   → error: sacudida, earcon grave y el mensaje de qué hacer.
// Después del éxito la acción principal pasa a ser "Siguiente clase" o "Ir a la evaluación" (al 100 %).
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { $, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';

interface ClaseIndice {
  id: number;
  codigo: string;
  titulo: string;
  duracionMin: number;
  completada: boolean;
}
interface Indice {
  modulos: { numero: number; titulo: string; completado: boolean; clases: ClaseIndice[] }[];
  completadas: number;
  total: number;
  porcentaje: number;
  evaluacion: { habilitada: boolean; aprobada: boolean; intentosUsados: number; intentosMax: number };
}

const raiz = document.querySelector<HTMLElement>('[data-clase]');
if (raiz) iniciar(raiz);

function iniciar(raiz: HTMLElement): void {
  const simular = simulacion();
  const sufijo = simular ? `simular=${simular}` : '';
  const claseId = Number(raiz.dataset.claseId);
  const cursoId = Number(raiz.dataset.cursoId);

  const progreso = $<HTMLElement>('[data-progreso]', raiz);
  const indice = $<HTMLElement>('[data-indice]', raiz);
  const cargando = $<HTMLElement>('[data-indice-cargando]', indice);
  const lista = $<HTMLElement>('[data-indice-lista]', indice);
  const error = $<HTMLElement>('[data-indice-error]', indice);
  const reconectar = $<HTMLElement>('[data-accion="reconectar"]', error);
  const anuncio = $<HTMLElement>('[data-anuncio-clase]', raiz);

  const completarCaja = $<HTMLElement>('[data-completar-caja]', raiz);
  const completar = $<HTMLButtonElement>('[data-completar]', raiz);
  const seguirCaja = $<HTMLElement>('[data-seguir-caja]', raiz);
  const seguir = $<HTMLAnchorElement>('[data-seguir]', raiz);
  const hecha = $<HTMLElement>('[data-hecha]', raiz);
  const errorCompletar = $<HTMLElement>('[data-completar-error]', raiz);

  let ultimoIndice: Indice | null = null;

  const crear = <K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase?: string, texto?: string) => {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  // ─── Pintar progreso e índice ─────────────────────────────────────
  function pintarProgreso(i: Indice): void {
    $<HTMLElement>('[data-progreso-texto]', progreso).textContent = `${i.completadas} de ${i.total} clases, ${i.porcentaje} %`;
    const barra = $<HTMLElement>('[data-progreso-barra]', progreso);
    void barra.offsetWidth;
    barra.style.width = `${i.porcentaje}%`;
    progreso.setAttribute('aria-busy', 'false');
  }

  function marca(estado: 'hecha' | 'actual' | 'pendiente'): HTMLElement {
    const m = crear('span', `marca marca--${estado}`);
    m.setAttribute('aria-hidden', 'true');
    if (estado === 'hecha') m.append(plantilla('ic-check', raiz));
    return m;
  }

  function filaEvaluacion(i: Indice): HTMLElement {
    const { habilitada, aprobada, intentosUsados, intentosMax } = i.evaluacion;
    const quedan = intentosMax - intentosUsados;
    const textos = crear('span');
    let el: HTMLElement;
    if (aprobada) {
      el = crear('a', 'evaluacion-i');
      (el as HTMLAnchorElement).href = `/resultado/${cursoId}`;
      textos.append(crear('span', 'evaluacion-i__titulo', 'Evaluación final'), crear('span', 'evaluacion-i__texto', 'Aprobada. Ver tu resultado y certificado.'));
      el.append(marca('hecha'), textos);
    } else if (habilitada && quedan > 0) {
      el = crear('a', 'evaluacion-i');
      (el as HTMLAnchorElement).href = `/evaluacion/${cursoId}`;
      textos.append(
        crear('span', 'evaluacion-i__titulo', 'Evaluación final'),
        crear('span', 'evaluacion-i__texto', `Habilitada: te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`),
      );
      el.append(plantilla('ic-portapapeles', raiz), textos);
    } else {
      el = crear('div', 'evaluacion-i');
      textos.append(
        crear('span', 'evaluacion-i__titulo', 'Evaluación final'),
        crear('span', 'evaluacion-i__texto', habilitada ? 'Usaste tus 3 intentos.' : 'Se habilita al completar el 100 %'),
      );
      el.append(plantilla('ic-candado', raiz), textos);
    }
    return el;
  }

  function pintarIndice(i: Indice): void {
    ultimoIndice = i;
    $<HTMLElement>('[data-indice-resumen]', indice).textContent = `${i.completadas} de ${i.total} clases completadas`;
    const abiertos = new Set(
      [...lista.querySelectorAll<HTMLDetailsElement>('details[open]')].map((d) => d.dataset.modulo),
    );
    lista.replaceChildren(
      ...i.modulos.map((m) => {
        const tieneActual = m.clases.some((c) => c.id === claseId);
        const det = crear('details', 'modulo-i');
        det.dataset.modulo = String(m.numero);
        // Ley de Miller: los módulos terminados se pliegan; el actual queda abierto.
        det.open = tieneActual || abiertos.has(String(m.numero));
        const resumen = crear('summary', 'modulo-i__resumen');
        resumen.append(
          marca(m.completado ? 'hecha' : 'pendiente'),
          crear('span', 'clase-i__titulo', `Módulo ${m.numero}: ${m.titulo}`),
          m.completado ? crear('span', 'modulo-i__estado', 'Completado') : plantilla('ic-chevron', raiz),
        );
        const ol = crear('ol', 'modulo-i__clases');
        for (const c of m.clases) {
          const a = crear('a', 'clase-i');
          a.href = `/clase/${c.id}`;
          const actual = c.id === claseId;
          if (actual) a.setAttribute('aria-current', 'page');
          a.append(
            marca(c.completada ? 'hecha' : actual ? 'actual' : 'pendiente'),
            crear('span', 'clase-i__titulo', `${c.codigo} ${c.titulo}`),
            crear('span', 'clase-i__min', `${c.duracionMin} min`),
          );
          const estado = crear('span', 'solo-lector', c.completada ? ', completada' : actual ? ', clase actual' : ', pendiente');
          a.append(estado);
          const li = crear('li');
          li.append(a);
          ol.append(li);
        }
        det.append(resumen, ol);
        return det;
      }),
      filaEvaluacion(i),
    );
    cargando.hidden = true;
    error.hidden = true;
    lista.hidden = false;
    indice.setAttribute('aria-busy', 'false');
  }

  // ─── Cargar el índice ─────────────────────────────────────────────
  async function cargar(reintento = false): Promise<boolean> {
    if (simular === 'cargando') return new Promise(() => {});
    const inicio = performance.now();
    try {
      const { respuesta, datos } = await pedirJSON<Indice>(`/api/indice?curso=${cursoId}${sufijo ? `&${sufijo}` : ''}`);
      if (respuesta.status === 401) {
        window.location.assign(`/login?volver=/clase/${claseId}`);
        return false;
      }
      if (!respuesta.ok) throw new Error('servidor');
      await completarCarga(inicio);
      if (reintento) {
        retroalimentar(reconectar, 'exito', 'El índice del curso se cargó.');
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(reconectar, 'normal');
      }
      pintarProgreso(datos);
      pintarIndice(datos);
      prepararSiguiente(datos, raiz.dataset.completada !== undefined, null);
      return true;
    } catch {
      await completarCarga(inicio);
      cargando.hidden = true;
      lista.hidden = true;
      error.hidden = false;
      indice.setAttribute('aria-busy', 'false');
      $<HTMLElement>('[data-progreso-texto]', progreso).textContent = 'No disponible';
      progreso.setAttribute('aria-busy', 'false');
      if (reintento) retroalimentar(reconectar, 'error', 'El índice sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
      return false;
    }
  }

  // ─── Acción principal después de completar ───────────────────────
  /** Muestra "Siguiente clase" / "Ir a la evaluación" en lugar de "Marcar como completada". */
  function prepararSiguiente(i: Indice | null, completada: boolean, siguienteApi: { id: number; codigo: string; titulo: string } | null): void {
    if (!completada) {
      completarCaja.hidden = false;
      seguirCaja.hidden = true;
      hecha.hidden = true;
      return;
    }
    hecha.hidden = false;
    const texto = $<HTMLElement>('[data-seguir-texto]', seguir);
    if (i?.evaluacion.aprobada) {
      seguir.href = `/resultado/${cursoId}`;
      texto.textContent = 'Ver mi resultado';
    } else if (i?.evaluacion.habilitada) {
      seguir.href = `/evaluacion/${cursoId}`;
      texto.textContent = 'Ir a la evaluación';
    } else if (siguienteApi) {
      seguir.href = `/clase/${siguienteApi.id}`;
      texto.textContent = `Siguiente: ${siguienteApi.codigo}`;
      seguir.setAttribute('aria-label', `Siguiente clase: ${siguienteApi.codigo} ${siguienteApi.titulo}`);
    } else if (raiz.dataset.siguiente) {
      seguir.href = `/clase/${raiz.dataset.siguiente}`;
      texto.textContent = 'Siguiente clase';
      seguir.setAttribute('aria-label', `Siguiente clase: ${raiz.dataset.siguienteTexto}`);
    } else {
      seguir.href = '/mis-cursos';
      texto.textContent = 'Volver a Mis cursos';
    }
    completarCaja.hidden = true;
    seguirCaja.hidden = false;
  }

  // ─── Marcar como completada ───────────────────────────────────────
  completar.addEventListener('click', async () => {
    if (estaOcupado(completar)) return; // ningún envío doble
    procesar(completar); // 50 ms: "Guardando…"
    errorCompletar.hidden = true;
    const inicio = performance.now();
    let status = 0;
    let datos: { indice?: Indice; siguiente?: { id: number; codigo: string; titulo: string } | null; mensaje?: string } = {};
    try {
      const r = await pedirJSON<typeof datos>(`/api/progreso${sufijo ? `?${sufijo}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clase: claseId }),
      });
      status = r.respuesta.status;
      datos = r.datos;
    } catch (e) {
      datos.mensaje =
        (e as Error).message === 'sin-conexion'
          ? 'No hay conexión: tu avance no se guardó. Revisa tu red y vuelve a pulsar “Marcar como completada”.'
          : 'El servidor no respondió y tu avance no se guardó. Vuelve a intentarlo en un momento.';
    }
    await completarCarga(inicio);

    if (status === 200 && datos.indice) {
      const i = datos.indice;
      const fin = i.evaluacion.habilitada && !i.evaluacion.aprobada;
      retroalimentar(
        completar,
        'exito',
        fin ? '¡Completaste todas las clases! La evaluación final ya está habilitada.' : `Clase completada. Llevas ${i.porcentaje} % del curso.`,
      );
      raiz.dataset.completada = '';
      pintarProgreso(i);
      pintarIndice(i); // también si antes no había cargado: llegó con la respuesta
      await esperar(ESPERA_EXITO_MS); // se alcanza a ver el verde con check
      ponerEstado(completar, 'normal');
      prepararSiguiente(i, true, datos.siguiente ?? null);
      enfocar(seguir);
      return;
    }
    if (status === 401) {
      datos.mensaje = datos.mensaje ?? 'Tu sesión terminó. Vuelve a iniciar sesión.';
    }
    const texto = datos.mensaje ?? 'No pudimos guardar tu avance. Vuelve a intentarlo.';
    $<HTMLElement>('[data-completar-error-texto]', errorCompletar).textContent = texto;
    errorCompletar.hidden = false;
    retroalimentar(completar, 'error', texto);
  });

  reconectar.addEventListener('click', async () => {
    if (estaOcupado(reconectar)) return;
    procesar(reconectar);
    if (await cargar(true)) enfocar($<HTMLElement>('#indice-titulo'));
  });

  // Sin esperar al índice: el estado inicial del botón sale de lo que sabe el servidor.
  prepararSiguiente(ultimoIndice, raiz.dataset.completada !== undefined, null);
  void cargar().then((ok) => ok && anunciar(anuncio, 'Índice del curso cargado.'));
}
