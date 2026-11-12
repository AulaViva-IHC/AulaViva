// Evaluación final: una pregunta a la vez, autoguardado y envío con confirmación.
//   /api/evaluacion            → preguntas e intento (si falla: error con "Reintentar")
//   /api/evaluacion/respuestas → lo ya guardado (si falla: parcial con "Reconectar"; se puede seguir respondiendo)
// Autoguardado (Act. 10): al elegir una opción → "Guardando…" (giro) → "Guardada" con check,
//   earcon y vibración suaves (§5.8, acción frecuente) y aviso al lector de pantalla.
// Envío: el modal avisa cuántas faltan; "Enviar evaluación" (BotonMultimodal completo) no se envía dos veces.
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { abrirModal, cerrarModal } from './modal';
import { $, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';

interface Pregunta {
  numero: number;
  enunciado: string;
  opciones: string[];
}
interface Intento {
  id: number;
  numero: number;
  intentosMax: number;
  notaMinima: number;
  curso: { id: number; slug: string; titulo: string };
  preguntas: Pregunta[];
}
interface Resumen {
  estado: string;
  curso: { id: number; slug: string; titulo: string } | null;
  completadas: number;
  total: number;
  intentosUsados: number;
  intentosMax: number;
  continuarClaseId: number | null;
}

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
const simular = simulacion();
const sufijo = simular ? `simular=${simular}` : '';
const conSufijo = (url: string) => (sufijo ? `${url}${url.includes('?') ? '&' : '?'}${sufijo}` : url);

const raiz = $<HTMLElement>('[data-evaluacion]');
const cursoId = Number(raiz.dataset.curso);
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const anuncio = $<HTMLElement>('[data-anuncio-evaluacion]');

const form = $<HTMLFormElement>('[data-form]', raiz);
const cargandoPregunta = $<HTMLElement>('[data-pregunta-cargando]', raiz);
const enunciado = $<HTMLElement>('[data-enunciado]', form);
const opciones = $<HTMLElement>('[data-opciones]', form);
const guardado = $<HTMLElement>('[data-guardado]', form);
const guardadoError = $<HTMLElement>('[data-guardado-error]', form);
const anterior = $<HTMLButtonElement>('[data-anterior]', form);
const siguiente = $<HTMLButtonElement>('[data-siguiente]', form);
const navegador = $<HTMLElement>('[data-navegador]', raiz);
const respuestasError = $<HTMLElement>('[data-respuestas-error]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', respuestasError);
const abrirEnvio = $<HTMLButtonElement>('[data-abrir-envio]', raiz);
const enviar = $<HTMLButtonElement>('[data-enviar]');
const envioError = $<HTMLElement>('[data-envio-error]');

let intento: Intento | null = null;
let respuestas: (number | null)[] = [];
let actual = 0; // índice de la pregunta visible
/** Ya respondió o navegó: la carga de respuestas guardadas no lo cambia de pregunta. */
let interactuo = false;
/** Guardados en curso por pregunta (se esperan antes de enviar). */
const pendientes = new Map<number, Promise<boolean>>();
/** Respuesta que falló al guardarse (para "Volver a guardar"). */
let fallida: { pregunta: number; opcion: number } | null = null;

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
}

const respondidas = () => respuestas.filter((r) => r !== null).length;

// ─── Pintar ─────────────────────────────────────────────────────────
function pintarAvance(): void {
  const total = intento!.preguntas.length;
  $<HTMLElement>('[data-pregunta-de]').textContent = `Pregunta ${actual + 1} de ${total}`;
  $<HTMLElement>('[data-respondidas]').textContent = `${respondidas()} de ${total} respondidas`;
  const barra = $<HTMLElement>('[data-avance-barra]');
  barra.style.width = `${((actual + 1) / total) * 100}%`;
}

function pintarNavegador(): void {
  navegador.replaceChildren(
    ...intento!.preguntas.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'num';
      b.textContent = String(p.numero);
      const hecha = respuestas[i] !== null;
      if (hecha) b.dataset.respondida = '';
      if (i === actual) b.setAttribute('aria-current', 'step');
      b.setAttribute('aria-label', `Pregunta ${p.numero}, ${hecha ? 'respondida' : 'sin responder'}${i === actual ? ', actual' : ''}`);
      b.addEventListener('click', () => irA(i, true));
      return b;
    }),
  );
}

function pintarPregunta(): void {
  const p = intento!.preguntas[actual];
  enunciado.textContent = `${p.numero}. ${p.enunciado}`;
  opciones.replaceChildren(
    ...p.opciones.map((texto, k) => {
      const label = document.createElement('label');
      label.className = 'opcion';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `pregunta-${p.numero}`;
      input.value = String(k);
      input.checked = respuestas[actual] === k;
      const letra = document.createElement('span');
      letra.className = 'opcion__letra';
      letra.textContent = LETRAS[k];
      letra.setAttribute('aria-hidden', 'true');
      const t = document.createElement('span');
      t.className = 'opcion__texto';
      t.textContent = texto;
      const check = document.createElement('span');
      check.className = 'opcion__check';
      check.setAttribute('aria-hidden', 'true');
      check.append(plantilla('ic-check'));
      label.append(input, letra, t, check);
      return label;
    }),
  );
  guardado.replaceChildren();
  delete guardado.dataset.estado;
  guardadoError.hidden = true;
  anterior.setAttribute('aria-disabled', String(actual === 0));
  const ultima = actual === intento!.preguntas.length - 1;
  $<HTMLElement>('[data-siguiente-texto]', siguiente).textContent = ultima ? 'Ir a enviar' : 'Siguiente';
  pintarAvance();
  pintarNavegador();
}

function irA(i: number, enfocarPregunta: boolean): void {
  if (!intento || i < 0 || i >= intento.preguntas.length) return;
  interactuo = true;
  actual = i;
  pintarPregunta();
  if (enfocarPregunta) enfocar(enunciado);
  anunciar(anuncio, `Pregunta ${i + 1} de ${intento.preguntas.length}${respuestas[i] !== null ? ', ya respondida' : ''}.`);
}

// ─── Autoguardado ───────────────────────────────────────────────────
function estadoGuardado(estado: 'guardando' | 'guardada'): void {
  guardado.dataset.estado = estado;
  if (estado === 'guardando') {
    const giro = document.createElement('span');
    giro.className = 'girador';
    guardado.replaceChildren(giro, document.createTextNode('Guardando…'));
  } else {
    guardado.replaceChildren(plantilla('ic-guardada'), document.createTextNode('Guardada'));
  }
}

async function guardar(pregunta: number, opcion: number): Promise<boolean> {
  const visible = () => actual === pregunta - 1;
  if (visible()) estadoGuardado('guardando');
  const inicio = performance.now();
  let ok = false;
  let mensaje = 'No se guardó tu respuesta. Revisa tu conexión y pulsa “Volver a guardar”.';
  try {
    const { respuesta, datos } = await pedirJSON<{ mensaje?: string }>(conSufijo('/api/evaluacion/respuestas'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intento: intento!.id, pregunta, opcion }),
    });
    ok = respuesta.ok;
    if (!ok && datos.mensaje) mensaje = datos.mensaje;
  } catch {
    ok = false;
  }
  await completarCarga(inicio);
  if (ok) {
    fallida = null;
    if (visible()) {
      estadoGuardado('guardada');
      guardadoError.hidden = true;
    }
    // Éxito suave (acción frecuente): earcon y vibración cortos + aviso al lector.
    retroalimentar(null, 'exito-suave', `Respuesta ${LETRAS[opcion]} de la pregunta ${pregunta} guardada.`);
  } else {
    fallida = { pregunta, opcion };
    if (visible()) {
      guardado.replaceChildren();
      $<HTMLElement>('[data-guardado-error-texto]', guardadoError).textContent = mensaje;
      guardadoError.hidden = false;
    }
    retroalimentar(null, 'error', mensaje);
  }
  return ok;
}

let espera: number | undefined;
opciones.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.type !== 'radio') return;
  const opcion = Number(input.value);
  const pregunta = actual + 1;
  interactuo = true;
  respuestas[actual] = opcion; // la marca visual es inmediata
  pintarAvance();
  pintarNavegador();
  // Con las flechas se recorren varias opciones seguidas: se guarda la última (250 ms).
  window.clearTimeout(espera);
  espera = window.setTimeout(() => {
    const p = guardar(pregunta, opcion);
    pendientes.set(pregunta, p);
    void p.finally(() => pendientes.get(pregunta) === p && pendientes.delete(pregunta));
  }, 250);
});

$<HTMLButtonElement>('[data-reguardar]', form).addEventListener('click', () => {
  if (fallida) void guardar(fallida.pregunta, fallida.opcion);
});

// ─── Navegación ─────────────────────────────────────────────────────
anterior.addEventListener('click', () => {
  if (actual > 0) irA(actual - 1, true);
});
siguiente.addEventListener('click', () => {
  if (actual < intento!.preguntas.length - 1) irA(actual + 1, true);
  else enfocar(abrirEnvio);
});

// ─── Envío ──────────────────────────────────────────────────────────
abrirEnvio.addEventListener('click', () => {
  if (!intento) return;
  const faltan = intento.preguntas.length - respondidas();
  const titulo = $<HTMLElement>('#modal-enviar [data-modal-titulo]');
  const texto = $<HTMLElement>('[data-envio-texto]');
  const icono = $<HTMLElement>('#modal-enviar .modal__icono');
  if (faltan > 0) {
    titulo.textContent = faltan === 1 ? 'Te falta 1 pregunta' : `Te faltan ${faltan} preguntas`;
    texto.textContent = 'Las preguntas sin responder cuentan como incorrectas. ¿Quieres enviar la evaluación de todos modos?';
    icono.hidden = false;
  } else {
    titulo.textContent = '¿Enviar tu evaluación?';
    texto.textContent = `Respondiste las ${intento.preguntas.length} preguntas. Después de enviar ya no podrás cambiar tus respuestas.`;
    icono.hidden = true;
  }
  envioError.hidden = true;
  ponerEstado(enviar, 'normal');
  // Foco en la acción segura: revisar (prevención de errores).
  abrirModal('modal-enviar', $<HTMLElement>('[data-revisar]'));
});

$<HTMLButtonElement>('[data-revisar]').addEventListener('click', () => {
  cerrarModal('modal-enviar');
  const primeraSinResponder = respuestas.findIndex((r) => r === null);
  irA(primeraSinResponder >= 0 ? primeraSinResponder : actual, true);
});

enviar.addEventListener('click', async () => {
  if (estaOcupado(enviar) || !intento) return; // ningún envío doble
  procesar(enviar);
  envioError.hidden = true;
  const inicio = performance.now();
  await Promise.all(pendientes.values()); // primero, lo que se estaba guardando
  let status = 0;
  let datos: { destino?: string; mensaje?: string } = {};
  try {
    const r = await pedirJSON<typeof datos>(conSufijo('/api/evaluacion/enviar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intento: intento.id, curso: cursoId }),
    });
    status = r.respuesta.status;
    datos = r.datos;
  } catch (e) {
    datos.mensaje =
      (e as Error).message === 'sin-conexion'
        ? 'No hay conexión: tu evaluación no se envió. Tus respuestas están guardadas; vuelve a intentarlo.'
        : 'El servidor no respondió. Tus respuestas están guardadas; vuelve a intentarlo.';
  }
  await completarCarga(inicio);
  if (status === 200 && datos.destino) {
    retroalimentar(enviar, 'exito');
    await esperar(ESPERA_EXITO_MS);
    window.location.assign(datos.destino);
    return;
  }
  const texto = datos.mensaje ?? 'No pudimos enviar tu evaluación. Vuelve a intentarlo.';
  $<HTMLElement>('[data-envio-error-texto]').textContent = texto;
  envioError.hidden = false;
  retroalimentar(enviar, 'error', texto);
});

// ─── Carga ──────────────────────────────────────────────────────────
function mostrarVacio(r: Resumen): void {
  const h2 = $<HTMLElement>('h2', vacio);
  const p = $<HTMLElement>('.vacio__texto', vacio);
  const accion = $<HTMLAnchorElement>('[data-vacio-accion]', vacio);
  const textoAccion = $<HTMLElement>('[data-vacio-accion-texto]', vacio);
  const curso = r.curso?.titulo ?? 'este curso';
  const textos: Record<string, [string, string, string, string]> = {
    bloqueada: [
      'Completa todas las clases para rendir la evaluación',
      `Llevas ${r.completadas} de ${r.total} clases de ${curso}. La evaluación final se habilita al completar el 100 %.`,
      'Continuar curso',
      `/clase/${r.continuarClaseId}`,
    ],
    'sin-intentos': [
      `Usaste tus ${r.intentosMax} intentos`,
      'Ya no quedan intentos para esta evaluación. Revisa tu resultado; si crees que hubo un error, escribe a soporte de AulaViva.',
      'Ver mi resultado',
      `/resultado/${cursoId}`,
    ],
    aprobada: ['Ya aprobaste esta evaluación', `Aprobaste ${curso}. Vale tu mejor nota y tu certificado te espera.`, 'Ver mi resultado', `/resultado/${cursoId}`],
    'no-inscrito': ['Aún no estás inscrito en este curso', 'Inscríbete gratis para ver las clases y rendir la evaluación.', 'Ver el curso', `/cursos/${r.curso?.slug ?? ''}`],
    'no-encontrada': ['No encontramos esta evaluación', 'Puede que el enlace esté mal escrito. Vuelve a Mis cursos.', 'Ir a Mis cursos', '/mis-cursos'],
  };
  const [titulo, texto, boton, href] = textos[r.estado] ?? textos['no-encontrada'];
  h2.textContent = titulo;
  p.textContent = texto;
  textoAccion.textContent = boton;
  accion.href = href;
  mostrar('vacio');
  anunciar(anuncio, titulo);
}

async function cargarRespuestas(reintento = false): Promise<boolean> {
  if (!intento) return false;
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ respuestas: (number | null)[] }>(
      conSufijo(`/api/evaluacion/respuestas?intento=${intento.id}`),
    );
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reconectar, 'exito', 'Tus respuestas guardadas se cargaron.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    // Lo que ya respondió en esta sesión gana a lo guardado (es más nuevo).
    respuestas = datos.respuestas.map((r, i) => respuestas[i] ?? r);
    respuestasError.hidden = true;
    // Retoma en la primera sin responder (solo si aún no empezó a responder: no se le mueve de pregunta).
    if (!reintento && !interactuo) {
      const primera = respuestas.findIndex((r) => r === null);
      actual = primera >= 0 ? primera : 0;
    }
    pintarPregunta();
    return true;
  } catch {
    await completarCarga(inicio);
    respuestasError.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', 'Tus respuestas siguen sin cargar. Puedes seguir respondiendo.');
    return false;
  }
}

async function cargar(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ estado: string; resumen: Resumen; intento: Intento | null }>(
      conSufijo(`/api/evaluacion?curso=${cursoId}`),
    );
    if (respuesta.status === 401) {
      window.location.assign(`/login?volver=/evaluacion/${cursoId}`);
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', 'Evaluación cargada.');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    if (!datos.intento) {
      mostrarVacio(datos.resumen);
      return true;
    }
    intento = datos.intento;
    respuestas = intento.preguntas.map(() => null);
    $<HTMLElement>('[data-titulo-esqueleto]').remove();
    $<HTMLElement>('[data-curso-titulo]').textContent = intento.curso.titulo;
    $<HTMLElement>('[data-intento]').textContent = `Intento ${intento.numero} de ${intento.intentosMax}`;
    $<HTMLElement>('[data-nota-minima]').textContent = `Nota mínima ${intento.notaMinima}/20`;
    $<HTMLElement>('[data-datos]').hidden = false;
    cargandoPregunta.hidden = true;
    form.hidden = false;
    mostrar('contenido');
    pintarPregunta();
    const ok = await cargarRespuestas();
    anunciar(anuncio, `Evaluación de ${intento.curso.titulo}, intento ${intento.numero} de ${intento.intentosMax}. Pregunta ${actual + 1} de ${intento.preguntas.length}.`);
    return ok || true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', 'La evaluación sigue sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    else anunciar(anuncio, 'No pudimos cargar la evaluación. Pulsa Reintentar.');
    return false;
  } finally {
    raiz.setAttribute('aria-busy', 'false');
  }
}

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargar(true)) enfocar($<HTMLElement>('[data-titulo-pagina]'));
});

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  if (await cargarRespuestas(true)) enfocar($<HTMLElement>('#navegador-titulo'));
});

// Mientras hay respuestas sin guardar, avisar antes de salir (prevención de errores).
window.addEventListener('beforeunload', (e) => {
  if (pendientes.size || fallida) e.preventDefault();
});

void cargar();
