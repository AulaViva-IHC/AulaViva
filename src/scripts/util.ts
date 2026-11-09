// Utilidades compartidas por los scripts del navegador.

export const $ = <T extends Element>(selector: string, raiz: ParentNode = document) =>
  raiz.querySelector<T>(selector)!;

export const $$ = <T extends Element>(selector: string, raiz: ParentNode = document) => [
  ...raiz.querySelectorAll<T>(selector),
];

export const esperar = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Tiempo mínimo del estado "cargando": el giro se alcanza a ver y no parpadea. */
export const CARGA_MINIMA_MS = 350;
/** Tiempo para ver el estado de éxito antes de cambiar de página. */
export const ESPERA_EXITO_MS = 700;

/** Último correo usado en este dispositivo (lo escriben login y registro, lo lee el login). */
export const CLAVE_ULTIMO_CORREO = 'aulaviva:ultimoCorreo';

/** Espera lo que falte para completar CARGA_MINIMA_MS desde `inicio`. */
export function completarCarga(inicio: number): Promise<void> {
  return esperar(Math.max(0, CARGA_MINIMA_MS - (performance.now() - inicio)));
}

/** Estado forzado por ?simular= (solo desarrollo; lo usa /estados). */
export function simulacion(): string {
  return document.body.dataset.simular ?? '';
}

/** Dentro de /estados (iframes) no robamos el foco de la página principal. */
export const enIframe = window.self !== window.top;
export function enfocar(el: HTMLElement | null | undefined): void {
  if (el && !enIframe) el.focus();
}

// localStorage puede fallar (modo privado, sitio bloqueado): todo funciona igual sin él.
// En modo simulación no se lee ni se escribe, para no mezclar datos reales.
export function leerLocal(clave: string): string | null {
  if (simulacion()) return null;
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
export function guardarLocal(clave: string, valor: string | null): void {
  if (simulacion()) return;
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento */
  }
}

/** Anuncia un texto a lectores de pantalla en una región aria-live. */
export function anunciar(region: HTMLElement, texto: string): void {
  region.textContent = '';
  window.setTimeout(() => (region.textContent = texto), 30);
}

/** Clona el contenido de un <template data-plantilla="nombre">. */
export function plantilla(nombre: string, raiz: ParentNode = document): DocumentFragment {
  const t = raiz.querySelector<HTMLTemplateElement>(`template[data-plantilla="${nombre}"]`)!;
  return t.content.cloneNode(true) as DocumentFragment;
}

/** Semáforo de entregas: siempre con texto (CLAUDE.md §5.7). */
export function semaforo(dias: number): { tono: 'rojo' | 'naranja' | 'verde'; texto: string } {
  if (dias <= 0) return { tono: 'rojo', texto: 'Vence hoy' };
  if (dias === 1) return { tono: 'naranja', texto: 'Mañana' };
  if (dias === 2) return { tono: 'naranja', texto: 'En 2 días' };
  return { tono: 'verde', texto: `En ${dias} días` };
}

/** "Mié 28" para una fecha a `dias` de hoy. */
export function fechaCorta(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  const dia = new Intl.DateTimeFormat('es-PE', { weekday: 'short' }).format(fecha).replace('.', '');
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${fecha.getDate()}`;
}

/** Pide JSON con límite de tiempo. Lanza 'sin-conexion' | 'servidor' si no se pudo. */
export async function pedirJSON<T>(url: string, init: RequestInit = {}, ms = 12000): Promise<{ respuesta: Response; datos: T }> {
  if (!navigator.onLine) throw new Error('sin-conexion');
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(ms) });
  } catch (e) {
    if ((e as Error).name === 'AbortError' && init.signal?.aborted) throw e;
    throw new Error(navigator.onLine ? 'servidor' : 'sin-conexion');
  }
  const datos = (await respuesta.json().catch(() => ({}))) as T;
  return { respuesta, datos };
}
