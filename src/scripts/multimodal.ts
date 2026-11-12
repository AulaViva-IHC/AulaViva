// Redundancia sensorial (CLAUDE.md §5.8, Act. 12) + Firmas multimodales (§5.9, Act. 14).
// Una sola función, retroalimentar(), dispara en el MISMO instante los cuatro canales:
//   visual   → estado del botón (hundirse, verde con check, sacudida) o la señal flotante (icono + texto)
//   auditivo → earcon generado con la Web Audio API (sin archivos)
//   háptico  → navigator.vibrate (si el dispositivo lo soporta)
//   lector   → región aria-live (polite: éxito, cancelación, progreso; assertive: error)
//
// Identidad sonora de AulaViva (Act. 14): todo en Re mayor (Re, Fa#, La) con timbre de
// "campana de madera" (senoidal + un armónico suave que decae rápido, ataque de 5 ms,
// volumen máx. 0,15, nada dura más de 2 s). Cuatro firmas que se reconocen sin mirar:
//   Éxito       "campanita de logro"   Re5 → La5 → Re6 ascendente, ~380 ms        háptico [18,40,18,40,60]
//   Error       "golpe disonante"      Re3 + Mi♭3 juntos, cae 15 %, triangular, ~420 ms   [120,60,120,60,120]
//   Cancelación "soplido que se apaga" ruido pasabanda 1200 → 400 Hz + La4 → Fa#4, ~320 ms   [90]
//   Progreso    "gotas de madera"      una gota cada 400 ms, de Re5 (0 %) a Re6 (100 %)    [8] cada 2 gotas
// Clic al presionar cualquier control: Re6 senoidal pura (sin armónico), ~40 ms, muy suave + 10 ms.
//
// Sonido y vibración activos por defecto y sin interruptor visible en el sitio (§5.8). Única
// excepción (Act. 14): /actividad-14 tiene "Sonido: activado / silenciado" (WCAG 1.4.2); la
// preferencia se guarda en localStorage y se respeta aquí en todo el sitio (en silencio tampoco vibra).
// WCAG 1.4.2 no exige más: ningún sonido pasa de 1 s y todos responden a algo, nunca suenan solos
// (las gotas de una carga automática solo suenan si esa carga tarda más de 1 s).
import { ponerEstado, estaOcupado } from './boton';

export type Retro = 'presionar' | 'exito' | 'exito-suave' | 'error' | 'cancelacion' | 'progreso';
/** Las cuatro firmas de la Act. 14 (las que se distinguen a ciegas). */
export type Firma = 'exito' | 'error' | 'cancelacion' | 'progreso';
/** Modo del botón (data-multimodal): qué canales usa además del visual. */
export type ModoMultimodal = 'toque' | 'exito-suave' | 'completo';

// ─── Preferencia de sonido (solo se cambia desde /actividad-14) ──────
export const CLAVE_SONIDO = 'aulaviva:sonido';
// Si localStorage falla, el interruptor sigue valiendo durante la visita.
let silencioMemoria: boolean | null = null;

export function sonidoSilenciado(): boolean {
  if (silencioMemoria !== null) return silencioMemoria;
  try {
    return localStorage.getItem(CLAVE_SONIDO) === 'silenciado';
  } catch {
    return false; // sin almacenamiento: sonido activo, como en el resto del sitio
  }
}

export function guardarSilencio(silenciado: boolean): void {
  silencioMemoria = silenciado;
  try {
    if (silenciado) localStorage.setItem(CLAVE_SONIDO, 'silenciado');
    else localStorage.removeItem(CLAVE_SONIDO);
  } catch {
    /* sin almacenamiento: dura solo esta visita */
  }
}

// ─── Háptico ────────────────────────────────────────────────────────
export const VIBRACION: Record<Retro, number | number[]> = {
  presionar: 10,
  exito: [18, 40, 18, 40, 60],
  'exito-suave': 20,
  error: [120, 60, 120, 60, 120],
  cancelacion: [90],
  progreso: [8],
};

function vibrar(tipo: Retro): void {
  if (sonidoSilenciado() || !('vibrate' in navigator)) return; // escritorio, iOS…: no pasa nada
  try {
    navigator.vibrate(VIBRACION[tipo]);
  } catch {
    /* sin permiso o sin activación del usuario: se ignora */
  }
}

// ─── Auditivo: motor "campana de madera" ────────────────────────────
// Notas de Re mayor (Hz) más Mi♭3, la segunda menor del error.
export const NOTAS = {
  Re3: 146.83, Mib3: 155.56, Fas4: 369.99, La4: 440, Re5: 587.33,
  Fas5: 739.99, La5: 880, Re6: 1174.66,
} as const;
const VOLUMEN_MAX = 0.15;

let audio: AudioContext | null = null;
let ruidoBlanco: AudioBuffer | null = null;

/** Crea o reanuda el AudioContext. Se llama durante un gesto del usuario. */
export function desbloquearAudio(): void {
  try {
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;
    audio ??= new Contexto();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
}

interface Voz {
  frecuencia: number;
  inicio: number; // s desde el arranque del earcon
  duracion: number; // s
  volumen: number;
  onda?: OscillatorType;
  /** Caída de tono hasta el final de la nota (0,15 = baja un 15 %). */
  caida?: number;
  /** Volumen relativo del armónico de madera (4 × la fundamental; se apaga en un cuarto de la nota). */
  armonico?: number;
}

/** Una nota con timbre de campana de madera: ataque de 5 ms y caída exponencial. */
function voz(ctx: AudioContext, salida: AudioNode, t0: number, v: Voz): void {
  const inicio = t0 + v.inicio;
  const fin = inicio + v.duracion;
  const parciales: [multiplo: number, volumen: number, apagado: number][] = [[1, v.volumen, fin]];
  if (v.armonico) parciales.push([4, v.volumen * v.armonico, inicio + v.duracion / 4]);
  for (const [multiplo, volumen, apagado] of parciales) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = multiplo === 1 ? (v.onda ?? 'sine') : 'sine';
    osc.frequency.setValueAtTime(v.frecuencia * multiplo, inicio);
    if (v.caida) osc.frequency.exponentialRampToValueAtTime(v.frecuencia * multiplo * (1 - v.caida), fin);
    g.gain.setValueAtTime(0.0001, inicio);
    g.gain.linearRampToValueAtTime(volumen, inicio + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, apagado);
    osc.connect(g).connect(salida);
    osc.start(inicio);
    osc.stop(apagado + 0.02);
  }
}

/** Ruido filtrado con un pasabanda que baja de `desde` a `hasta` Hz (el "soplido"). */
function soplido(ctx: AudioContext, salida: AudioNode, t0: number, duracion: number, volumen: number, desde: number, hasta: number): void {
  if (!ruidoBlanco) {
    ruidoBlanco = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
    const datos = ruidoBlanco.getChannelData(0);
    for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
  }
  const fuente = ctx.createBufferSource();
  fuente.buffer = ruidoBlanco;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 2.5;
  filtro.frequency.setValueAtTime(desde, t0);
  filtro.frequency.exponentialRampToValueAtTime(hasta, t0 + duracion);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(volumen, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  fuente.connect(filtro).connect(g).connect(salida);
  fuente.start(t0);
  fuente.stop(t0 + duracion + 0.02);
}

/** Frecuencia de la gota de progreso: Re5 al 0 % → Re6 al 100 % (sube una octava). */
export const tonoGota = (porcentaje: number) => NOTAS.Re5 * 2 ** (Math.min(100, Math.max(0, porcentaje)) / 100);

type Earcon = 'presionar' | 'exito' | 'exito-suave' | 'error' | 'cancelacion' | 'gota';

function programar(ctx: AudioContext, tipo: Earcon, porcentaje = 0): void {
  // Limitador final: aunque se superpongan sonidos, la salida no pasa de 0,15.
  const salida = ctx.createGain();
  const tope = ctx.createDynamicsCompressor();
  tope.threshold.value = 20 * Math.log10(VOLUMEN_MAX);
  tope.knee.value = 0;
  tope.ratio.value = 20;
  tope.attack.value = 0.001;
  salida.connect(tope).connect(ctx.destination);
  const t0 = ctx.currentTime + 0.005;
  switch (tipo) {
    case 'presionar': // clic: Re6 senoidal pura, sin armónico (no se confunde con las gotas)
      voz(ctx, salida, t0, { frecuencia: NOTAS.Re6, inicio: 0, duracion: 0.04, volumen: 0.05 });
      break;
    case 'exito': // campanita de logro: Re5 → La5 → Re6 (~380 ms)
      voz(ctx, salida, t0, { frecuencia: NOTAS.Re5, inicio: 0, duracion: 0.17, volumen: 0.1, armonico: 0.3 });
      voz(ctx, salida, t0, { frecuencia: NOTAS.La5, inicio: 0.1, duracion: 0.17, volumen: 0.1, armonico: 0.3 });
      voz(ctx, salida, t0, { frecuencia: NOTAS.Re6, inicio: 0.2, duracion: 0.18, volumen: 0.11, armonico: 0.3 });
      break;
    case 'exito-suave': // versión corta y baja para acciones frecuentes: Fa#5 → La5 (~200 ms)
      voz(ctx, salida, t0, { frecuencia: NOTAS.Fas5, inicio: 0, duracion: 0.1, volumen: 0.05, armonico: 0.25 });
      voz(ctx, salida, t0, { frecuencia: NOTAS.La5, inicio: 0.08, duracion: 0.12, volumen: 0.05, armonico: 0.25 });
      break;
    case 'error': // golpe disonante: Re3 + Mi♭3 a la vez, triangular, cae 15 % (~420 ms)
      voz(ctx, salida, t0, { frecuencia: NOTAS.Re3, inicio: 0, duracion: 0.42, volumen: 0.075, onda: 'triangle', caida: 0.15, armonico: 0.2 });
      voz(ctx, salida, t0, { frecuencia: NOTAS.Mib3, inicio: 0, duracion: 0.42, volumen: 0.075, onda: 'triangle', caida: 0.15, armonico: 0.2 });
      break;
    case 'cancelacion': // soplido que se apaga + La4 → Fa#4 consonante (~320 ms)
      soplido(ctx, salida, t0, 0.32, 0.09, 1200, 400);
      voz(ctx, salida, t0, { frecuencia: NOTAS.La4, inicio: 0, duracion: 0.16, volumen: 0.045, armonico: 0.2 });
      voz(ctx, salida, t0, { frecuencia: NOTAS.Fas4, inicio: 0.13, duracion: 0.19, volumen: 0.045, armonico: 0.2 });
      break;
    case 'gota': // gota de madera: muy corta, con el armónico marcado (el "toc")
      voz(ctx, salida, t0, { frecuencia: tonoGota(porcentaje), inicio: 0, duracion: 0.07, volumen: 0.07, armonico: 0.6 });
      break;
  }
}

function tocarEarcon(tipo: Earcon, porcentaje = 0): void {
  if (sonidoSilenciado()) return;
  // Una gota no es un gesto del usuario: solo suena si el audio ya está activo. Si se encolara,
  // las gotas de una carga automática sonarían todas juntas en el primer clic.
  if (tipo === 'gota') {
    if (audio?.state === 'running') programar(audio, tipo, porcentaje);
    return;
  }
  desbloquearAudio();
  if (!audio) return;
  if (audio.state === 'running') {
    programar(audio, tipo, porcentaje);
  } else if (audio.state === 'suspended') {
    // Primer gesto de la página: el contexto tarda unos ms en reanudarse; suena en cuanto lo hace.
    const ctx = audio;
    void ctx.resume().then(() => programar(ctx, tipo, porcentaje)).catch(() => {});
  }
}

/**
 * Solo la firma (sonido + vibración), sin tocar la interfaz: lo usan la matriz y la prueba
 * a ciegas de /actividad-14. Progreso = 6 gotas de 0 a 100 % (cada 400 ms) y la campanita final.
 * Devuelve cuánto dura, en ms.
 */
export function reproducirFirma(firma: Firma): number {
  desbloquearAudio();
  if (firma !== 'progreso') {
    tocarEarcon(firma);
    vibrar(firma);
    return { exito: 380, error: 420, cancelacion: 320 }[firma];
  }
  const pasos = [0, 20, 40, 60, 80, 100];
  pasos.forEach((p, i) =>
    window.setTimeout(() => {
      tocarEarcon('gota', p);
      if (i % 2 === 1) vibrar('progreso');
    }, 60 + i * 400), // 60 ms: el audio termina de despertar con el gesto
  );
  window.setTimeout(() => {
    tocarEarcon('exito');
    vibrar('exito');
  }, 60 + pasos.length * 400);
  return pasos.length * 400 + 380;
}

// ─── Lector de pantalla ─────────────────────────────────────────────
function anunciarVivo(texto: string, urgencia: 'polite' | 'assertive'): void {
  const region = document.querySelector<HTMLElement>(`[data-vivo="${urgencia}"]`);
  if (!region || !texto) return;
  // Mismo texto dos veces seguidas: se cambia un carácter invisible para que se vuelva a leer.
  region.textContent = region.textContent === texto ? `${texto} ` : texto;
}

// ─── Visual: señal flotante (icono + texto) de RegionesVivas ────────
// Para cancelación y progreso sin botón propio (WCAG 1.4.1: el color nunca va solo).
// Es aria-hidden: el lector ya oye el mismo texto por la región aria-live.
let temporizadorSenal: number | undefined;
let duenoSenal: object | null = null;

function mostrarSenal(tipo: 'cancelacion' | 'progreso', texto: string, dueno: object | null = null): void {
  const senal = document.querySelector<HTMLElement>('[data-senal]');
  if (!senal) return;
  window.clearTimeout(temporizadorSenal);
  duenoSenal = dueno;
  senal.dataset.tipo = tipo;
  senal.querySelector<HTMLElement>('[data-senal-texto]')!.textContent = texto;
  senal.hidden = false;
  // La cancelación se ve 1,8 s; el progreso queda mientras dure la carga.
  if (tipo === 'cancelacion') temporizadorSenal = window.setTimeout(() => (senal.hidden = true), 1800);
}

function ocultarSenal(dueno: object): void {
  const senal = document.querySelector<HTMLElement>('[data-senal]');
  if (senal && duenoSenal === dueno && senal.dataset.tipo === 'progreso') senal.hidden = true;
}

// ─── Visual del botón ───────────────────────────────────────────────
function hundir(boton: HTMLElement): void {
  boton.dataset.presion = 'abajo';
}

/** Al soltar: rebota y vuelve a su sitio. */
export function soltar(boton: HTMLElement): void {
  if (boton.dataset.presion !== 'abajo') return;
  boton.dataset.presion = 'rebote';
  window.setTimeout(() => {
    if (boton.dataset.presion === 'rebote') delete boton.dataset.presion;
  }, 220);
}

// ─── Progreso: "gotas de madera" ────────────────────────────────────
export interface OpcionesProgreso {
  /**
   * Carga que arranca sola (skeleton): solo se oye, vibra y muestra la señal si tarda más de 1 s;
   * al terminar no suena Éxito (solo se anuncia que cargó, si llegó a sonar).
   * Sin esto (botones que el usuario pulsa) las gotas suenan siempre, desde los 50 ms.
   */
  automatico?: boolean;
  /** Qué se está haciendo, para la señal y el lector: "Cargando tus cursos". */
  texto?: string;
  /** Anuncio al terminar con éxito. */
  textoListo?: string;
}

export interface Progreso {
  /** Porcentaje real (0–100). Sin llamarlo, se estima con una curva que no pasa del 90 %. */
  avanzar(porcentaje: number): void;
  porcentaje(): number;
  /** 'exito' / 'error' suenan con su firma (salvo en cargas automáticas); 'silencio' solo detiene. */
  detener(resultado?: 'exito' | 'error' | 'silencio'): void;
}

const ESPERA_AUTOMATICA_MS = 1000;
const INTERVALO_GOTA_MS = 400;
const progresos = new Map<object, Progreso>();

/**
 * Empieza el progreso sobre un botón (que está "procesando") o una región que carga.
 * Cada 400 ms: gota de madera con el tono del porcentaje (Re5 → Re6), vibración de 8 ms cada
 * 2 gotas, señal visible con reloj + "Cargando… 40 %" (si no es un botón) y anuncio aria-live cada 25 %.
 */
export function iniciarProgreso(objetivo: HTMLElement | null, opciones: OpcionesProgreso = {}): Progreso {
  const clave: object = objetivo ?? document;
  progresos.get(clave)?.detener('silencio');

  const esBoton = !!objetivo?.matches('.boton, [data-boton]');
  const automatico = !!opciones.automatico;
  const texto =
    opciones.texto ??
    objetivo?.querySelector('[data-texto-cargando]')?.textContent?.replace(/…$/, '').trim() ??
    'Cargando';
  const inicio = performance.now();
  let real: number | null = null;
  let gotas = 0;
  let hitoAnunciado = 0;
  let activo = true;

  const estimado = () => Math.round(90 * (1 - Math.exp(-(performance.now() - inicio) / 2500)));
  const porcentaje = () => real ?? estimado();

  const gota = () => {
    // Si alguien sacó al botón de "procesando" sin pasar por aquí, el progreso termina en silencio.
    if (esBoton && objetivo!.dataset.estado !== 'cargando') return control.detener('silencio');
    const p = porcentaje();
    gotas++;
    // Mismo instante: sonido, vibración (cada 2 gotas), señal visible y anuncio por hito.
    tocarEarcon('gota', p);
    if (gotas % 2 === 0) vibrar('progreso');
    if (!esBoton) mostrarSenal('progreso', `${texto}… ${p} %`, control);
    const hito = Math.floor(p / 25) * 25;
    if (hito >= 25 && hito < 100 && hito > hitoAnunciado) {
      hitoAnunciado = hito;
      anunciarVivo(`${texto}: ${hito} %`, 'polite');
    }
  };

  let intervalo: number | undefined;
  const espera = window.setTimeout(() => {
    if (!activo) return;
    gota();
    intervalo = window.setInterval(gota, INTERVALO_GOTA_MS);
  }, automatico ? ESPERA_AUTOMATICA_MS : 50);

  const control: Progreso = {
    avanzar(p) {
      real = Math.min(100, Math.max(0, p));
    },
    porcentaje,
    detener(resultado = 'silencio') {
      if (!activo) return;
      activo = false;
      window.clearTimeout(espera);
      window.clearInterval(intervalo);
      if (progresos.get(clave) === control) progresos.delete(clave);
      ocultarSenal(control);
      if (resultado === 'silencio') return;
      if (automatico) {
        // Cargas solas: sin campanita. Solo se anuncia si la espera llegó a notarse.
        if (resultado === 'exito' && gotas > 0) anunciarVivo(opciones.textoListo ?? `${texto}: listo.`, 'polite');
        return;
      }
      tocarEarcon(resultado);
      vibrar(resultado);
      anunciarVivo(
        resultado === 'exito' ? (opciones.textoListo ?? `${texto}: 100 %. Listo.`) : `${texto}: no se pudo completar.`,
        resultado === 'exito' ? 'polite' : 'assertive',
      );
    },
  };
  progresos.set(clave, control);
  return control;
}

/** Detiene el progreso de ese botón o región (null = el progreso sin objetivo). */
export function detenerProgreso(objetivo: HTMLElement | null, resultado: 'exito' | 'error' | 'silencio' = 'silencio'): void {
  progresos.get(objetivo ?? document)?.detener(resultado);
}

// ─── La función única ───────────────────────────────────────────────
/**
 * Respuesta multimodal sincronizada. Los canales se disparan en la misma llamada:
 *   'presionar'   → inmediato (< 50 ms): se hunde + clic Re6 (~40 ms) + vibración 10 ms.
 *                   Vale para cualquier control pulsable (lo dispara la escucha global de iniciarMultimodal).
 *   'exito'       → con el resultado (~200 ms): verde con check + campanita Re5→La5→Re6 + [18,40,18,40,60] + polite.
 *   'exito-suave' → igual, con Fa#5→La5 bajito y vibración de 20 ms (acciones frecuentes, p. ej. guardar).
 *   'error'       → sacudida + golpe disonante Re3+Mi♭3 + [120,60,120,60,120] + assertive.
 *   'cancelacion' → señal "deshacer" + texto + soplido La4→Fa#4 + [90] + polite.
 *   'progreso'    → empieza las gotas de madera sobre ese control (= iniciarProgreso(boton)).
 * Éxito y error detienen antes las gotas del botón. El modo (data-multimodal) limita los canales:
 * "toque" solo suena y vibra al presionar; "exito-suave" convierte el éxito en suave.
 * `texto` es lo que se anuncia; si falta, se usa data-anuncio-exito / data-anuncio-error.
 */
export function retroalimentar(boton: HTMLElement | null, tipo: Retro, texto?: string): void {
  const modo = (boton?.dataset.multimodal ?? 'completo') as ModoMultimodal;
  if (tipo === 'exito' && modo === 'exito-suave') tipo = 'exito-suave';

  if (tipo === 'presionar') {
    // Mismo instante: se hunde, suena el clic y vibra. El gesto deja el audio listo para el resultado.
    if (boton) hundir(boton);
    tocarEarcon('presionar');
    vibrar('presionar');
    return;
  }

  if (tipo === 'progreso') {
    iniciarProgreso(boton);
    return;
  }

  if (tipo === 'cancelacion') {
    const aviso = texto || 'Operación cancelada.';
    if (boton) delete boton.dataset.presion;
    mostrarSenal('cancelacion', aviso);
    tocarEarcon('cancelacion');
    vibrar('cancelacion');
    anunciarVivo(aviso, 'polite');
    return;
  }

  const anuncio =
    texto ?? (tipo === 'error' ? boton?.dataset.anuncioError : boton?.dataset.anuncioExito) ?? '';

  // Mismo instante: visual, auditivo, háptico y lector de pantalla.
  if (boton) {
    progresos.get(boton)?.detener('silencio');
    delete boton.dataset.presion;
    ponerEstado(boton, tipo === 'error' ? 'error' : 'exito');
  }
  if (modo !== 'toque') {
    tocarEarcon(tipo);
    vibrar(tipo);
  }
  anunciarVivo(anuncio, tipo === 'error' ? 'assertive' : 'polite');
}

/**
 * Fase "procesando" (50 ms): giro + micro barra, aria-busy y aria-disabled.
 * Además empiezan las gotas de madera (Act. 14): en un botón que el usuario pulsó suenan siempre.
 */
export function procesar(boton: HTMLElement): void {
  delete boton.dataset.presion;
  ponerEstado(boton, 'cargando');
  iniciarProgreso(boton);
}

// ─── Escuchas globales: "presionar" con puntero y con teclado ───────
// Cualquier control pulsable: botones, enlaces, pestañas, casillas, opciones del buscador…
const PULSABLE = [
  'button',
  'a[href]',
  'summary',
  'label',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="button"]',
  'input[type="submit"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[data-multimodal]',
].join(',');

let iniciado = false;

export function iniciarMultimodal(): void {
  if (iniciado) return;
  iniciado = true;

  const objetivo = (e: Event): HTMLElement | null => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(PULSABLE) ?? null;
    // Una etiqueta solo cuenta si activa una casilla u opción (no la de un campo de texto).
    if (el instanceof HTMLLabelElement) {
      const c = el.control;
      return c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio') ? el : null;
    }
    return el;
  };
  const puedePresionar = (b: HTMLElement) =>
    !estaOcupado(b) &&
    !(b as HTMLButtonElement).disabled &&
    b.dataset.estado !== 'error' &&
    !b.closest('[inert]');

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const b = objetivo(e);
    if (b && puedePresionar(b)) retroalimentar(b, 'presionar');
  });
  for (const tipo of ['pointerup', 'pointercancel', 'pointerout'] as const) {
    document.addEventListener(tipo, (e) => {
      const b = objetivo(e);
      // pointerout también salta al pasar a un hijo del botón: eso no es soltar.
      if (!b || (tipo === 'pointerout' && b.contains(e.relatedTarget as Node | null))) return;
      soltar(b);
    });
  }
  // Teclas que activan cada control, sin repetir al mantener la tecla:
  // Enter en botones y enlaces; Espacio en botones, casillas y opciones (no en enlaces).
  const activa = (b: HTMLElement, tecla: string) => {
    const casilla = b instanceof HTMLInputElement && (b.type === 'checkbox' || b.type === 'radio');
    return tecla === 'Enter' ? !casilla : b.tagName !== 'A';
  };
  document.addEventListener('keydown', (e) => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    const b = objetivo(e);
    if (b && activa(b, e.key) && puedePresionar(b)) retroalimentar(b, 'presionar');
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = objetivo(e);
    if (b) soltar(b);
  });
  // En pantallas táctiles el primer pointerdown aún no cuenta como gesto: se reintenta al hacer clic.
  document.addEventListener('click', (e) => {
    if (objetivo(e)) desbloquearAudio();
  }, true);
}
