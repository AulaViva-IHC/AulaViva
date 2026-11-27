// Act. 20 · Sesión SAM y tarjeta "¿Cómo te sentiste?" (ver src/components/TarjetaSam.astro).
//
// Sesión SAM en sessionStorage (aulaviva:sam): { participante, flujo, inicio, fin?, aprobado?, publicadoId? }.
//   La crea /actividad-20 al pulsar "Empezar flujo…". Sobrevive al cambio de cuenta (misma pestaña).
//   terminarFlujoSam() fija la hora de fin (la duración no cuenta el tiempo de responder la tarjeta).
// La tarjeta guarda en POST /api/actividad-20/respuestas, suena la firma de Éxito y vuelve a /actividad-20.
import { estaOcupado, ponerEstado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { abrirModal } from './modal';
import { $, $$, completarCarga, ESPERA_EXITO_MS, esperar, pedirJSON } from './util';
import { DIMENSIONES, esFlujo, formatearDuracion, type DimensionSam, type FlujoSam } from '../lib/sam';

export interface SesionSam {
  participante: string;
  flujo: FlujoSam;
  /** Date.now() al pulsar "Empezar". */
  inicio: number;
  /** Date.now() al terminar el flujo (A4/A5 o B5). */
  fin?: number;
  /** Flujo A: si aprobó. */
  aprobado?: boolean;
  /** Flujo B: id del curso publicado (para resaltarlo en /admin/cursos). */
  publicadoId?: number;
}

const CLAVE = 'aulaviva:sam';

// sessionStorage puede fallar (modo privado, sitio bloqueado): sin él no hay prueba SAM, nada más.
export function leerSesionSam(): SesionSam | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null') as SesionSam | null;
    return s && esFlujo(s.flujo) && typeof s.participante === 'string' && typeof s.inicio === 'number' ? s : null;
  } catch {
    return null;
  }
}
export function guardarSesionSam(sesion: SesionSam | null): void {
  try {
    if (sesion) sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}

/** Sesión SAM activa del flujo pedido (o null). */
export function sesionDelFlujo(flujo: FlujoSam): SesionSam | null {
  const s = leerSesionSam();
  return s?.flujo === flujo ? s : null;
}

/** Marca el fin del flujo (solo la primera vez) y guarda los datos extra. */
export function terminarFlujoSam(flujo: FlujoSam, extra: Partial<SesionSam> = {}): SesionSam | null {
  const s = sesionDelFlujo(flujo);
  if (!s) return null;
  const nueva: SesionSam = { ...s, ...extra, fin: s.fin ?? Date.now() };
  guardarSesionSam(nueva);
  return nueva;
}

/** Textos de un <script type="application/json" id="…"> con {n}, {flujo}… */
export function crearTx(id: string): (clave: string, variables?: Record<string, string | number>) => string {
  let textos: Record<string, string> = {};
  try {
    textos = JSON.parse(document.getElementById(id)?.textContent ?? '{}');
  } catch {
    /* sin textos: se muestran las claves */
  }
  return (clave, variables) =>
    (textos[clave] ?? clave).replace(/\{(\w+)\}/g, (todo, nombre: string) => (variables && nombre in variables ? String(variables[nombre]) : todo));
}

// ─── Tarjeta ────────────────────────────────────────────────────────
let abrirTarjeta: (() => void) | null = null;

/** Abre la tarjeta SAM si la página la tiene y hay sesión del flujo. Devuelve si se abrió. */
export function abrirTarjetaSam(): boolean {
  if (!abrirTarjeta) return false;
  abrirTarjeta();
  return true;
}

export function iniciarTarjetaSam(): void {
  const raiz = document.querySelector<HTMLElement>('[data-sam]');
  if (!raiz || abrirTarjeta) return;
  const flujo = raiz.dataset.sam as FlujoSam;
  const tx = crearTx('textos-sam');
  const dialogo = $<HTMLDialogElement>('#modal-sam');
  const secciones = $$<HTMLElement>('[data-sam-seccion]', dialogo);
  const contador = $<HTMLElement>('[data-sam-contador]', dialogo);
  const barra = $<HTMLElement>('[data-sam-barra]', dialogo);
  const terminaste = $<HTMLElement>('[data-sam-terminaste]', dialogo);
  const despues = $<HTMLButtonElement>('[data-sam-despues]', dialogo);
  const anterior = $<HTMLButtonElement>('[data-sam-anterior]', dialogo);
  const siguiente = $<HTMLButtonElement>('[data-sam-siguiente]', dialogo);
  const guardar = $<HTMLButtonElement>('[data-sam-guardar]', dialogo);
  const aviso = $<HTMLElement>('[data-sam-aviso]', dialogo);
  const comentario = $<HTMLTextAreaElement>('[data-sam-comentario]', dialogo);
  const caracteres = $<HTMLElement>('[data-sam-caracteres]', dialogo);
  const pendiente = $<HTMLElement>('[data-sam-pendiente]', raiz);
  let paso = 1;
  let guardada = false;

  const elegido = (nombre: string) => dialogo.querySelector<HTMLInputElement>(`input[name="${nombre}"]:checked`)?.value ?? null;
  const nombreDelPaso = (n: number) => (n <= 3 ? `sam-${DIMENSIONES[n - 1]}` : 'sam-paso');
  const errorDe = (n: number) => $<HTMLElement>('[data-sam-error]', secciones[n - 1]);

  function irA(n: number, enfocar = true): void {
    paso = n;
    secciones.forEach((s, i) => (s.hidden = i !== n - 1));
    contador.textContent = tx('sam.paso', { n });
    barra.style.width = `${n * 25}%`;
    despues.hidden = n !== 1;
    anterior.hidden = n === 1;
    siguiente.hidden = n === 4;
    guardar.hidden = n !== 4;
    aviso.hidden = true;
    if (!enfocar) return;
    // Foco en la opción elegida o en la primera del grupo (el lector anuncia la leyenda del grupo).
    const grupo = nombreDelPaso(n);
    const destino =
      dialogo.querySelector<HTMLInputElement>(`input[name="${grupo}"]:checked`) ??
      dialogo.querySelector<HTMLInputElement>(`input[name="${grupo}"]`);
    destino?.focus();
  }

  /** ¿Se eligió algo en el paso n? Si no, error en el grupo con la firma de Error. */
  function validar(n: number, boton: HTMLElement): boolean {
    if (elegido(nombreDelPaso(n))) return true;
    const error = errorDe(n);
    error.hidden = false;
    retroalimentar(boton, 'error', error.textContent?.trim() ?? tx('sam.elige'));
    dialogo.querySelector<HTMLInputElement>(`input[name="${nombreDelPaso(n)}"]`)?.focus();
    return false;
  }

  dialogo.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.type !== 'radio') return;
    const seccion = input.closest<HTMLElement>('[data-sam-seccion]');
    const error = seccion?.querySelector<HTMLElement>('[data-sam-error]');
    if (error) error.hidden = true;
  });

  siguiente.addEventListener('click', () => {
    if (!validar(paso, siguiente)) return;
    irA(paso + 1);
  });
  anterior.addEventListener('click', () => irA(paso - 1));
  despues.addEventListener('click', () => {
    dialogo.close();
    retroalimentar(despues, 'cancelacion', tx('sam.cerrado'));
  });

  comentario.addEventListener('input', () => {
    caracteres.textContent = tx('sam.contador', { n: comentario.value.length });
  });

  dialogo.addEventListener('close', () => {
    if (!guardada && sesionDelFlujo(flujo)?.fin) pendiente.hidden = false;
  });
  $<HTMLButtonElement>('[data-sam-reabrir]', pendiente).addEventListener('click', () => abrirTarjeta?.());

  guardar.addEventListener('click', async () => {
    if (estaOcupado(guardar)) return; // ningún envío doble
    if (!validar(4, guardar)) return;
    const sesion = sesionDelFlujo(flujo);
    if (!sesion) {
      aviso.hidden = false;
      $<HTMLElement>('[data-sam-aviso-texto]', aviso).textContent = tx('sam.errorSesion');
      retroalimentar(guardar, 'error', tx('sam.errorSesion'));
      return;
    }
    const fin = sesion.fin ?? Date.now();
    const cuerpo = {
      participante: sesion.participante,
      flujo,
      ...(Object.fromEntries(DIMENSIONES.map((d) => [d, Number(elegido(`sam-${d}`))])) as Record<DimensionSam, number>),
      pasoDificil: elegido('sam-paso'),
      comentario: comentario.value,
      duracionSeg: Math.max(0, Math.round((fin - sesion.inicio) / 1000)),
      aprobado: flujo === 'A' ? (sesion.aprobado ?? null) : null,
    };
    procesar(guardar);
    aviso.hidden = true;
    const inicio = performance.now();
    let status = 0;
    let mensaje = '';
    try {
      const r = await pedirJSON<{ mensaje?: string }>('/api/actividad-20/respuestas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      status = r.respuesta.status;
      mensaje = r.datos.mensaje ?? '';
    } catch {
      /* sin conexión: status 0 */
    }
    await completarCarga(inicio);
    if (status === 201) {
      guardada = true;
      guardarSesionSam(null);
      retroalimentar(guardar, 'exito'); // visual + campanita + vibración + "Respuesta guardada…"
      await esperar(ESPERA_EXITO_MS);
      window.location.assign('/actividad-20');
      return;
    }
    const texto = status === 401 ? tx('sam.errorSesion') : mensaje || tx('sam.errorRed');
    $<HTMLElement>('[data-sam-aviso-texto]', aviso).textContent = texto;
    aviso.hidden = false;
    retroalimentar(guardar, 'error', texto);
  });

  abrirTarjeta = () => {
    const sesion = sesionDelFlujo(flujo);
    if (!sesion || dialogo.open) return;
    pendiente.hidden = true;
    ponerEstado(guardar, 'normal');
    const segundos = Math.max(0, Math.round(((sesion.fin ?? Date.now()) - sesion.inicio) / 1000));
    terminaste.textContent = `${tx('sam.terminaste', { flujo, duracion: formatearDuracion(segundos) })} ${tx('sam.intro')}`;
    irA(paso, false);
    abrirModal('modal-sam');
    irA(paso);
  };

  // Si el flujo ya terminó y la página se recargó sin responder: recordatorio (no se abre sola).
  if (sesionDelFlujo(flujo)?.fin) pendiente.hidden = false;
}
