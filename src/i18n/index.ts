// Internacionalización (Act. 17): español y quechua chanka.
// Lo usan el servidor (componentes .astro, con Astro.locals.idioma) y el navegador
// (src/scripts/idioma.ts, catalogo.ts, portada.ts). Aquí está la interfaz;
// el título, el resumen y la descripción de los cursos van aparte (campo qu de datos-demo.ts).
//
//   t('qu', 'catalogo.clases', { n: 12 })  →  "12 yachachikuy"
//   Si una clave falta en quechua se usa el español; si falta en los dos, la propia clave.
//
// Formatos regionales (zona America/Lima, con Intl):
//   fecha → DD/MM/AAAA en los dos idiomas · hora → es 12 h ("6:00 p. m."), qu 24 h ("18:00")
//   moneda → "S/ 49.90" en los dos idiomas; 0 = "Gratis" / "Yanqalla"
//
// Prueba de estrés (l10n, solo desarrollo, ?i18n=estres): cada texto traducido crece un 35 %
// con relleno visible entre corchetes, para encontrar desbordes.
import es from './es.json';
import qu from './qu.json';

export type Idioma = 'es' | 'qu';
export const IDIOMAS: readonly Idioma[] = ['es', 'qu'];
export const IDIOMA_POR_DEFECTO: Idioma = 'es';
/** Cookie que recuerda el idioma (1 año) para que el servidor pinte la página ya traducida. */
export const COOKIE_IDIOMA = 'idioma';
export const ZONA = 'America/Lima';

type Diccionario = { [clave: string]: string | Diccionario };
const DICCIONARIOS: Record<Idioma, Diccionario> = { es, qu };

export type Variables = Record<string, string | number>;

export function esIdioma(valor: unknown): valor is Idioma {
  return valor === 'es' || valor === 'qu';
}

function buscar(dic: Diccionario, clave: string): string | undefined {
  let nodo: string | Diccionario | undefined = dic;
  for (const parte of clave.split('.')) {
    if (typeof nodo !== 'object' || nodo === null) return undefined;
    nodo = nodo[parte];
  }
  return typeof nodo === 'string' ? nodo : undefined;
}

/** Reemplaza {n}, {nombre}… por sus valores. */
function interpolar(texto: string, variables?: Variables): string {
  if (!variables) return texto;
  return texto.replace(/\{(\w+)\}/g, (todo, nombre: string) =>
    nombre in variables ? String(variables[nombre]) : todo,
  );
}

/** Texto traducido de `clave` ("catalogo.niveles.basico") con interpolación de {n}. */
export function t(idioma: Idioma, clave: string, variables?: Variables): string {
  const texto = buscar(DICCIONARIOS[idioma], clave) ?? buscar(DICCIONARIOS.es, clave) ?? clave;
  return interpolar(texto, variables);
}

/**
 * Alarga un texto un 35 % (redondeado hacia arriba) con relleno visible:
 * "Cursos" → "Cursos [Cur]". El relleno repite las letras del propio texto.
 */
export function estresar(texto: string): string {
  const letras = texto.replace(/[^\p{L}]/gu, '') || 'x';
  const extra = Math.max(3, Math.ceil(texto.length * 0.35));
  // " [" y "]" cuentan como parte del 35 %.
  const relleno = Math.max(1, extra - 3);
  let r = '';
  for (let i = 0; r.length < relleno; i++) r += letras[i % letras.length];
  return `${texto} [${r}]`;
}

/** Función t ligada a un idioma (y al modo estrés): la usan los componentes del servidor. */
export function traductor(idioma: Idioma, estres = false) {
  return (clave: string, variables?: Variables): string => {
    const texto = t(idioma, clave, variables);
    return estres ? estresar(texto) : texto;
  };
}

// ─── Formatos regionales ────────────────────────────────────────────

const FECHA = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
const HORA: Record<Idioma, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, hour: 'numeric', minute: '2-digit', hour12: true }),
  qu: new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
};
const MONEDA = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

const aFecha = (valor: Date | string) => (valor instanceof Date ? valor : new Date(valor));

/** "20/11/2026" (DD/MM/AAAA) en los dos idiomas. */
export function formatearFecha(valor: Date | string, _idioma: Idioma = 'es'): string {
  return FECHA.format(aFecha(valor));
}

/** Español: "6:00 p. m." (12 h) · quechua: "18:00" (24 h). */
export function formatearHora(valor: Date | string, idioma: Idioma): string {
  return HORA[idioma].format(aFecha(valor));
}

/** "20/11/2026 · 6:00 p. m." */
export function formatearFechaHora(valor: Date | string, idioma: Idioma): string {
  return `${formatearFecha(valor, idioma)} · ${formatearHora(valor, idioma)}`;
}

/** "S/ 49.90" en los dos idiomas; 0 → "Gratis" / "Yanqalla". */
export function formatearPrecio(soles: number, idioma: Idioma): string {
  return soles === 0 ? t(idioma, 'catalogo.gratis') : MONEDA.format(soles);
}
