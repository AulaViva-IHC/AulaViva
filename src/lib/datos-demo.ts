// Datos de prueba del catálogo, el estudiante y los instructores mientras no hay base de datos.
// Solo los lee src/lib/repositorio.ts. Cuando se conecte MySQL pasan a db/seed.sql
// (tablas categorias, cursos, modulos, clases, inscripciones, progreso_clases…) y este
// archivo se borra.
//
// Los 6 cursos son los de referencias/pantallas/01-catalogo.png.
// Id de cada clase = id del curso × 100 + su posición en el curso (1.1 de Figma = 101).

export type Categoria = 'tecnologia' | 'diseno' | 'negocios' | 'habilidades-blandas';
export type Nivel = 'basico' | 'intermedio' | 'avanzado';
export type EtiquetaCurso = 'destacado' | 'nuevo' | null;
/** Icono de la portada (nombres de Icono.astro). */
export type IconoCurso = 'pluma' | 'codigo' | 'grafico' | 'red' | 'chat' | 'chispa';

export interface CursoDemo {
  id: number;
  slug: string;
  titulo: string;
  /** Una línea para la tarjeta del catálogo. */
  resumen: string;
  /** Bajada del detalle del curso. */
  descripcion: string;
  /** Pestaña "Descripción". */
  sobre: string;
  aprenderas: string[];
  categoria: Categoria;
  nivel: Nivel;
  horas: number;
  etiqueta: EtiquetaCurso;
  /** Fondo de la portada (con el icono blanco encima). */
  color: string;
  icono: IconoCurso;
  instructor: { nombre: string; rol: string; bio: string };
  /** Temas que se encuentran escribiendo en el buscador. */
  temas: string[];
  /** Módulos con sus clases: [título, minutos]. */
  modulos: { titulo: string; clases: [string, number][] }[];
  /** Evaluación final: 5 preguntas de opción múltiple [enunciado, opciones A–D, índice correcto]. */
  preguntas: [string, string[], number][];
}

export const catalogoDemo: readonly CursoDemo[] = [
  {
    id: 1,
    slug: 'diseno-de-interfaces-con-figma',
    titulo: 'Diseño de interfaces con Figma',
    resumen: 'Diseña pantallas claras y pruébalas con personas.',
    descripcion: 'De las heurísticas de usabilidad a un prototipo navegable que pruebas con personas reales.',
    sobre:
      'Aprende a diseñar interfaces que la gente entiende a la primera. Empiezas por los principios de usabilidad, construyes componentes reutilizables en Figma y terminas con un prototipo que pruebas con usuarios reales.',
    aprenderas: [
      'Aplicar las 10 heurísticas de Nielsen a una pantalla real',
      'Crear componentes con variantes y estilos compartidos',
      'Diseñar los 5 estados de una interfaz',
      'Preparar y conducir una prueba de usabilidad',
    ],
    categoria: 'diseno',
    nivel: 'basico',
    horas: 24,
    etiqueta: 'destacado',
    color: '#2A2477',
    icono: 'pluma',
    instructor: {
      nombre: 'Lucía Paredes',
      rol: 'Instructora, diseñadora UX',
      bio: 'Diseñadora de producto con 9 años de experiencia en banca y educación. Enseña a diseñar probando con personas desde el primer boceto.',
    },
    temas: ['Atajos de Figma', 'Componentes de Figma', 'Heurísticas de Nielsen', 'Contraste y accesibilidad'],
    modulos: [
      {
        titulo: 'Fundamentos del diseño de interfaces',
        clases: [
          ['¿Qué es una interfaz?', 9],
          ['Las 10 heurísticas de Nielsen', 14],
          ['Jerarquía visual', 12],
          ['Accesibilidad básica (WCAG)', 15],
        ],
      },
      {
        titulo: 'Primeros pasos en Figma',
        clases: [
          ['Tu primer archivo en Figma', 10],
          ['Marcos y rejillas', 12],
          ['Formas, texto y color', 13],
          ['Auto layout', 15],
          ['Atajos de Figma', 8],
        ],
      },
      {
        titulo: 'Componentes y estilos',
        clases: [
          ['Componentes y variantes', 14],
          ['Estilos de color y texto', 11],
          ['Bibliotecas compartidas', 12],
          ['Iconos y recursos', 9],
          ['Un sistema de diseño básico', 16],
        ],
      },
      {
        titulo: 'Prototipado y pruebas',
        clases: [
          ['Enlaces e interacciones', 11],
          ['Animaciones inteligentes', 14],
          ['Los 5 estados de la UI', 16],
          ['Prueba de usabilidad con usuarios', 13],
        ],
      },
    ],
    preguntas: [
      ['¿Qué heurística de Nielsen pide mostrar siempre qué está pasando en el sistema?', ['Visibilidad del estado del sistema', 'Control y libertad del usuario', 'Estética y diseño minimalista', 'Ayuda y documentación'], 0],
      ['En Figma, ¿qué te permite crear las versiones de un mismo botón: normal, al pasar el cursor y desactivado?', ['Grupos de capas', 'Componentes con variantes', 'Máscaras', 'Marcos sin auto layout'], 1],
      ['¿Para qué sirve el auto layout en Figma?', ['Para exportar imágenes', 'Para que los elementos se acomoden solos al cambiar el contenido', 'Para crear prototipos con animación', 'Para compartir el archivo'], 1],
      ['¿Cuál de estos NO es uno de los 5 estados de una interfaz?', ['Vacío', 'Cargando', 'Parcial', 'Archivado'], 3],
      ['Durante una prueba de usabilidad, ¿qué debes hacer cuando la persona se equivoca?', ['Explicarle cómo se hace', 'Observar sin intervenir y anotar', 'Terminar la prueba', 'Cambiar la tarea'], 1],
    ],
  },
  {
    id: 2,
    slug: 'python-desde-cero',
    titulo: 'Python desde cero',
    resumen: 'Escribe tus primeros programas paso a paso.',
    descripcion: 'Programa desde la primera clase: variables, listas, funciones y un proyecto final que resuelve un problema real.',
    sobre:
      'Un curso para quien nunca ha programado. Cada clase termina con un ejercicio corto y al final construyes una pequeña aplicación de consola.',
    aprenderas: [
      'Escribir y ejecutar programas en Python',
      'Usar listas, diccionarios y bucles',
      'Organizar tu código en funciones y módulos',
      'Leer archivos y manejar errores',
    ],
    categoria: 'tecnologia',
    nivel: 'basico',
    horas: 32,
    etiqueta: 'nuevo',
    color: '#1E5E9E',
    icono: 'codigo',
    instructor: {
      nombre: 'Martín Quispe',
      rol: 'Instructor, desarrollador de software',
      bio: 'Desarrollador backend y docente de programación. Le gusta explicar con ejemplos del día a día.',
    },
    temas: ['Listas en Python', 'Bucles en Python', 'Funciones en Python'],
    modulos: [
      {
        titulo: 'Primeros pasos con Python',
        clases: [
          ['Instalar Python y el editor', 10],
          ['Tu primer programa', 9],
          ['Variables y tipos de datos', 14],
          ['Operaciones y expresiones', 12],
          ['Entrada y salida', 11],
          ['Condicionales', 15],
          ['Errores comunes', 10],
        ],
      },
      {
        titulo: 'Estructuras de datos',
        clases: [
          ['Listas', 13],
          ['Bucles for y while', 15],
          ['Listas y bucles', 14],
          ['Diccionarios', 13],
          ['Tuplas y conjuntos', 11],
          ['Recorrer colecciones', 12],
          ['Práctica: agenda de contactos', 18],
        ],
      },
      {
        titulo: 'Funciones y módulos',
        clases: [
          ['Definir funciones', 13],
          ['Parámetros y retorno', 12],
          ['Alcance de variables', 10],
          ['Módulos y paquetes', 12],
          ['Leer y escribir archivos', 14],
          ['Manejo de excepciones', 13],
          ['Proyecto final: planificación', 15],
          ['Proyecto final: entrega', 20],
        ],
      },
    ],
    preguntas: [
      ['¿Qué muestra en pantalla print("Hola")?', ['print', 'Hola', '"Hola"', 'Nada'], 1],
      ['¿Qué tipo de dato es 3.14 en Python?', ['int', 'str', 'float', 'bool'], 2],
      ['¿Cómo accedes al primer elemento de la lista notas?', ['notas[1]', 'notas[0]', 'notas.primero', 'notas(0)'], 1],
      ['¿Qué estructura guarda pares clave y valor?', ['Lista', 'Tupla', 'Diccionario', 'Conjunto'], 2],
      ['¿Qué palabra se usa para definir una función?', ['func', 'def', 'function', 'lambda'], 1],
    ],
  },
  {
    id: 3,
    slug: 'analisis-de-datos-con-excel',
    titulo: 'Análisis de datos con Excel',
    resumen: 'Convierte datos en decisiones con tablas y gráficos.',
    descripcion: 'Limpia, resume y presenta datos con fórmulas, tablas dinámicas y paneles que se entienden de un vistazo.',
    sobre:
      'Para quien ya usa Excel y quiere sacarle provecho a sus datos. Trabajas con un archivo de ventas real de principio a fin.',
    aprenderas: [
      'Limpiar y ordenar datos sin perder información',
      'Resumir miles de filas con tablas dinámicas',
      'Elegir el gráfico que comunica mejor',
      'Armar un panel de control mensual',
    ],
    categoria: 'negocios',
    nivel: 'intermedio',
    horas: 20,
    etiqueta: null,
    color: '#22766A',
    icono: 'grafico',
    instructor: {
      nombre: 'Rosa Huamán',
      rol: 'Instructora, analista de datos',
      bio: 'Analista de datos en el sector retail. Convierte hojas de cálculo desordenadas en decisiones claras.',
    },
    temas: ['Tablas dinámicas', 'Gráficos en Excel', 'Fórmulas de Excel'],
    modulos: [
      {
        titulo: 'Datos en orden',
        clases: [
          ['Ordenar y limpiar datos', 12],
          ['Fórmulas básicas', 13],
          ['Referencias relativas y absolutas', 11],
          ['Tablas dinámicas', 15],
          ['Búsquedas con BUSCARX', 12],
        ],
      },
      {
        titulo: 'Análisis',
        clases: [
          ['Tablas dinámicas avanzadas', 14],
          ['Segmentación de datos', 10],
          ['Gráficos que comunican', 13],
          ['Formato condicional', 9],
          ['Escenarios y Solver', 14],
        ],
      },
      {
        titulo: 'Informes',
        clases: [
          ['Power Query básico', 15],
          ['Modelo de datos', 13],
          ['Paneles de control', 16],
          ['Automatizar con macros', 14],
          ['Proyecto: informe mensual', 18],
        ],
      },
    ],
    preguntas: [
      ['¿Qué referencia no cambia al copiar la fórmula a otra celda?', ['A1', '$A$1', 'A$1', 'Ninguna'], 1],
      ['¿Qué herramienta resume miles de filas por categoría en segundos?', ['Formato condicional', 'Tabla dinámica', 'Validación de datos', 'Inmovilizar paneles'], 1],
      ['¿Qué gráfico conviene para mostrar la evolución mensual de las ventas?', ['Circular', 'De líneas', 'De dispersión', 'De radar'], 1],
      ['¿Qué función busca un valor y devuelve un dato de la misma fila?', ['BUSCARX', 'CONTAR', 'SUMA', 'HOY'], 0],
      ['¿Para qué sirve la segmentación de datos?', ['Para filtrar tablas dinámicas con botones', 'Para proteger la hoja', 'Para crear macros', 'Para imprimir'], 0],
    ],
  },
  {
    id: 4,
    slug: 'fundamentos-de-redes-de-computadoras',
    titulo: 'Fundamentos de redes de computadoras',
    resumen: 'Entiende cómo se conectan los equipos y arma una red.',
    descripcion: 'Del cable al router: cómo viaja la información, cómo se reparten las direcciones IP y cómo armar una red pequeña.',
    sobre:
      'Conoce las piezas de una red y cómo se comunican. Practicas con un simulador gratuito y terminas diseñando la red de una oficina.',
    aprenderas: [
      'Explicar el modelo OSI y TCP/IP con ejemplos',
      'Calcular direcciones IP y subredes',
      'Configurar un router y una red Wi-Fi',
      'Diagnosticar fallas comunes de conexión',
    ],
    categoria: 'tecnologia',
    nivel: 'intermedio',
    horas: 28,
    etiqueta: null,
    color: '#4A40A6',
    icono: 'red',
    instructor: {
      nombre: 'Jorge Salas',
      rol: 'Instructor, ingeniero de redes',
      bio: 'Ingeniero de redes certificado. Ha montado la red de colegios y municipalidades en Apurímac.',
    },
    temas: ['Direcciones IP', 'Subredes', 'Modelo OSI'],
    modulos: [
      {
        titulo: 'Cómo viaja la información',
        clases: [
          ['¿Qué es una red?', 9],
          ['El modelo OSI', 14],
          ['TCP/IP en la práctica', 13],
          ['Cables y medios de transmisión', 11],
          ['Redes inalámbricas', 12],
        ],
      },
      {
        titulo: 'Direcciones IP y subredes',
        clases: [
          ['Direcciones IPv4', 13],
          ['Máscaras de red', 12],
          ['Calcular subredes', 16],
          ['IPv6 en pocas palabras', 10],
          ['DHCP y DNS', 12],
        ],
      },
      {
        titulo: 'Equipos de red',
        clases: [
          ['Switches', 11],
          ['Routers', 13],
          ['Puntos de acceso', 10],
          ['Cortafuegos', 12],
          ['Simulador de redes', 15],
        ],
      },
      {
        titulo: 'Arma tu red',
        clases: [
          ['Diseñar la red de una oficina', 14],
          ['Configurar el router', 15],
          ['Seguridad básica', 13],
          ['Diagnosticar fallas', 12],
          ['Proyecto: red de una oficina', 18],
        ],
      },
    ],
    preguntas: [
      ['¿Cuántas capas tiene el modelo OSI?', ['4', '5', '7', '9'], 2],
      ['¿Qué servicio entrega direcciones IP automáticamente?', ['DNS', 'DHCP', 'HTTP', 'FTP'], 1],
      ['¿Qué equipo conecta dos redes distintas?', ['Switch', 'Router', 'Repetidor', 'Cable'], 1],
      ['¿Qué máscara corresponde a /24?', ['255.0.0.0', '255.255.0.0', '255.255.255.0', '255.255.255.255'], 2],
      ['¿Qué traduce nombres como aulaviva.pe a direcciones IP?', ['DHCP', 'NAT', 'DNS', 'VPN'], 2],
    ],
  },
  {
    id: 5,
    slug: 'comunicacion-efectiva',
    titulo: 'Comunicación efectiva',
    resumen: 'Expón tus ideas con claridad y seguridad.',
    descripcion: 'Ordena tus ideas, adapta tu mensaje a quien te escucha y presenta con seguridad, en persona o en línea.',
    sobre:
      'Un curso práctico para estudiantes y profesionales. Grabas tres presentaciones cortas y recibes una guía para mejorar cada una.',
    aprenderas: [
      'Estructurar un mensaje en tres partes',
      'Escuchar de forma activa',
      'Controlar los nervios al hablar en público',
      'Dar y recibir retroalimentación',
    ],
    categoria: 'habilidades-blandas',
    nivel: 'basico',
    horas: 12,
    etiqueta: 'nuevo',
    color: '#7A3A86',
    icono: 'chat',
    instructor: {
      nombre: 'Carmen Ríos',
      rol: 'Instructora, comunicadora',
      bio: 'Comunicadora y coach de oratoria. Ha preparado a cientos de estudiantes para sus sustentaciones.',
    },
    temas: ['Hablar en público', 'Escucha activa'],
    modulos: [
      {
        titulo: 'Comunicar con claridad',
        clases: [
          ['¿Qué hace claro un mensaje?', 9],
          ['Ordena tus ideas', 11],
          ['Escucha activa', 10],
          ['Lenguaje no verbal', 12],
          ['Escribir para que te entiendan', 11],
        ],
      },
      {
        titulo: 'Hablar en público',
        clases: [
          ['Prepara tu presentación', 12],
          ['Controla los nervios', 10],
          ['Apoyos visuales', 11],
          ['Responder preguntas', 9],
          ['Dar y recibir retroalimentación', 12],
        ],
      },
    ],
    preguntas: [
      ['¿Cuál es una buena estructura para un mensaje claro?', ['Detalles, idea y cierre', 'Idea principal, apoyo y cierre', 'Solo datos', 'Cierre y luego la idea'], 1],
      ['¿Qué caracteriza a la escucha activa?', ['Pensar la respuesta mientras el otro habla', 'Parafrasear y preguntar para entender', 'Interrumpir para aclarar', 'Mirar el celular'], 1],
      ['¿Qué ayuda a controlar los nervios antes de hablar en público?', ['Improvisar todo', 'Ensayar en voz alta', 'Leer las diapositivas', 'Hablar más rápido'], 1],
      ['Un buen apoyo visual…', ['Tiene mucho texto', 'Refuerza una idea por diapositiva', 'Repite lo que dices palabra por palabra', 'Usa muchas fuentes'], 1],
      ['¿Cómo das retroalimentación útil?', ['Con ejemplos concretos y una sugerencia', 'Con juicios generales', 'Solo con lo negativo', 'En público y sin aviso'], 0],
    ],
  },
  {
    id: 6,
    slug: 'introduccion-a-la-inteligencia-artificial',
    titulo: 'Introducción a la inteligencia artificial',
    resumen: 'Conoce cómo funciona la IA y úsala con criterio.',
    descripcion: 'Qué hay detrás de los modelos de IA, cómo aprenden, qué pueden y qué no pueden hacer, y cómo usarlos con responsabilidad.',
    sobre:
      'Un recorrido por los conceptos clave de la inteligencia artificial con ejemplos y ejercicios. Requiere bases de programación y estadística.',
    aprenderas: [
      'Distinguir los tipos de aprendizaje automático',
      'Entrenar y evaluar un modelo sencillo',
      'Entender cómo funcionan los modelos de lenguaje',
      'Detectar sesgos y usar la IA con responsabilidad',
    ],
    categoria: 'tecnologia',
    nivel: 'avanzado',
    horas: 36,
    etiqueta: null,
    color: '#363852',
    icono: 'chispa',
    instructor: {
      nombre: 'Ana Torres',
      rol: 'Instructora, científica de datos',
      bio: 'Científica de datos e investigadora en aprendizaje automático aplicado a la educación.',
    },
    temas: ['Modelos de lenguaje', 'Aprendizaje automático', 'Redes neuronales'],
    modulos: [
      {
        titulo: '¿Qué es la inteligencia artificial?',
        clases: [
          ['Historia breve de la IA', 12],
          ['IA, aprendizaje automático y datos', 14],
          ['Tipos de problemas', 11],
          ['Datos de entrenamiento', 13],
          ['Herramientas para empezar', 12],
          ['Tu primer experimento', 16],
        ],
      },
      {
        titulo: 'Aprendizaje automático',
        clases: [
          ['Aprendizaje supervisado', 15],
          ['Regresión', 14],
          ['Clasificación', 14],
          ['Aprendizaje no supervisado', 13],
          ['Evaluar un modelo', 15],
          ['Sobreajuste', 12],
        ],
      },
      {
        titulo: 'Redes neuronales y lenguaje',
        clases: [
          ['Redes neuronales', 16],
          ['Aprendizaje profundo', 15],
          ['Visión por computadora', 14],
          ['Modelos de lenguaje', 16],
          ['Cómo escribir buenas instrucciones', 13],
          ['Límites de los modelos', 12],
        ],
      },
      {
        titulo: 'Uso responsable de la IA',
        clases: [
          ['Sesgos en los datos', 13],
          ['Privacidad', 12],
          ['IA en la educación', 11],
          ['IA en el trabajo', 12],
          ['Ética y regulación', 14],
          ['Proyecto final', 20],
        ],
      },
    ],
    preguntas: [
      ['¿Qué tipo de aprendizaje usa datos con la respuesta correcta ya etiquetada?', ['Supervisado', 'No supervisado', 'Por refuerzo', 'Ninguno'], 0],
      ['Predecir el precio de una casa es un problema de…', ['Clasificación', 'Regresión', 'Agrupamiento', 'Reducción de dimensiones'], 1],
      ['¿Qué es el sobreajuste?', ['Cuando el modelo memoriza el entrenamiento y falla con datos nuevos', 'Cuando el modelo es muy simple', 'Cuando faltan datos de prueba', 'Cuando el modelo entrena rápido'], 0],
      ['¿Qué genera un modelo de lenguaje?', ['Imágenes en 3D', 'La siguiente palabra más probable', 'Bases de datos', 'Código binario'], 1],
      ['Un sesgo en los datos de entrenamiento puede…', ['Mejorar siempre el modelo', 'Producir resultados injustos', 'Acelerar el entrenamiento', 'Eliminar errores'], 1],
    ],
  },
];

export const instructoresDemo: readonly string[] = [
  'Lucía Paredes',
  'Martín Quispe',
  'Rosa Huamán',
  'Jorge Salas',
  'Carmen Ríos',
  'Ana Torres',
];

// ─── Avance del estudiante de prueba ────────────────────────────────

/** Inscripción de un estudiante: las primeras `completadas` clases están hechas. */
export interface InscripcionDemo {
  usuarioId: number;
  cursoId: number;
  completadas: number;
  /** Código de la última clase vista ("4.4"): "Continuar" lleva ahí. */
  ultimaClase: string;
  /** Horas desde el último acceso (relativo para que la demo nunca "caduque"). */
  haceHoras: number;
  /** Mejor nota aprobatoria de la evaluación (null si aún no aprueba). */
  nota: number | null;
}

// Gonzalo Barreto (id 1), como en referencias/pantallas/05-mis-cursos.png:
// Figma 17 de 18 (94 %), Python 10 de 22 (45 %), Excel 3 de 15 (20 %) y Comunicación aprobado con 16/20
// (la referencia dice 17/20, pero con 5 preguntas la nota solo puede ser 0, 4, 8, 12, 16 o 20).
export const inscripcionesDemo: readonly InscripcionDemo[] = [
  { usuarioId: 1, cursoId: 1, completadas: 17, ultimaClase: '4.4', haceHoras: 26, nota: null },
  { usuarioId: 1, cursoId: 2, completadas: 10, ultimaClase: '2.3', haceHoras: 74, nota: null },
  { usuarioId: 1, cursoId: 3, completadas: 3, ultimaClase: '1.2', haceHoras: 170, nota: null },
  { usuarioId: 1, cursoId: 5, completadas: 10, ultimaClase: '2.5', haceHoras: 720, nota: 16 },
];

// ─── Certificados emitidos ──────────────────────────────────────────
// En MySQL: certificados (codigo, usuario_id, curso_id, nombre, emitido_en, estado, motivo, anulado_por, anulado_en).
// Código: 10 caracteres en mayúsculas y números, sin O, 0, I ni 1 (CLAUDE.md §8).

export interface CertificadoDemo {
  codigo: string;
  usuarioId: number;
  cursoId: number;
  /** Nombre confirmado por el estudiante al emitirlo (no cambia después). */
  nombre: string;
  emitidoEn: string; // AAAA-MM-DD
  anulado?: { motivo: string; en: string };
}

export const certificadosDemo: readonly CertificadoDemo[] = [
  // El de la referencia 10-verificar: Gonzalo aprobó Comunicación efectiva.
  { codigo: 'K7Q2M9XPD4', usuarioId: 1, cursoId: 5, nombre: 'Gonzalo Osmar Barreto Geri', emitidoEn: '2026-10-12' },
  // Uno anulado, para mostrar ese resultado en /verificar (de una estudiante sin cuenta en la demo).
  {
    codigo: 'R5T8W2Y6Z3',
    usuarioId: 0,
    cursoId: 2,
    nombre: 'María Fernanda Quispe Rojas',
    emitidoEn: '2026-09-03',
    anulado: { motivo: 'Se emitió con un nombre equivocado.', en: '2026-09-20' },
  },
];

export interface TareaDemo {
  usuarioId: number;
  titulo: string;
  cursoId: number;
  /** Días que faltan desde hoy: 0 = vence hoy. Relativo para que la demo nunca "caduque". */
  venceEnDias: number;
}

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
