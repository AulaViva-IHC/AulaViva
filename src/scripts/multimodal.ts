// Redundancia sensorial (CLAUDE.md §5.8, Act. 12).
// Una sola función, retroalimentar(), dispara en el MISMO instante los cuatro canales:
//   visual   → estado del botón (hundirse, verde con check, sacudida)
//   auditivo → earcon generado con la Web Audio API (sin archivos)
//   háptico  → navigator.vibrate (si el dispositivo lo soporta)
//   lector   → anuncio en la región aria-live (polite para éxito, assertive para error)
// El sonido y la vibración respetan el interruptor "Sonido y vibración" (WCAG 1.4.2)
// y solo ocurren como respuesta a una acción del usuario.
import { ponerEstado, estaOcupado } from './boton';

export type Retro = 'presionar' | 'exito' | 'exito-suave' | 'error';
/** Modo del botón (data-multimodal): qué canales usa además del visual. */
export type ModoMultimodal = 'toque' | 'exito-suave' | 'completo';

// ─── Preferencia: sonido y vibración ────────────────────────────────
export const CLAVE_SONIDO = 'aulaviva:sonido';

export function sonidoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== 'no';
  } catch {
    return true; // sin almacenamiento: activado por defecto
  }
}

export function cambiarSonido(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE_SONIDO, activo ? 'si' : 'no');
  } catch {
    /* sin almacenamiento: vale solo para esta página */
  }
  document.dispatchEvent(new CustomEvent('aulaviva:sonido', { detail: activo }));
  if (activo) {
    // Confirma con el mismo canal que se acaba de activar.
    tocarEarcon('exito-suave');
    vibrar('presionar');
  }
}

// ─── Háptico ────────────────────────────────────────────────────────
const VIBRACION: Record<Retro, number | number[]> = {
  presionar: 10,
  exito: [30, 50, 30],
  'exito-suave': 20,
  error: [80, 40, 80],
};

function vibrar(tipo: Retro): void {
  if (!('vibrate' in navigator)) return; // escritorio, iOS…: no pasa nada
  try {
    navigator.vibrate(VIBRACION[tipo]);
  } catch {
    /* sin permiso o sin activación del usuario: se ignora */
  }
}

// ─── Auditivo (earcons) ─────────────────────────────────────────────
// Éxito: 2 notas ascendentes cortas y suaves (Do5 → Sol5).
// Error: 2 notas descendentes graves (La3 → Mi3), onda triangular.
// Cada earcon dura ~250 ms y lleva fundido de entrada y de salida.
interface Nota { frecuencia: number; inicio: number; duracion: number }
const EARCONS: Record<Exclude<Retro, 'presionar'>, { onda: OscillatorType; volumen: number; notas: Nota[] }> = {
  exito: {
    onda: 'sine',
    volumen: 0.14,
    notas: [
      { frecuencia: 523.25, inicio: 0, duracion: 0.11 },
      { frecuencia: 783.99, inicio: 0.12, duracion: 0.13 },
    ],
  },
  'exito-suave': {
    onda: 'sine',
    volumen: 0.07,
    notas: [
      { frecuencia: 659.25, inicio: 0, duracion: 0.08 },
      { frecuencia: 880, inicio: 0.09, duracion: 0.1 },
    ],
  },
  error: {
    onda: 'triangle',
    volumen: 0.16,
    notas: [
      { frecuencia: 220, inicio: 0, duracion: 0.12 },
      { frecuencia: 164.81, inicio: 0.13, duracion: 0.14 },
    ],
  },
};

let audio: AudioContext | null = null;

/** Crea o reanuda el AudioContext. Se llama durante un gesto del usuario. */
export function desbloquearAudio(): void {
  if (!sonidoActivo()) return;
  try {
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;
    audio ??= new Contexto();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function tocarEarcon(tipo: Retro): void {
  if (tipo === 'presionar' || !sonidoActivo()) return;
  desbloquearAudio();
  if (!audio || audio.state !== 'running') return;
  const { onda, volumen, notas } = EARCONS[tipo];
  const t0 = audio.currentTime + 0.005;
  for (const nota of notas) {
    const osc = audio.createOscillator();
    const ganancia = audio.createGain();
    osc.type = onda;
    osc.frequency.value = nota.frecuencia;
    const inicio = t0 + nota.inicio;
    const fin = inicio + nota.duracion;
    // Fundido: sube en 12 ms y baja exponencialmente hasta el final.
    ganancia.gain.setValueAtTime(0.0001, inicio);
    ganancia.gain.linearRampToValueAtTime(volumen, inicio + 0.012);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, fin);
    osc.connect(ganancia).connect(audio.destination);
    osc.start(inicio);
    osc.stop(fin + 0.02);
  }
}

// ─── Lector de pantalla ─────────────────────────────────────────────
function anunciarVivo(texto: string, urgencia: 'polite' | 'assertive'): void {
  const region = document.querySelector<HTMLElement>(`[data-vivo="${urgencia}"]`);
  if (!region || !texto) return;
  // Mismo texto dos veces seguidas: se cambia un carácter invisible para que se vuelva a leer.
  region.textContent = region.textContent === texto ? `${texto} ` : texto;
}

// ─── Visual ─────────────────────────────────────────────────────────
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

// ─── La función única ───────────────────────────────────────────────
/**
 * Respuesta multimodal sincronizada. Los 4 canales se disparan en la misma llamada:
 *   'presionar'   → inmediato (< 50 ms): se hunde + vibración 10 ms.
 *   'exito'       → con el resultado (~200 ms): verde con check + 2 notas ascendentes + [30,50,30] + aria-live polite.
 *   'exito-suave' → igual, con earcon más bajo y vibración de 20 ms (acciones frecuentes, p. ej. guardar).
 *   'error'       → sacudida + 2 notas graves descendentes + [80,40,80] + aria-live assertive.
 * El modo del botón (data-multimodal) limita los canales: "toque" solo usa presionar;
 * "exito-suave" convierte el éxito en suave.
 * `texto` es lo que se anuncia; si falta, se usa data-anuncio-exito / data-anuncio-error.
 */
export function retroalimentar(boton: HTMLElement | null, tipo: Retro, texto?: string): void {
  const modo = (boton?.dataset.multimodal ?? 'completo') as ModoMultimodal;
  if (tipo === 'exito' && modo === 'exito-suave') tipo = 'exito-suave';

  if (tipo === 'presionar') {
    if (boton) hundir(boton);
    if (sonidoActivo()) vibrar('presionar');
    desbloquearAudio(); // el gesto del usuario habilita el audio para el resultado
    return;
  }

  const anuncio =
    texto ?? (tipo === 'error' ? boton?.dataset.anuncioError : boton?.dataset.anuncioExito) ?? '';

  // Mismo instante: visual, auditivo, háptico y lector de pantalla.
  if (boton) {
    delete boton.dataset.presion;
    ponerEstado(boton, tipo === 'error' ? 'error' : 'exito');
  }
  if (modo !== 'toque' && sonidoActivo()) {
    tocarEarcon(tipo);
    vibrar(tipo);
  }
  anunciarVivo(anuncio, tipo === 'error' ? 'assertive' : 'polite');
}

/** Fase "procesando" (50 ms): giro + micro barra, aria-busy y aria-disabled. */
export function procesar(boton: HTMLElement): void {
  delete boton.dataset.presion;
  ponerEstado(boton, 'cargando');
}

// ─── Escuchas globales: "presionar" con puntero y con teclado ───────
let iniciado = false;

export function iniciarMultimodal(): void {
  if (iniciado) return;
  iniciado = true;

  const objetivo = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('[data-multimodal]') ?? null;
  const puedePresionar = (b: HTMLElement) =>
    !estaOcupado(b) && !(b as HTMLButtonElement).disabled && b.dataset.estado !== 'error';

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
  // Enter (botón y enlace) y Espacio (solo botón), sin repetir al mantener la tecla.
  document.addEventListener('keydown', (e) => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    const b = objetivo(e);
    if (!b || (e.key === ' ' && b.tagName === 'A')) return;
    if (puedePresionar(b)) retroalimentar(b, 'presionar');
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
