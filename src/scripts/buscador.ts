// Buscador de la barra superior (referencia 04b-inicio-buscador):
// sugerencias mientras escribes (máx. 3, Ley de Hick), búsquedas recientes guardadas
// en este dispositivo y navegación con teclado (patrón combobox de ARIA).
import { normalizarBusqueda } from '../lib/validacion';
import { anunciar, guardarLocal, leerLocal, plantilla } from './util';

interface Sugerencia {
  tipo: 'curso' | 'tema';
  texto: string;
  slug?: string;
}

interface Opcion {
  tipo: 'curso' | 'tema' | 'reciente';
  texto: string;
}

const CLAVE_RECIENTES = 'aulaviva:busquedas';
const MAX_RECIENTES = 3;
const ESPERA_ESCRITURA_MS = 120;

const raiz = document.querySelector<HTMLElement>('[data-buscador]');
if (raiz) iniciar(raiz);

function iniciar(raiz: HTMLElement): void {
  const input = raiz.querySelector<HTMLInputElement>('[data-buscar]')!;
  const form = raiz.querySelector<HTMLFormElement>('[data-buscador-form]')!;
  const panel = raiz.querySelector<HTMLElement>('[data-panel]')!;
  const lista = raiz.querySelector<HTMLUListElement>('[data-lista]')!;
  const pie = raiz.querySelector<HTMLElement>('[data-pie]')!;
  const pieTexto = raiz.querySelector<HTMLElement>('[data-pie-texto]')!;
  const borrar = raiz.querySelector<HTMLButtonElement>('[data-borrar-historial]')!;
  const anuncio = raiz.querySelector<HTMLElement>('[data-anuncio-buscador]')!;

  let sugerencias: Sugerencia[] = [];
  let consultaHecha = ''; // texto para el que ya llegaron sugerencias
  let buscando = false;
  let fallo = false;
  let opciones: { el: HTMLLIElement; opcion: Opcion }[] = [];
  let activo = -1;
  let temporizador = 0;
  let control: AbortController | null = null;

  // ─── Búsquedas recientes ─────────────────────────────────────────
  function leerRecientes(): string[] {
    try {
      const datos = JSON.parse(leerLocal(CLAVE_RECIENTES) ?? '[]');
      return Array.isArray(datos) ? datos.filter((d) => typeof d === 'string').slice(0, MAX_RECIENTES) : [];
    } catch {
      return [];
    }
  }
  function guardarReciente(texto: string): void {
    const limpio = texto.trim();
    if (!limpio) return;
    const sinRepetir = leerRecientes().filter((r) => normalizarBusqueda(r) !== normalizarBusqueda(limpio));
    guardarLocal(CLAVE_RECIENTES, JSON.stringify([limpio, ...sinRepetir].slice(0, MAX_RECIENTES)));
  }

  // ─── Pintar el panel ─────────────────────────────────────────────
  function resaltar(texto: string, consulta: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const q = normalizarBusqueda(consulta.trim());
    const i = q ? normalizarBusqueda(texto).indexOf(q) : -1;
    if (i < 0) {
      frag.append(texto);
      return frag;
    }
    const fuerte = document.createElement('strong');
    fuerte.textContent = texto.slice(i, i + q.length);
    frag.append(texto.slice(0, i), fuerte, texto.slice(i + q.length));
    return frag;
  }

  function grupo(texto: string): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'buscador__grupo';
    li.setAttribute('role', 'presentation');
    li.textContent = texto;
    return li;
  }

  function crearOpcion(opcion: Opcion, consulta: string): HTMLLIElement {
    const li = document.createElement('li');
    li.id = `buscar-opcion-${opciones.length}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.append(plantilla(opcion.tipo === 'reciente' ? 'icono-reciente' : `icono-${opcion.tipo}`, raiz));
    const texto = document.createElement('span');
    texto.className = 'opcion__texto';
    texto.append(opcion.tipo === 'reciente' ? opcion.texto : resaltar(opcion.texto, consulta));
    li.append(texto);
    if (opcion.tipo !== 'reciente') {
      const tipo = document.createElement('span');
      tipo.className = 'opcion__tipo';
      tipo.textContent = opcion.tipo === 'curso' ? 'Curso' : 'Tema';
      li.append(tipo);
    }
    // mousedown: elegir sin que el campo pierda el foco antes del clic
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => elegir(opcion));
    opciones.push({ el: li, opcion });
    return li;
  }

  function pintar(): void {
    const consulta = input.value.trim();
    const filas: HTMLLIElement[] = [];
    opciones = [];
    activo = -1;
    input.removeAttribute('aria-activedescendant');
    let nota = '';

    if (consulta.length >= 2) {
      filas.push(grupo(`Sugerencias para “${consulta}”`));
      if (consultaHecha === consulta) {
        for (const s of sugerencias) filas.push(crearOpcion({ tipo: s.tipo, texto: s.texto }, consulta));
      }
      if (buscando && consultaHecha !== consulta) {
        nota = 'Buscando…';
      } else if (fallo) {
        nota = 'No se pudieron cargar las sugerencias. Pulsa Enter para buscar en el catálogo.';
      } else if (consultaHecha === consulta && sugerencias.length === 0) {
        nota = `Sin sugerencias para “${consulta}”. Pulsa Enter para buscarlo en el catálogo.`;
      }
      if (nota) {
        const fila = grupo(nota);
        fila.className = 'buscador__nota';
        filas.push(fila);
      }
    }

    const recientes = leerRecientes().filter((r) => normalizarBusqueda(r) !== normalizarBusqueda(consulta));
    if (recientes.length) {
      filas.push(grupo('Búsquedas recientes'));
      for (const r of recientes) filas.push(crearOpcion({ tipo: 'reciente', texto: r }, consulta));
      pieTexto.textContent =
        recientes.length === 1 ? 'Tu última búsqueda' : `Tus últimas ${recientes.length} búsquedas`;
    }
    pie.hidden = recientes.length === 0;

    lista.replaceChildren(...filas);

    const hayAlgo = lista.children.length > 0;
    panel.hidden = !hayAlgo;
    input.setAttribute('aria-expanded', String(hayAlgo));
  }

  function cerrar(): void {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activo = -1;
  }

  function mover(indice: number): void {
    if (!opciones.length) return;
    if (activo >= 0) opciones[activo].el.setAttribute('aria-selected', 'false');
    activo = (indice + opciones.length) % opciones.length;
    const { el } = opciones[activo];
    el.setAttribute('aria-selected', 'true');
    el.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', el.id);
  }

  // ─── Ir al resultado ─────────────────────────────────────────────
  function ir(texto: string): void {
    guardarReciente(texto);
    cerrar();
    anunciar(anuncio, `Buscando ${texto}…`);
    window.location.assign(`/catalogo?q=${encodeURIComponent(texto)}`);
  }

  function elegir(opcion: Opcion): void {
    input.value = opcion.texto;
    ir(opcion.texto);
  }

  // ─── Pedir sugerencias ───────────────────────────────────────────
  async function pedir(consulta: string): Promise<void> {
    control?.abort();
    control = new AbortController();
    buscando = true;
    fallo = false;
    try {
      const r = await fetch(`/api/buscar?q=${encodeURIComponent(consulta)}`, { signal: control.signal });
      if (!r.ok) throw new Error(String(r.status));
      const datos = (await r.json()) as { sugerencias: Sugerencia[] };
      sugerencias = datos.sugerencias;
      consultaHecha = consulta;
      buscando = false;
      if (document.activeElement === input) {
        pintar();
        anunciar(
          anuncio,
          sugerencias.length
            ? `${sugerencias.length} ${sugerencias.length === 1 ? 'sugerencia' : 'sugerencias'}.`
            : 'Sin sugerencias.',
        );
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      buscando = false;
      fallo = true;
      sugerencias = [];
      consultaHecha = consulta;
      if (document.activeElement === input) pintar();
    }
  }

  // ─── Eventos ─────────────────────────────────────────────────────
  input.addEventListener('focus', pintar);

  input.addEventListener('input', () => {
    const consulta = input.value.trim();
    window.clearTimeout(temporizador);
    if (consulta.length >= 2) {
      buscando = true;
      temporizador = window.setTimeout(() => void pedir(consulta), ESPERA_ESCRITURA_MS);
    } else {
      control?.abort();
      buscando = false;
    }
    pintar();
  });

  input.addEventListener('keydown', (e) => {
    const abierto = !panel.hidden;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!abierto) pintar();
        mover(activo + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!abierto) pintar();
        mover(activo <= 0 ? opciones.length - 1 : activo - 1);
        break;
      case 'Enter':
        if (abierto && activo >= 0) {
          e.preventDefault();
          elegir(opciones[activo].opcion);
        }
        break; // sin opción activa: el formulario se envía (ver "submit")
      case 'Escape':
        if (abierto) cerrar();
        else input.value = '';
        break;
      case 'Tab':
        cerrar();
        break;
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const consulta = input.value.trim();
    if (consulta) ir(consulta);
  });

  raiz.addEventListener('focusout', (e) => {
    if (!raiz.contains(e.relatedTarget as Node | null)) cerrar();
  });

  borrar.addEventListener('mousedown', (e) => e.preventDefault());
  borrar.addEventListener('click', () => {
    guardarLocal(CLAVE_RECIENTES, null);
    pintar();
    input.focus();
    anunciar(anuncio, 'Historial de búsquedas borrado.');
  });

  document.addEventListener('keydown', (e) => {
    // Atajo: "/" lleva al buscador (si no se está escribiendo en otro campo).
    const t = e.target as HTMLElement;
    if (e.key === '/' && !t.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault();
      input.focus();
    }
  });
}
