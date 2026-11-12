// Act. 14 · Firmas multimodales (src/pages/actividad-14.astro).
// · Demostraciones: cada botón dispara su firma COMPLETA con retroalimentar() / iniciarProgreso()
//   (visual + sonido + vibración + aria-live en el mismo instante).
// · Interruptor "Sonido: activado / silenciado" (aria-pressed, WCAG 1.4.2): solo existe aquí;
//   guardarSilencio() lo deja en localStorage y retroalimentar() lo respeta en todo el sitio.
// · "Escuchar" de la matriz y la prueba a ciegas usan reproducirFirma(): solo sonido + vibración,
//   sin ningún cambio visual ni anuncio (así la prueba no delata el estado).
// · Prueba a ciegas: cada firma sale el mismo número de veces en orden aleatorio; las respuestas
//   reales se guardan en este navegador y se muestra la matriz de confusión (filas = real).
import { ponerEstado, estaOcupado, textosBoton } from './boton';
import {
  desbloquearAudio,
  guardarSilencio,
  iniciarProgreso,
  procesar,
  reproducirFirma,
  retroalimentar,
  sonidoSilenciado,
  type Firma,
} from './multimodal';
import { abrirModal, cerrarModal } from './modal';
import { mostrarError, limpiarError } from './campo';
import { $, $$, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, plantilla } from './util';

const FIRMAS: Firma[] = ['exito', 'error', 'cancelacion', 'progreso'];
const NOMBRE: Record<Firma, string> = {
  exito: 'Éxito',
  error: 'Error',
  cancelacion: 'Cancelación',
  progreso: 'Progreso',
};
/** Pausa tras el clic del botón para que no se mezcle con la firma. */
const PAUSA_CLIC_MS = 150;

// ═══ Interruptor de sonido (solo en esta página) ════════════════════
const interruptor = document.querySelector<HTMLButtonElement>('[data-sonido]');
if (interruptor) {
  const texto = $<HTMLElement>('[data-sonido-texto]', interruptor);
  const anuncio = $<HTMLElement>('[data-anuncio-sonido]');
  const pintar = () => {
    const activo = !sonidoSilenciado();
    interruptor.setAttribute('aria-pressed', String(activo));
    texto.textContent = activo ? 'Sonido: activado' : 'Sonido: silenciado';
  };
  pintar();
  interruptor.addEventListener('click', () => {
    guardarSilencio(!sonidoSilenciado());
    pintar();
    anunciar(
      anuncio,
      sonidoSilenciado()
        ? 'Sonido silenciado en todo el sitio. Tampoco vibrará.'
        : 'Sonido activado en todo el sitio.',
    );
  });
}

// ═══ Demostraciones ═════════════════════════════════════════════════
const demos = $$<HTMLButtonElement>('[data-demo]');
const demoError = document.querySelector<HTMLElement>('[data-demo-error]');

for (const boton of demos) {
  boton.addEventListener('click', () => {
    if (estaOcupado(boton) || boton.dataset.estado === 'error') return;
    switch (boton.dataset.demo as Firma) {
      case 'exito':
        return void demoExito(boton);
      case 'error':
        return void demoError_(boton);
      case 'cancelacion':
        return retroalimentar(boton, 'cancelacion', 'Operación cancelada. No se guardó ningún cambio.');
      case 'progreso':
        return void demoProgreso(boton);
    }
  });
}

async function demoExito(boton: HTMLElement): Promise<void> {
  procesar(boton); // "Confirmando…" + gotas
  await esperar(600);
  retroalimentar(boton, 'exito'); // campanita + verde con check + "Inscripción confirmada."
  await esperar(ESPERA_EXITO_MS * 2);
  ponerEstado(boton, 'normal');
}

async function demoError_(boton: HTMLElement): Promise<void> {
  if (!demoError) return;
  demoError.hidden = true;
  procesar(boton);
  await esperar(500);
  demoError.hidden = false; // mensaje en rojo con icono: el color nunca va solo
  retroalimentar(boton, 'error', 'No se pudo enviar. El correo «ana@» está incompleto: escribe el dominio, por ejemplo ana@correo.com.');
}

async function demoProgreso(boton: HTMLElement): Promise<void> {
  const avance = $<HTMLElement>('[data-demo-avance]');
  const barra = $<HTMLElement>('[data-demo-barra]');
  const relleno = $<HTMLElement>('[data-demo-relleno]');
  const porcentaje = $<HTMLElement>('[data-demo-porcentaje]');
  const pintar = (p: number) => {
    relleno.style.width = `${p}%`;
    barra.setAttribute('aria-valuenow', String(p));
    porcentaje.textContent = `${p} %`;
    textosBoton(boton, { cargando: `Cargando… ${p} %` });
  };
  pintar(0);
  avance.hidden = false;
  procesar(boton);
  // Progreso REAL de 0 a 100 % en ~3,2 s: las gotas suben de tono con él y se anuncia cada 25 %.
  const progreso = iniciarProgreso(boton, { texto: 'Cargando mis datos' });
  for (let p = 0; p <= 100; p += 4) {
    progreso.avanzar(p);
    pintar(p);
    await esperar(128);
  }
  retroalimentar(boton, 'exito', 'Tus datos se cargaron: 100 %.'); // termina en la firma de Éxito
  await esperar(ESPERA_EXITO_MS * 2);
  ponerEstado(boton, 'normal');
  textosBoton(boton, { cargando: 'Cargando mis datos…' });
  avance.hidden = true;
}

// ═══ "Escuchar" en la matriz ════════════════════════════════════════
for (const boton of $$<HTMLButtonElement>('[data-escuchar]')) {
  boton.addEventListener('click', () => {
    desbloquearAudio();
    window.setTimeout(() => reproducirFirma(boton.dataset.escuchar as Firma), PAUSA_CLIC_MS);
  });
}

// ═══ Prueba a ciegas ════════════════════════════════════════════════
const raizCiegas = document.querySelector<HTMLElement>('[data-ciegas]');
if (raizCiegas) iniciarPrueba(raizCiegas);

interface Ensayo {
  real: Firma;
  respuesta: Firma;
  /** Veces que el participante pidió escuchar la señal (1 = una sola vez). */
  escuchas: number;
  /** Desde que terminó de sonar hasta que respondió. */
  tiempoMs: number;
}
interface Sesion {
  participante: string;
  fecha: string; // ISO
  ensayos: Ensayo[];
}

const CLAVE_PRUEBAS = 'aulaviva:pruebaCiegas';

function leerPruebas(): Sesion[] {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_PRUEBAS) ?? '[]') as unknown;
    if (!Array.isArray(datos)) return [];
    return datos.filter(
      (s): s is Sesion =>
        !!s && typeof s.participante === 'string' && Array.isArray(s.ensayos) &&
        s.ensayos.every((e: Ensayo) => FIRMAS.includes(e?.real) && FIRMAS.includes(e?.respuesta)),
    );
  } catch {
    return [];
  }
}

/** true si se guardó; false si el navegador no deja (modo privado, sitio bloqueado). */
function guardarPruebas(sesiones: Sesion[]): boolean {
  try {
    if (sesiones.length) localStorage.setItem(CLAVE_PRUEBAS, JSON.stringify(sesiones));
    else localStorage.removeItem(CLAVE_PRUEBAS);
    return true;
  } catch {
    return false;
  }
}

/** Entero al azar en [0, n) con crypto (sin sesgo apreciable para n pequeño). */
function azar(n: number): number {
  const v = new Uint32Array(1);
  crypto.getRandomValues(v);
  return v[0] % n;
}

/** Cada firma `rondas` veces, mezcladas con Fisher-Yates. */
function secuencia(rondas: number): Firma[] {
  const lista = FIRMAS.flatMap((f) => Array<Firma>(rondas).fill(f));
  for (let i = lista.length - 1; i > 0; i--) {
    const j = azar(i + 1);
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

type Matriz = Record<Firma, Record<Firma, number>>;

function matrizDe(ensayos: Ensayo[]): Matriz {
  const m = Object.fromEntries(FIRMAS.map((r) => [r, Object.fromEntries(FIRMAS.map((c) => [c, 0]))])) as Matriz;
  for (const e of ensayos) m[e.real][e.respuesta]++;
  return m;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Confusiones (real ≠ respondida) con el máximo de repeticiones, si hay alguna. */
function peoresConfusiones(m: Matriz): { real: Firma; respuesta: Firma; veces: number }[] {
  const lista = FIRMAS.flatMap((real) =>
    FIRMAS.filter((c) => c !== real).map((respuesta) => ({ real, respuesta, veces: m[real][respuesta] })),
  ).filter((c) => c.veces > 0);
  const max = Math.max(0, ...lista.map((c) => c.veces));
  return lista.filter((c) => c.veces === max);
}

function iniciarPrueba(raiz: HTMLElement): void {
  const rondas = Number(raiz.dataset.rondas) || 3;
  const total = rondas * FIRMAS.length;

  const vistas = {
    preparar: $<HTMLElement>('[data-vista="preparar"]', raiz),
    ensayo: $<HTMLElement>('[data-vista="ensayo"]', raiz),
    resultado: $<HTMLElement>('[data-vista="resultado"]', raiz),
  };
  const formPreparar = $<HTMLFormElement>('[data-form-preparar]', raiz);
  const campoNombre = $<HTMLInputElement>('#participante', raiz);
  const avisoSilencio = $<HTMLElement>('[data-aviso-silencio]', raiz);
  const tituloEnsayo = $<HTMLElement>('[data-ensayo-titulo]', raiz);
  const avanceEnsayo = $<HTMLElement>('[data-ensayo-avance]', raiz);
  const reproducir = $<HTMLButtonElement>('[data-reproducir]', raiz);
  const textoReproducir = $<HTMLElement>('[data-reproducir-texto]', raiz);
  const estadoEnsayo = $<HTMLElement>('[data-ensayo-estado]', raiz);
  const respuestas = $$<HTMLButtonElement>('[data-respuesta]', raiz);
  const acumVacio = $<HTMLElement>('[data-acumulado-vacio]', raiz);
  const acumLleno = $<HTMLElement>('[data-acumulado-lleno]', raiz);
  const copiar = $<HTMLButtonElement>('[data-copiar]', raiz);
  const copiarManual = $<HTMLElement>('[data-copiar-manual]', raiz);
  const copiarTexto = $<HTMLTextAreaElement>('[data-copiar-texto]', raiz);

  // Estado de la prueba en curso
  let participante = '';
  let orden: Firma[] = [];
  let indice = 0;
  let ensayos: Ensayo[] = [];
  let escuchas = 0;
  let finSenal = 0; // performance.now() cuando terminó de sonar
  let sonando = false;
  let puedeResponder = false;

  function mostrarVista(nombre: keyof typeof vistas): void {
    for (const [clave, el] of Object.entries(vistas)) el.hidden = clave !== nombre;
  }

  // ─── 1 · Preparar ─────────────────────────────────────────────────
  const pintarAvisoSilencio = () => (avisoSilencio.hidden = !sonidoSilenciado());
  pintarAvisoSilencio();
  $<HTMLButtonElement>('[data-activar-sonido]', raiz).addEventListener('click', () => {
    guardarSilencio(false);
    pintarAvisoSilencio();
    anunciar(estadoEnsayo, 'Sonido activado.');
    campoNombre.focus();
  });

  const validarNombre = (): string | null =>
    campoNombre.value.trim().length >= 2 ? null : 'Escribe el nombre del participante (al menos 2 letras) para guardar sus respuestas.';
  campoNombre.addEventListener('blur', () => {
    if (!campoNombre.value) return; // vacío al salir sin escribir: se avisa al empezar
    const error = validarNombre();
    if (error) mostrarError(campoNombre, error);
    else limpiarError(campoNombre);
  });
  campoNombre.addEventListener('input', () => {
    if (!validarNombre()) limpiarError(campoNombre);
  });

  formPreparar.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = validarNombre();
    if (error) {
      mostrarError(campoNombre, error, { sacudir: true });
      campoNombre.focus();
      return;
    }
    desbloquearAudio(); // el gesto deja el audio listo para todas las señales
    participante = campoNombre.value.trim().slice(0, 60);
    orden = secuencia(rondas);
    indice = 0;
    ensayos = [];
    prepararEnsayo();
    mostrarVista('ensayo');
    enfocar(reproducir);
  });

  // ─── 2 · Ensayos (pantalla oscura, sin texto del estado) ───────────
  function habilitarRespuestas(si: boolean): void {
    puedeResponder = si;
    for (const b of respuestas) b.setAttribute('aria-disabled', String(!si));
  }

  function prepararEnsayo(): void {
    escuchas = 0;
    sonando = false;
    habilitarRespuestas(false);
    tituloEnsayo.textContent = `Señal ${indice + 1} de ${total}`;
    avanceEnsayo.style.width = `${(indice / total) * 100}%`;
    textoReproducir.textContent = indice === 0 ? 'Reproducir señal' : 'Siguiente señal';
    anunciar(estadoEnsayo, indice === 0 ? 'Pulsa «Reproducir señal» cuando estés listo.' : 'Respuesta guardada. Pulsa «Siguiente señal».');
  }

  reproducir.addEventListener('click', () => {
    if (sonando) return;
    sonando = true;
    escuchas++;
    habilitarRespuestas(false);
    estadoEnsayo.textContent = 'Escucha…';
    // Solo sonido y vibración: nada en pantalla ni en el lector dice qué estado es.
    window.setTimeout(() => {
      const dura = reproducirFirma(orden[indice]);
      window.setTimeout(() => {
        sonando = false;
        finSenal = performance.now();
        textoReproducir.textContent = 'Escuchar otra vez';
        habilitarRespuestas(true);
        anunciar(estadoEnsayo, '¿Qué estado escuchaste? Elige una opción o pulsa una tecla del 1 al 4.');
      }, dura + 120);
    }, PAUSA_CLIC_MS);
  });

  function responder(respuesta: Firma): void {
    if (!puedeResponder || sonando) return;
    habilitarRespuestas(false);
    ensayos.push({
      real: orden[indice],
      respuesta,
      escuchas,
      tiempoMs: Math.round(performance.now() - finSenal),
    });
    indice++;
    if (indice < total) {
      prepararEnsayo();
      enfocar(reproducir);
    } else {
      terminar();
    }
  }

  for (const b of respuestas) b.addEventListener('click', () => responder(b.dataset.respuesta as Firma));

  document.addEventListener('keydown', (e) => {
    if (vistas.ensayo.hidden || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as Element).closest('input, textarea, select')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      e.preventDefault();
      const boton = respuestas[n - 1];
      if (puedeResponder) retroalimentar(boton, 'presionar'); // mismo clic que con el puntero
      window.setTimeout(() => {
        delete boton.dataset.presion;
        responder(FIRMAS[n - 1]);
      }, 60);
    }
  });

  $<HTMLButtonElement>('[data-salir]', raiz).addEventListener('click', () => {
    retroalimentar(null, 'cancelacion', 'Prueba cancelada. No se guardaron sus respuestas.');
    sonando = false;
    mostrarVista('preparar');
    campoNombre.focus();
  });

  // ─── 3 · Resultado ────────────────────────────────────────────────
  function terminar(): void {
    const sesion: Sesion = { participante, fecha: new Date().toISOString(), ensayos };
    const guardado = guardarPruebas([...leerPruebas(), sesion]);
    const aciertos = ensayos.filter((e) => e.real === e.respuesta).length;
    $<HTMLElement>('[data-resultado-titulo]', raiz).textContent = `Resultado de ${participante}: ${pct(aciertos, total)} %`;
    $<HTMLElement>('[data-resultado-resumen]', raiz).textContent =
      `Acertó ${aciertos} de ${total} señales.` +
      (guardado ? ' Sus respuestas se sumaron a los resultados acumulados.' : ' Este navegador no deja guardar: copia los resultados antes de salir.');
    $<HTMLElement>('[data-matriz-participante]', raiz).replaceChildren(tablaConfusion(matrizDe(ensayos), `Matriz de confusión de ${participante}`));
    mostrarVista('resultado');
    pintarAcumulado(guardado ? null : sesion);
    enfocar($<HTMLElement>('[data-resultado-titulo]', raiz));
  }

  $<HTMLButtonElement>('[data-nueva]', raiz).addEventListener('click', () => {
    campoNombre.value = '';
    limpiarError(campoNombre);
    mostrarVista('preparar');
    pintarAvisoSilencio();
    campoNombre.focus();
  });

  $<HTMLButtonElement>('[data-ir-preparar]', raiz).addEventListener('click', () => {
    mostrarVista('preparar');
    campoNombre.focus();
  });

  // ─── Acumulado ────────────────────────────────────────────────────
  /** `extra`: la sesión que no se pudo guardar (se muestra igual en esta visita). */
  let sinGuardar: Sesion | null = null;
  function todas(): Sesion[] {
    return sinGuardar ? [...leerPruebas(), sinGuardar] : leerPruebas();
  }

  function pintarAcumulado(extra: Sesion | null = sinGuardar): void {
    sinGuardar = extra;
    const sesiones = todas();
    const ensayosTodos = sesiones.flatMap((s) => s.ensayos);
    acumVacio.hidden = sesiones.length > 0;
    acumLleno.hidden = sesiones.length === 0;
    copiarManual.hidden = true;
    if (!sesiones.length) return;
    const m = matrizDe(ensayosTodos);
    const aciertos = FIRMAS.reduce((s, f) => s + m[f][f], 0);
    $<HTMLElement>('[data-acumulado-resumen]', raiz).textContent =
      `${sesiones.length} ${sesiones.length === 1 ? 'participante' : 'participantes'} · ${ensayosTodos.length} señales · ` +
      `acierto total ${pct(aciertos, ensayosTodos.length)} % (${aciertos} de ${ensayosTodos.length}).`;
    $<HTMLElement>('[data-matriz-acumulada]', raiz).replaceChildren(tablaConfusion(m, 'Matriz de confusión acumulada'));

    const peores = peoresConfusiones(m);
    const caja = $<HTMLElement>('[data-confusiones]', raiz);
    if (!peores.length) {
      caja.replaceChildren(Object.assign(document.createElement('p'), { className: 'pequeno secundario', textContent: 'Sin confusiones: todas las respuestas fueron correctas.' }));
    } else {
      const titulo = Object.assign(document.createElement('p'), {
        className: 'pequeno',
        textContent: peores.length === 1 ? 'Confusión más repetida (marcada en naranja):' : 'Confusiones más repetidas (marcadas en naranja):',
      });
      const lista = document.createElement('ul');
      lista.className = 'lista-confusiones pequeno';
      for (const c of peores) {
        const li = document.createElement('li');
        li.textContent = `${NOMBRE[c.real]} respondido como ${NOMBRE[c.respuesta]}: ${c.veces} ${c.veces === 1 ? 'vez' : 'veces'}.`;
        lista.append(li);
      }
      caja.replaceChildren(titulo, lista);
    }
  }

  /** Tabla con filas = estado real, columnas = respuesta, y el % de acierto por fila. */
  function tablaConfusion(m: Matriz, titulo: string): HTMLElement {
    const peores = new Set(peoresConfusiones(m).map((c) => `${c.real}>${c.respuesta}`));
    const envoltura = document.createElement('div');
    envoltura.className = 'tabla-scroll';
    envoltura.tabIndex = 0;
    envoltura.setAttribute('role', 'region');
    envoltura.setAttribute('aria-label', titulo);
    const tabla = document.createElement('table');
    tabla.className = 'tabla confusion';
    const cap = document.createElement('caption');
    cap.className = 'solo-lector';
    cap.textContent = `${titulo}. Filas: estado que sonó. Columnas: lo que respondió el participante.`;
    const thead = document.createElement('thead');
    const filaCab = document.createElement('tr');
    const celdaCab = (texto: string, scope: 'col' | 'row') => {
      const th = document.createElement('th');
      th.scope = scope;
      th.textContent = texto;
      return th;
    };
    filaCab.append(celdaCab('Sonó ↓ · Respondió →', 'col'), ...FIRMAS.map((f) => celdaCab(NOMBRE[f], 'col')), celdaCab('Acierto', 'col'));
    thead.append(filaCab);

    const tbody = document.createElement('tbody');
    let aciertos = 0;
    let total = 0;
    for (const real of FIRMAS) {
      const tr = document.createElement('tr');
      tr.append(celdaCab(NOMBRE[real], 'row'));
      const fila = FIRMAS.reduce((s, c) => s + m[real][c], 0);
      total += fila;
      aciertos += m[real][real];
      for (const resp of FIRMAS) {
        const td = document.createElement('td');
        const n = m[real][resp];
        const celda = document.createElement('span');
        celda.className = 'celda';
        // Nunca solo color: icono + texto para lector en aciertos y en la confusión más repetida.
        if (resp === real) {
          td.className = 'celda--acierto';
          celda.append(plantilla('ic-check'), String(n), oculto(' (aciertos)'));
        } else if (peores.has(`${real}>${resp}`)) {
          td.className = 'celda--confusion';
          celda.append(plantilla('ic-alerta'), String(n), oculto(' (confusión más repetida)'));
        } else {
          celda.append(String(n));
        }
        td.append(celda);
        tr.append(td);
      }
      const tdPct = document.createElement('td');
      tdPct.textContent = fila ? `${pct(m[real][real], fila)} %` : '—';
      tr.append(tdPct);
      tbody.append(tr);
    }
    const tfoot = document.createElement('tfoot');
    const trTotal = document.createElement('tr');
    const thTotal = celdaCab('Total', 'row');
    const tdTotal = document.createElement('td');
    tdTotal.colSpan = FIRMAS.length + 1;
    tdTotal.textContent = `${aciertos} de ${total} · ${pct(aciertos, total)} %`;
    trTotal.append(thTotal, tdTotal);
    tfoot.append(trTotal);

    tabla.append(cap, thead, tbody, tfoot);
    envoltura.append(tabla);
    return envoltura;
  }

  function oculto(texto: string): HTMLElement {
    return Object.assign(document.createElement('span'), { className: 'solo-lector', textContent: texto });
  }

  // ─── Copiar como texto y exportar CSV ─────────────────────────────
  function textoResultados(): string {
    const sesiones = todas();
    const fecha = (iso: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
    const columnas = (celdas: string[]) => celdas.map((c, i) => (i === 0 ? c.padEnd(14) : c.padStart(12))).join('');
    const matrizTexto = (ensayosM: Ensayo[]) => {
      const m = matrizDe(ensayosM);
      const lineas = [columnas(['Sonó \\ Resp.', ...FIRMAS.map((f) => NOMBRE[f]), 'Acierto'])];
      for (const r of FIRMAS) {
        const fila = FIRMAS.reduce((s, c) => s + m[r][c], 0);
        lineas.push(columnas([NOMBRE[r], ...FIRMAS.map((c) => String(m[r][c])), fila ? `${pct(m[r][r], fila)} %` : '—']));
      }
      const ac = FIRMAS.reduce((s, f) => s + m[f][f], 0);
      lineas.push(`Acierto total: ${ac} de ${ensayosM.length} (${pct(ac, ensayosM.length)} %)`);
      return lineas.join('\n');
    };
    const partes = [
      'AulaViva · Act. 14 · Prueba a ciegas de firmas multimodales',
      'Matriz de confusión: filas = estado que sonó, columnas = respuesta.',
      '',
    ];
    for (const s of sesiones) {
      partes.push(`Participante: ${s.participante} · ${fecha(s.fecha)}`, matrizTexto(s.ensayos), '');
    }
    if (sesiones.length > 1) {
      partes.push(`ACUMULADO · ${sesiones.length} participantes`, matrizTexto(sesiones.flatMap((s) => s.ensayos)));
      const peores = peoresConfusiones(matrizDe(sesiones.flatMap((s) => s.ensayos)));
      if (peores.length) {
        partes.push('Confusiones más repetidas: ' + peores.map((c) => `${NOMBRE[c.real]} → ${NOMBRE[c.respuesta]} (${c.veces})`).join('; '));
      }
    }
    return partes.join('\n').trim();
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
      retroalimentar(copiar, 'error', 'Tu navegador no dejó copiar. El texto está seleccionado: cópialo con Ctrl + C.');
      copiarTexto.focus();
      copiarTexto.select();
    }
  });

  $<HTMLButtonElement>('[data-exportar]', raiz).addEventListener('click', () => {
    const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const filas = [['participante', 'fecha', 'orden', 'real', 'respuesta', 'acierto', 'escuchas', 'tiempo_ms']];
    for (const s of todas()) {
      s.ensayos.forEach((e, i) =>
        filas.push([s.participante, s.fecha, String(i + 1), e.real, e.respuesta, e.real === e.respuesta ? 'si' : 'no', String(e.escuchas), String(e.tiempoMs)]),
      );
    }
    const csv = '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n'); // BOM: Excel lee bien las tildes
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `prueba-ciegas-aulaviva-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  // ─── Borrar resultados: casilla + espera de 3 s (§5.3, acción irreversible) ──
  const borrar = $<HTMLButtonElement>('[data-borrar]', raiz);
  const confirmar = $<HTMLButtonElement>('[data-borrar-confirmar]');
  const casilla = $<HTMLInputElement>('[data-borrar-casilla]');
  const cuenta = $<HTMLElement>('[data-borrar-cuenta]');
  let cuentaAtras: number | undefined;
  let segundos = 3;

  const pintarConfirmar = () => {
    const listo = casilla.checked && segundos === 0;
    if (listo) confirmar.removeAttribute('aria-disabled');
    else confirmar.setAttribute('aria-disabled', 'true');
    cuenta.textContent = !casilla.checked
      ? 'Marca la casilla para continuar.'
      : segundos > 0
        ? `Podrás borrar en ${segundos} s…`
        : 'Ya puedes borrar.';
  };

  borrar.addEventListener('click', () => {
    const n = todas().length;
    $<HTMLElement>('[data-borrar-texto]').textContent =
      `Se ${n === 1 ? 'borrará 1 prueba guardada' : `borrarán ${n} pruebas guardadas`} en este navegador. No se puede deshacer.`;
    casilla.checked = false;
    segundos = 3;
    window.clearInterval(cuentaAtras);
    pintarConfirmar();
    abrirModal('modal-borrar');
  });

  casilla.addEventListener('change', () => {
    window.clearInterval(cuentaAtras);
    segundos = 3;
    if (casilla.checked) {
      cuentaAtras = window.setInterval(() => {
        segundos = Math.max(0, segundos - 1);
        pintarConfirmar();
        if (segundos === 0) window.clearInterval(cuentaAtras);
      }, 1000);
    }
    pintarConfirmar();
  });

  $<HTMLDialogElement>('#modal-borrar').addEventListener('close', () => window.clearInterval(cuentaAtras));

  confirmar.addEventListener('click', async () => {
    if (estaOcupado(confirmar)) return;
    if (confirmar.getAttribute('aria-disabled') === 'true') {
      retroalimentar(confirmar, 'error', casilla.checked ? `Espera ${segundos} s para poder borrar.` : 'Marca la casilla para poder borrar.');
      return;
    }
    procesar(confirmar);
    const inicio = performance.now();
    const ok = guardarPruebas([]);
    await completarCarga(inicio);
    if (!ok) {
      retroalimentar(confirmar, 'error', 'Este navegador no dejó borrar los resultados. Vuelve a intentarlo.');
      return;
    }
    sinGuardar = null;
    retroalimentar(confirmar, 'exito');
    await esperar(ESPERA_EXITO_MS);
    cerrarModal('modal-borrar');
    ponerEstado(confirmar, 'normal');
    pintarAcumulado(null);
    enfocar($<HTMLElement>('#acumulado-titulo'));
  });

  // ─── Arranque ─────────────────────────────────────────────────────
  pintarAcumulado(null);
}
