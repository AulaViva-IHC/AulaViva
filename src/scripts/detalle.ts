// Detalle del curso: tarjeta de inscripción del estudiante (con sesión).
//   cargando → skeleton del botón
//   no inscrito → "Inscribirme gratis" (BotonMultimodal completo: Inscribiendo… → ¡Inscrito! → primera clase)
//   inscrito → avance + "Continuar curso" a la última clase vista
//   parcial → la inscripción no cargó: "No se pudo cargar esta parte" + "Reconectar"
// Ningún envío doble: el botón queda ocupado desde que se pulsa hasta cambiar de página.
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { $, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, simulacion } from './util';

type Estado =
  | { inscrito: false }
  | { inscrito: true; porcentaje: number; aprobado: boolean; continuar: { id: number; codigo: string; titulo: string } };

const raiz = document.querySelector<HTMLElement>('[data-inscripcion]');
if (raiz) iniciar(raiz);

function iniciar(raiz: HTMLElement): void {
  const slug = raiz.dataset.curso ?? '';
  const simular = simulacion();
  const sufijo = simular ? `&simular=${simular}` : '';

  const cargando = $<HTMLElement>('[data-inscripcion-cargando]', raiz);
  const nueva = $<HTMLElement>('[data-inscripcion-nueva]', raiz);
  const inscrito = $<HTMLElement>('[data-inscripcion-inscrito]', raiz);
  const error = $<HTMLElement>('[data-inscripcion-error]', raiz);
  const reconectar = $<HTMLElement>('[data-accion="reconectar"]', error);
  const inscribirme = $<HTMLButtonElement>('[data-inscribirme]', nueva);
  const mensaje = $<HTMLElement>('[data-inscripcion-mensaje]', nueva);

  function mostrar(cual: 'cargando' | 'nueva' | 'inscrito' | 'error'): void {
    cargando.hidden = cual !== 'cargando';
    nueva.hidden = cual !== 'nueva';
    inscrito.hidden = cual !== 'inscrito';
    error.hidden = cual !== 'error';
  }

  function pintarInscrito(e: Extract<Estado, { inscrito: true }>): void {
    $<HTMLElement>('[data-inscripcion-estado]', inscrito).textContent = e.aprobado ? 'Aprobaste este curso' : 'Ya estás inscrito';
    $<HTMLElement>('[data-inscripcion-porcentaje]', inscrito).textContent = `${e.porcentaje} % completado`;
    const continuar = $<HTMLAnchorElement>('[data-continuar]', inscrito);
    continuar.href = `/clase/${e.continuar.id}`;
    $<HTMLElement>('[data-continuar-texto]', inscrito).textContent = e.aprobado ? 'Repasar el curso' : 'Continuar curso';
    $<HTMLElement>('[data-continuar-clase]', inscrito).textContent = `Última clase: ${e.continuar.codigo} ${e.continuar.titulo}`;
    mostrar('inscrito');
    // Ya visible: se calcula el ancho inicial (0) y la barra crece con transición.
    const barra = $<HTMLElement>('[data-inscripcion-barra]', inscrito);
    void barra.offsetWidth;
    barra.style.width = `${e.porcentaje}%`;
  }

  async function cargar(reintento = false): Promise<boolean> {
    raiz.setAttribute('aria-busy', 'true');
    if (simular === 'cargando') return new Promise(() => {});
    const inicio = performance.now();
    try {
      const { respuesta, datos } = await pedirJSON<Estado>(`/api/inscripcion?curso=${encodeURIComponent(slug)}${sufijo}`);
      if (respuesta.status === 401) {
        window.location.assign(`/login?curso=${encodeURIComponent(slug)}`);
        return false;
      }
      if (!respuesta.ok) throw new Error('servidor');
      await completarCarga(inicio);
      if (reintento) {
        retroalimentar(reconectar, 'exito', 'Tu inscripción se cargó.');
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(reconectar, 'normal');
      }
      if (datos.inscrito) pintarInscrito(datos);
      else mostrar('nueva');
      return true;
    } catch {
      await completarCarga(inicio);
      mostrar('error');
      if (reintento) retroalimentar(reconectar, 'error', 'Tu inscripción sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
      return false;
    } finally {
      raiz.setAttribute('aria-busy', 'false');
    }
  }

  reconectar.addEventListener('click', async () => {
    if (estaOcupado(reconectar)) return;
    procesar(reconectar);
    if (await cargar(true)) {
      enfocar(nueva.hidden ? $<HTMLElement>('[data-continuar]', inscrito) : inscribirme);
    }
  });

  inscribirme.addEventListener('click', async () => {
    if (estaOcupado(inscribirme)) return; // ningún envío doble
    procesar(inscribirme);
    mensaje.hidden = true;
    const inicio = performance.now();
    let datos: { destino?: string; mensaje?: string } = {};
    let status = 0;
    try {
      const r = await pedirJSON<typeof datos>('/api/inscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curso: slug }),
      });
      datos = r.datos;
      status = r.respuesta.status;
    } catch (e) {
      datos = {
        mensaje:
          (e as Error).message === 'sin-conexion'
            ? 'No hay conexión a internet. Revisa tu red y vuelve a pulsar “Inscribirme gratis”.'
            : 'El servidor no respondió. Vuelve a intentarlo en un momento.',
      };
    }
    await completarCarga(inicio);

    if (status === 401) {
      window.location.assign(`/login?curso=${encodeURIComponent(slug)}`);
      return;
    }
    if (status === 201 && datos.destino) {
      retroalimentar(inscribirme, 'exito');
      await esperar(ESPERA_EXITO_MS);
      window.location.assign(datos.destino);
      return;
    }
    const texto = datos.mensaje ?? 'No pudimos inscribirte. Vuelve a intentarlo.';
    $<HTMLElement>('[data-inscripcion-mensaje-texto]', mensaje).textContent = texto;
    mensaje.hidden = false;
    retroalimentar(inscribirme, 'error', texto);
  });

  // Al volver con "Atrás" desde la clase, la tarjeta se actualiza (ya estás inscrito).
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      ponerEstado(inscribirme, 'normal');
      void cargar();
    }
  });

  void cargar();
}
