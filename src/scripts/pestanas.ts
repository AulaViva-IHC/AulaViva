// Pestañas ARIA de Pestanas.astro: clic, flechas, Inicio y Fin (activación automática).
// El clic + vibración al presionar ya lo da la escucha global de multimodal.ts (role="tab").
// Avisa con el evento "pestana" (detail = id) por si la página necesita reaccionar.

function seleccionar(lista: HTMLElement, pestana: HTMLElement, enfocar: boolean): void {
  for (const p of lista.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const activa = p === pestana;
    p.setAttribute('aria-selected', String(activa));
    p.tabIndex = activa ? 0 : -1;
    const panel = document.getElementById(p.getAttribute('aria-controls') ?? '');
    if (panel) panel.hidden = !activa;
  }
  if (enfocar) pestana.focus();
  lista.dispatchEvent(new CustomEvent('pestana', { detail: pestana.dataset.pestana, bubbles: true }));
}

let iniciado = false;

export function iniciarPestanas(): void {
  if (iniciado) return;
  iniciado = true;

  document.addEventListener('click', (e) => {
    const pestana = (e.target as Element).closest<HTMLElement>('[data-pestanas] [role="tab"]');
    if (!pestana) return;
    seleccionar(pestana.closest<HTMLElement>('[data-pestanas]')!, pestana, false);
  });

  document.addEventListener('keydown', (e) => {
    const actual = (e.target as Element).closest<HTMLElement>('[data-pestanas] [role="tab"]');
    if (!actual) return;
    const lista = actual.closest<HTMLElement>('[data-pestanas]')!;
    const todas = [...lista.querySelectorAll<HTMLElement>('[role="tab"]')];
    const i = todas.indexOf(actual);
    const destino = {
      ArrowRight: todas[(i + 1) % todas.length],
      ArrowLeft: todas[(i - 1 + todas.length) % todas.length],
      Home: todas[0],
      End: todas[todas.length - 1],
    }[e.key];
    if (!destino) return;
    e.preventDefault();
    seleccionar(lista, destino, true);
  });
}

/** Selecciona una pestaña desde código (p. ej. al cargar con ?pestana=). */
export function irAPestana(id: string): void {
  const pestana = document.querySelector<HTMLElement>(`[data-pestanas] [data-pestana="${CSS.escape(id)}"]`);
  if (pestana) seleccionar(pestana.closest<HTMLElement>('[data-pestanas]')!, pestana, false);
}
