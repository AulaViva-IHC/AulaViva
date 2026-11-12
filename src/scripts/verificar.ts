// Verificar certificado (pública).
//   Validación en vivo: mayúsculas automáticas, sin espacios ni guiones, contador "7 de 10" y aviso
//   inmediato si escribe O, 0, I o 1 (no existen en los códigos). Al salir del campo exige los 10.
//   "Verificar" (BotonMultimodal completo): válido → éxito; anulado o no encontrado → sonido/vibración
//   de error, porque el certificado NO sirve; sin conexión → estado de error con "Reintentar".
//   ?codigo= (el enlace del QR) verifica al abrir. El escáner usa la cámara + jsQR (se carga al pedirlo;
//   si no carga → parcial con "Reconectar").
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { limpiarError, mostrarError } from './campo';
import { $, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';
import { codigoDesdeQR, LARGO_CODIGO, normalizarCodigo, validarCodigo } from '../lib/codigo';

type Respuesta =
  | { estado: 'valido' | 'anulado'; codigo: string; nombre: string; curso: string; emitido: string; anulado: string | null }
  | { estado: 'no-encontrado'; codigo: string };

const simular = simulacion();
const raiz = $<HTMLElement>('[data-verificar]');
const form = $<HTMLFormElement>('[data-form]', raiz);
const input = $<HTMLInputElement>('[data-codigo]', raiz);
const cuenta = $<HTMLElement>('[data-cuenta]', raiz);
const boton = $<HTMLButtonElement>('[data-verificar-boton]', raiz);
const resultado = $<HTMLElement>('[data-resultado]', raiz);
const vistas = {
  vacio: $<HTMLElement>('[data-r="vacio"]', resultado),
  cargando: $<HTMLElement>('[data-r="cargando"]', resultado),
  veredicto: $<HTMLElement>('[data-r="veredicto"]', resultado),
  error: $<HTMLElement>('[data-r="error"]', resultado),
};
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', vistas.error);

function mostrar(cual: keyof typeof vistas): void {
  for (const [nombre, el] of Object.entries(vistas)) el.hidden = nombre !== cual;
}

// ─── Validación en vivo ─────────────────────────────────────────────
function actualizarCuenta(): void {
  const n = input.value.length;
  cuenta.textContent = `${Math.min(n, 99)} de ${LARGO_CODIGO}`;
}

input.addEventListener('input', () => {
  // Mayúsculas y sin espacios/guiones, sin mover el cursor de lugar.
  const antes = input.selectionStart ?? input.value.length;
  const crudo = input.value;
  const limpio = normalizarCodigo(crudo);
  if (limpio !== crudo) {
    const quitados = normalizarCodigo(crudo.slice(0, antes)).length;
    input.value = limpio;
    input.setSelectionRange(quitados, quitados);
  }
  actualizarCuenta();
  const error = validarCodigo(limpio, false);
  if (error) mostrarError(input, error);
  else limpiarError(input);
});

input.addEventListener('blur', () => {
  if (!input.value) return limpiarError(input); // vacío al salir: sin regaño
  const error = validarCodigo(input.value, true);
  if (error) mostrarError(input, error);
  else limpiarError(input);
});

// ─── Verificar ──────────────────────────────────────────────────────
function dato(dl: HTMLElement, nombre: string, valor: string): void {
  const div = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = nombre;
  const dd = document.createElement('dd');
  dd.textContent = valor;
  div.append(dt, dd);
  dl.append(div);
}

function pintar(r: Respuesta): string {
  const v = vistas.veredicto;
  v.dataset.tono = r.estado;
  const icono = $<HTMLElement>('[data-veredicto-icono]', v);
  const titulo = $<HTMLElement>('[data-veredicto-titulo]', v);
  const texto = $<HTMLElement>('[data-veredicto-texto]', v);
  const dl = $<HTMLElement>('[data-veredicto-datos]', v);
  dl.replaceChildren();
  if (r.estado === 'no-encontrado') {
    icono.replaceChildren(plantilla('ic-buscar'));
    titulo.textContent = 'No encontramos ese código';
    texto.textContent = 'Revisa que esté bien escrito, letra por letra. Si el código es correcto, este certificado no fue emitido por AulaViva.';
    dato(dl, 'Código buscado', r.codigo);
    return `No encontramos el código ${r.codigo.split('').join(' ')}. Revisa que esté bien escrito.`;
  }
  dato(dl, 'Nombre', r.nombre);
  dato(dl, 'Curso', r.curso);
  dato(dl, 'Fecha de emisión', r.emitido);
  if (r.estado === 'anulado') {
    icono.replaceChildren(plantilla('ic-alerta'));
    titulo.textContent = 'Certificado anulado';
    texto.textContent = `AulaViva anuló este certificado el ${r.anulado}. Ya no es válido.`;
    dato(dl, 'Anulado el', r.anulado ?? '');
    return `Certificado anulado. Fue emitido a ${r.nombre} para ${r.curso} y ya no es válido.`;
  }
  icono.replaceChildren(plantilla('ic-check'));
  titulo.textContent = 'Certificado válido';
  texto.textContent = 'AulaViva emitió este certificado y no ha sido modificado.';
  dato(dl, 'Código', r.codigo);
  return `Certificado válido. ${r.nombre}, ${r.curso}, emitido el ${r.emitido}.`;
}

let ultimo = '';

async function verificar(codigo: string, disparador: HTMLElement): Promise<void> {
  if (estaOcupado(disparador)) return; // ningún envío doble
  const error = validarCodigo(codigo, true);
  if (error) {
    mostrarError(input, error, { sacudir: true });
    retroalimentar(disparador, 'error', error);
    input.focus();
    return;
  }
  limpiarError(input);
  ultimo = codigo;
  procesar(disparador);
  mostrar('cargando');
  resultado.setAttribute('aria-busy', 'true');
  if (simular === 'cargando') return; // se queda verificando (solo /estados)
  const inicio = performance.now();
  try {
    const sim = simular === 'error' ? '&simular=error' : '';
    const { respuesta, datos } = await pedirJSON<Respuesta & { mensaje?: string }>(
      `/api/verificar?codigo=${encodeURIComponent(codigo)}${sim}`,
    );
    await completarCarga(inicio);
    if (respuesta.status === 422) {
      mostrar('vacio');
      mostrarError(input, datos.mensaje ?? 'Revisa el código.', { sacudir: true });
      retroalimentar(disparador, 'error', datos.mensaje);
      return;
    }
    if (!respuesta.ok) throw new Error('servidor');
    const anuncio = pintar(datos);
    mostrar('veredicto');
    retroalimentar(disparador, datos.estado === 'valido' ? 'exito' : 'error', anuncio);
    if (!simular) {
      const u = new URL(window.location.href);
      u.searchParams.set('codigo', codigo);
      history.replaceState(null, '', u);
    }
    await esperar(ESPERA_EXITO_MS);
    ponerEstado(disparador, 'normal');
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    retroalimentar(disparador, 'error', 'No pudimos verificar el código ahora. Revisa tu conexión y pulsa Reintentar.');
  } finally {
    resultado.setAttribute('aria-busy', 'false');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void verificar(normalizarCodigo(input.value), boton);
});

reintentar.addEventListener('click', async () => {
  await verificar(ultimo || normalizarCodigo(input.value), reintentar);
  if (!vistas.veredicto.hidden) enfocar($<HTMLElement>('[data-veredicto-titulo]'));
});

$<HTMLButtonElement>('[data-ejemplo]', resultado).addEventListener('click', () => {
  input.value = 'K7Q2M9XPD4';
  actualizarCuenta();
  limpiarError(input);
  void verificar(input.value, boton);
  input.focus();
});

// ─── Escáner QR (cámara + jsQR) ─────────────────────────────────────
const visor = $<HTMLElement>('[data-visor]', raiz);
const ilustracion = $<HTMLElement>('[data-ilustracion]', visor);
const video = $<HTMLVideoElement>('[data-video]', visor);
const lienzo = $<HTMLCanvasElement>('[data-lienzo]', visor);
const estadoEscaner = $<HTMLElement>('[data-escaner-estado]', raiz);
const escanerError = $<HTMLElement>('[data-escaner-error]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', escanerError);
const cajaEscanear = $<HTMLElement>('[data-escanear-caja]', raiz);
const cajaDetener = $<HTMLElement>('[data-detener-caja]', raiz);
const escanear = $<HTMLButtonElement>('[data-escanear]', raiz);
const detener = $<HTMLButtonElement>('[data-detener]', raiz);

type LectorQR = (datos: Uint8ClampedArray, ancho: number, alto: number) => { data: string } | null;
let lector: LectorQR | null = null;
let flujo: MediaStream | null = null;
let cuadro = 0;

async function cargarLector(): Promise<LectorQR> {
  if (lector) return lector;
  if (simular === 'parcial') throw new Error('sin-lector');
  const modulo = await import('jsqr');
  lector = modulo.default as unknown as LectorQR;
  return lector;
}

function pararCamara(mensaje = ''): void {
  cancelAnimationFrame(cuadro);
  flujo?.getTracks().forEach((t) => t.stop());
  flujo = null;
  video.hidden = true;
  ilustracion.hidden = false;
  cajaDetener.hidden = true;
  cajaEscanear.hidden = false;
  estadoEscaner.textContent = mensaje;
}

function leerCuadro(): void {
  if (!flujo || !lector) return;
  if (video.readyState >= 2) {
    const ancho = video.videoWidth;
    const alto = video.videoHeight;
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, ancho, alto);
    const leido = lector(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto);
    if (leido?.data) {
      const codigo = codigoDesdeQR(leido.data);
      pararCamara(`QR leído: ${codigo}`);
      input.value = codigo;
      actualizarCuenta();
      void verificar(codigo, boton);
      return;
    }
  }
  cuadro = requestAnimationFrame(leerCuadro);
}

async function iniciarEscaneo(): Promise<void> {
  estadoEscaner.textContent = '';
  try {
    await cargarLector();
    escanerError.hidden = true;
  } catch {
    escanerError.hidden = false;
    cajaEscanear.hidden = true;
    retroalimentar(escanear, 'error', 'El lector de QR no cargó. Pulsa Reconectar o escribe el código.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    estadoEscaner.textContent = 'Este navegador no permite usar la cámara aquí. Escribe el código del certificado.';
    retroalimentar(escanear, 'error', estadoEscaner.textContent);
    return;
  }
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    const nombre = (e as DOMException).name;
    const mensaje =
      nombre === 'NotAllowedError'
        ? 'No diste permiso para usar la cámara. Permítelo en el navegador o escribe el código.'
        : nombre === 'NotFoundError'
          ? 'No encontramos una cámara en este dispositivo. Escribe el código del certificado.'
          : 'No pudimos abrir la cámara. Escribe el código del certificado.';
    pararCamara(mensaje);
    retroalimentar(escanear, 'error', mensaje);
    return;
  }
  video.srcObject = flujo;
  ilustracion.hidden = true;
  video.hidden = false;
  cajaEscanear.hidden = true;
  cajaDetener.hidden = false;
  estadoEscaner.textContent = 'Apunta la cámara al QR del certificado.';
  await video.play().catch(() => {});
  enfocar(detener);
  cuadro = requestAnimationFrame(leerCuadro);
}

escanear.addEventListener('click', () => void iniciarEscaneo());
detener.addEventListener('click', () => {
  pararCamara('Escaneo cancelado.');
  retroalimentar(null, 'cancelacion', 'Escaneo cancelado. Puedes escribir el código.'); // firma de Cancelación (Act. 14)
  enfocar(escanear);
});
reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  const inicio = performance.now();
  try {
    await cargarLector();
    await completarCarga(inicio);
    retroalimentar(reconectar, 'exito', 'Lector de QR listo.');
    await esperar(ESPERA_EXITO_MS);
    ponerEstado(reconectar, 'normal');
    escanerError.hidden = true;
    cajaEscanear.hidden = false;
    enfocar(escanear);
  } catch {
    await completarCarga(inicio);
    retroalimentar(reconectar, 'error', 'El lector de QR sigue sin cargar. Escribe el código mientras tanto.');
  }
});
window.addEventListener('pagehide', () => pararCamara());

// ─── Arranque ───────────────────────────────────────────────────────
actualizarCuenta();
// /estados: el parcial muestra el lector caído desde el inicio.
if (simular === 'parcial') {
  escanerError.hidden = false;
  cajaEscanear.hidden = true;
}
const pedido = new URL(window.location.href).searchParams.get('codigo');
if (pedido && simular !== 'vacio') {
  input.value = normalizarCodigo(pedido).slice(0, 14);
  actualizarCuenta();
  void verificar(input.value, boton);
} else {
  mostrar('vacio');
}
