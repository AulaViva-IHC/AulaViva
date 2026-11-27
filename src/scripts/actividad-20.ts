// Act. 20 · Escala SAM en flujos críticos (ver el comentario de src/pages/actividad-20.astro).
//   Prueba: código del participante → "Empezar flujo A/B" crea la sesión SAM (sam.ts), cambia a la cuenta
//           de prueba (POST /api/actividad-20/sesion) y abre el inicio del flujo. Datos de prueba con
//           GET /api/actividad-20/estado (si falla → parcial) y POST /api/actividad-20/preparar.
//   Resultados: GET /api/actividad-20/respuestas (ideal, vacío, cargando, error) + estado aparte (parcial).
import { estaOcupado, ponerEstado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { abrirModal, cerrarModal } from './modal';
import { limpiarError, mostrarError } from './campo';
import { $, $$, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';
import { crearTx, guardarSesionSam } from './sam';
import {
  DIMENSIONES,
  FLUJOS,
  PASOS,
  analizarFlujo,
  formatearDuracion,
  normalizarParticipante,
  validarParticipante,
  type DatosRespuestaSam,
  type FlujoSam,
} from '../lib/sam';

interface Respuesta extends DatosRespuestaSam {
  id: number;
  fecha: string;
}
interface EstadoPruebas {
  flujoA: { intentosUsados: number; aprobado: boolean; certificado: boolean; listo: boolean };
  cursosDePrueba: number;
  respuestas: number;
  siguienteParticipante: string;
}

const tx = crearTx('textos-a20');
const raiz = $<HTMLElement>('[data-a20]');
const anuncio = $<HTMLElement>('[data-anuncio]', raiz);
const simular = simulacion();
const conSufijo = (url: string) => (simular ? `${url}${url.includes('?') ? '&' : '?'}simular=${simular}` : url);
const CLAVE_BORRADOR_CURSO = 'aulaviva:borradorCurso'; // el mismo de crear-curso.ts

const nombrePaso = (p: string) => tx(`sam.pasos.${p}`);
const numero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });
const fechaHora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]) {
  const nodo = Object.assign(document.createElement(tag), props);
  nodo.append(...hijos);
  return nodo;
}

/** Icono de alerta o check (mismos trazos que Icono.astro), para que el estado nunca sea solo color. */
function icono(nombre: 'alerta' | 'check' | 'info'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const trazos = {
    alerta: ['M12 3 2 21h20L12 3z', 'M12 10v5', 'M12 18h.01'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v6', 'M12 7.5h.01'],
  }[nombre];
  for (const d of trazos) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Insignia "Punto crítico" (Badge rojo: icono + palabra, nunca solo color). */
function insigniaCritica(): DocumentFragment {
  return plantilla('critico');
}

// ─── Estado de los datos de prueba (las dos vistas; si falla → parcial) ───
const estadoRegion = raiz.querySelector<HTMLElement>('[data-estado-region]');
const estadoLista = raiz.querySelector<HTMLElement>('[data-estado-lista]');
const parcial = $<HTMLElement>('[data-estado-parcial]', raiz);
const reconectar = $<HTMLElement>('[data-accion="reconectar"]', parcial);
let estado: EstadoPruebas | null = null;

function pintarEstado(e: EstadoPruebas): void {
  if (!estadoLista) return;
  const fila = (ok: boolean, texto: string) => {
    const li = el('li');
    li.append(icono(ok ? 'check' : 'alerta'), el('span', { textContent: texto }));
    li.style.color = ok ? 'var(--grn)' : 'var(--org)';
    return li;
  };
  const a = e.flujoA;
  estadoLista.replaceChildren(
    fila(
      a.listo,
      a.listo
        ? tx('a20.estadoListo')
        : tx('a20.estadoUsado', { intentos: a.intentosUsados, certificado: a.certificado ? tx('a20.estadoCertificado') : '' }),
    ),
    fila(true, tx('a20.estadoCursos', { n: e.cursosDePrueba })),
    fila(true, tx('a20.estadoRespuestas', { n: e.respuestas })),
  );
  estadoLista.querySelectorAll<HTMLElement>('li').forEach((li, i) => i > 0 && (li.style.color = 'var(--ink2)'));
}

async function cargarEstado(reintento = false): Promise<boolean> {
  estadoRegion?.setAttribute('aria-busy', 'true');
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<EstadoPruebas>(conSufijo('/api/actividad-20/estado'));
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    estado = datos;
    parcial.hidden = true;
    if (estadoLista) estadoLista.hidden = false;
    pintarEstado(datos);
    sugerirParticipante(datos.siguienteParticipante);
    if (reintento) {
      retroalimentar(reconectar, 'exito');
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reconectar, 'normal');
    }
    return true;
  } catch {
    await completarCarga(inicio);
    if (estadoLista) estadoLista.hidden = true;
    parcial.hidden = false;
    if (reintento) retroalimentar(reconectar, 'error', tx('a20.errorPreparar'));
    return false;
  } finally {
    estadoRegion?.setAttribute('aria-busy', 'false');
  }
}

reconectar.addEventListener('click', async () => {
  if (estaOcupado(reconectar)) return;
  procesar(reconectar);
  await cargarEstado(true);
});

// ─── Vista de prueba ────────────────────────────────────────────────
const campo = raiz.querySelector<HTMLInputElement>('[data-participante]');
const sugerido = raiz.querySelector<HTMLElement>('[data-sugerido]');

/** Valor por defecto inteligente (§5.3): el siguiente código libre, marcado como "Sugerido". */
function sugerirParticipante(codigo: string): void {
  if (!campo || !sugerido || (campo.value && !campo.dataset.sugerido)) return;
  campo.value = codigo;
  campo.dataset.sugerido = 'si';
  sugerido.hidden = false;
}

function validarCampo(): string | null {
  if (!campo) return null;
  campo.value = normalizarParticipante(campo.value);
  const error = validarParticipante(campo.value);
  if (error) mostrarError(campo, error);
  else limpiarError(campo);
  return error;
}

if (campo && sugerido) {
  campo.addEventListener('input', () => {
    delete campo.dataset.sugerido;
    sugerido.hidden = true;
    if (!validarParticipante(normalizarParticipante(campo.value))) limpiarError(campo);
  });
  campo.addEventListener('blur', () => {
    if (campo.value) validarCampo(); // validar al salir del campo
  });

  const errorEmpezar = $<HTMLElement>('[data-empezar-error]', raiz);
  const errorEmpezarTexto = $<HTMLElement>('[data-empezar-error-texto]', raiz);

  for (const boton of $$<HTMLButtonElement>('[data-empezar]', raiz)) {
    boton.addEventListener('click', async () => {
      if (estaOcupado(boton)) return; // ningún envío doble
      const flujo = boton.dataset.empezar as FlujoSam;
      errorEmpezar.hidden = true;
      const errorCampo = validarCampo();
      if (errorCampo) {
        mostrarError(campo, errorCampo, { sacudir: true });
        retroalimentar(boton, 'error', errorCampo);
        campo.focus();
        return;
      }
      procesar(boton);
      const inicio = performance.now();
      let status = 0;
      let datos: { destino?: string; mensaje?: string } = {};
      try {
        const r = await pedirJSON<typeof datos>('/api/actividad-20/sesion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flujo }),
        });
        status = r.respuesta.status;
        datos = r.datos;
      } catch {
        /* sin conexión */
      }
      await completarCarga(inicio);
      if (status === 200 && datos.destino) {
        // La duración se mide desde aquí hasta el final del flujo (A4/A5 o B5).
        guardarSesionSam({ participante: campo.value, flujo, inicio: Date.now() });
        if (flujo === 'B') {
          try {
            localStorage.removeItem(CLAVE_BORRADOR_CURSO); // cada participante empieza Crear curso de cero
          } catch {
            /* sin almacenamiento */
          }
        }
        retroalimentar(boton, 'exito', tx('a20.empezado', { participante: campo.value, flujo }));
        await esperar(ESPERA_EXITO_MS);
        window.location.assign(datos.destino);
        return;
      }
      const texto =
        status === 404 ? tx('a20.soloDesarrollo') : status === 409 || status === 422 ? (datos.mensaje ?? tx('a20.errorEmpezar')) : tx('a20.errorEmpezar');
      errorEmpezarTexto.textContent = texto;
      errorEmpezar.hidden = false;
      retroalimentar(boton, 'error', texto);
      if (status === 409) enfocar($<HTMLElement>('[data-preparar="flujo-a"]', raiz));
    });
  }

  // Preparar flujo A / Borrar cursos de prueba: confirmación sencilla (solo datos de prueba).
  for (const abrir of $$<HTMLButtonElement>('[data-preparar]', raiz)) {
    abrir.addEventListener('click', () => {
      const que = abrir.dataset.preparar!;
      const modal = $<HTMLDialogElement>(`#modal-${que}`);
      $<HTMLElement>('[data-preparar-error]', modal).hidden = true;
      ponerEstado($<HTMLElement>('[data-confirmar-preparar]', modal), 'normal');
      abrirModal(`modal-${que}`, $<HTMLElement>('[data-cancelar-preparar]', modal));
    });
  }
  for (const cancelar of $$<HTMLButtonElement>('[data-cancelar-preparar]')) {
    cancelar.addEventListener('click', () => {
      cancelar.closest('dialog')?.close();
      retroalimentar(cancelar, 'cancelacion', tx('a20.cancelado'));
    });
  }
  for (const confirmar of $$<HTMLButtonElement>('[data-confirmar-preparar]')) {
    confirmar.addEventListener('click', async () => {
      if (estaOcupado(confirmar)) return;
      const que = confirmar.dataset.confirmarPreparar!;
      const modal = confirmar.closest('dialog')!;
      const error = $<HTMLElement>('[data-preparar-error]', modal);
      error.hidden = true;
      procesar(confirmar);
      const inicio = performance.now();
      let datos: { ok?: boolean; borrados?: number; mensaje?: string } = {};
      let ok = false;
      try {
        const r = await pedirJSON<typeof datos>(conSufijo('/api/actividad-20/preparar'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ que }),
        });
        ok = r.respuesta.ok;
        datos = r.datos;
        if (r.respuesta.status === 404) datos.mensaje = tx('a20.soloDesarrollo');
      } catch {
        /* sin conexión */
      }
      await completarCarga(inicio);
      if (!ok) {
        const texto = datos.mensaje ?? tx('a20.errorPreparar');
        $<HTMLElement>('span', error).textContent = texto;
        error.hidden = false;
        retroalimentar(confirmar, 'error', texto);
        return;
      }
      const texto = que === 'flujo-a' ? tx('a20.preparado') : tx('a20.borrados', { n: datos.borrados ?? 0 });
      retroalimentar(confirmar, 'exito', texto);
      await esperar(ESPERA_EXITO_MS);
      cerrarModal(modal.id);
      void cargarEstado();
    });
  }

  void cargarEstado();
}

// ─── Vista de resultados ────────────────────────────────────────────
const zona = raiz.querySelector<HTMLElement>('[data-resultados]');
if (zona) iniciarResultados(zona);

function iniciarResultados(zona: HTMLElement): void {
  const contenido = $<HTMLElement>('[data-region="contenido"]', zona);
  const vacio = $<HTMLElement>('[data-region="vacio"]', zona);
  const error = $<HTMLElement>('[data-region="error"]', zona);
  const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
  const resumen = $<HTMLElement>('[data-resumen]', zona);
  const herramientas = $<HTMLElement>('[data-herramientas]', zona);
  const copiar = $<HTMLButtonElement>('[data-copiar]', zona);
  const copiarManual = $<HTMLElement>('[data-copiar-manual]', zona);
  const copiarTexto = $<HTMLTextAreaElement>('[data-copiar-texto]', zona);
  let respuestas: Respuesta[] = [];

  function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
    contenido.hidden = region !== 'contenido';
    vacio.hidden = region !== 'vacio';
    error.hidden = region !== 'error';
  }

  function pintarFlujo(flujo: FlujoSam): void {
    const tarjeta = $<HTMLElement>(`[data-flujo-resultados="${flujo}"]`, zona);
    const titulo = $<HTMLElement>('h2', tarjeta);
    const suyas = respuestas.filter((r) => r.flujo === flujo);
    const a = analizarFlujo(flujo, suyas);
    const partes: Node[] = [];
    partes.push(el('p', { className: 'secundario', textContent: a.n === 1 ? tx('a20.resultados.respuesta') : tx('a20.resultados.respuestas', { n: a.n }) }));

    if (!a.n || !a.promedios) {
      partes.push(el('p', { textContent: tx('a20.resultados.flujoVacio') }));
      tarjeta.replaceChildren(titulo, ...partes);
      return;
    }

    // Puntos críticos (región roja con icono + texto) o "sin puntos críticos" (verde con check).
    const motivos: string[] = [
      ...a.conteo.filter((c) => c.critico).map((c) => tx('a20.resultados.criticoPaso', { paso: `${c.paso} · ${nombrePaso(c.paso)}`, n: c.veces })),
      ...a.dimensionesCriticas.map((d) =>
        tx(`a20.resultados.critico${d === 'valencia' ? 'Valencia' : d === 'activacion' ? 'Activacion' : 'Control'}`, { x: numero.format(a.promedios![d]) }),
      ),
    ];
    if (a.critico) {
      const caja = el('div', { className: 'aviso aviso--error' });
      const cuerpo = el('div', { className: 'res__critico-cuerpo' });
      cuerpo.append(el('p', { className: 'res__titulo', textContent: tx('a20.resultados.critico') }), el('ul', {}, ...motivos.map((m) => el('li', { textContent: m }))));
      caja.append(icono('alerta'), cuerpo);
      partes.push(caja);
    } else {
      const caja = el('p', { className: 'aviso aviso--info' });
      caja.append(icono('check'), el('span', { textContent: tx('a20.resultados.sinCriticos') }));
      partes.push(caja);
    }

    // Promedios
    partes.push(el('h3', { className: 'res__titulo', textContent: tx('a20.resultados.promedios') }));
    const dl = el('dl', { className: 'res__promedios' });
    for (const d of DIMENSIONES) {
      const x = a.promedios[d];
      const critica = a.dimensionesCriticas.includes(d);
      const caja = el('div', { className: `res__promedio${critica ? ' res__promedio--critico' : ''}` });
      const dd = el('dd');
      const barra = el('span', { className: 'res__barra' });
      barra.setAttribute('aria-hidden', 'true');
      const relleno = el('span');
      relleno.style.width = `${((x - 1) / 8) * 100}%`;
      barra.append(relleno);
      dd.append(el('span', { className: 'res__valor', textContent: `${numero.format(x)} / 9` }), barra);
      if (critica) dd.append(insigniaCritica());
      caja.append(el('dt', { textContent: tx(`sam.${d}.titulo`) }), dd);
      dl.append(caja);
    }
    partes.push(dl);

    // Paso que más costó
    const tablaPasos = el('table', { className: 'tabla' });
    tablaPasos.append(el('caption', { textContent: tx('a20.resultados.conteo') }));
    const cuerpoPasos = el('tbody');
    const maximo = Math.max(1, ...a.conteo.map((c) => c.veces));
    for (const c of a.conteo) {
      const fila = el('tr', { className: c.critico ? 'fila--critica' : '' });
      const barra = el('span', { className: 'res__barra' });
      barra.setAttribute('aria-hidden', 'true');
      const relleno = el('span');
      relleno.style.width = `${(c.veces / maximo) * 100}%`;
      barra.append(relleno);
      const estadoCelda = el('td');
      if (c.critico) estadoCelda.append(insigniaCritica());
      fila.append(
        el('th', { scope: 'row', textContent: `${c.paso} · ${nombrePaso(c.paso)}` }),
        el('td', { textContent: c.veces === 1 ? tx('a20.resultados.vez', { n: 1 }) : tx('a20.resultados.veces', { n: c.veces }) }),
        el('td', { className: 'res__col-barra' }, barra),
        estadoCelda,
      );
      cuerpoPasos.append(fila);
    }
    tablaPasos.append(cuerpoPasos);
    partes.push(envolverTabla(tablaPasos, `${titulo.textContent} · ${tx('a20.resultados.conteo')}`));

    // Tabla de respuestas
    const tabla = el('table', { className: 'tabla tabla--respuestas' });
    tabla.append(el('caption', { textContent: tx('a20.resultados.tabla', { flujo }) }));
    const columnas = [
      'colParticipante',
      'colValencia',
      'colActivacion',
      'colControl',
      'colPaso',
      ...(flujo === 'A' ? ['colAprobado'] : []),
      'colDuracion',
      'colFecha',
      'colComentario',
    ];
    const cabeza = el('tr');
    for (const c of columnas) cabeza.append(el('th', { scope: 'col', textContent: tx(`a20.resultados.${c}`) }));
    tabla.append(el('thead', {}, cabeza));
    const cuerpo = el('tbody');
    for (const r of suyas) {
      const fila = el('tr');
      fila.append(
        el('th', { scope: 'row', textContent: r.participante }),
        el('td', { textContent: String(r.valencia) }),
        el('td', { textContent: String(r.activacion) }),
        el('td', { textContent: String(r.control) }),
        el('td', { textContent: `${r.pasoDificil} · ${nombrePaso(r.pasoDificil)}` }),
        ...(flujo === 'A' ? [el('td', { textContent: r.aprobado === null ? '—' : r.aprobado ? tx('a20.resultados.si') : tx('a20.resultados.no') })] : []),
        el('td', { textContent: formatearDuracion(r.duracionSeg) }),
        el('td', { textContent: fechaHora.format(new Date(r.fecha)) }),
        el('td', { className: 'res__comentario', textContent: r.comentario || tx('a20.resultados.sinComentario') }),
      );
      cuerpo.append(fila);
    }
    tabla.append(cuerpo);
    partes.push(envolverTabla(tabla, tx('a20.resultados.tabla', { flujo })));

    tarjeta.replaceChildren(titulo, ...partes);
  }

  /** Tabla con desplazamiento horizontal propio (la página no se desplaza de lado en móvil). */
  function envolverTabla(tabla: HTMLTableElement, nombre: string): HTMLElement {
    const caja = el('div', { className: 'tabla-scroll', tabIndex: 0 });
    caja.setAttribute('role', 'region');
    caja.setAttribute('aria-label', nombre);
    caja.append(tabla);
    return caja;
  }

  async function cargar(reintento = false): Promise<boolean> {
    zona.setAttribute('aria-busy', 'true');
    const progreso = reintento ? null : iniciarProgreso(zona, { automatico: true, texto: tx('a20.resultados.cargando') });
    if (simular === 'cargando') return new Promise(() => {});
    const inicio = performance.now();
    try {
      const { respuesta, datos } = await pedirJSON<{ respuestas: Respuesta[] }>(conSufijo('/api/actividad-20/respuestas'));
      if (respuesta.status === 401) {
        window.location.assign('/login?volver=/actividad-20?ver=resultados');
        return false;
      }
      if (!respuesta.ok) throw new Error('servidor');
      await completarCarga(inicio);
      if (reintento) {
        retroalimentar(reintentar, 'exito', tx('a20.resultados.cargados'));
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(reintentar, 'normal');
      }
      respuestas = datos.respuestas;
      if (!respuestas.length) {
        mostrar('vacio');
        anunciar(anuncio, tx('a20.resultados.vacioTitulo'));
        return true;
      }
      mostrar('contenido');
      resumen.textContent = respuestas.length === 1 ? tx('a20.resultados.respuesta') : tx('a20.resultados.respuestas', { n: respuestas.length });
      herramientas.hidden = false;
      FLUJOS.forEach(pintarFlujo);
      anunciar(anuncio, `${tx('a20.resultados.cargados')} ${resumen.textContent}`);
      void cargarEstado(); // aparte: si falla, parcial con "Reconectar"
      return true;
    } catch {
      await completarCarga(inicio);
      mostrar('error');
      if (reintento) retroalimentar(reintentar, 'error', tx('a20.resultados.errorSigue'));
      else anunciar(anuncio, tx('a20.resultados.errorTitulo'));
      return false;
    } finally {
      progreso?.detener();
      zona.setAttribute('aria-busy', 'false');
    }
  }

  reintentar.addEventListener('click', async () => {
    if (estaOcupado(reintentar)) return;
    procesar(reintentar);
    if (await cargar(true)) enfocar($<HTMLElement>('[data-titulo-pagina], h1'));
  });

  // ─── Copiar como texto (tabla alineada) y CSV ─────────────────────
  function textoResultados(): string {
    const lineas = ['AulaViva · Act. 20 · Escala SAM en flujos críticos', `${tx('a20.resultados.reglas')}`, ''];
    for (const flujo of FLUJOS) {
      const suyas = respuestas.filter((r) => r.flujo === flujo);
      const a = analizarFlujo(flujo, suyas);
      lineas.push(`${tx(`a20.flujo${flujo}.titulo`)} · ${a.n === 1 ? tx('a20.resultados.respuesta') : tx('a20.resultados.respuestas', { n: a.n })}`);
      if (!a.n || !a.promedios) {
        lineas.push(tx('a20.resultados.flujoVacio'), '');
        continue;
      }
      const cab = ['Part.', 'Val.', 'Act.', 'Ctrl.', 'Paso', ...(flujo === 'A' ? ['Aprobó'] : []), 'Duración', 'Fecha', 'Comentario'];
      const filas = suyas.map((r) => [
        r.participante,
        String(r.valencia),
        String(r.activacion),
        String(r.control),
        r.pasoDificil,
        ...(flujo === 'A' ? [r.aprobado === null ? '—' : r.aprobado ? 'Sí' : 'No'] : []),
        formatearDuracion(r.duracionSeg),
        fechaHora.format(new Date(r.fecha)),
        r.comentario.replace(/\s+/g, ' '),
      ]);
      const anchos = cab.map((c, i) => Math.max(c.length, ...filas.slice(0).map((f) => (i === cab.length - 1 ? 0 : f[i].length))));
      const linea = (celdas: string[]) => celdas.map((c, i) => (i === celdas.length - 1 ? c : c.padEnd(anchos[i]))).join('  ');
      lineas.push(linea(cab), ...filas.map(linea));
      lineas.push(
        `${tx('a20.resultados.promedios')}: ${DIMENSIONES.map((d) => `${tx(`sam.${d}.titulo`)} ${numero.format(a.promedios![d])}`).join(' · ')}`,
        `${tx('a20.resultados.conteo')}: ${a.conteo.map((c) => `${c.paso} ${c.veces}`).join(' · ')}`,
      );
      const criticos = [
        ...a.conteo.filter((c) => c.critico).map((c) => `${c.paso} (${nombrePaso(c.paso)}) elegido ${c.veces} veces`),
        ...a.dimensionesCriticas.map((d) => `${tx(`sam.${d}.titulo`)} ${numero.format(a.promedios![d])}`),
      ];
      lineas.push(`${tx('a20.resultados.critico')}: ${criticos.length ? criticos.join('; ') : tx('a20.resultados.sinCriticos')}`, '');
      lineas.push(`Pasos: ${PASOS[flujo].map((p) => `${p} = ${nombrePaso(p)}`).join(' · ')}`, '');
    }
    return lineas.join('\n').trim();
  }

  copiar.addEventListener('click', async () => {
    if (estaOcupado(copiar)) return;
    procesar(copiar);
    const inicio = performance.now();
    const texto = textoResultados();
    try {
      await navigator.clipboard.writeText(texto);
      await completarCarga(inicio);
      copiarManual.hidden = true;
      retroalimentar(copiar, 'exito');
      await esperar(ESPERA_EXITO_MS * 2);
      ponerEstado(copiar, 'normal');
    } catch {
      await completarCarga(inicio);
      copiarTexto.value = texto;
      copiarManual.hidden = false;
      retroalimentar(copiar, 'error', tx('a20.resultados.copiarError'));
      copiarTexto.focus();
      copiarTexto.select();
    }
  });

  const csv = $<HTMLButtonElement>('[data-csv]', zona);
  csv.addEventListener('click', () => {
    const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const filas: (string | number)[][] = [
      ['participante', 'flujo', 'valencia', 'activacion', 'control', 'paso_dificil', 'paso_nombre', 'aprobado', 'duracion_seg', 'fecha', 'comentario'],
      ...respuestas.map((r) => [
        r.participante,
        r.flujo,
        r.valencia,
        r.activacion,
        r.control,
        r.pasoDificil,
        nombrePaso(r.pasoDificil),
        r.aprobado === null ? '' : r.aprobado ? 'si' : 'no',
        r.duracionSeg,
        r.fecha,
        r.comentario,
      ]),
    ];
    const texto = '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n'); // BOM: Excel lee bien las tildes
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `sam-aulaviva-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    retroalimentar(csv, 'exito-suave', tx('a20.resultados.csvAnuncio'));
    window.setTimeout(() => ponerEstado(csv, 'normal'), ESPERA_EXITO_MS);
  });

  void cargar();
}
