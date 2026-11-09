// Cambia el estado visual de un <Boton> (bucle perceptual).
export type EstadoBoton = 'normal' | 'cargando' | 'exito' | 'error';

export function ponerEstado(boton: HTMLElement, estado: EstadoBoton): void {
  // Reiniciar la animación si se repite el mismo estado (p. ej. dos errores seguidos).
  if (boton.dataset.estado === estado) {
    boton.dataset.estado = 'normal';
    void boton.offsetWidth;
  }
  boton.dataset.estado = estado;

  const ocupado = estado === 'cargando' || estado === 'exito';
  if (estado === 'cargando') boton.setAttribute('aria-busy', 'true');
  else boton.removeAttribute('aria-busy');
  if (ocupado) boton.setAttribute('aria-disabled', 'true');
  else boton.removeAttribute('aria-disabled');

  if (estado === 'error') {
    // La sacudida dura 320 ms; luego el botón vuelve a estar listo.
    window.setTimeout(() => {
      if (boton.dataset.estado === 'error') boton.dataset.estado = 'normal';
    }, 340);
  }
}

/** true mientras procesa o ya terminó: así ningún botón se envía dos veces. */
export function estaOcupado(boton: HTMLElement): boolean {
  return (
    boton.dataset.estado === 'cargando' ||
    boton.dataset.estado === 'exito' ||
    (boton as HTMLButtonElement).disabled
  );
}

/** Cambia el texto que acompaña al giro o al check. */
export function textosBoton(boton: HTMLElement, textos: { cargando?: string; exito?: string }): void {
  const cargando = boton.querySelector<HTMLElement>('[data-texto-cargando]');
  const exito = boton.querySelector<HTMLElement>('[data-texto-exito]');
  if (textos.cargando && cargando) cargando.textContent = textos.cargando;
  if (textos.exito && exito) exito.textContent = textos.exito;
}
