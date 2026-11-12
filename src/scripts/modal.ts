// Modales <dialog> de Modal.astro. showModal() ya atrapa el foco y cierra con Esc;
// aquí se recuerda qué control lo abrió para devolverle el foco al cerrar (WCAG 2.4.3).
// Un botón con data-cerrar-modal dentro del diálogo lo cierra.
// Cerrar con Esc o con clic en el fondo suena con la firma de Cancelación (Act. 14).
import { retroalimentar } from './multimodal';

const origen = new WeakMap<HTMLDialogElement, HTMLElement | null>();

export function abrirModal(id: string, foco?: HTMLElement | null): HTMLDialogElement | null {
  const dialogo = document.getElementById(id) as HTMLDialogElement | null;
  if (!dialogo || dialogo.open) return dialogo;
  origen.set(dialogo, document.activeElement as HTMLElement | null);
  dialogo.showModal();
  (foco ?? dialogo.querySelector<HTMLElement>('[autofocus], button, a[href], input'))?.focus();
  return dialogo;
}

export function cerrarModal(id: string): void {
  const dialogo = document.getElementById(id) as HTMLDialogElement | null;
  if (dialogo?.open) dialogo.close();
}

let iniciado = false;

export function iniciarModales(): void {
  if (iniciado) return;
  iniciado = true;
  document.addEventListener('click', (e) => {
    const boton = (e.target as Element).closest<HTMLElement>('[data-cerrar-modal]');
    boton?.closest<HTMLDialogElement>('dialog')?.close();
  });
  for (const dialogo of document.querySelectorAll<HTMLDialogElement>('dialog[data-modal]')) {
    dialogo.addEventListener('close', () => {
      const anterior = origen.get(dialogo);
      if (anterior?.isConnected) anterior.focus();
    });
    // Clic en el fondo oscuro: cierra (salvo mientras se envía algo).
    dialogo.addEventListener('click', (e) => {
      if (e.target !== dialogo || dialogo.querySelector('[data-estado="cargando"], [data-estado="exito"]')) return;
      dialogo.close();
      retroalimentar(null, 'cancelacion', 'Ventana cerrada sin cambios.');
    });
    // Esc tampoco cierra mientras se envía (ningún envío queda a medias sin aviso).
    dialogo.addEventListener('cancel', (e) => {
      if (dialogo.querySelector('[data-estado="cargando"], [data-estado="exito"]')) e.preventDefault();
      else retroalimentar(null, 'cancelacion', 'Ventana cerrada sin cambios.');
    });
  }
}
