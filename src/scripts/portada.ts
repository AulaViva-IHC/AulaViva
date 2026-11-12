// Encabezado de la portada pública: el curso destacado se pide aparte del catálogo.
//   cargando → skeleton del título y la bajada
//   ideal    → título, bajada y "Ver el curso"
//   parcial  → "No se pudo cargar esta parte" + "Reconectar"; el catálogo de abajo sigue funcionando
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { $, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, simulacion } from './util';

interface Destacado {
  slug: string;
  titulo: string;
  descripcion: string;
}

const raiz = $<HTMLElement>('[data-destacado]');
const cargando = $<HTMLElement>('[data-destacado-cargando]', raiz);
const contenido = $<HTMLElement>('[data-destacado-contenido]', raiz);
const error = $<HTMLElement>('[data-destacado-error]', raiz);
const accion = $<HTMLElement>('[data-destacado-accion]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', error);
const simular = simulacion();
const sufijo = simular ? `?simular=${simular}` : '';

async function cargar(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ curso: Destacado | null }>(`/api/cursos/destacado${sufijo}`);
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', 'Curso destacado cargado.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    cargando.hidden = true;
    error.hidden = true;
    if (!datos.curso) return true; // sin cursos publicados: queda "Ver todos los cursos"
    $<HTMLElement>('[data-destacado-titulo]', contenido).textContent = datos.curso.titulo;
    $<HTMLElement>('[data-destacado-descripcion]', contenido).textContent = datos.curso.descripcion;
    $<HTMLAnchorElement>('[data-destacado-enlace]', accion).href = `/cursos/${datos.curso.slug}`;
    contenido.hidden = false;
    accion.hidden = false;
    return true;
  } catch {
    await completarCarga(inicio);
    cargando.hidden = true;
    error.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', 'El curso destacado sigue sin cargar. Revisa tu conexión.');
    return false;
  } finally {
    raiz.setAttribute('aria-busy', 'false');
  }
}

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargar(true)) enfocar($<HTMLAnchorElement>('[data-destacado-enlace]', accion));
});

void cargar();
