// Muestra u oculta el error de un <Campo>. El mensaje se anuncia por aria-live.

export type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function partes(input: Control) {
  const campo = input.closest<HTMLElement>('[data-campo]');
  const mensaje = campo?.querySelector<HTMLElement>('[data-mensaje]');
  return { campo, mensaje };
}

/** Sacudida corta (bucle perceptual: error a los 200 ms). */
export function sacudir(el: Element | null | undefined): void {
  if (!el) return;
  el.classList.remove('anima-sacudida');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('anima-sacudida');
}

export function mostrarError(
  input: Control,
  mensaje: string | Node,
  opciones: { sacudir?: boolean } = {},
): void {
  const { campo, mensaje: nodo } = partes(input);
  if (!campo || !nodo) return;
  campo.classList.add('is-error');
  input.setAttribute('aria-invalid', 'true');
  nodo.replaceChildren(mensaje);
  if (opciones.sacudir) sacudir(campo.querySelector('.campo__control'));
}

export function limpiarError(input: Control): void {
  const { campo, mensaje } = partes(input);
  if (!campo || !mensaje) return;
  campo.classList.remove('is-error');
  input.removeAttribute('aria-invalid');
  mensaje.replaceChildren();
}

export function tieneError(input: Control): boolean {
  return input.getAttribute('aria-invalid') === 'true';
}
