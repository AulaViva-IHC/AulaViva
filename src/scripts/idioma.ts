// Selector de idioma (Act. 17) · español / quechua, sin recargar la página.
// Al elegir un idioma:
//   1. guarda la cookie "idioma" (1 año, SameSite=Lax, path=/): la próxima carga ya llega traducida
//      desde el servidor (middleware.ts → Astro.locals.idioma), sin parpadeo;
//   2. reemplaza al instante los textos marcados en el HTML:
//        data-i18n="clave"                    → textContent (con data-i18n-n para {n})
//        data-i18n-attr="aria-label:clave;title:otra" → atributos (aria-label, title, placeholder…)
//        data-i18n-lang                       → atributo lang de esa región
//        <time data-formato="fecha-hora">     → fecha y hora regionales
//      también dentro de los <template>, para que lo que se pinte después ya salga traducido;
//   3. actualiza <html lang>, document.title y la descripción (solo en páginas traducidas);
//   4. avisa con el evento "idioma:cambio" (catalogo.ts vuelve a pintar las tarjetas);
//   5. confirma con la firma de Éxito (visual + earcon + vibración + aria-live).
import { COOKIE_IDIOMA, esIdioma, estresar, formatearFechaHora, t, type Idioma, type Variables } from '../i18n';
import { ponerEstado } from './boton';
import { retroalimentar } from './multimodal';
import { ESPERA_EXITO_MS, esperar } from './util';

export const EVENTO_IDIOMA = 'idioma:cambio';
const UN_ANO_S = 60 * 60 * 24 * 365;

/** Idioma con el que el servidor pintó la página (o el último elegido). */
export function idiomaActual(): Idioma {
  const valor = document.documentElement.dataset.idioma;
  return esIdioma(valor) ? valor : 'es';
}

/** ?i18n=estres (solo desarrollo): el servidor marca <html data-i18n-modo="estres">. */
export function enEstres(): boolean {
  return document.documentElement.dataset.i18nModo === 'estres';
}

/** t() del navegador: respeta el modo estrés. */
export function tr(idioma: Idioma, clave: string, variables?: Variables): string {
  const texto = t(idioma, clave, variables);
  return enEstres() ? estresar(texto) : texto;
}

function variablesDe(el: HTMLElement): Variables | undefined {
  return el.dataset.i18nN !== undefined ? { n: el.dataset.i18nN } : undefined;
}

/** Traduce todo lo marcado dentro de `raiz`. */
export function aplicarIdioma(idioma: Idioma, raiz: ParentNode = document): void {
  for (const el of raiz.querySelectorAll<HTMLElement>('[data-i18n]')) {
    if (el.dataset.i18n) el.textContent = tr(idioma, el.dataset.i18n, variablesDe(el));
  }
  for (const el of raiz.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const par of (el.dataset.i18nAttr ?? '').split(';')) {
      const [atributo, clave] = par.split(':').map((s) => s.trim());
      if (atributo && clave) el.setAttribute(atributo, tr(idioma, clave, variablesDe(el)));
    }
  }
  for (const el of raiz.querySelectorAll<HTMLElement>('[data-i18n-lang]')) el.lang = idioma;
  for (const el of raiz.querySelectorAll<HTMLTimeElement>('time[data-formato="fecha-hora"]')) {
    el.textContent = formatearFechaHora(el.dateTime, idioma);
  }
}

export function cambiarIdioma(idioma: Idioma): void {
  const html = document.documentElement;
  html.dataset.idioma = idioma;
  document.cookie = `${COOKIE_IDIOMA}=${idioma}; Max-Age=${UN_ANO_S}; Path=/; SameSite=Lax`;

  aplicarIdioma(idioma);
  for (const plantilla of document.querySelectorAll('template')) aplicarIdioma(idioma, plantilla.content);

  // Solo las páginas traducidas por completo cambian el idioma del documento.
  if (html.dataset.i18nTitulo) {
    html.lang = idioma;
    document.title = `${tr(idioma, html.dataset.i18nTitulo)} · AulaViva`;
  }
  if (html.dataset.i18nDescripcion) {
    document.querySelector('meta[name="description"]')?.setAttribute('content', tr(idioma, html.dataset.i18nDescripcion));
  }
  document.dispatchEvent(new CustomEvent<Idioma>(EVENTO_IDIOMA, { detail: idioma }));
}

/** Grupo de botones con aria-pressed de CabeceraPublica.astro. */
export function iniciarSelector(grupo: HTMLElement): void {
  const opciones = [...grupo.querySelectorAll<HTMLButtonElement>('[data-idioma-opcion]')];
  for (const boton of opciones) {
    boton.addEventListener('click', async () => {
      const elegido = boton.dataset.idiomaOpcion;
      if (!esIdioma(elegido) || boton.getAttribute('aria-pressed') === 'true') return;
      for (const b of opciones) b.setAttribute('aria-pressed', String(b === boton));
      cambiarIdioma(elegido);
      // "Idioma: Quechua" / "Idioma: Español"
      retroalimentar(boton, 'exito', `${t(elegido, 'idioma.etiqueta')}: ${t(elegido, `idioma.${elegido}`)}`);
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(boton, 'normal');
    });
  }
}
