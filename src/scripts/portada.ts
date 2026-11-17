// Encabezado de la portada pública: el curso destacado se pide aparte del catálogo.
//   cargando → skeleton del título y la bajada
//   ideal    → título, bajada y "Ver el curso"
//   parcial  → "No se pudo cargar esta parte" + "Reconectar"; el catálogo de abajo sigue funcionando
// Act. 17: los anuncios salen de t() en el idioma actual; el título y la bajada del curso salen en
// quechua si el curso los tiene (campo qu) y se vuelven a pintar con el evento "idioma:cambio".
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { $, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, simulacion } from './util';
import { EVENTO_IDIOMA, idiomaActual, tr } from './idioma';
import type { Idioma } from '../i18n';

interface Destacado {
  slug: string;
  titulo: string;
  descripcion: string;
  qu: { titulo: string; descripcion: string } | null;
}

let destacado: Destacado | null = null;

/** Título y bajada del curso en el idioma actual (con su lang, para el lector de pantalla). */
function pintarDestacado(idioma: Idioma): void {
  if (!destacado) return;
  const textos = idioma === 'qu' && destacado.qu ? { ...destacado.qu, lang: 'qu' } : { ...destacado, lang: 'es' };
  const titulo = $<HTMLElement>('[data-destacado-titulo]', contenido);
  const descripcion = $<HTMLElement>('[data-destacado-descripcion]', contenido);
  titulo.textContent = textos.titulo;
  descripcion.textContent = textos.descripcion;
  titulo.lang = descripcion.lang = textos.lang;
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
      retroalimentar(reconectar, 'exito', tr(idiomaActual(), 'heroe.cargado'));
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    cargando.hidden = true;
    error.hidden = true;
    if (!datos.curso) return true; // sin cursos publicados: queda "Ver todos los cursos"
    destacado = datos.curso;
    pintarDestacado(idiomaActual());
    $<HTMLAnchorElement>('[data-destacado-enlace]', accion).href = `/cursos/${datos.curso.slug}`;
    contenido.hidden = false;
    accion.hidden = false;
    return true;
  } catch {
    await completarCarga(inicio);
    cargando.hidden = true;
    error.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', tr(idiomaActual(), 'heroe.sigueSinCargar'));
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

document.addEventListener(EVENTO_IDIOMA, (e) => pintarDestacado((e as CustomEvent<Idioma>).detail));

void cargar();
