// Reglas de "Crear curso" compartidas entre el navegador (validar cada paso) y el
// servidor (POST /api/admin/cursos). Los números llegan como texto (valor de los campos).
// Cada error se identifica con una ruta: "titulo", "modulos.0.clases.1.duracionMin"…

export type CategoriaId = 'tecnologia' | 'diseno' | 'negocios' | 'habilidades-blandas';
export type NivelId = 'basico' | 'intermedio' | 'avanzado';

/** Solo 4 categorías principales (Ley de Hick); los temas se buscan escribiendo. */
export const CATEGORIAS: readonly { id: CategoriaId; texto: string }[] = [
  { id: 'tecnologia', texto: 'Tecnología' },
  { id: 'diseno', texto: 'Diseño' },
  { id: 'negocios', texto: 'Negocios' },
  { id: 'habilidades-blandas', texto: 'Habilidades blandas' },
];

export const NIVELES: readonly { id: NivelId; texto: string }[] = [
  { id: 'basico', texto: 'Básico' },
  { id: 'intermedio', texto: 'Intermedio' },
  { id: 'avanzado', texto: 'Avanzado' },
];

/** Valor sugerido de "Requisitos previos" según el nivel. */
export const REQUISITO_SUGERIDO: Record<NivelId, string> = {
  basico: 'Ninguno',
  intermedio: 'Conocimientos básicos del tema',
  avanzado: 'Experiencia previa en el tema',
};

/** Reglas de negocio (CLAUDE.md §8): nota mínima 14/20 y 3 intentos. */
export const EVALUACION_SUGERIDA = { notaMinima: '14', intentos: '3', tiempoMin: '30' };

export const ARCHIVOS = {
  imagen: { extensiones: ['jpg', 'jpeg', 'png'], maxMB: 5, texto: 'una imagen JPG o PNG' },
  video: { extensiones: ['mp4', 'webm', 'mov'], maxMB: 2048, texto: 'un video MP4, WEBM o MOV' },
  subtitulos: { extensiones: ['vtt'], maxMB: 5, texto: 'un archivo de subtítulos .vtt' },
  documento: { extensiones: ['pdf', 'docx', 'pptx'], maxMB: 50, texto: 'un PDF, DOCX o PPTX' },
} as const;
export type TipoArchivo = keyof typeof ARCHIVOS;

export const LIMITES = {
  titulo: 120,
  descripcion: 400,
  horas: [1, 200],
  duracion: [1, 300],
  nota: [0, 20],
  intentos: [1, 5],
  tiempo: [5, 180],
  tituloClase: 120,
  tituloModulo: 120,
  enunciado: 300,
  opcion: 150,
  modulos: 20,
  clases: 30,
  preguntas: 50,
  instructor: 100,
  requisitos: 150,
} as const;

// ─── Borrador: lo que se edita y se guarda en localStorage ─────────

export interface ClaseBorrador {
  id: string;
  titulo: string;
  duracionMin: string;
  video: string | null;
  subtitulos: string | null;
  documento: string | null;
}
export interface ModuloBorrador {
  id: string;
  titulo: string;
  clases: ClaseBorrador[];
}
export interface PreguntaBorrador {
  id: string;
  enunciado: string;
  opciones: [string, string, string, string];
  correcta: number | null;
}
export interface CursoBorrador {
  titulo: string;
  descripcion: string;
  categoria: CategoriaId | '';
  nivel: NivelId;
  horas: string;
  imagen: string | null;
  modulos: ModuloBorrador[];
  evaluacion: { notaMinima: string; intentos: string; tiempoMin: string; preguntas: PreguntaBorrador[] };
  instructor: string;
  requisitos: string;
  fechaPublicacion: string;
}

export type Errores = Record<string, string>;

const entero = (valor: string) => (/^\d+$/.test(valor.trim()) ? Number(valor) : NaN);

function revisarEntero(valor: string, [min, max]: readonly [number, number], nombre: string): string | null {
  if (!valor.trim()) return `Escribe ${nombre}.`;
  const n = entero(valor);
  if (Number.isNaN(n)) return `Escribe ${nombre} con números enteros.`;
  if (n < min || n > max) return `Debe estar entre ${min} y ${max}.`;
  return null;
}

/** Extensión válida para el tipo de archivo; devuelve el error o null. */
export function revisarArchivo(tipo: TipoArchivo, nombre: string, bytes?: number): string | null {
  const regla = ARCHIVOS[tipo];
  const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
  if (!(regla.extensiones as readonly string[]).includes(ext)) return `Elige ${regla.texto}.`;
  if (bytes !== undefined && bytes > regla.maxMB * 1024 * 1024) return `El archivo pesa más de ${regla.maxMB} MB.`;
  return null;
}

// ─── Paso 1 · Datos generales ──────────────────────────────────────
export function erroresDatosGenerales(c: CursoBorrador): Errores {
  const e: Errores = {};
  const titulo = c.titulo.trim();
  if (!titulo) e.titulo = 'Escribe el título del curso.';
  else if (titulo.length < 5) e.titulo = 'El título es muy corto: usa al menos 5 caracteres.';
  else if (titulo.length > LIMITES.titulo) e.titulo = `Usa como máximo ${LIMITES.titulo} caracteres.`;
  const descripcion = c.descripcion.trim();
  if (!descripcion) e.descripcion = 'Escribe una descripción corta para el catálogo.';
  else if (descripcion.length < 20) e.descripcion = 'Cuenta un poco más: al menos 20 caracteres.';
  else if (descripcion.length > LIMITES.descripcion) e.descripcion = `Usa como máximo ${LIMITES.descripcion} caracteres.`;
  if (!CATEGORIAS.some((x) => x.id === c.categoria)) e.categoria = 'Elige una de las 4 categorías.';
  if (!NIVELES.some((x) => x.id === c.nivel)) e.nivel = 'Elige el nivel del curso.';
  const horas = revisarEntero(c.horas, LIMITES.horas, 'las horas académicas');
  if (horas) e.horas = horas;
  if (c.imagen && revisarArchivo('imagen', c.imagen)) e.imagen = revisarArchivo('imagen', c.imagen)!;
  return e;
}

// ─── Paso 2 · Contenido ────────────────────────────────────────────
export function erroresClase(clase: ClaseBorrador, ruta: string): Errores {
  const e: Errores = {};
  const titulo = clase.titulo.trim();
  if (!titulo) e[`${ruta}.titulo`] = 'Escribe el título de la clase.';
  else if (titulo.length > LIMITES.tituloClase) e[`${ruta}.titulo`] = `Usa como máximo ${LIMITES.tituloClase} caracteres.`;
  const duracion = revisarEntero(clase.duracionMin, LIMITES.duracion, 'la duración en minutos');
  if (duracion) e[`${ruta}.duracionMin`] = duracion;
  for (const tipo of ['video', 'subtitulos', 'documento'] as const) {
    const archivo = clase[tipo];
    if (archivo && revisarArchivo(tipo, archivo)) e[`${ruta}.${tipo}`] = revisarArchivo(tipo, archivo)!;
  }
  return e;
}

export function erroresContenido(c: CursoBorrador): Errores {
  const e: Errores = {};
  if (c.modulos.length === 0) e.modulos = 'Agrega al menos un módulo con una clase.';
  if (c.modulos.length > LIMITES.modulos) e.modulos = `Máximo ${LIMITES.modulos} módulos.`;
  c.modulos.forEach((m, i) => {
    const titulo = m.titulo.trim();
    if (!titulo) e[`modulos.${i}.titulo`] = 'Escribe el título del módulo.';
    else if (titulo.length > LIMITES.tituloModulo) e[`modulos.${i}.titulo`] = `Usa como máximo ${LIMITES.tituloModulo} caracteres.`;
    if (m.clases.length === 0) e[`modulos.${i}.clases`] = 'Agrega al menos una clase a este módulo.';
    if (m.clases.length > LIMITES.clases) e[`modulos.${i}.clases`] = `Máximo ${LIMITES.clases} clases por módulo.`;
    m.clases.forEach((clase, j) => Object.assign(e, erroresClase(clase, `modulos.${i}.clases.${j}`)));
  });
  return e;
}

/** Clases a las que les falta el video o los subtítulos (se exigen para publicar). */
export function clasesSinMedia(c: CursoBorrador): number {
  return c.modulos.flatMap((m) => m.clases).filter((x) => !x.video || !x.subtitulos).length;
}

// ─── Paso 3 · Evaluación ───────────────────────────────────────────
export function erroresPregunta(p: PreguntaBorrador, ruta: string): Errores {
  const e: Errores = {};
  const enunciado = p.enunciado.trim();
  if (!enunciado) e[`${ruta}.enunciado`] = 'Escribe el enunciado de la pregunta.';
  else if (enunciado.length > LIMITES.enunciado) e[`${ruta}.enunciado`] = `Usa como máximo ${LIMITES.enunciado} caracteres.`;
  p.opciones.forEach((o, k) => {
    if (!o.trim()) e[`${ruta}.opciones.${k}`] = `Escribe la opción ${'ABCD'[k]}.`;
    else if (o.trim().length > LIMITES.opcion) e[`${ruta}.opciones.${k}`] = `Usa como máximo ${LIMITES.opcion} caracteres.`;
  });
  const textos = p.opciones.map((o) => o.trim().toLowerCase()).filter(Boolean);
  if (new Set(textos).size !== textos.length) e[`${ruta}.opciones`] = 'Hay dos opciones iguales; cada opción debe ser distinta.';
  if (p.correcta === null || p.correcta < 0 || p.correcta > 3) e[`${ruta}.correcta`] = 'Marca cuál es la opción correcta.';
  return e;
}

export function preguntaCompleta(p: PreguntaBorrador): boolean {
  return Object.keys(erroresPregunta(p, 'p')).length === 0;
}

export function erroresEvaluacion(c: CursoBorrador): Errores {
  const e: Errores = {};
  const ev = c.evaluacion;
  const nota = revisarEntero(ev.notaMinima, LIMITES.nota, 'la nota mínima');
  if (nota) e['evaluacion.notaMinima'] = nota;
  const intentos = revisarEntero(ev.intentos, LIMITES.intentos, 'los intentos');
  if (intentos) e['evaluacion.intentos'] = intentos;
  const tiempo = revisarEntero(ev.tiempoMin, LIMITES.tiempo, 'el tiempo límite en minutos');
  if (tiempo) e['evaluacion.tiempoMin'] = tiempo;
  if (ev.preguntas.length === 0) e['evaluacion.preguntas'] = 'Agrega al menos una pregunta.';
  if (ev.preguntas.length > LIMITES.preguntas) e['evaluacion.preguntas'] = `Máximo ${LIMITES.preguntas} preguntas.`;
  ev.preguntas.forEach((p, i) => Object.assign(e, erroresPregunta(p, `evaluacion.preguntas.${i}`)));
  return e;
}

// ─── Paso 4 · Revisar y publicar ───────────────────────────────────
export function erroresPublicacion(c: CursoBorrador, hoy: string, instructores: readonly string[]): Errores {
  const e: Errores = {};
  const instructor = c.instructor.trim();
  if (!instructor) e.instructor = 'Elige el instructor del curso.';
  else if (!instructores.includes(instructor)) e.instructor = 'Elige un instructor de la lista (escribe para buscar).';
  const requisitos = c.requisitos.trim();
  if (!requisitos) e.requisitos = 'Escribe los requisitos previos o deja “Ninguno”.';
  else if (requisitos.length > LIMITES.requisitos) e.requisitos = `Usa como máximo ${LIMITES.requisitos} caracteres.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fechaPublicacion)) e.fechaPublicacion = 'Elige la fecha de publicación.';
  else if (c.fechaPublicacion < hoy) e.fechaPublicacion = 'La fecha no puede ser anterior a hoy.';
  const sinMedia = clasesSinMedia(c);
  if (sinMedia > 0) {
    e.media = `${sinMedia === 1 ? 'A 1 clase le falta' : `A ${sinMedia} clases les falta`} el video o los subtítulos. Todos los videos deben tener subtítulos.`;
  }
  return e;
}

export function todosLosErrores(c: CursoBorrador, hoy: string, instructores: readonly string[]): Errores {
  return {
    ...erroresDatosGenerales(c),
    ...erroresContenido(c),
    ...erroresEvaluacion(c),
    ...erroresPublicacion(c, hoy, instructores),
  };
}

/** Fecha AAAA-MM-DD de hoy en Perú. */
export function hoyEnLima(fecha = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(fecha);
}
