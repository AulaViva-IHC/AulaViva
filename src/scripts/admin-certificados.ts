// Certificados emitidos + Anular (ver el comentario de src/pages/admin/certificados.astro).
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { abrirModal, cerrarModal } from './modal';
import { limpiarError, mostrarError } from './campo';
import { $, $$, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla } from './util';
import { confirmacionActiva, guardarEnUrl, iniciarResumen, normalizar, sufijos, tx } from './admin-util';

interface Certificado {
  codigo: string;
  estudiante: string;
  curso: string;
  emitido: string;
  estado: 'valido' | 'anulado';
  motivo: string | null;
  anulado: string | null;
}

const { principal, simular } = sufijos();
// Las escrituras en /estados no cambian nada (el servidor responde igual).
const sufijoEscritura = simular ? '?simular=ideal' : '';

const raiz = $<HTMLElement>('[data-certificados]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const filas = $<HTMLElement>('[data-filas]', raiz);
const caption = $<HTMLElement>('[data-caption]', raiz);
const buscar = $<HTMLInputElement>('#buscar-certificado', raiz);
const chips = $$<HTMLButtonElement>('[data-filtro]', raiz);
const sinResultados = $<HTMLElement>('[data-sin-resultados]', raiz);
const limpiar = $<HTMLElement>('[data-limpiar]', raiz);
const anuncio = $<HTMLElement>('[data-anuncio]');
const avisoFlotante = $<HTMLElement>('[data-aviso-flotante]');

// Modal de anulación
const descripcion = $<HTMLElement>('[data-modal-descripcion]');
const motivo = $<HTMLSelectElement>('#motivo-anulacion');
const confirmar = $<HTMLInputElement>('#confirmar-codigo');
const etiquetaConfirmar = $<HTMLLabelElement>('label[for="confirmar-codigo"]');
const coincide = $<HTMLElement>('[data-coincide]');
const casilla = $<HTMLInputElement>('[data-casilla]');
const faltan = $<HTMLElement>('[data-faltan]');
const anular = $<HTMLButtonElement>('[data-anular]');
const cancelar = $<HTMLElement>('[data-cancelar-anular]');
const dialogo = $<HTMLDialogElement>('#modal-anular');

let certificados: Certificado[] = [];
let actual: Certificado | null = null;
const params = new URLSearchParams(window.location.search);
let filtro = ['valido', 'anulado'].includes(params.get('estado') ?? '') ? params.get('estado')! : '';
buscar.value = params.get('q') ?? '';

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
}

function coincideBusqueda(c: Certificado, q: string): boolean {
  return !q || normalizar(`${c.codigo} ${c.estudiante} ${c.curso}`).includes(q);
}

function pintar(): void {
  const q = normalizar(buscar.value);
  const visibles = certificados.filter((c) => (!filtro || c.estado === filtro) && coincideBusqueda(c, q));
  filas.replaceChildren(
    ...visibles.map((c) => {
      const f = plantilla('fila');
      const fila = $<HTMLTableRowElement>('tr', f);
      fila.dataset.codigoFila = c.codigo;
      if (c.estado === 'anulado') fila.classList.add('fila--anulada');
      $<HTMLElement>('[data-codigo]', f).textContent = c.codigo;
      $<HTMLElement>('[data-estudiante]', f).textContent = c.estudiante;
      $<HTMLElement>('[data-curso]', f).textContent = c.curso;
      $<HTMLElement>('[data-emitido]', f).textContent = c.emitido;
      $<HTMLElement>('[data-estado]', f).append(plantilla(c.estado));
      const accion = $<HTMLElement>('[data-accion]', f);
      if (c.estado === 'valido') {
        const boton = plantilla('anular');
        const b = $<HTMLButtonElement>('[data-abrir-anular]', boton);
        b.dataset.codigo = c.codigo;
        b.setAttribute('aria-label', tx('certificados.anularNombre', { codigo: c.codigo, estudiante: c.estudiante }));
        accion.append(boton);
      } else {
        const nota = document.createElement('span');
        nota.className = 'fila__motivo';
        nota.textContent = c.motivo ? tx('certificados.motivo', { motivo: c.motivo }) : '';
        accion.append(nota);
      }
      return f;
    }),
  );
  // Contadores de los chips (se calculan con la búsqueda aplicada)
  for (const nodo of $$<HTMLElement>('[data-contar]', raiz)) {
    const estado = nodo.dataset.contar;
    nodo.textContent = String(certificados.filter((c) => (!estado || c.estado === estado) && coincideBusqueda(c, q)).length);
  }
  for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.filtro === filtro));
  const filtrando = Boolean(q || filtro);
  caption.textContent = filtrando
    ? tx('certificados.resultados', { n: visibles.length, total: certificados.length })
    : tx('certificados.cargados', { n: certificados.length });
  sinResultados.hidden = visibles.length > 0;
  $<HTMLElement>('.tabla-adm__envoltura', raiz).hidden = visibles.length === 0;
}

async function cargar(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  // Firma de Progreso (Act. 14): carga automática → gotas solo si tarda más de 1 s.
  const progreso = reintento ? null : iniciarProgreso(raiz, { automatico: true, texto: tx('certificados.cargando') });
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ certificados: Certificado[] }>(`/api/admin/certificados${principal}`);
    if (respuesta.status === 401 || respuesta.status === 403) {
      window.location.assign('/login?volver=/admin/certificados');
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', tx('certificados.cargados', { n: datos.certificados.length }));
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    certificados = datos.certificados;
    if (certificados.length === 0) {
      mostrar('vacio');
      anunciar(anuncio, tx('certificados.vacioAnuncio'));
      return true;
    }
    mostrar('contenido');
    pintar();
    anunciar(anuncio, caption.textContent ?? '');
    return true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', tx('certificados.errorSigue'));
    return false;
  } finally {
    progreso?.detener();
    raiz.setAttribute('aria-busy', 'false');
  }
}

// ─── Búsqueda y filtro (se guardan en la URL) ───────────────────────

let espera = 0;
buscar.addEventListener('input', () => {
  window.clearTimeout(espera);
  espera = window.setTimeout(() => {
    guardarEnUrl({ q: buscar.value.trim() });
    pintar();
    anunciar(anuncio, caption.textContent ?? '');
  }, 200);
});
buscar.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && buscar.value) {
    e.preventDefault();
    limpiarBusqueda(null);
  }
});

for (const chip of chips) {
  chip.addEventListener('click', () => {
    filtro = chip.dataset.filtro ?? '';
    guardarEnUrl({ estado: filtro });
    pintar();
    anunciar(anuncio, caption.textContent ?? '');
  });
}

function limpiarBusqueda(boton: HTMLElement | null): void {
  buscar.value = '';
  filtro = '';
  guardarEnUrl({ q: '', estado: '' });
  pintar();
  retroalimentar(boton, 'cancelacion', tx('comun.busquedaQuitada'));
  buscar.focus();
}
limpiar.addEventListener('click', () => limpiarBusqueda(limpiar));

// ─── Anular (confirmación activa) ───────────────────────────────────

const confirmacion = confirmacionActiva({
  boton: anular,
  etiqueta: $<HTMLElement>('[data-anular-texto]', anular),
  faltan,
  accion: tx('certificados.anular'),
  textoListo: tx('certificados.anularCertificado'),
  pendientes: () => {
    const lista: string[] = [];
    if (!motivo.value) lista.push(tx('certificados.faltaMotivo'));
    if (!actual || confirmar.value !== actual.codigo) lista.push(tx('certificados.faltaCodigo'));
    if (!casilla.checked) lista.push(tx('certificados.faltaCasilla'));
    return lista;
  },
});

function revisarCodigo(alSalir: boolean): void {
  if (!actual) return;
  // Mayúsculas automáticas y sin espacios (como en /verificar)
  const limpio = confirmar.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (confirmar.value !== limpio) confirmar.value = limpio;
  const ok = limpio === actual.codigo;
  coincide.hidden = !ok;
  if (ok || !limpio) limpiarError(confirmar);
  else if (alSalir || limpio.length === actual.codigo.length) {
    // Validar al salir (o al completar los 10): decir qué hacer
    mostrarError(
      confirmar,
      limpio.length < actual.codigo.length
        ? tx('certificados.codigoFaltan', { n: actual.codigo.length - limpio.length })
        : tx('certificados.codigoNoCoincide', { codigo: actual.codigo }),
    );
  }
  confirmacion.actualizar();
}

filas.addEventListener('click', (e) => {
  const boton = (e.target as Element).closest<HTMLButtonElement>('[data-abrir-anular]');
  if (!boton) return;
  actual = certificados.find((c) => c.codigo === boton.dataset.codigo) ?? null;
  if (!actual) return;
  // Limpio cada vez: nada queda marcado de una anulación anterior
  descripcion.replaceChildren(...textoConNombres(tx('certificados.modalTexto'), { estudiante: actual.estudiante, curso: actual.curso }));
  etiquetaConfirmar.textContent = tx('certificados.codigoEtiqueta', { codigo: actual.codigo });
  motivo.value = '';
  confirmar.value = '';
  casilla.checked = false;
  coincide.hidden = true;
  limpiarError(confirmar);
  limpiarError(motivo);
  ponerEstado(anular, 'normal');
  confirmacion.reiniciar();
  confirmacion.actualizar();
  abrirModal('modal-anular', motivo);
});

/** "El certificado de {estudiante} en {curso}…" con los nombres en negrita (como en admin-06). */
function textoConNombres(plantillaTexto: string, valores: Record<string, string>): Node[] {
  return plantillaTexto.split(/(\{\w+\})/).map((parte) => {
    const nombre = parte.match(/^\{(\w+)\}$/)?.[1];
    if (!nombre || !(nombre in valores)) return document.createTextNode(parte);
    const fuerte = document.createElement('strong');
    fuerte.className = 'modal-nombre';
    fuerte.textContent = valores[nombre];
    return fuerte;
  });
}

motivo.addEventListener('change', () => {
  if (motivo.value) limpiarError(motivo);
  confirmacion.actualizar();
});
motivo.addEventListener('blur', () => {
  if (!motivo.value && dialogo.open) mostrarError(motivo, tx('certificados.motivoFalta'));
});
confirmar.addEventListener('input', () => revisarCodigo(false));
confirmar.addEventListener('blur', () => revisarCodigo(true));
casilla.addEventListener('change', () => confirmacion.actualizar());

cancelar.addEventListener('click', () => {
  if (estaOcupado(anular)) return;
  cerrarModal('modal-anular');
  retroalimentar(cancelar, 'cancelacion', tx('certificados.cancelado'));
});
dialogo.addEventListener('close', () => confirmacion.reiniciar());

anular.addEventListener('click', async () => {
  if (!actual || estaOcupado(anular)) return;
  if (anular.getAttribute('aria-disabled') === 'true' || !confirmacion.habilitado()) {
    // Aún no se puede: dice qué falta y lleva al primer campo pendiente
    confirmacion.actualizar();
    retroalimentar(anular, 'error', faltan.textContent || tx('certificados.errorAnular'));
    confirmacion.actualizar();
    (!motivo.value ? motivo : confirmar.value !== actual.codigo ? confirmar : casilla).focus();
    return;
  }
  procesar(anular);
  const codigo = actual.codigo;
  const inicio = performance.now();
  let respuesta: Response | null = null;
  let datos: { certificado?: Certificado; mensaje?: string } = {};
  try {
    ({ respuesta, datos } = await pedirJSON<{ certificado?: Certificado; mensaje?: string }>(`/api/admin/certificados${sufijoEscritura}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, motivo: motivo.value, confirmacion: confirmar.value }),
    }));
  } catch {
    respuesta = null;
  }
  await completarCarga(inicio);

  if (respuesta?.status === 401 || respuesta?.status === 403) {
    retroalimentar(anular, 'error', tx('comun.sesionTerminada'));
    window.setTimeout(() => window.location.assign('/login?volver=/admin/certificados'), 1500);
    return;
  }
  if (respuesta?.status === 409 && datos.certificado) {
    reemplazar(datos.certificado);
    retroalimentar(anular, 'error', tx('certificados.yaAnulado'));
    await esperar(ESPERA_EXITO_MS);
    cerrarModal('modal-anular');
    pintar();
    return;
  }
  if (!respuesta?.ok || !datos.certificado) {
    retroalimentar(
      anular,
      'error',
      respuesta?.status === 404 ? tx('certificados.noEncontrado') : respuesta ? tx('certificados.errorAnular') : tx('comun.sinConexion'),
    );
    window.setTimeout(() => confirmacion.reiniciar(), 360); // vuelve a pedir la espera de 3 s
    window.setTimeout(() => confirmacion.actualizar(), 380);
    return;
  }

  // Éxito: verde con check + campanita + vibración + anuncio, en el mismo instante (§5.8)
  const mensaje = tx('certificados.anuladoAnuncio', { codigo });
  retroalimentar(anular, 'exito', mensaje);
  reemplazar(datos.certificado);
  await esperar(ESPERA_EXITO_MS);
  cerrarModal('modal-anular');
  pintar();
  mostrarAvisoFlotante(mensaje);
  // El botón "Anular" de esa fila ya no existe: el foco va a su código (no se pierde)
  enfocar(filas.querySelector<HTMLElement>(`[data-codigo-fila="${codigo}"] [data-codigo]`) ?? $<HTMLElement>('[data-titulo-pagina]'));
});

function reemplazar(nuevo: Certificado): void {
  certificados = certificados.map((c) => (c.codigo === nuevo.codigo ? nuevo : c));
}

let ocultarAviso = 0;
function mostrarAvisoFlotante(texto: string): void {
  $<HTMLElement>('[data-aviso-texto]', avisoFlotante).textContent = texto;
  avisoFlotante.hidden = false;
  window.clearTimeout(ocultarAviso);
  ocultarAviso = window.setTimeout(() => (avisoFlotante.hidden = true), 5000);
}

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargar(true)) enfocar($<HTMLElement>('[data-titulo-pagina]'));
});

iniciarResumen((r) => ({ validos: r.certificados.validos, anulados: r.certificados.anulados, inscripciones: r.inscripciones }));
void cargar();
