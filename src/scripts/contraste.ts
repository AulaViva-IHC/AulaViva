// Alto contraste (Act. 18) · se aplica al instante, sin recargar.
//   1. <html data-contraste="alto" | "normal">: src/styles/contraste.css hace el resto;
//   2. cookie "contraste" (1 año, SameSite=Lax, path=/): la próxima página ya llega así desde el servidor
//      (middleware.ts → Astro.locals.contraste → Publico.astro), sin parpadeo;
//   3. todos los interruptores de la página quedan con el mismo aria-pressed;
//   4. confirma con la firma de Éxito: "Alto contraste activado" / "desactivado" (visual + earcon + vibración + aria-live).
// Sin cookie manda prefers-contrast: more (script en línea de Publico.astro, que avisa con "contraste:cambio").
import { ponerEstado } from './boton';
import { retroalimentar } from './multimodal';
import { ESPERA_EXITO_MS, esperar } from './util';

const COOKIE = 'contraste';
const UN_ANO_S = 60 * 60 * 24 * 365;
const SELECTOR = '[data-contraste-interruptor]';

export function contrasteActivo(): boolean {
  return document.documentElement.dataset.contraste === 'alto';
}

function sincronizar(): void {
  const activo = String(contrasteActivo());
  for (const b of document.querySelectorAll<HTMLElement>(SELECTOR)) b.setAttribute('aria-pressed', activo);
}

let escuchando = false;

export function iniciarContraste(boton: HTMLButtonElement): void {
  sincronizar(); // p. ej. activado por prefers-contrast sin cookie
  if (!escuchando) {
    escuchando = true;
    document.addEventListener('contraste:cambio', sincronizar);
  }
  boton.addEventListener('click', async () => {
    const activar = !contrasteActivo();
    const html = document.documentElement;
    html.dataset.contraste = activar ? 'alto' : 'normal';
    html.dataset.contrasteElegido = ''; // desde ahora manda la elección, no la preferencia del sistema
    document.cookie = `${COOKIE}=${activar ? 'alto' : 'normal'}; Max-Age=${UN_ANO_S}; Path=/; SameSite=Lax`;
    sincronizar();
    const texto = activar ? boton.dataset.anuncioActivado : boton.dataset.anuncioDesactivado;
    retroalimentar(boton, 'exito', texto);
    await esperar(ESPERA_EXITO_MS);
    ponerEstado(boton, 'normal');
  });
}
