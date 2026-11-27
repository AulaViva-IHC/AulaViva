// Act. 20 · Escala visual SAM (Self-Assessment Manikin) en flujos críticos.
// Reglas compartidas por el navegador (tarjeta SAM y resultados) y el servidor (API de respuestas).
//   Flujo A (estudiante): rendir la evaluación y obtener el certificado.
//   Flujo B (administrador): crear y publicar un curso.
// Los textos visibles están en src/i18n/es.json y qu.json (ramas "sam" y "a20").

export type FlujoSam = 'A' | 'B';
export type DimensionSam = 'valencia' | 'activacion' | 'control';

export const FLUJOS: readonly FlujoSam[] = ['A', 'B'];
export const DIMENSIONES: readonly DimensionSam[] = ['valencia', 'activacion', 'control'];
export const PASOS: Record<FlujoSam, readonly string[]> = {
  A: ['A1', 'A2', 'A3', 'A4', 'A5'],
  B: ['B1', 'B2', 'B3', 'B4', 'B5'],
};
/** 9 posiciones: las 5 figuras (1, 3, 5, 7, 9) y los 4 puntos intermedios. */
export const POSICIONES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Punto crítico de un flujo según el promedio de cada dimensión. */
export const UMBRALES = {
  valencia: (x: number) => x <= 4, // molesto o tenso
  activacion: (x: number) => x >= 6, // muy activado, tenso
  control: (x: number) => x <= 4, // superado, sin control
} satisfies Record<DimensionSam, (x: number) => boolean>;
/** Un paso es crítico si 2 o más participantes lo eligieron como el que más costó. */
export const MIN_VECES_PASO_CRITICO = 2;

export const LIMITE_COMENTARIO = 500;
export const PATRON_PARTICIPANTE = /^P[1-9]\d{0,2}$/;

/** "p3 " → "P3". */
export function normalizarParticipante(texto: string): string {
  return texto.trim().toUpperCase().replace(/\s+/g, '');
}

/** null si el código vale; si no, qué hacer. Sin nombres: solo P1, P2… (privacidad). */
export function validarParticipante(codigo: string): string | null {
  if (!codigo) return 'Escribe el código del participante, por ejemplo P1.';
  if (!PATRON_PARTICIPANTE.test(codigo)) return 'Usa una P seguida de un número, por ejemplo P1 o P12. No escribas nombres.';
  return null;
}

export const esFlujo = (v: unknown): v is FlujoSam => v === 'A' || v === 'B';
export const esPosicion = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 9;
export const esPasoDe = (flujo: FlujoSam, v: unknown): v is string => typeof v === 'string' && PASOS[flujo].includes(v);

/** Lo que se guarda por respuesta (el servidor añade id y fecha). */
export interface DatosRespuestaSam {
  participante: string;
  flujo: FlujoSam;
  valencia: number;
  activacion: number;
  control: number;
  pasoDificil: string;
  comentario: string;
  duracionSeg: number;
  aprobado: boolean | null;
}

export interface AnalisisFlujo {
  n: number;
  promedios: Record<DimensionSam, number> | null;
  /** Veces que se eligió cada paso (en orden A1…A5 o B1…B5). */
  conteo: { paso: string; veces: number; critico: boolean }[];
  dimensionesCriticas: DimensionSam[];
  critico: boolean;
}

const redondear = (x: number) => Math.round(x * 10) / 10;

/** Promedios, conteo de pasos y puntos críticos de un flujo. */
export function analizarFlujo(flujo: FlujoSam, respuestas: readonly Pick<DatosRespuestaSam, DimensionSam | 'pasoDificil'>[]): AnalisisFlujo {
  const n = respuestas.length;
  const promedios = n
    ? (Object.fromEntries(DIMENSIONES.map((d) => [d, redondear(respuestas.reduce((s, r) => s + r[d], 0) / n)])) as Record<DimensionSam, number>)
    : null;
  const conteo = PASOS[flujo].map((paso) => {
    const veces = respuestas.filter((r) => r.pasoDificil === paso).length;
    return { paso, veces, critico: veces >= MIN_VECES_PASO_CRITICO };
  });
  const dimensionesCriticas = promedios ? DIMENSIONES.filter((d) => UMBRALES[d](promedios[d])) : [];
  return { n, promedios, conteo, dimensionesCriticas, critico: dimensionesCriticas.length > 0 || conteo.some((c) => c.critico) };
}

/** 1 min 05 s, 42 s… */
export function formatearDuracion(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m} min ${String(s).padStart(2, '0')} s`;
}
