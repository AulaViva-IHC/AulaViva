// Mis certificados con los 5 estados reales (ver el comentario de src/pages/certificados.astro).
//   /api/certificados → obtenidos (con el QR en SVG generado en el servidor)
//   /api/mis-cursos   → "En progreso" (aparte: si falla, parcial con "Reconectar")
// Acciones del certificado elegido:
//   Descargar PDF  (BotonMultimodal completo: "Generando PDF…" → "¡Descargado!", o error con qué hacer)
//   Copiar enlace  (éxito suave; si el navegador no deja copiar, muestra el enlace seleccionado)
//   Verificar      (abre /verificar?codigo=…)
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { $, $$, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';

interface Cert {
  codigo: string;
  nombre: string;
  estado: 'valido' | 'anulado';
  emitido: string;
  anulado: string | null;
  curso: { titulo: string; horas: number; color: string; icono: string; slug: string };
  enlace: string;
  enlaceCorto: string;
  qr: string;
}
interface EnCurso {
  titulo: string;
  porcentaje: number;
  completadas: number;
  total: number;
  color: string;
  accion: { href: string };
}

const simular = simulacion();
const sufijo = simular ? `?simular=${simular}` : '';
const raiz = $<HTMLElement>('[data-certificados]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const anuncio = $<HTMLElement>('[data-anuncio-certificados]');

const listaObtenidos = $<HTMLUListElement>('[data-obtenidos]', raiz);
const listaProgreso = $<HTMLUListElement>('[data-progreso]', raiz);
const progresoError = $<HTMLElement>('[data-progreso-error]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', progresoError);
const vista = $<HTMLElement>('[data-vista]', raiz);
const vistaCargando = $<HTMLElement>('[data-vista-cargando]', raiz);
const vistaVacia = $<HTMLElement>('[data-vista-vacia]', raiz);
const descargar = $<HTMLButtonElement>('[data-descargar]', raiz);
const copiar = $<HTMLButtonElement>('[data-copiar]', raiz);
const verificar = $<HTMLAnchorElement>('[data-verificar]', raiz);
const accionError = $<HTMLElement>('[data-accion-error]', raiz);
const copiarManual = $<HTMLElement>('[data-copiar-manual]', raiz);

let certificados: Cert[] = [];
let elegido: Cert | null = null;

function mostrar(region: 'contenido' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  error.hidden = region !== 'error';
}

// ─── Vista del certificado ──────────────────────────────────────────
function elegir(c: Cert, enfocarVista = false): void {
  elegido = c;
  for (const b of $$<HTMLButtonElement>('[data-elegir]', listaObtenidos)) {
    b.setAttribute('aria-pressed', String(b.dataset.codigo === c.codigo));
  }
  $<HTMLElement>('[data-c-nombre]', vista).textContent = c.nombre;
  $<HTMLElement>('[data-c-curso]', vista).textContent = c.curso.titulo;
  $<HTMLElement>('[data-c-fecha]', vista).textContent = `${c.curso.horas} horas académicas. Emitido el ${c.emitido}.`;
  $<HTMLElement>('[data-c-codigo]', vista).textContent = c.codigo;
  $<HTMLElement>('[data-c-url]', vista).textContent = c.enlaceCorto;
  const qr = $<HTMLElement>('[data-c-qr]', vista);
  qr.innerHTML = c.qr; // SVG generado en nuestro servidor con la librería qrcode
  qr.setAttribute('aria-label', `Código QR que abre la verificación del certificado ${c.codigo}`);
  $<HTMLElement>('[data-c-anulado]', vista).hidden = c.estado !== 'anulado';
  const avisoAnulado = $<HTMLElement>('[data-vista-anulado]', vista);
  avisoAnulado.hidden = c.estado !== 'anulado';
  $<HTMLElement>('[data-vista-anulado-texto]', vista).textContent = `Este certificado fue anulado el ${c.anulado} y ya no es válido.`;
  $<HTMLElement>('[data-c-descripcion]', vista).textContent =
    `Certificado de aprobación de ${c.curso.titulo} a nombre de ${c.nombre}, emitido el ${c.emitido}, código ${c.codigo}${c.estado === 'anulado' ? ', anulado' : ''}.`;
  verificar.href = `/verificar?codigo=${c.codigo}`;
  accionError.hidden = true;
  copiarManual.hidden = true;
  for (const b of [descargar, copiar]) ponerEstado(b, 'normal');
  if (!simular) {
    const u = new URL(window.location.href);
    u.searchParams.set('codigo', c.codigo);
    history.replaceState(null, '', u);
  }
  if (enfocarVista) {
    anunciar(anuncio, `Mostrando el certificado de ${c.curso.titulo}.`);
    enfocar($<HTMLElement>('#vista-titulo'));
  }
}

function filaObtenido(c: Cert): DocumentFragment {
  const t = plantilla('obtenido');
  const b = $<HTMLButtonElement>('[data-elegir]', t);
  b.dataset.codigo = c.codigo;
  const icono = $<HTMLElement>('[data-icono]', t);
  icono.style.background = c.curso.color;
  icono.append(plantilla(`icono-${c.curso.icono}`));
  $<HTMLElement>('[data-titulo]', t).textContent = c.curso.titulo;
  $<HTMLElement>('[data-fecha]', t).textContent = c.emitido;
  $<HTMLElement>('[data-estado]', t).append(plantilla(c.estado === 'valido' ? 'valido' : 'anulado'));
  b.addEventListener('click', () => elegir(c, true));
  return t;
}

// ─── En progreso ────────────────────────────────────────────────────
function falta(c: EnCurso): string {
  if (c.completadas >= c.total) return 'Te falta aprobar la evaluación';
  const n = c.total - c.completadas;
  return `Te ${n === 1 ? 'falta 1 clase' : `faltan ${n} clases`} y la evaluación`;
}

async function cargarProgreso(reintento = false): Promise<boolean> {
  if (simular === 'cargando') return false;
  const inicio = performance.now();
  try {
    // En /estados: "parcial" hace fallar solo esta parte; en los demás, esta parte carga normal.
    const sim = simular ? `?simular=${simular === 'parcial' ? 'error' : 'ideal'}` : '';
    const { respuesta, datos } = await pedirJSON<{ enCurso: EnCurso[] }>(`/api/mis-cursos${sim}`);
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', 'Cursos en progreso cargados.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    progresoError.hidden = true;
    $<HTMLElement>('[data-progreso-titulo]').textContent = `En progreso (${datos.enCurso.length})`;
    listaProgreso.replaceChildren(
      ...datos.enCurso.map((c) => {
        const t = plantilla('progreso');
        $<HTMLAnchorElement>('[data-enlace]', t).href = c.accion.href;
        $<HTMLElement>('[data-titulo]', t).textContent = c.titulo;
        $<HTMLElement>('[data-porcentaje]', t).textContent = `${c.porcentaje} %`;
        const barra = $<HTMLElement>('[data-barra]', t);
        barra.style.background = c.color;
        barra.dataset.ancho = `${c.porcentaje}%`;
        $<HTMLElement>('[data-falta]', t).textContent = falta(c);
        return t;
      }),
    );
    listaProgreso.hidden = datos.enCurso.length === 0;
    $<HTMLElement>('[data-progreso-vacio]').hidden = datos.enCurso.length > 0;
    for (const barra of $$<HTMLElement>('[data-barra]', listaProgreso)) {
      void barra.offsetWidth;
      barra.style.width = barra.dataset.ancho ?? '0%';
    }
    return true;
  } catch {
    await completarCarga(inicio);
    listaProgreso.hidden = true;
    progresoError.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', 'Siguen sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    return false;
  }
}

// ─── Certificados ───────────────────────────────────────────────────
async function cargar(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ certificados: Cert[] }>(
      `/api/certificados${simular === 'parcial' ? '?simular=ideal' : sufijo}`,
    );
    if (respuesta.status === 401) {
      window.location.assign('/login?volver=/certificados');
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', 'Certificados cargados.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    certificados = datos.certificados;
    mostrar('contenido');
    $<HTMLElement>('[data-obtenidos-titulo]').textContent = `Obtenidos (${certificados.length})`;
    listaObtenidos.replaceChildren(...certificados.map(filaObtenido));
    listaObtenidos.hidden = certificados.length === 0;
    $<HTMLElement>('[data-obtenidos-vacio]').hidden = certificados.length > 0;
    vistaCargando.hidden = true;
    if (certificados.length === 0) {
      vista.hidden = true;
      vistaVacia.hidden = false;
      anunciar(anuncio, 'Aún no tienes certificados.');
      return true;
    }
    vistaVacia.hidden = true;
    vista.hidden = false;
    const pedido = new URL(window.location.href).searchParams.get('codigo');
    elegir(certificados.find((c) => c.codigo === pedido) ?? certificados[0]);
    anunciar(anuncio, `Tienes ${certificados.length === 1 ? '1 certificado' : `${certificados.length} certificados`}.`);
    return true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', 'Tus certificados siguen sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    else anunciar(anuncio, 'No pudimos cargar tus certificados. Pulsa Reintentar.');
    return false;
  } finally {
    raiz.setAttribute('aria-busy', 'false');
  }
}

// ─── Acciones ───────────────────────────────────────────────────────
function errorAccion(boton: HTMLElement, texto: string): void {
  $<HTMLElement>('[data-accion-error-texto]', accionError).textContent = texto;
  accionError.hidden = false;
  retroalimentar(boton, 'error', texto);
}

descargar.addEventListener('click', async () => {
  if (estaOcupado(descargar) || !elegido) return;
  procesar(descargar);
  accionError.hidden = true;
  const inicio = performance.now();
  try {
    if (!navigator.onLine) throw new Error('sin-conexion');
    const r = await fetch(`/api/certificados/${elegido.codigo}/pdf`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) {
      const datos = (await r.json().catch(() => ({}))) as { mensaje?: string };
      throw new Error(datos.mensaje ?? 'servidor');
    }
    const blob = await r.blob();
    await completarCarga(inicio);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificado-aulaviva-${elegido.codigo}.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    retroalimentar(descargar, 'exito', `PDF del certificado ${elegido.codigo} descargado.`);
    await esperar(ESPERA_EXITO_MS * 2);
    ponerEstado(descargar, 'normal');
  } catch (e) {
    await completarCarga(inicio);
    const m = (e as Error).message;
    errorAccion(
      descargar,
      m === 'sin-conexion'
        ? 'No hay conexión: el PDF no se descargó. Revisa tu red y vuelve a pulsar “Descargar PDF”.'
        : m === 'servidor' || m.includes('aborted')
          ? 'No pudimos generar el PDF. Vuelve a intentarlo en un momento.'
          : m,
    );
  }
});

copiar.addEventListener('click', async () => {
  if (estaOcupado(copiar) || !elegido) return;
  procesar(copiar);
  accionError.hidden = true;
  const inicio = performance.now();
  try {
    await navigator.clipboard.writeText(elegido.enlace);
    await completarCarga(inicio);
    copiarManual.hidden = true;
    retroalimentar(copiar, 'exito', 'Enlace de verificación copiado. Pégalo donde quieras compartirlo.');
    await esperar(ESPERA_EXITO_MS * 2);
    ponerEstado(copiar, 'normal');
  } catch {
    await completarCarga(inicio);
    // Sin permiso para el portapapeles: el enlace queda seleccionado para copiarlo a mano.
    const input = $<HTMLInputElement>('[data-enlace-manual]', copiarManual);
    input.value = elegido.enlace;
    copiarManual.hidden = false;
    retroalimentar(copiar, 'error', 'Tu navegador no dejó copiar. El enlace está seleccionado: cópialo con Ctrl + C.');
    input.focus();
    input.select();
  }
});

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargar(true)) {
    enfocar($<HTMLElement>('[data-titulo-pagina]'));
    void cargarProgreso();
  }
});

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargarProgreso(true)) enfocar($<HTMLElement>('[data-progreso-titulo]'));
});

void cargar();
void cargarProgreso();
