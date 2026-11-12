// Resultado de la evaluación + "Obtener certificado" con el modal "Confirma tu nombre".
//   /api/resultado             → nota y cifras (cargando, vacío, error reales)
//   /api/certificados/estado   → si ya se emitió y con qué nombre (si falla: parcial con "Reconectar")
// Confirmar y emitir (BotonMultimodal completo): "Emitiendo…" → "¡Emitido!" → Mis certificados.
// Corregir el nombre: validación al salir del campo y al guardar (mismas reglas que el registro).
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { abrirModal } from './modal';
import { limpiarError, mostrarError } from './campo';
import { $, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, simulacion } from './util';
import { normalizarNombre, validarNombre } from '../lib/validacion';

interface Resultado {
  curso: { id: number; slug: string; titulo: string };
  ultimo: { numero: number; correctas: number; total: number; nota: number };
  mejorNota: number;
  aprobado: boolean;
  notaMinima: number;
  intentosUsados: number;
  intentosMax: number;
  porcentajeContenido: number;
}

const simular = simulacion();
const sufijo = simular ? `simular=${simular}` : '';
const conSufijo = (url: string) => (sufijo ? `${url}${url.includes('?') ? '&' : '?'}${sufijo}` : url);

const raiz = $<HTMLElement>('[data-resultado]');
const cursoId = Number(raiz.dataset.curso);
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const anuncio = $<HTMLElement>('[data-anuncio-resultado]');

const accionCargando = $<HTMLElement>('[data-accion-cargando]', raiz);
const accionCertificado = $<HTMLElement>('[data-accion-certificado]', raiz);
const obtener = $<HTMLButtonElement>('[data-obtener]', raiz);
const accionEnlace = $<HTMLElement>('[data-accion-enlace]', raiz);
const accionPrincipal = $<HTMLAnchorElement>('[data-accion-principal]', raiz);
const certError = $<HTMLElement>('[data-cert-error]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', certError);

const vistaConfirmar = $<HTMLElement>('[data-vista="confirmar"]');
const vistaCorregir = $<HTMLFormElement>('[data-vista="corregir"]');
const tituloModal = $<HTMLElement>('#modal-nombre [data-modal-titulo]');
const nombreCert = $<HTMLElement>('[data-nombre-cert]');
const emitir = $<HTMLButtonElement>('[data-emitir]');
const emitirError = $<HTMLElement>('[data-emitir-error]');
const inputNombre = $<HTMLInputElement>('#nombre-nuevo');
const guardarNombre = $<HTMLButtonElement>('[data-guardar-nombre]');

let resultado: Resultado | null = null;
let nombre = '';

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
}

function pintar(r: Resultado, primerNombre: string): void {
  $<HTMLElement>('[data-ceja]').textContent = `Evaluación final de ${r.curso.titulo}`;
  $<HTMLElement>('[data-nota]').textContent = String(r.ultimo.nota);
  const anillo = $<HTMLElement>('[data-anillo]');
  anillo.setAttribute('aria-label', `Tu nota: ${r.ultimo.nota} de 20`);
  if (r.ultimo.nota < r.notaMinima) anillo.dataset.tono = 'bajo';
  const avance = $<SVGCircleElement>('[data-anillo-avance]');
  const total = Number(avance.dataset.circunferencia);
  void avance.getBoundingClientRect();
  // Como propiedad de estilo (no atributo): así la transición de CSS siempre se dispara.
  avance.style.strokeDashoffset = String(total * (1 - r.ultimo.nota / 20));

  const aprobo = r.aprobado;
  $<HTMLElement>('[data-veredicto]').hidden = false;
  $<HTMLElement>('[data-badge-aprobado]').hidden = !aprobo;
  $<HTMLElement>('[data-badge-desaprobado]').hidden = aprobo;
  $<HTMLElement>('[data-confeti]').hidden = !aprobo;
  $<HTMLElement>('[data-titulo-esqueleto]')?.remove();
  const quedan = r.intentosMax - r.intentosUsados;
  $<HTMLElement>('[data-titulo]').textContent = aprobo ? `¡Aprobaste, ${primerNombre}!` : `Esta vez no alcanzó, ${primerNombre}`;
  $<HTMLElement>('[data-texto]').textContent = aprobo
    ? r.ultimo.nota >= r.notaMinima
      ? 'Completaste el curso. Ya puedes obtener tu certificado con código único y QR.'
      : `En este intento sacaste ${r.ultimo.nota}, pero vale tu mejor nota (${r.mejorNota}/20): sigues aprobado.`
    : quedan > 0
      ? `Necesitas ${r.notaMinima} de 20. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}; repasa las clases y vuelve a intentarlo.`
      : `Necesitabas ${r.notaMinima} de 20 y ya usaste tus ${r.intentosMax} intentos. Escribe a soporte de AulaViva si crees que hubo un error.`;
  $<HTMLElement>('[data-cifra="correctas"]').textContent = `${r.ultimo.correctas} de ${r.ultimo.total}`;
  $<HTMLElement>('[data-cifra="mejor"]').textContent = `${r.mejorNota}/20`;
  $<HTMLElement>('[data-cifra="intentos"]').textContent = `${r.intentosUsados} de ${r.intentosMax}`;
  $<HTMLElement>('[data-cifra="contenido"]').textContent = `${r.porcentajeContenido} %`;
}

/** Acción principal según el resultado y el certificado (Ley de Hick: una sola amarilla). */
function pintarAccion(codigo: string | null): void {
  const r = resultado!;
  accionCargando.hidden = true;
  accionCertificado.hidden = true;
  accionEnlace.hidden = true;
  const texto = $<HTMLElement>('[data-accion-principal-texto]', accionPrincipal);
  if (r.aprobado && !codigo) {
    accionCertificado.hidden = false;
    return;
  }
  if (r.aprobado && codigo) {
    accionPrincipal.href = `/certificados?codigo=${codigo}`;
    texto.textContent = 'Ver mi certificado';
  } else if (r.intentosUsados < r.intentosMax) {
    accionPrincipal.href = `/evaluacion/${cursoId}`;
    texto.textContent = `Rendir intento ${r.intentosUsados + 1} de ${r.intentosMax}`;
  } else {
    return; // sin intentos: solo "Volver a Mis cursos"
  }
  accionEnlace.hidden = false;
}

async function cargarCertificado(reintento = false): Promise<boolean> {
  if (!resultado) return false;
  if (!resultado.aprobado) {
    pintarAccion(null);
    return true;
  }
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ codigo: string | null; nombre: string }>(
      conSufijo(`/api/certificados/estado?curso=${cursoId}`),
    );
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', 'Estado de tu certificado cargado.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    nombre = datos.nombre;
    certError.hidden = true;
    pintarAccion(datos.codigo);
    return true;
  } catch {
    await completarCarga(inicio);
    accionCargando.hidden = true;
    certError.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', 'Sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    return false;
  }
}

async function cargar(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ resultado: Resultado | null; estado: string; primerNombre: string }>(
      conSufijo(`/api/resultado?curso=${cursoId}`),
    );
    if (respuesta.status === 401) {
      window.location.assign(`/login?volver=/resultado/${cursoId}`);
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', 'Resultado cargado.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    if (!datos.resultado) {
      // Vacío: si la evaluación aún está bloqueada, la acción lleva a las clases.
      if (datos.estado === 'bloqueada') {
        const a = $<HTMLAnchorElement>('[data-vacio-accion]', vacio);
        a.href = '/mis-cursos';
        a.querySelector('.boton__contenido')!.textContent = 'Continuar mis clases';
      }
      mostrar('vacio');
      anunciar(anuncio, 'Aún no rindes esta evaluación.');
      return true;
    }
    resultado = datos.resultado;
    mostrar('contenido');
    pintar(datos.resultado, datos.primerNombre);
    anunciar(
      anuncio,
      `${datos.resultado.aprobado ? 'Aprobado' : 'Desaprobado'}. Tu nota: ${datos.resultado.ultimo.nota} de 20.`,
    );
    await cargarCertificado();
    return true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', 'Tu resultado sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    else anunciar(anuncio, 'No pudimos cargar tu resultado. Pulsa Reintentar.');
    return false;
  } finally {
    raiz.setAttribute('aria-busy', 'false');
  }
}

// ─── Modal "Confirma tu nombre" ─────────────────────────────────────
function vistaModal(cual: 'confirmar' | 'corregir'): void {
  vistaConfirmar.hidden = cual !== 'confirmar';
  vistaCorregir.hidden = cual !== 'corregir';
  tituloModal.textContent = cual === 'confirmar' ? 'Confirma tu nombre' : 'Corrige tu nombre';
}

obtener.addEventListener('click', () => {
  nombreCert.textContent = nombre;
  emitirError.hidden = true;
  vistaModal('confirmar');
  ponerEstado(emitir, 'normal');
  abrirModal('modal-nombre', $<HTMLElement>('[data-corregir]'));
});

$<HTMLButtonElement>('[data-corregir]').addEventListener('click', () => {
  inputNombre.value = nombre;
  limpiarError(inputNombre);
  vistaModal('corregir');
  inputNombre.focus();
  inputNombre.select();
});

$<HTMLButtonElement>('[data-cancelar-correccion]').addEventListener('click', () => {
  vistaModal('confirmar');
  $<HTMLElement>('[data-corregir]').focus();
});

// Validación al salir del campo (prevención de errores).
inputNombre.addEventListener('blur', () => {
  const error = validarNombre(normalizarNombre(inputNombre.value));
  if (error) mostrarError(inputNombre, error);
  else limpiarError(inputNombre);
});
inputNombre.addEventListener('input', () => {
  if (!validarNombre(normalizarNombre(inputNombre.value))) limpiarError(inputNombre);
});

vistaCorregir.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (estaOcupado(guardarNombre)) return;
  const nuevo = normalizarNombre(inputNombre.value);
  const errorLocal = validarNombre(nuevo);
  if (errorLocal) {
    mostrarError(inputNombre, errorLocal, { sacudir: true });
    retroalimentar(guardarNombre, 'error', errorLocal);
    inputNombre.focus();
    return;
  }
  procesar(guardarNombre);
  const inicio = performance.now();
  let datos: { nombre?: string; mensaje?: string } = {};
  let ok = false;
  try {
    const r = await pedirJSON<typeof datos>(conSufijo('/api/perfil/nombre'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevo }),
    });
    ok = r.respuesta.ok;
    datos = r.datos;
  } catch {
    datos.mensaje = 'No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.';
  }
  await completarCarga(inicio);
  if (!ok) {
    const texto = datos.mensaje ?? 'No se pudo guardar tu nombre.';
    mostrarError(inputNombre, texto, { sacudir: true });
    retroalimentar(guardarNombre, 'error', texto);
    return;
  }
  retroalimentar(guardarNombre, 'exito');
  nombre = datos.nombre ?? nuevo;
  nombreCert.textContent = nombre;
  await esperar(ESPERA_EXITO_MS);
  ponerEstado(guardarNombre, 'normal');
  vistaModal('confirmar');
  emitir.focus();
});

emitir.addEventListener('click', async () => {
  if (estaOcupado(emitir)) return; // ningún envío doble
  procesar(emitir);
  emitirError.hidden = true;
  const inicio = performance.now();
  let status = 0;
  let datos: { destino?: string; mensaje?: string } = {};
  try {
    const r = await pedirJSON<typeof datos>(conSufijo('/api/certificados'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curso: cursoId, nombre }),
    });
    status = r.respuesta.status;
    datos = r.datos;
  } catch {
    datos.mensaje = 'No hay conexión: el certificado no se emitió. Vuelve a intentarlo.';
  }
  await completarCarga(inicio);
  if (status === 201 && datos.destino) {
    retroalimentar(emitir, 'exito');
    await esperar(ESPERA_EXITO_MS);
    window.location.assign(datos.destino);
    return;
  }
  const texto = datos.mensaje ?? 'No pudimos emitir tu certificado. Vuelve a intentarlo.';
  $<HTMLElement>('[data-emitir-error-texto]').textContent = texto;
  emitirError.hidden = false;
  retroalimentar(emitir, 'error', texto);
});

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargar(true)) enfocar($<HTMLElement>('[data-titulo-pagina]'));
});

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargarCertificado(true)) enfocar(accionCertificado.hidden ? accionPrincipal : obtener);
});

void cargar();
