// Catálogo de cursos (CatalogoCursos.astro) con los 5 estados reales:
//   ideal    → la rejilla con los cursos que pasan los filtros
//   vacío    → ningún curso con estos filtros: "Limpiar filtros"
//   cargando → 6 tarjetas skeleton
//   error    → no cargó la lista: qué pasó + "Reintentar"
//   parcial  → con sesión, la lista cargó pero "tu avance" no: "Reconectar"
//              (en la portada, el parcial es el curso destacado: ver portada.ts)
// Los filtros quedan en la URL (?categoria=&nivel=&q=) sin recargar la página.
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { $, $$, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';
import { normalizarBusqueda } from '../lib/validacion';

interface CursoResumen {
  slug: string;
  titulo: string;
  resumen: string;
  categoria: string;
  nivel: 'basico' | 'intermedio' | 'avanzado';
  horas: number;
  clases: number;
  etiqueta: 'destacado' | 'nuevo' | null;
  color: string;
  icono: string;
  buscable: string;
}
interface Avance {
  slug: string;
  porcentaje: number;
  aprobado: boolean;
}

const raiz = document.querySelector<HTMLElement>('[data-catalogo]');
if (raiz) iniciar(raiz);

function iniciar(raiz: HTMLElement): void {
  const simular = simulacion();
  const sufijo = simular ? `?simular=${simular}` : '';
  const conSesion = raiz.dataset.sesion !== undefined;
  const destacadoPrincipal = raiz.dataset.destacadoPrincipal !== undefined;

  const rejilla = $<HTMLUListElement>('[data-rejilla]', raiz);
  const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
  const error = $<HTMLElement>('[data-region="error"]', raiz);
  const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
  const limpiar = $<HTMLButtonElement>('[data-limpiar]', vacio);
  const anuncio = $<HTMLElement>('[data-anuncio-catalogo]', raiz);
  const busqueda = $<HTMLElement>('[data-busqueda]', raiz);
  const botonesCategoria = $$<HTMLButtonElement>('[data-categoria]', raiz);
  const botonesNivel = $$<HTMLButtonElement>('[data-nivel]', raiz);
  const avanceError = raiz.querySelector<HTMLElement>('[data-avance-error]');

  // ─── Filtros (desde la URL) ───────────────────────────────────────
  const url = new URL(window.location.href);
  const filtros = {
    categoria: url.searchParams.get('categoria') ?? '',
    nivel: url.searchParams.get('nivel') ?? '',
    q: (url.searchParams.get('q') ?? '').trim().slice(0, 80),
  };
  if (!botonesCategoria.some((b) => b.dataset.categoria === filtros.categoria)) filtros.categoria = '';
  if (!botonesNivel.some((b) => b.dataset.nivel === filtros.nivel)) filtros.nivel = '';
  // /estados: el vacío se muestra con una combinación de filtros sin cursos.
  if (simular === 'vacio') Object.assign(filtros, { categoria: 'diseno', nivel: 'avanzado', q: '' });

  let cursos: CursoResumen[] = [];
  let avance = new Map<string, Avance>();
  let cargado = false;

  function guardarEnURL(): void {
    if (simular) return; // dentro de /estados la URL no cambia
    const u = new URL(window.location.href);
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor) u.searchParams.set(clave, valor);
      else u.searchParams.delete(clave);
    }
    history.replaceState(null, '', u);
  }

  function pintarFiltros(): void {
    for (const b of botonesCategoria) b.setAttribute('aria-pressed', String(b.dataset.categoria === filtros.categoria));
    for (const b of botonesNivel) b.setAttribute('aria-pressed', String(b.dataset.nivel === filtros.nivel));
    busqueda.hidden = !filtros.q;
    $<HTMLElement>('[data-busqueda-texto]', busqueda).textContent = filtros.q;
  }

  function filtrados(): CursoResumen[] {
    const palabras = normalizarBusqueda(filtros.q).split(/\s+/).filter((p) => p.length > 1);
    return cursos.filter(
      (c) =>
        (!filtros.categoria || c.categoria === filtros.categoria) &&
        (!filtros.nivel || c.nivel === filtros.nivel) &&
        palabras.every((p) => c.buscable.includes(p)),
    );
  }

  // ─── Pintar ───────────────────────────────────────────────────────
  const NIVEL = { basico: 'Nivel básico', intermedio: 'Nivel intermedio', avanzado: 'Nivel avanzado' };

  function tarjeta(c: CursoResumen): DocumentFragment {
    const t = plantilla('curso', raiz);
    const portada = $<HTMLElement>('[data-portada]', t);
    portada.style.setProperty('--portada', c.color);
    $<HTMLElement>('[data-portada-icono]', t).append(plantilla(`icono-${c.icono}`, raiz));
    if (c.etiqueta) $<HTMLElement>('[data-portada-etiqueta]', t).append(plantilla(`etiqueta-${c.etiqueta}`, raiz));
    $<HTMLElement>('[data-titulo]', t).textContent = c.titulo;
    $<HTMLElement>('[data-resumen]', t).textContent = c.resumen;
    $<HTMLElement>('[data-clases]', t).textContent = `${c.clases} clases`;
    $<HTMLElement>('[data-horas]', t).textContent = `${c.horas} horas`;
    $<HTMLElement>('[data-nivel]', t).textContent = NIVEL[c.nivel];
    const ver = $<HTMLAnchorElement>('[data-ver]', t);
    ver.href = `/cursos/${c.slug}`;
    ver.dataset.slug = c.slug;
    $<HTMLElement>('[data-ver-titulo]', t).textContent = `: ${c.titulo}`;
    // Ley de Hick: solo la tarjeta destacada lleva la acción amarilla (y solo en /catalogo).
    if (destacadoPrincipal && c.etiqueta === 'destacado') ver.classList.replace('boton--secundario', 'boton--principal');
    pintarAvance(t, c.slug);
    return t;
  }

  function pintarAvance(contenedor: ParentNode, slug: string): void {
    const caja = contenedor.querySelector<HTMLElement>('[data-avance]');
    if (!caja) return;
    const a = avance.get(slug);
    caja.hidden = !a;
    caja.replaceChildren();
    if (!a) return;
    const badge = plantilla(a.aprobado ? 'avance-aprobado' : 'avance-inscrito', raiz);
    $<HTMLElement>('[data-badge-texto]', badge).textContent = a.aprobado ? 'Aprobado' : `Inscrito · ${a.porcentaje} %`;
    caja.append(badge);
  }

  function mostrar(region: 'rejilla' | 'vacio' | 'error'): void {
    rejilla.hidden = region !== 'rejilla';
    vacio.hidden = region !== 'vacio';
    error.hidden = region !== 'error';
  }

  function pintar(anunciarCambio = true): void {
    pintarFiltros();
    const lista = filtrados();
    if (lista.length === 0) {
      mostrar('vacio');
      $<HTMLElement>('h2', vacio).textContent = filtros.q
        ? `No encontramos cursos para “${filtros.q}”`
        : 'No hay cursos con estos filtros';
      if (anunciarCambio) anunciar(anuncio, 'Ningún curso coincide. Puedes limpiar los filtros.');
      return;
    }
    rejilla.replaceChildren(...lista.map(tarjeta));
    mostrar('rejilla');
    if (anunciarCambio) anunciar(anuncio, lista.length === 1 ? '1 curso' : `${lista.length} cursos`);
  }

  // ─── Cargar la lista ──────────────────────────────────────────────
  async function cargar(reintento = false): Promise<boolean> {
    rejilla.setAttribute('aria-busy', 'true');
    // Firma de Progreso (Act. 14): carga automática → gotas solo si tarda más de 1 s, sin campanita al final.
    const progreso = reintento ? null : iniciarProgreso(rejilla, { automatico: true, texto: 'Cargando los cursos' });
    if (simular === 'cargando') return new Promise(() => {}); // se queda en skeleton (solo /estados)
    const inicio = performance.now();
    try {
      const { respuesta, datos } = await pedirJSON<{ cursos: CursoResumen[] }>(`/api/cursos${sufijo}`);
      if (!respuesta.ok) throw new Error('servidor');
      await completarCarga(inicio);
      if (reintento) {
        retroalimentar(reintentar, 'exito', 'Cursos cargados.');
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(reintentar, 'normal');
      }
      cursos = datos.cursos;
      cargado = true;
      pintar(true);
      return true;
    } catch {
      await completarCarga(inicio);
      mostrar('error');
      if (reintento) retroalimentar(reintentar, 'error', 'Los cursos siguen sin cargar. Revisa tu conexión y vuelve a intentarlo.');
      else anunciar(anuncio, 'No pudimos cargar los cursos. Pulsa Reintentar.');
      return false;
    } finally {
      progreso?.detener(); // el resultado ya se anuncia arriba
      rejilla.setAttribute('aria-busy', 'false');
    }
  }

  // ─── Avance del estudiante (solo con sesión; si falla, parcial) ────
  async function cargarAvance(reintento = false): Promise<boolean> {
    if (!conSesion || !avanceError) return true;
    if (simular === 'cargando') return false;
    const boton = $<HTMLElement>('[data-accion="reconectar"]', avanceError);
    const inicio = performance.now();
    try {
      const { respuesta, datos } = await pedirJSON<{ avance: Avance[] }>(`/api/mi-avance${sufijo}`);
      if (!respuesta.ok) throw new Error('servidor');
      await completarCarga(inicio);
      if (reintento) {
        retroalimentar(boton, 'exito', 'Tu avance se cargó.');
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(boton, 'normal');
      }
      avanceError.hidden = true;
      avance = new Map(datos.avance.map((a) => [a.slug, a]));
      for (const li of $$<HTMLElement>('.curso', rejilla)) {
        const slug = li.querySelector<HTMLElement>('[data-ver]')?.dataset.slug;
        if (slug) pintarAvance(li, slug);
      }
      return true;
    } catch {
      await completarCarga(inicio);
      avanceError.hidden = false;
      if (reintento) retroalimentar(boton, 'error', 'Tu avance sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
      return false;
    }
  }

  // ─── Eventos ──────────────────────────────────────────────────────
  function cambiar(cambio: Partial<typeof filtros>): void {
    Object.assign(filtros, cambio);
    guardarEnURL();
    if (cargado) pintar();
    else pintarFiltros();
  }

  for (const b of botonesCategoria) b.addEventListener('click', () => cambiar({ categoria: b.dataset.categoria ?? '' }));
  for (const b of botonesNivel) b.addEventListener('click', () => cambiar({ nivel: b.dataset.nivel ?? '' }));
  $<HTMLButtonElement>('[data-quitar-busqueda]', busqueda).addEventListener('click', () => {
    cambiar({ q: '' });
    enfocar(botonesCategoria[0]);
  });
  limpiar.addEventListener('click', () => {
    // Firma de Cancelación (Act. 14): se deshacen los filtros.
    retroalimentar(limpiar, 'cancelacion', 'Filtros quitados. Se muestran todos los cursos.');
    cambiar({ categoria: '', nivel: '', q: '' });
    enfocar(botonesCategoria[0]); // el botón desaparece: el foco va al inicio de los filtros
  });

  reintentar.addEventListener('click', async () => {
    if (estaOcupado(reintentar)) return;
    procesar(reintentar);
    if (await cargar(true)) enfocar(botonesCategoria[0]);
  });

  if (avanceError) {
    const boton = $<HTMLElement>('[data-accion="reconectar"]', avanceError);
    boton.addEventListener('click', async () => {
      if (estaOcupado(boton)) return;
      procesar(boton);
      await cargarAvance(true);
    });
  }

  // ─── Arranque: la lista y el avance se piden a la vez ─────────────
  pintarFiltros();
  void Promise.all([cargar(), cargarAvance()]).then(() => {
    // Si el avance llegó antes que la lista, se vuelve a pintar con él.
    if (cargado && avance.size) for (const li of $$<HTMLElement>('.curso', rejilla)) {
      const slug = li.querySelector<HTMLElement>('[data-ver]')?.dataset.slug;
      if (slug) pintarAvance(li, slug);
    }
  });
}
