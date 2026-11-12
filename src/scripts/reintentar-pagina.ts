// "Reintentar" de las páginas que arma el servidor (p. ej. el detalle del curso).
// Antes de recargar pregunta al servidor si la página ya responde: así el BotonMultimodal
// da el éxito (verde + earcon + vibración) o el error (sacudida + aviso) con el resultado real.
// Uso: un contenedor con data-reintentar-pagina que tenga dentro <EstadoError multimodal />.
import { estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { completarCarga, ESPERA_EXITO_MS, esperar } from './util';

for (const contenedor of document.querySelectorAll<HTMLElement>('[data-reintentar-pagina]')) {
  const boton = contenedor.querySelector<HTMLElement>('[data-accion="reintentar"]');
  boton?.addEventListener('click', async () => {
    if (estaOcupado(boton)) return;
    procesar(boton);
    const inicio = performance.now();
    let ok = false;
    try {
      const respuesta = await fetch(window.location.href, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      ok = respuesta.ok;
    } catch {
      ok = false;
    }
    await completarCarga(inicio);
    if (ok) {
      retroalimentar(boton, 'exito', 'La página ya responde. Cargando…');
      await esperar(ESPERA_EXITO_MS);
      window.location.reload();
    } else {
      retroalimentar(boton, 'error', 'La página sigue sin responder. Revisa tu conexión y vuelve a intentarlo.');
    }
  });
}
