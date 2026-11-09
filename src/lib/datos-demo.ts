// Datos de prueba del estudiante, el catálogo y los instructores mientras no hay base de datos.
// Solo los lee src/lib/repositorio.ts. Cuando se conecte MySQL pasan a db/seed.sql
// (tablas categorias, cursos, modulos, clases, inscripciones, progreso_clases…) y este
// archivo se borra.

export type Categoria = 'tecnologia' | 'diseno' | 'negocios' | 'habilidades-blandas';

export interface CursoCatalogo {
  id: number;
  slug: string;
  titulo: string;
  categoria: Categoria;
  instructor: string;
}

/** Progreso de un estudiante en un curso inscrito. */
export interface InscripcionDemo {
  usuarioId: number;
  cursoId: number;
  /** Clases por módulo: cuántas tiene y cuántas completó. */
  modulos: { titulo: string; clases: number; completadas: number }[];
  claseActual: { id: number; codigo: string; titulo: string };
  ultimoAcceso: Date;
}

export interface TareaDemo {
  usuarioId: number;
  titulo: string;
  cursoId: number;
  /** Días que faltan desde hoy: 0 = vence hoy. Relativo para que la demo nunca "caduque". */
  venceEnDias: number;
}

export const catalogoDemo: readonly CursoCatalogo[] = [
  { id: 1, slug: 'diseno-de-interfaces-con-figma', titulo: 'Diseño de interfaces con Figma', categoria: 'diseno', instructor: 'Lucía Paredes' },
  { id: 2, slug: 'python-desde-cero', titulo: 'Python desde cero', categoria: 'tecnologia', instructor: 'Martín Quispe' },
  { id: 3, slug: 'analisis-de-datos-con-excel', titulo: 'Análisis de datos con Excel', categoria: 'negocios', instructor: 'Rosa Huamán' },
  { id: 4, slug: 'prototipado-en-figma', titulo: 'Prototipado en Figma', categoria: 'diseno', instructor: 'Lucía Paredes' },
  { id: 5, slug: 'heuristicas-de-usabilidad', titulo: 'Heurísticas de usabilidad', categoria: 'diseno', instructor: 'Lucía Paredes' },
  { id: 6, slug: 'comunicacion-efectiva', titulo: 'Comunicación efectiva', categoria: 'habilidades-blandas', instructor: 'Carmen Ríos' },
  { id: 7, slug: 'finanzas-para-emprendedores', titulo: 'Finanzas para emprendedores', categoria: 'negocios', instructor: 'Jorge Salas' },
];

/** Temas que se pueden buscar escribiendo (no son cursos, llevan al catálogo filtrado). */
export const temasDemo: readonly string[] = [
  'Atajos de Figma',
  'Componentes de Figma',
  'Heurísticas de Nielsen',
  'Tablas dinámicas',
  'Listas en Python',
  'Bucles en Python',
  'Contraste y accesibilidad',
  'Hablar en público',
];

export const instructoresDemo: readonly string[] = [
  'Lucía Paredes',
  'Martín Quispe',
  'Rosa Huamán',
  'Carmen Ríos',
  'Jorge Salas',
];

const hace = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000);

// Gonzalo Barreto (id 1) va en el Módulo 4 de Figma: 17 de 18 clases (94 %).
export const inscripcionesDemo: readonly InscripcionDemo[] = [
  {
    usuarioId: 1,
    cursoId: 1,
    modulos: [
      { titulo: 'Módulo 1', clases: 4, completadas: 4 },
      { titulo: 'Módulo 2', clases: 5, completadas: 5 },
      { titulo: 'Módulo 3', clases: 5, completadas: 5 },
      { titulo: 'Módulo 4', clases: 4, completadas: 3 },
    ],
    claseActual: { id: 18, codigo: '4.4', titulo: 'Prueba de usabilidad con usuarios' },
    ultimoAcceso: hace(20),
  },
  {
    usuarioId: 1,
    cursoId: 2,
    modulos: [
      { titulo: 'Módulo 1', clases: 7, completadas: 7 },
      { titulo: 'Módulo 2', clases: 7, completadas: 2 },
      { titulo: 'Módulo 3', clases: 6, completadas: 0 },
    ],
    claseActual: { id: 210, codigo: '2.3', titulo: 'Listas y bucles' },
    ultimoAcceso: hace(50),
  },
  {
    usuarioId: 1,
    cursoId: 3,
    modulos: [
      { titulo: 'Módulo 1', clases: 5, completadas: 3 },
      { titulo: 'Módulo 2', clases: 5, completadas: 0 },
      { titulo: 'Módulo 3', clases: 5, completadas: 0 },
    ],
    claseActual: { id: 304, codigo: '1.4', titulo: 'Tablas dinámicas' },
    ultimoAcceso: hace(120),
  },
];

export const tareasDemo: readonly TareaDemo[] = [
  { usuarioId: 1, titulo: 'Cuestionario del Módulo 4', cursoId: 1, venceEnDias: 0 },
  { usuarioId: 1, titulo: 'Práctica de tablas dinámicas', cursoId: 3, venceEnDias: 2 },
  { usuarioId: 1, titulo: 'Ejercicios de listas y bucles', cursoId: 2, venceEnDias: 4 },
];

/** Lo que muestra el panel del login y del registro a quien aún no inició sesión. */
export const tareasEjemplo = [
  { titulo: 'Cuestionario del Módulo 4', curso: 'Diseño de interfaces con Figma', venceEnDias: 0 },
  { titulo: 'Práctica de tablas dinámicas', curso: 'Análisis de datos con Excel', venceEnDias: 2 },
  { titulo: 'Ejercicios de listas y bucles', curso: 'Python desde cero', venceEnDias: 4 },
];
