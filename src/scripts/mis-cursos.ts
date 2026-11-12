// Mis cursos con los 5 estados reales (ver el comentario de src/pages/mis-cursos.astro).
// La lista (/api/mis-cursos) y el aviso del certificado (/api/certificado-listo) se piden a la vez;
// si solo falla el aviso, el resto funciona (estado parcial).
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { irAPestana } from './pestanas';
import { $, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';

interface MiCurso {
  slug: string;
  titulo: string;
  categoria: string;
  total: number;
  completadas: number;
  porcentaje: number;
  nota: number | null;
  color: string;
  icono: string;
  ultimaClase: { id: number; codigo: string; titulo: string };
  hace: string;
  accion: { texto: string; href: string };
}
interface Lista {
  enCurso: MiCurso[];
  completados: MiCurso[];
}

const simular = simulacion();
const sufijo = simular ? `?simular=${simular}` : '';
const raiz = $<HTMLElement>('[data-mis-cursos]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const anuncio = $<HTMLElement>('[data-anuncio-mis-cursos]');
const avisoCert = $<HTMLElement>('[data-aviso-cert]', raiz);
const avisoError = $<HTMLElement>('[data-aviso-cert-error]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', avisoError);

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
}

function fila(c: MiCurso, completado: boolean, principal: boolean): DocumentFragment {
  const t = plantilla('mi-curso');
  $<HTMLElement>('[data-portada]', t).style.setProperty('--portada', c.color);
  $<HTMLElement>('[data-portada-icono]', t).append(plantilla(`icono-${c.icono}`));
  $<HTMLElement>('[data-categoria]', t).textContent = c.categoria;
  $<HTMLElement>('[data-clases]', t).textContent = `${c.total} clases`;
  $<HTMLElement>('[data-titulo]', t).textContent = c.titulo;
  $<HTMLElement>('[data-clase]', t).textContent = `Última clase: ${c.ultimaClase.codigo} ${c.ultimaClase.titulo}`;
  const barra = $<HTMLElement>('[data-barra]', t);
  barra.style.background = c.color;
  barra.dataset.ancho = `${c.porcentaje}%`; // se aplica cuando la lista ya se ve (animarBarras)
  $<HTMLElement>('[data-porcentaje]', t).textContent = `${c.porcentaje} % completado`;
  $<HTMLElement>('[data-hace]', t).textContent = c.hace;

  const boton = $<HTMLAnchorElement>('[data-continuar]', t);
  boton.href = c.accion.href;
  $<HTMLElement>('[data-continuar-texto]', t).textContent = c.accion.texto;
  $<HTMLElement>('[data-continuar-curso]', t).textContent = `: ${c.titulo}`;
  if (completado) {
    const aprobado = plantilla('aprobado');
    $<HTMLElement>('[data-badge-texto]', aprobado).textContent = `Aprobado ${c.nota}/20`;
    $<HTMLElement>('.mi-curso__etiquetas', t).append(aprobado);
  }
  // Ley de Hick: una sola acción amarilla (el curso que viste último).
  if (principal) boton.classList.replace('boton--secundario', 'boton--principal');
  return t;
}

/** Las barras crecen desde 0 con transición; también al abrir la otra pestaña. */
function animarBarras(): void {
  for (const barra of document.querySelectorAll<HTMLElement>('[data-mis-cursos] [data-barra]')) {
    if (!barra.offsetParent || barra.style.width) continue; // oculta (otra pestaña) o ya pintada
    void barra.offsetWidth;
    barra.style.width = barra.dataset.ancho ?? '0%';
  }
}
document.addEventListener('pestana', animarBarras);

function contador(id: string, n: number): void {
  const c = $<HTMLElement>(`[data-pestana="${id}"] [data-contador]`);
  c.textContent = String(n);
  c.hidden = false;
}

async function cargar(reintento = false): Promise<'ok' | 'vacio' | 'error'> {
  raiz.setAttribute('aria-busy', 'true');
  // Firma de Progreso (Act. 14): carga automática → gotas solo si tarda más de 1 s, sin campanita al final.
  const progreso = reintento ? null : iniciarProgreso(raiz, { automatico: true, texto: 'Cargando tus cursos' });
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<Lista>(`/api/mis-cursos${sufijo}`);
    if (respuesta.status === 401) {
      window.location.assign('/login?volver=/mis-cursos');
      return 'error';
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', 'Tus cursos se cargaron.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    if (datos.enCurso.length + datos.completados.length === 0) {
      mostrar('vacio');
      anunciar(anuncio, 'Aún no tienes cursos. Explora el catálogo para empezar.');
      return 'vacio';
    }
    $<HTMLElement>('[data-lista="en-curso"]').replaceChildren(...datos.enCurso.map((c, i) => fila(c, false, i === 0)));
    $<HTMLElement>('[data-lista="completados"]').replaceChildren(...datos.completados.map((c) => fila(c, true, false)));
    $<HTMLElement>('[data-vacio="en-curso"]').hidden = datos.enCurso.length > 0;
    $<HTMLElement>('[data-vacio="completados"]').hidden = datos.completados.length > 0;
    contador('en-curso', datos.enCurso.length);
    contador('completados', datos.completados.length);
    mostrar('contenido');
    animarBarras();
    // Si no queda nada en curso, se abre "Completados"; también con ?pestana=completados.
    const pedida = new URL(window.location.href).searchParams.get('pestana');
    if (pedida === 'completados' || datos.enCurso.length === 0) irAPestana('completados');
    anunciar(anuncio, `Tienes ${datos.enCurso.length} en curso y ${datos.completados.length} completados.`);
    return 'ok';
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', 'Tus cursos siguen sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    else anunciar(anuncio, 'No pudimos cargar tus cursos. Pulsa Reintentar.');
    return 'error';
  } finally {
    progreso?.detener(); // el resultado ya se anuncia arriba
    raiz.setAttribute('aria-busy', 'false');
  }
}

async function cargarAviso(reintento = false): Promise<boolean> {
  if (simular === 'cargando') return false;
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ listo: { curso: string; cursoId: number; nota: number; codigo: string | null } | null }>(`/api/certificado-listo${sufijo}`);
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', 'Aviso del certificado cargado.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    avisoError.hidden = true;
    avisoCert.hidden = !datos.listo;
    if (datos.listo) {
      $<HTMLElement>('[data-aviso-cert-titulo]', avisoCert).textContent = `Ya terminaste ${datos.listo.curso}`;
      const { codigo, cursoId, nota } = datos.listo;
      $<HTMLElement>('[data-aviso-cert-texto]', avisoCert).textContent = codigo
        ? `Aprobaste con ${nota}/20. Tu certificado está listo.`
        : `Aprobaste con ${nota}/20. Confirma tu nombre para obtener tu certificado.`;
      const enlace = $<HTMLAnchorElement>('[data-aviso-cert-enlace]', avisoCert);
      enlace.href = codigo ? `/certificados?codigo=${codigo}` : `/resultado/${cursoId}`;
      $<HTMLElement>('.boton__contenido', enlace).textContent = codigo ? 'Ver certificado' : 'Obtener certificado';
    }
    return true;
  } catch {
    await completarCarga(inicio);
    avisoCert.hidden = true;
    avisoError.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', 'El aviso sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    return false;
  }
}

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  const resultado = await cargar(true);
  if (resultado === 'error') return;
  enfocar($<HTMLElement>('[data-titulo-pagina]'));
  if (resultado === 'ok') void cargarAviso();
});

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargarAviso(true)) enfocar($<HTMLElement>('#aviso-cert-titulo'));
});

void cargar();
void cargarAviso();
