// ÚNICO punto de acceso a los datos de AulaViva.
//
// Hoy: datos de prueba (usuarios-demo.ts y datos-demo.ts) y todo lo nuevo
// (usuarios registrados, sesiones, intentos, cursos publicados, inscripciones y
// avance) en memoria. Se pierde al reiniciar el servidor.
// Mañana: estas mismas funciones harán consultas parametrizadas a MySQL.
// El resto del proyecto no cambia, por eso todas son async aunque ahora
// respondan al instante.

import { randomInt } from 'node:crypto';
import { usuariosDemo, type Usuario, type Rol } from './usuarios-demo';
import { normalizarBusqueda } from './validacion';
import type { FlujoSam } from './sam';
import {
  catalogoDemo,
  certificadosDemo,
  cursoPruebaSam,
  ID_CURSO_SAM,
  inscripcionSam,
  estudiantesDemo,
  inscripcionesDemo,
  inscripcionesEstudiantesDemo,
  instructoresDemo,
  tareasDemo,
  tareasEjemplo,
  type Categoria,
  type CursoDemo,
  type EtiquetaCurso,
  type IconoCurso,
  type Nivel,
} from './datos-demo';

export type { Usuario, Rol } from './usuarios-demo';
export type { Categoria, Nivel, EtiquetaCurso, IconoCurso } from './datos-demo';

export interface Sesion {
  id: string; // hash del token de la cookie, nunca el token
  usuarioId: number;
  expiraEn: Date;
  creadoEn: Date;
}

export interface IntentoLogin {
  id: number;
  correo: string;
  ip: string;
  exito: boolean;
  creadoEn: Date;
}

// ─── Tipos de los cursos que crea el administrador ─────────────────

export interface ClaseNueva {
  titulo: string;
  duracionMin: number;
  video: string | null; // por ahora solo el nombre del archivo
  subtitulos: string | null;
  documento: string | null;
}

export interface ModuloNuevo {
  titulo: string;
  clases: ClaseNueva[];
}

export interface PreguntaNueva {
  enunciado: string;
  opciones: string[]; // 4 opciones (A–D)
  correcta: number; // índice de la opción correcta
}

export interface CursoNuevo {
  titulo: string;
  descripcion: string;
  categoria: Categoria;
  nivel: Nivel;
  horas: number;
  imagen: string | null;
  modulos: ModuloNuevo[];
  evaluacion: { notaMinima: number; intentos: number; tiempoMin: number; preguntas: PreguntaNueva[] };
  instructor: string;
  requisitos: string;
  fechaPublicacion: string; // AAAA-MM-DD
}

export interface CursoPublicado extends CursoNuevo {
  id: number;
  slug: string;
  creadoPor: number;
  creadoEn: Date;
  /** Act. 20: creado durante una prueba SAM (flujo B); "Borrar cursos de prueba" lo quita. */
  pruebaSam?: boolean;
}

// ─── Tipos del catálogo ────────────────────────────────────────────
// En MySQL: cursos + modulos + clases (+ categorias).

export interface Clase {
  id: number;
  /** "4.4": módulo.posición */
  codigo: string;
  titulo: string;
  duracionMin: number;
}

export interface Modulo {
  numero: number;
  titulo: string;
  clases: Clase[];
}

export interface Curso {
  id: number;
  slug: string;
  titulo: string;
  resumen: string;
  descripcion: string;
  /** Act. 17: título, resumen y descripción en quechua (null en los cursos del administrador). */
  qu: TextosQuechua | null;
  sobre: string;
  aprenderas: string[];
  categoria: Categoria;
  nivel: Nivel;
  horas: number;
  /** Soles; 0 = gratis (DEMO, Act. 17). */
  precio: number;
  /** Fecha ISO de inicio, o null si no tiene (DEMO, Act. 17). */
  inicio: string | null;
  etiqueta: EtiquetaCurso;
  color: string;
  icono: IconoCurso;
  instructor: { nombre: string; rol: string; bio: string };
  temas: string[];
  modulos: Modulo[];
  totalClases: number;
  evaluacion: { notaMinima: number; intentos: number };
  /** Con la respuesta correcta: NUNCA se envía al navegador (ver Pregunta). */
  preguntas: PreguntaInterna[];
}

/** Pregunta tal como la ve el estudiante (sin la respuesta correcta). */
export interface Pregunta {
  numero: number; // 1–5
  enunciado: string;
  opciones: string[]; // A–D
}
interface PreguntaInterna extends Pregunta {
  correcta: number;
}

/** Act. 17: textos del curso en quechua (los módulos y las clases siguen en español). */
export interface TextosQuechua {
  titulo: string;
  resumen: string;
  descripcion: string;
}

/** Lo que muestra una tarjeta del catálogo. */
export interface CursoResumen {
  id: number;
  slug: string;
  titulo: string;
  resumen: string;
  /** Versión en quechua del título y el resumen, o null si no hay. */
  qu: { titulo: string; resumen: string } | null;
  categoria: Categoria;
  nivel: Nivel;
  horas: number;
  clases: number;
  /** Soles; 0 = gratis. */
  precio: number;
  /** Fecha ISO de inicio (-05:00) o null. */
  inicio: string | null;
  etiqueta: EtiquetaCurso;
  color: string;
  icono: IconoCurso;
  /** Texto en el que se busca (título, resumen, temas y clases), ya normalizado. */
  buscable: string;
}

// ─── Tipos del estudiante ──────────────────────────────────────────

export type EstadoPaso = 'completado' | 'en-curso' | 'pendiente' | 'bloqueada';

export interface ResumenInicio {
  continuar: {
    cursoId: number;
    titulo: string;
    clase: { id: number; etiqueta: string };
    ruta: { nombre: string; estado: EstadoPaso }[];
  } | null;
  certificado: { curso: string; porcentaje: number; completadas: number; total: number } | null;
  otros: { titulo: string; slug: string; porcentaje: number }[];
}

export interface Tarea {
  titulo: string;
  curso: string;
  venceEnDias: number;
}

export interface Sugerencia {
  tipo: 'curso' | 'tema';
  texto: string;
  slug?: string;
}

/** Avance de un estudiante en un curso (Mis cursos, catálogo con sesión, detalle). */
export interface Avance {
  cursoId: number;
  slug: string;
  completadas: number;
  total: number;
  porcentaje: number;
  /** Aprobó la evaluación final: el curso pasa a "Completados". */
  aprobado: boolean;
  nota: number | null;
  ultimaClase: Clase;
  ultimoAcceso: Date;
}

export interface MiCurso extends Avance {
  titulo: string;
  categoria: Categoria;
  color: string;
  icono: IconoCurso;
}

// ─── Memoria ───────────────────────────────────────────────────────

/** En MySQL: inscripciones + progreso_clases (+ intentos_evaluacion para la nota). */
interface Inscripcion {
  usuarioId: number;
  cursoId: number;
  inscritoEn: Date;
  completadas: Set<number>; // ids de clase
  ultimaClaseId: number;
  ultimoAcceso: Date;
  nota: number | null;
}

/** En MySQL: intentos_evaluacion + respuestas. */
interface IntentoEvaluacion {
  id: number;
  usuarioId: number;
  cursoId: number;
  numero: number; // 1, 2 o 3
  respuestas: (number | null)[]; // índice de la opción elegida por pregunta
  iniciadoEn: Date;
  enviadoEn: Date | null;
  correctas: number | null;
  nota: number | null; // sobre 20
}

/** En MySQL: certificados. */
export interface Certificado {
  codigo: string;
  usuarioId: number;
  cursoId: number;
  nombre: string;
  emitidoEn: Date;
  estado: 'valido' | 'anulado';
  motivo: string | null;
  anuladoEn: Date | null;
  /** Fase 7: id del administrador que lo anuló (null en los de prueba). */
  anuladoPor?: number | null;
}

interface Memoria {
  usuarios: Usuario[];
  siguienteUsuario: number;
  sesiones: Map<string, Sesion>;
  intentos: IntentoLogin[];
  siguienteIntento: number;
  registrosRechazados: { ip: string; creadoEn: Date }[];
  cursos: CursoPublicado[];
  inscripciones: Inscripcion[];
  intentosEvaluacion: IntentoEvaluacion[];
  siguienteIntentoEvaluacion: number;
  certificados: Certificado[];
  /** Avisos leídos por usuario (ids de notificaciones). */
  avisosLeidos: Map<number, Set<string>>;
  /** Fase 7: cursos que el administrador sacó del catálogo (tienen inscritos: no se eliminan). */
  cursosDeshabilitados: Set<number>;
  /** Fase 7: cursos eliminados por el administrador (solo los que no tenían inscritos). */
  cursosEliminados: Set<number>;
  /** Act. 20: respuestas de la escala SAM (sobreviven al cambio de cuenta entre flujos). */
  respuestasSam: RespuestaSam[];
  siguienteRespuestaSam: number;
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const UNA_HORA_MS = 60 * 60 * 1000;

// ─── Catálogo de prueba ────────────────────────────────────────────

/** Arma el curso completo con ids y códigos de clase (id = curso × 100 + posición). */
function desdeDemo(c: CursoDemo): Curso {
  let posicion = 0;
  const modulos: Modulo[] = c.modulos.map((m, i) => ({
    numero: i + 1,
    titulo: m.titulo,
    clases: m.clases.map(([titulo, duracionMin], j) => ({
      id: c.id * 100 + ++posicion,
      codigo: `${i + 1}.${j + 1}`,
      titulo,
      duracionMin,
    })),
  }));
  return {
    ...c,
    aprenderas: [...c.aprenderas],
    temas: [...c.temas],
    instructor: { ...c.instructor },
    modulos,
    totalClases: posicion,
    evaluacion: { notaMinima: 14, intentos: 3 },
    preguntas: c.preguntas.map(([enunciado, opciones, correcta], i) => ({ numero: i + 1, enunciado, opciones: [...opciones], correcta })),
  };
}

const CATALOGO: readonly Curso[] = catalogoDemo.map(desdeDemo);
/** Act. 20: curso de prueba SAM. Se puede abrir (clase, evaluación, resultado, certificado), pero está oculto. */
const CURSO_SAM: Curso = desdeDemo(cursoPruebaSam);

const COLOR_CATEGORIA: Record<Categoria, string> = {
  tecnologia: '#1E5E9E',
  diseno: '#2A2477',
  negocios: '#22766A',
  'habilidades-blandas': '#7A3A86',
};
const ICONO_CATEGORIA: Record<Categoria, IconoCurso> = {
  tecnologia: 'codigo',
  diseno: 'pluma',
  negocios: 'grafico',
  'habilidades-blandas': 'chat',
};

/** Un curso publicado por el administrador, con la misma forma que los del catálogo. */
function desdePublicado(p: CursoPublicado): Curso {
  let posicion = 0;
  const modulos: Modulo[] = p.modulos.map((m, i) => ({
    numero: i + 1,
    titulo: m.titulo,
    clases: m.clases.map((cl, j) => ({
      id: p.id * 100 + ++posicion,
      codigo: `${i + 1}.${j + 1}`,
      titulo: cl.titulo,
      duracionMin: cl.duracionMin,
    })),
  }));
  const resumen = p.descripcion.length > 90 ? `${p.descripcion.slice(0, 87).trimEnd()}…` : p.descripcion;
  return {
    id: p.id,
    slug: p.slug,
    titulo: p.titulo,
    resumen,
    descripcion: p.descripcion,
    sobre: p.requisitos && p.requisitos !== 'Ninguno' ? `${p.descripcion} Requisitos: ${p.requisitos}.` : p.descripcion,
    aprenderas: [],
    categoria: p.categoria,
    nivel: p.nivel,
    horas: p.horas,
    qu: null, // ni traducción al quechua…
    precio: 0, // …ni precio ni fecha de inicio: los cursos del administrador aún no los tienen
    inicio: null,
    etiqueta: 'nuevo',
    color: COLOR_CATEGORIA[p.categoria],
    icono: ICONO_CATEGORIA[p.categoria],
    instructor: { nombre: p.instructor, rol: 'Instructor del curso', bio: '' },
    temas: [],
    modulos,
    totalClases: posicion,
    evaluacion: { notaMinima: p.evaluacion.notaMinima, intentos: p.evaluacion.intentos },
    preguntas: p.evaluacion.preguntas.map((q, i) => ({ numero: i + 1, enunciado: q.enunciado, opciones: [...q.opciones], correcta: q.correcta })),
  };
}

function clasesDe(curso: Curso): Clase[] {
  return curso.modulos.flatMap((m) => m.clases);
}

// En desarrollo Vite recarga los módulos al guardar; guardar la memoria en
// globalThis evita que se cierren todas las sesiones con cada cambio.
// Cada campo se completa por separado por si la memoria viene de una versión anterior.
const global = globalThis as typeof globalThis & { __aulavivaMemoria?: Partial<Memoria> };
const parcial = (global.__aulavivaMemoria ??= {});
parcial.usuarios ??= usuariosDemo.map((u) => ({ ...u }));
parcial.siguienteUsuario ??= Math.max(...usuariosDemo.map((u) => u.id)) + 1;
parcial.sesiones ??= new Map();
parcial.intentos ??= [];
parcial.siguienteIntento ??= 1;
parcial.registrosRechazados ??= [];
parcial.cursos ??= [];
parcial.inscripciones ??= [...inscripcionesDemo, ...inscripcionesEstudiantesDemo].map((i): Inscripcion => {
  const clases = clasesDe(CATALOGO.find((c) => c.id === i.cursoId)!);
  const ahora = Date.now();
  return {
    usuarioId: i.usuarioId,
    cursoId: i.cursoId,
    inscritoEn: new Date(ahora - (i.haceHoras + 24 * 20) * UNA_HORA_MS),
    completadas: new Set(clases.slice(0, i.completadas).map((c) => c.id)),
    ultimaClaseId: (clases.find((c) => c.codigo === i.ultimaClase) ?? clases[0]).id,
    ultimoAcceso: new Date(ahora - i.haceHoras * UNA_HORA_MS),
    nota: i.nota,
  };
});
// El aprobado de prueba (Comunicación) tiene su intento: 4 de 5 correctas = 16/20.
parcial.intentosEvaluacion ??= parcial.inscripciones
  .filter((i) => i.nota !== null)
  .map((i, n): IntentoEvaluacion => {
    const curso = CATALOGO.find((c) => c.id === i.cursoId)!;
    const correctas = Math.round((i.nota! / 20) * curso.preguntas.length);
    const enviado = new Date(i.ultimoAcceso.getTime() - UNA_HORA_MS);
    return {
      id: n + 1,
      usuarioId: i.usuarioId,
      cursoId: i.cursoId,
      numero: 1,
      respuestas: curso.preguntas.map((q, k) => (k < correctas ? q.correcta : (q.correcta + 1) % q.opciones.length)),
      iniciadoEn: new Date(enviado.getTime() - 20 * 60 * 1000),
      enviadoEn: enviado,
      correctas,
      nota: i.nota,
    };
  });
parcial.siguienteIntentoEvaluacion ??= parcial.intentosEvaluacion.length + 1;
parcial.certificados ??= certificadosDemo.map((c) => ({
  codigo: c.codigo,
  usuarioId: c.usuarioId,
  cursoId: c.cursoId,
  nombre: c.nombre,
  emitidoEn: new Date(`${c.emitidoEn}T15:00:00Z`),
  estado: c.anulado ? 'anulado' : 'valido',
  motivo: c.anulado?.motivo ?? null,
  anuladoEn: c.anulado ? new Date(`${c.anulado.en}T15:00:00Z`) : null,
}));
parcial.avisosLeidos ??= new Map();
parcial.cursosDeshabilitados ??= new Set();
parcial.cursosEliminados ??= new Set();
parcial.respuestasSam ??= [];
parcial.siguienteRespuestaSam ??= 1;
// Act. 20: inscripción de Gonzalo al curso de prueba SAM (aparte, por si la memoria viene de antes).
if (!parcial.inscripciones.some((i) => i.usuarioId === inscripcionSam.usuarioId && i.cursoId === ID_CURSO_SAM)) {
  parcial.inscripciones.push(inscripcionSamNueva());
}
const memoria = parcial as Memoria;

function inscripcionSamNueva(): Inscripcion {
  const clases = clasesDe(CURSO_SAM);
  const ahora = Date.now();
  return {
    usuarioId: inscripcionSam.usuarioId,
    cursoId: ID_CURSO_SAM,
    inscritoEn: new Date(ahora - (inscripcionSam.haceHoras + 24) * UNA_HORA_MS),
    completadas: new Set(clases.slice(0, inscripcionSam.completadas).map((c) => c.id)),
    ultimaClaseId: (clases.find((c) => c.codigo === inscripcionSam.ultimaClase) ?? clases[0]).id,
    ultimoAcceso: new Date(ahora - inscripcionSam.haceHoras * UNA_HORA_MS),
    nota: null,
  };
}

// ─── Usuarios ──────────────────────────────────────────────────────

export async function buscarUsuarioPorCorreo(correo: string): Promise<Usuario | null> {
  return memoria.usuarios.find((u) => u.correo === correo) ?? null;
}

export async function buscarUsuarioPorId(id: number): Promise<Usuario | null> {
  return memoria.usuarios.find((u) => u.id === id) ?? null;
}

/** Crea el usuario. Devuelve null si el correo ya existe (en MySQL: índice único). */
export async function crearUsuario(datos: {
  nombre: string;
  correo: string;
  passwordHash: string;
  rol: Rol;
}): Promise<Usuario | null> {
  if (memoria.usuarios.some((u) => u.correo === datos.correo)) return null;
  const usuario: Usuario = { id: memoria.siguienteUsuario++, ...datos, creadoEn: new Date() };
  memoria.usuarios.push(usuario);
  return usuario;
}

// ─── Sesiones ──────────────────────────────────────────────────────

export async function crearSesion(id: string, usuarioId: number, expiraEn: Date): Promise<void> {
  memoria.sesiones.set(id, { id, usuarioId, expiraEn, creadoEn: new Date() });
}

/** Devuelve la sesión vigente y su usuario; borra la sesión si ya venció. */
export async function buscarSesion(
  id: string,
): Promise<{ sesion: Sesion; usuario: Usuario } | null> {
  const sesion = memoria.sesiones.get(id);
  if (!sesion) return null;
  if (sesion.expiraEn.getTime() <= Date.now()) {
    memoria.sesiones.delete(id);
    return null;
  }
  const usuario = await buscarUsuarioPorId(sesion.usuarioId);
  return usuario ? { sesion, usuario } : null;
}

export async function eliminarSesion(id: string): Promise<void> {
  memoria.sesiones.delete(id);
}

// ─── Intentos de login ─────────────────────────────────────────────

export async function registrarIntento(datos: {
  correo: string;
  ip: string;
  exito: boolean;
}): Promise<void> {
  const ahora = new Date();
  memoria.intentos.push({ id: memoria.siguienteIntento++, ...datos, creadoEn: ahora });
  // Solo hacen falta los últimos minutos; descartamos lo de más de un día.
  const limite = ahora.getTime() - UN_DIA_MS;
  if (memoria.intentos[0] && memoria.intentos[0].creadoEn.getTime() < limite) {
    memoria.intentos = memoria.intentos.filter((i) => i.creadoEn.getTime() >= limite);
  }
}

/** Intentos de ese correo desde una fecha, del más antiguo al más reciente. */
export async function intentosRecientes(correo: string, desde: Date): Promise<IntentoLogin[]> {
  return memoria.intentos.filter(
    (i) => i.correo === correo && i.creadoEn.getTime() >= desde.getTime(),
  );
}

// ─── Registros rechazados por correo existente (límite por IP) ─────
// En MySQL: tabla intentos_registro (id, ip, creado_en).

export async function registrarRegistroRechazado(ip: string): Promise<void> {
  const ahora = new Date();
  memoria.registrosRechazados.push({ ip, creadoEn: ahora });
  const limite = ahora.getTime() - UN_DIA_MS;
  memoria.registrosRechazados = memoria.registrosRechazados.filter((r) => r.creadoEn.getTime() >= limite);
}

/** Fechas de los rechazos de esa IP desde una fecha, del más antiguo al más reciente. */
export async function registrosRechazadosRecientes(ip: string, desde: Date): Promise<Date[]> {
  return memoria.registrosRechazados
    .filter((r) => r.ip === ip && r.creadoEn.getTime() >= desde.getTime())
    .map((r) => r.creadoEn);
}

// ─── Catálogo ──────────────────────────────────────────────────────

/** Cursos visibles: los de prueba y los publicados con fecha de hoy o anterior. */
function cursosVisibles(): Curso[] {
  const hoy = new Date().toISOString().slice(0, 10);
  return [...CATALOGO, CURSO_SAM, ...memoria.cursos.filter((c) => c.fechaPublicacion <= hoy).map(desdePublicado)].filter(
    (c) => !memoria.cursosEliminados.has(c.id), // Fase 7
  );
}

/**
 * Fase 7: lo que se ofrece en el catálogo, la portada y el buscador. Un curso deshabilitado
 * sale de aquí, pero quien ya estaba inscrito lo sigue viendo (clases, evaluación, certificado).
 */
function cursosEnCatalogo(): Curso[] {
  // Act. 20: el curso de prueba SAM nunca se ofrece (catálogo, portada ni buscador).
  return cursosVisibles().filter((c) => !memoria.cursosDeshabilitados.has(c.id) && c.id !== ID_CURSO_SAM);
}

function aResumen(c: Curso): CursoResumen {
  const buscable = normalizarBusqueda(
    // Act. 17: también se encuentra por su título y resumen en quechua.
    [c.titulo, c.resumen, c.qu?.titulo ?? '', c.qu?.resumen ?? '', ...c.temas, ...clasesDe(c).map((cl) => cl.titulo)].join(' · '),
  );
  return {
    id: c.id,
    slug: c.slug,
    titulo: c.titulo,
    resumen: c.resumen,
    categoria: c.categoria,
    nivel: c.nivel,
    horas: c.horas,
    clases: c.totalClases,
    qu: c.qu && { titulo: c.qu.titulo, resumen: c.qu.resumen },
    precio: c.precio,
    inicio: c.inicio,
    etiqueta: c.etiqueta,
    color: c.color,
    icono: c.icono,
    buscable,
  };
}

/** Todos los cursos publicados: el destacado primero y luego del más antiguo al más nuevo. */
export async function listarCursos(): Promise<CursoResumen[]> {
  return cursosEnCatalogo()
    .sort((a, b) => Number(b.etiqueta === 'destacado') - Number(a.etiqueta === 'destacado'))
    .map(aResumen);
}

export async function cursoPorSlug(slug: string): Promise<Curso | null> {
  return cursosVisibles().find((c) => c.slug === slug) ?? null;
}

/** El curso de la portada pública. */
export async function cursoDestacado(): Promise<Curso | null> {
  const cursos = cursosEnCatalogo();
  return cursos.find((c) => c.etiqueta === 'destacado') ?? cursos[0] ?? null;
}

// ─── Inscripciones y avance ────────────────────────────────────────

function cursoPorId(id: number): Curso | undefined {
  return cursosVisibles().find((c) => c.id === id);
}

function avanceDe(i: Inscripcion, curso: Curso): Avance {
  const clases = clasesDe(curso);
  const total = clases.length;
  const completadas = clases.filter((c) => i.completadas.has(c.id)).length;
  return {
    cursoId: curso.id,
    slug: curso.slug,
    completadas,
    total,
    porcentaje: total ? Math.floor((completadas / total) * 100) : 0,
    aprobado: i.nota !== null && i.nota >= curso.evaluacion.notaMinima,
    nota: i.nota,
    ultimaClase: clases.find((c) => c.id === i.ultimaClaseId) ?? clases[0],
    ultimoAcceso: i.ultimoAcceso,
  };
}

/** Avance del estudiante en cada curso inscrito, del último abierto al más antiguo. */
export async function avanceDeEstudiante(usuarioId: number): Promise<Avance[]> {
  return memoria.inscripciones
    .filter((i) => i.usuarioId === usuarioId)
    .flatMap((i) => {
      const curso = cursoPorId(i.cursoId);
      return curso ? [avanceDe(i, curso)] : [];
    })
    .sort((a, b) => b.ultimoAcceso.getTime() - a.ultimoAcceso.getTime());
}

/** Avance en un curso, o null si no está inscrito. */
export async function avanceEnCurso(usuarioId: number, cursoId: number): Promise<Avance | null> {
  const i = memoria.inscripciones.find((x) => x.usuarioId === usuarioId && x.cursoId === cursoId);
  const curso = cursoPorId(cursoId);
  return i && curso ? avanceDe(i, curso) : null;
}

/**
 * Inscribe al estudiante (sin repetir: en MySQL, índice único usuario_id + curso_id).
 * Devuelve el avance; la última clase "vista" es la primera del curso.
 */
export async function inscribir(usuarioId: number, cursoId: number): Promise<Avance | null> {
  const curso = cursoPorId(cursoId);
  if (!curso || curso.totalClases === 0) return null;
  let i = memoria.inscripciones.find((x) => x.usuarioId === usuarioId && x.cursoId === cursoId);
  if (!i && memoria.cursosDeshabilitados.has(cursoId)) return null; // Fase 7: ya no acepta inscripciones
  if (!i) {
    const ahora = new Date();
    i = {
      usuarioId,
      cursoId,
      inscritoEn: ahora,
      completadas: new Set(),
      ultimaClaseId: clasesDe(curso)[0].id,
      ultimoAcceso: ahora,
      nota: null,
    };
    memoria.inscripciones.push(i);
  }
  return avanceDe(i, curso);
}

/** Mis cursos: en curso (sin aprobar) y completados (evaluación aprobada). */
export async function misCursos(usuarioId: number): Promise<{ enCurso: MiCurso[]; completados: MiCurso[] }> {
  const avances = await avanceDeEstudiante(usuarioId);
  const lista: MiCurso[] = avances.map((a) => {
    const curso = cursoPorId(a.cursoId)!;
    return { ...a, titulo: curso.titulo, categoria: curso.categoria, color: curso.color, icono: curso.icono };
  });
  return { enCurso: lista.filter((c) => !c.aprobado), completados: lista.filter((c) => c.aprobado) };
}

/**
 * El último curso aprobado (aviso de Mis cursos). `codigo` es null si aún no confirma su nombre
 * para emitir el certificado: el aviso lleva entonces a /resultado/{cursoId}.
 */
export async function certificadoListo(
  usuarioId: number,
): Promise<{ curso: string; slug: string; cursoId: number; nota: number; codigo: string | null } | null> {
  const aprobado = (await avanceDeEstudiante(usuarioId)).find((a) => a.aprobado);
  if (!aprobado) return null;
  const cert = memoria.certificados.find((c) => c.usuarioId === usuarioId && c.cursoId === aprobado.cursoId && c.estado === 'valido');
  return {
    curso: cursoPorId(aprobado.cursoId)!.titulo,
    slug: aprobado.slug,
    cursoId: aprobado.cursoId,
    nota: aprobado.nota!,
    codigo: cert?.codigo ?? null,
  };
}

// ─── Inicio del estudiante ─────────────────────────────────────────

const MAX_PASOS_RUTA = 6; // + "Evaluación" = 7 elementos (Ley de Miller)

export async function inicioDeEstudiante(usuarioId: number): Promise<ResumenInicio> {
  // Solo los cursos que aún no aprueba (los aprobados están en "Completados").
  const avances = (await avanceDeEstudiante(usuarioId)).filter((a) => !a.aprobado);
  if (avances.length === 0) return { continuar: null, certificado: null, otros: [] };

  // Continúa: el curso que abrió por última vez.
  const actual = avances[0];
  const cursoActual = cursoPorId(actual.cursoId)!;
  const hechas = memoria.inscripciones.find((i) => i.usuarioId === usuarioId && i.cursoId === actual.cursoId)!.completadas;
  let enCursoMarcado = false;
  let ruta: { nombre: string; estado: EstadoPaso }[] = cursoActual.modulos.map((m) => {
    let estado: EstadoPaso = 'pendiente';
    if (m.clases.every((c) => hechas.has(c.id))) estado = 'completado';
    else if (!enCursoMarcado) {
      estado = 'en-curso';
      enCursoMarcado = true;
    }
    return { nombre: `Módulo ${m.numero}`, estado };
  });
  // Muchos módulos: se muestran los que rodean al actual.
  if (ruta.length > MAX_PASOS_RUTA) {
    const i = Math.max(0, ruta.findIndex((p) => p.estado === 'en-curso'));
    const desde = Math.min(Math.max(0, i - 2), ruta.length - MAX_PASOS_RUTA);
    ruta = ruta.slice(desde, desde + MAX_PASOS_RUTA);
  }
  const listo = actual.completadas >= actual.total;
  ruta.push({ nombre: 'Evaluación', estado: listo ? 'en-curso' : 'bloqueada' });

  // Próximo certificado: el curso sin terminar más avanzado.
  const proximo = [...avances].sort((a, b) => b.porcentaje - a.porcentaje)[0];

  return {
    continuar: {
      cursoId: cursoActual.id,
      titulo: cursoActual.titulo,
      clase: { id: actual.ultimaClase.id, etiqueta: `Clase ${actual.ultimaClase.codigo}: ${actual.ultimaClase.titulo}` },
      ruta,
    },
    certificado: proximo
      ? {
          curso: cursoPorId(proximo.cursoId)!.titulo,
          porcentaje: proximo.porcentaje,
          completadas: proximo.completadas,
          total: proximo.total,
        }
      : null,
    otros: avances.slice(1, 5).map((a) => ({
      titulo: cursoPorId(a.cursoId)!.titulo,
      slug: a.slug,
      porcentaje: a.porcentaje,
    })),
  };
}

/** Entregas de los próximos 7 días. Sin usuario: ejemplo para el panel del login. */
export async function tareasDeLaSemana(usuarioId: number | null): Promise<Tarea[]> {
  if (usuarioId === null) return tareasEjemplo.map((t) => ({ ...t }));
  return tareasDemo
    .filter((t) => t.usuarioId === usuarioId && t.venceEnDias >= 0 && t.venceEnDias <= 7)
    .sort((a, b) => a.venceEnDias - b.venceEnDias)
    .map((t) => ({ titulo: t.titulo, curso: cursoPorId(t.cursoId)?.titulo ?? '', venceEnDias: t.venceEnDias }));
}

// ─── Búsqueda ──────────────────────────────────────────────────────

/** Hasta `limite` sugerencias: primero cursos, luego temas de los cursos publicados. */
export async function buscarSugerencias(texto: string, limite = 3): Promise<Sugerencia[]> {
  const q = normalizarBusqueda(texto.trim());
  if (q.length < 2) return [];
  const visibles = cursosEnCatalogo();
  const cursos = visibles
    .filter((c) => normalizarBusqueda(c.titulo).includes(q))
    .map((c): Sugerencia => ({ tipo: 'curso', texto: c.titulo, slug: c.slug }));
  const temas = visibles
    .flatMap((c) => c.temas)
    .filter((t) => normalizarBusqueda(t).includes(q))
    .map((t): Sugerencia => ({ tipo: 'tema', texto: t }));
  // Sin repetir textos (dos cursos pueden llamarse igual).
  const vistos = new Set<string>();
  return [...cursos, ...temas]
    .filter((s) => !vistos.has(normalizarBusqueda(s.texto)) && vistos.add(normalizarBusqueda(s.texto)))
    .slice(0, limite);
}

// ─── Instructores y cursos ─────────────────────────────────────────

export async function listarInstructores(): Promise<string[]> {
  return [...instructoresDemo];
}

/** El instructor del último curso publicado (valor sugerido). */
export async function ultimoInstructor(): Promise<string> {
  return memoria.cursos.at(-1)?.instructor ?? instructoresDemo[0];
}

function crearSlug(titulo: string): string {
  const base =
    normalizarBusqueda(titulo)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'curso';
  const usados = new Set([...CATALOGO, CURSO_SAM, ...memoria.cursos].map((c) => c.slug));
  let slug = base;
  for (let n = 2; usados.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export async function crearCurso(datos: CursoNuevo, creadoPor: number, pruebaSam = false): Promise<CursoPublicado> {
  let id = Math.max(0, ...CATALOGO.map((c) => c.id), ...memoria.cursos.map((c) => c.id)) + 1;
  if (id === ID_CURSO_SAM) id++; // Act. 20: ese id es del curso de prueba SAM
  const curso: CursoPublicado = { ...datos, id, slug: crearSlug(datos.titulo), creadoPor, creadoEn: new Date() };
  if (pruebaSam) curso.pruebaSam = true;
  memoria.cursos.push(curso);
  return curso;
}

// ─── Clase ─────────────────────────────────────────────────────────
// En MySQL: clases (+ materiales) y progreso_clases (usuario_id, clase_id, completada_en).

export interface Material {
  id: 'guia' | 'plantilla';
  nombre: string;
  tipo: 'PDF' | 'TXT';
  detalle: string;
  url: string;
}

export interface ClaseVista {
  curso: { id: number; slug: string; titulo: string };
  modulo: { numero: number; titulo: string };
  clase: Clase & { descripcion: string };
  anterior: Clase | null;
  siguiente: Clase | null;
  completada: boolean;
  video: { src: string; tipo: string; subtitulos: string };
  materiales: Material[];
}

export interface IndiceCurso {
  modulos: { numero: number; titulo: string; completado: boolean; clases: (Clase & { completada: boolean })[] }[];
  completadas: number;
  total: number;
  porcentaje: number;
  evaluacion: { habilitada: boolean; aprobada: boolean; intentosUsados: number; intentosMax: number };
}

// Descripciones escritas a mano; el resto usa una genérica.
const DESCRIPCIONES: Record<number, string> = {
  118: 'Cómo preparar tareas, observar sin intervenir y convertir lo que ves en mejoras concretas.',
};

function buscarClase(claseId: number): { curso: Curso; modulo: Modulo; clase: Clase; lista: Clase[] } | null {
  for (const curso of cursosVisibles()) {
    for (const modulo of curso.modulos) {
      const clase = modulo.clases.find((c) => c.id === claseId);
      if (clase) return { curso, modulo, clase, lista: clasesDe(curso) };
    }
  }
  return null;
}

function inscripcionDe(usuarioId: number, cursoId: number): Inscripcion | undefined {
  return memoria.inscripciones.find((i) => i.usuarioId === usuarioId && i.cursoId === cursoId);
}

/**
 * La clase para un estudiante. Si está inscrito, la marca como última vista
 * ("Continuar" de Mis cursos lleva aquí).
 */
export async function claseParaEstudiante(
  usuarioId: number,
  claseId: number,
): Promise<
  | { estado: 'ok'; vista: ClaseVista }
  | { estado: 'no-encontrada' }
  | { estado: 'no-inscrito'; curso: { slug: string; titulo: string } }
> {
  const hallada = buscarClase(claseId);
  if (!hallada) return { estado: 'no-encontrada' };
  const { curso, modulo, clase, lista } = hallada;
  const inscripcion = inscripcionDe(usuarioId, curso.id);
  if (!inscripcion) return { estado: 'no-inscrito', curso: { slug: curso.slug, titulo: curso.titulo } };
  inscripcion.ultimaClaseId = clase.id;
  inscripcion.ultimoAcceso = new Date();
  const i = lista.findIndex((c) => c.id === clase.id);
  return {
    estado: 'ok',
    vista: {
      curso: { id: curso.id, slug: curso.slug, titulo: curso.titulo },
      modulo: { numero: modulo.numero, titulo: modulo.titulo },
      clase: {
        ...clase,
        descripcion:
          DESCRIPCIONES[clase.id] ??
          `En esta clase de ${curso.titulo} verás «${clase.titulo}» con ejemplos cortos y un ejercicio para practicar.`,
      },
      anterior: lista[i - 1] ?? null,
      siguiente: lista[i + 1] ?? null,
      completada: inscripcion.completadas.has(clase.id),
      // Un solo video de muestra (CC0) para todas las clases; ver public/videos/CREDITOS.md.
      video: { src: '/videos/clase-demo.webm', tipo: 'video/webm', subtitulos: '/subtitulos/clase-demo.vtt' },
      materiales: [
        { id: 'guia', nombre: `Guía: ${clase.titulo}`, tipo: 'PDF', detalle: 'Para leer o imprimir', url: `/api/materiales/${clase.id}/guia` },
        { id: 'plantilla', nombre: 'Plantilla de práctica', tipo: 'TXT', detalle: 'Para completar', url: `/api/materiales/${clase.id}/plantilla` },
      ],
    },
  };
}

/** Datos de una clase para sus materiales descargables. */
export async function claseConCurso(claseId: number): Promise<{ curso: Curso; modulo: Modulo; clase: Clase } | null> {
  const hallada = buscarClase(claseId);
  return hallada && { curso: hallada.curso, modulo: hallada.modulo, clase: hallada.clase };
}

function intentosDe(usuarioId: number, cursoId: number): IntentoEvaluacion[] {
  return memoria.intentosEvaluacion.filter((x) => x.usuarioId === usuarioId && x.cursoId === cursoId);
}

/** Índice del curso con lo que completó el estudiante (null si no está inscrito). */
export async function indiceDelCurso(usuarioId: number, cursoId: number): Promise<IndiceCurso | null> {
  const curso = cursoPorId(cursoId);
  const inscripcion = inscripcionDe(usuarioId, cursoId);
  if (!curso || !inscripcion) return null;
  const hechas = inscripcion.completadas;
  const avance = avanceDe(inscripcion, curso);
  const enviados = intentosDe(usuarioId, cursoId).filter((x) => x.enviadoEn);
  return {
    modulos: curso.modulos.map((m) => ({
      numero: m.numero,
      titulo: m.titulo,
      completado: m.clases.every((c) => hechas.has(c.id)),
      clases: m.clases.map((c) => ({ ...c, completada: hechas.has(c.id) })),
    })),
    completadas: avance.completadas,
    total: avance.total,
    porcentaje: avance.porcentaje,
    evaluacion: {
      habilitada: avance.completadas >= avance.total,
      aprobada: avance.aprobado,
      intentosUsados: enviados.length,
      intentosMax: curso.evaluacion.intentos,
    },
  };
}

/** Marca la clase como completada (no se duplica). */
export async function marcarCompletada(
  usuarioId: number,
  claseId: number,
): Promise<{ estado: 'ok'; cursoId: number; indice: IndiceCurso; siguiente: Clase | null } | { estado: 'no-encontrada' | 'no-inscrito' }> {
  const hallada = buscarClase(claseId);
  if (!hallada) return { estado: 'no-encontrada' };
  const inscripcion = inscripcionDe(usuarioId, hallada.curso.id);
  if (!inscripcion) return { estado: 'no-inscrito' };
  inscripcion.completadas.add(claseId);
  inscripcion.ultimoAcceso = new Date();
  const i = hallada.lista.findIndex((c) => c.id === claseId);
  // La siguiente sin completar (después de esta; si no hay, la primera pendiente).
  const siguiente =
    hallada.lista.slice(i + 1).find((c) => !inscripcion.completadas.has(c.id)) ??
    hallada.lista.find((c) => !inscripcion.completadas.has(c.id)) ??
    null;
  return { estado: 'ok', cursoId: hallada.curso.id, indice: (await indiceDelCurso(usuarioId, hallada.curso.id))!, siguiente };
}

// ─── Evaluación ────────────────────────────────────────────────────
// Reglas (CLAUDE.md §8): se habilita al 100 % de clases, nota mínima 14/20, 3 intentos, vale la mejor nota.

export type EstadoEvaluacion = 'disponible' | 'no-encontrada' | 'no-inscrito' | 'bloqueada' | 'aprobada' | 'sin-intentos';

export interface IntentoAbierto {
  id: number;
  numero: number;
  intentosMax: number;
  notaMinima: number;
  curso: { id: number; slug: string; titulo: string };
  preguntas: Pregunta[];
  respuestas: (number | null)[];
}

export interface ResumenEvaluacion {
  estado: EstadoEvaluacion;
  curso: { id: number; slug: string; titulo: string } | null;
  completadas: number;
  total: number;
  intentosUsados: number;
  intentosMax: number;
  continuarClaseId: number | null;
}

/** Si el estudiante puede rendir la evaluación y, si no, por qué. */
export async function estadoEvaluacion(usuarioId: number, cursoId: number): Promise<ResumenEvaluacion> {
  const curso = cursoPorId(cursoId);
  const vacio = { completadas: 0, total: 0, intentosUsados: 0, intentosMax: 3, continuarClaseId: null };
  if (!curso) return { estado: 'no-encontrada', curso: null, ...vacio };
  const datosCurso = { id: curso.id, slug: curso.slug, titulo: curso.titulo };
  const inscripcion = inscripcionDe(usuarioId, cursoId);
  if (!inscripcion) return { estado: 'no-inscrito', curso: datosCurso, ...vacio };
  const avance = avanceDe(inscripcion, curso);
  const usados = intentosDe(usuarioId, cursoId).filter((x) => x.enviadoEn).length;
  const pendiente = clasesDe(curso).find((c) => !inscripcion.completadas.has(c.id));
  let estado: EstadoEvaluacion = 'disponible';
  if (avance.aprobado) estado = 'aprobada';
  else if (avance.completadas < avance.total) estado = 'bloqueada';
  else if (usados >= curso.evaluacion.intentos) estado = 'sin-intentos';
  return {
    estado,
    curso: datosCurso,
    completadas: avance.completadas,
    total: avance.total,
    intentosUsados: usados,
    intentosMax: curso.evaluacion.intentos,
    continuarClaseId: (pendiente ?? avance.ultimaClase).id,
  };
}

/** Retoma el intento sin enviar o abre uno nuevo (si puede rendir). */
export async function abrirIntento(
  usuarioId: number,
  cursoId: number,
): Promise<{ resumen: ResumenEvaluacion; intento: IntentoAbierto | null }> {
  const resumen = await estadoEvaluacion(usuarioId, cursoId);
  if (resumen.estado !== 'disponible') return { resumen, intento: null };
  const curso = cursoPorId(cursoId)!;
  let intento = intentosDe(usuarioId, cursoId).find((x) => !x.enviadoEn);
  if (!intento) {
    intento = {
      id: memoria.siguienteIntentoEvaluacion++,
      usuarioId,
      cursoId,
      numero: resumen.intentosUsados + 1,
      respuestas: curso.preguntas.map(() => null),
      iniciadoEn: new Date(),
      enviadoEn: null,
      correctas: null,
      nota: null,
    };
    memoria.intentosEvaluacion.push(intento);
  }
  return {
    resumen,
    intento: {
      id: intento.id,
      numero: intento.numero,
      intentosMax: curso.evaluacion.intentos,
      notaMinima: curso.evaluacion.notaMinima,
      curso: resumen.curso!,
      preguntas: curso.preguntas.map(({ numero, enunciado, opciones }) => ({ numero, enunciado, opciones })),
      respuestas: [...intento.respuestas],
    },
  };
}

function intentoDe(usuarioId: number, intentoId: number): IntentoEvaluacion | undefined {
  return memoria.intentosEvaluacion.find((x) => x.id === intentoId && x.usuarioId === usuarioId);
}

/** Respuestas guardadas de un intento (para retomarlo). */
export async function respuestasDeIntento(usuarioId: number, intentoId: number): Promise<(number | null)[] | null> {
  const intento = intentoDe(usuarioId, intentoId);
  return intento ? [...intento.respuestas] : null;
}

/** Autoguardado de una respuesta (pregunta 1–5, opción 0–3). */
export async function guardarRespuesta(
  usuarioId: number,
  intentoId: number,
  pregunta: number,
  opcion: number,
): Promise<'ok' | 'no-encontrado' | 'enviado' | 'invalida'> {
  const intento = intentoDe(usuarioId, intentoId);
  if (!intento) return 'no-encontrado';
  if (intento.enviadoEn) return 'enviado';
  const curso = cursoPorId(intento.cursoId)!;
  const q = curso.preguntas[pregunta - 1];
  if (!q || !Number.isInteger(opcion) || opcion < 0 || opcion >= q.opciones.length) return 'invalida';
  intento.respuestas[pregunta - 1] = opcion;
  return 'ok';
}

/** Envía el intento: calcula la nota (sin responder = incorrecta) y guarda la mejor nota. */
export async function enviarIntento(
  usuarioId: number,
  intentoId: number,
): Promise<{ estado: 'ok'; cursoId: number; nota: number; aprobado: boolean } | { estado: 'no-encontrado' | 'enviado' }> {
  const intento = intentoDe(usuarioId, intentoId);
  if (!intento) return { estado: 'no-encontrado' };
  if (intento.enviadoEn) return { estado: 'enviado' };
  const curso = cursoPorId(intento.cursoId)!;
  const correctas = curso.preguntas.filter((q, i) => intento.respuestas[i] === q.correcta).length;
  const nota = Math.round((correctas / curso.preguntas.length) * 20);
  intento.correctas = correctas;
  intento.nota = nota;
  intento.enviadoEn = new Date();
  const inscripcion = inscripcionDe(usuarioId, curso.id)!;
  inscripcion.nota = Math.max(inscripcion.nota ?? 0, nota);
  inscripcion.ultimoAcceso = new Date();
  return { estado: 'ok', cursoId: curso.id, nota, aprobado: nota >= curso.evaluacion.notaMinima };
}

export interface ResultadoEvaluacion {
  curso: { id: number; slug: string; titulo: string };
  ultimo: { numero: number; correctas: number; total: number; nota: number; enviadoEn: Date };
  mejorNota: number;
  aprobado: boolean;
  notaMinima: number;
  intentosUsados: number;
  intentosMax: number;
  porcentajeContenido: number;
  certificado: string | null;
}

/** Resultado del último intento enviado (null si aún no rinde la evaluación). */
export async function resultadoEvaluacion(usuarioId: number, cursoId: number): Promise<ResultadoEvaluacion | null> {
  const curso = cursoPorId(cursoId);
  const inscripcion = inscripcionDe(usuarioId, cursoId);
  if (!curso || !inscripcion) return null;
  const enviados = intentosDe(usuarioId, cursoId)
    .filter((x) => x.enviadoEn)
    .sort((a, b) => b.enviadoEn!.getTime() - a.enviadoEn!.getTime());
  const ultimo = enviados[0];
  if (!ultimo) return null;
  const mejorNota = Math.max(...enviados.map((x) => x.nota!));
  const cert = memoria.certificados.find((c) => c.usuarioId === usuarioId && c.cursoId === cursoId && c.estado === 'valido');
  return {
    curso: { id: curso.id, slug: curso.slug, titulo: curso.titulo },
    ultimo: { numero: ultimo.numero, correctas: ultimo.correctas!, total: curso.preguntas.length, nota: ultimo.nota!, enviadoEn: ultimo.enviadoEn! },
    mejorNota,
    aprobado: mejorNota >= curso.evaluacion.notaMinima,
    notaMinima: curso.evaluacion.notaMinima,
    intentosUsados: enviados.length,
    intentosMax: curso.evaluacion.intentos,
    porcentajeContenido: avanceDe(inscripcion, curso).porcentaje,
    certificado: cert?.codigo ?? null,
  };
}

// ─── Certificados ──────────────────────────────────────────────────

/** 10 caracteres en mayúsculas y números, sin O, 0, I ni 1 (CLAUDE.md §8). */
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nuevoCodigo(): string {
  let codigo = '';
  do {
    codigo = Array.from({ length: 10 }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join('');
  } while (memoria.certificados.some((c) => c.codigo === codigo));
  return codigo;
}

export interface CertificadoVista extends Certificado {
  curso: { id: number; slug: string; titulo: string; horas: number; color: string; icono: IconoCurso };
}

function vistaCertificado(c: Certificado): CertificadoVista | null {
  const curso = cursoPorId(c.cursoId);
  return curso
    ? { ...c, curso: { id: curso.id, slug: curso.slug, titulo: curso.titulo, horas: curso.horas, color: curso.color, icono: curso.icono } }
    : null;
}

/** Emite el certificado con el nombre confirmado. Si ya hay uno válido, lo devuelve (no duplica). */
export async function emitirCertificado(
  usuarioId: number,
  cursoId: number,
  nombre: string,
): Promise<{ estado: 'ok'; certificado: CertificadoVista } | { estado: 'no-aprobado' }> {
  const existente = memoria.certificados.find((c) => c.usuarioId === usuarioId && c.cursoId === cursoId && c.estado === 'valido');
  if (existente) return { estado: 'ok', certificado: vistaCertificado(existente)! };
  const avance = await avanceEnCurso(usuarioId, cursoId);
  if (!avance?.aprobado) return { estado: 'no-aprobado' };
  const certificado: Certificado = {
    codigo: nuevoCodigo(),
    usuarioId,
    cursoId,
    nombre,
    emitidoEn: new Date(),
    estado: 'valido',
    motivo: null,
    anuladoEn: null,
  };
  memoria.certificados.push(certificado);
  return { estado: 'ok', certificado: vistaCertificado(certificado)! };
}

/** Certificados del estudiante, del más reciente al más antiguo. */
export async function certificadosDe(usuarioId: number): Promise<CertificadoVista[]> {
  return memoria.certificados
    .filter((c) => c.usuarioId === usuarioId)
    .sort((a, b) => b.emitidoEn.getTime() - a.emitidoEn.getTime())
    .flatMap((c) => vistaCertificado(c) ?? []);
}

export async function certificadoPorCodigo(codigo: string): Promise<CertificadoVista | null> {
  const c = memoria.certificados.find((x) => x.codigo === codigo);
  return c ? vistaCertificado(c) : null;
}

/** Verificación pública: solo nombre, curso y fecha (CLAUDE.md §8). */
export async function verificarCertificado(
  codigo: string,
): Promise<
  | { estado: 'valido' | 'anulado'; codigo: string; nombre: string; curso: string; emitidoEn: Date; anuladoEn: Date | null }
  | { estado: 'no-encontrado'; codigo: string }
> {
  const c = await certificadoPorCodigo(codigo);
  if (!c) return { estado: 'no-encontrado', codigo };
  return { estado: c.estado, codigo: c.codigo, nombre: c.nombre, curso: c.curso.titulo, emitidoEn: c.emitidoEn, anuladoEn: c.anuladoEn };
}

/** Corrige el nombre del usuario (así saldrá en los certificados que emita después). */
export async function actualizarNombre(usuarioId: number, nombre: string): Promise<Usuario | null> {
  const usuario = memoria.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return null;
  usuario.nombre = nombre;
  return usuario;
}

// ─── Avisos (notificaciones) ───────────────────────────────────────
// Las entregas que vencen salen de tareasDeLaSemana(); aquí, los avisos de cada curso.

export interface Aviso {
  id: string;
  tipo: 'certificado' | 'evaluacion' | 'resultado';
  titulo: string;
  texto: string;
  enlace: string;
  fecha: Date;
  leido: boolean;
}

export async function avisosDe(usuarioId: number): Promise<Aviso[]> {
  const leidos = memoria.avisosLeidos.get(usuarioId) ?? new Set<string>();
  const avisos: Omit<Aviso, 'leido'>[] = [];
  for (const a of await avanceDeEstudiante(usuarioId)) {
    const curso = cursoPorId(a.cursoId)!;
    const cert = memoria.certificados.find((c) => c.usuarioId === usuarioId && c.cursoId === a.cursoId && c.estado === 'valido');
    if (cert) {
      avisos.push({
        id: `cert-${cert.codigo}`,
        tipo: 'certificado',
        titulo: `Tu certificado de ${curso.titulo} está listo`,
        texto: `Código ${cert.codigo}. Descárgalo en PDF o comparte su enlace.`,
        enlace: `/certificados?codigo=${cert.codigo}`,
        fecha: cert.emitidoEn,
      });
    } else if (a.aprobado) {
      avisos.push({
        id: `aprobado-${a.cursoId}`,
        tipo: 'resultado',
        titulo: `Aprobaste ${curso.titulo}`,
        texto: 'Confirma tu nombre para emitir tu certificado.',
        enlace: `/resultado/${a.cursoId}`,
        fecha: a.ultimoAcceso,
      });
    } else if (a.completadas >= a.total) {
      avisos.push({
        id: `evaluacion-${a.cursoId}`,
        tipo: 'evaluacion',
        titulo: `Ya puedes rendir la evaluación de ${curso.titulo}`,
        texto: `Completaste todas las clases. Tienes ${curso.evaluacion.intentos} intentos; apruebas con ${curso.evaluacion.notaMinima}/20.`,
        enlace: `/evaluacion/${a.cursoId}`,
        fecha: a.ultimoAcceso,
      });
    }
  }
  return avisos.sort((x, y) => y.fecha.getTime() - x.fecha.getTime()).map((x) => ({ ...x, leido: leidos.has(x.id) }));
}

export async function marcarAvisosLeidos(usuarioId: number): Promise<void> {
  const ids = (await avisosDe(usuarioId)).map((a) => a.id);
  memoria.avisosLeidos.set(usuarioId, new Set([...(memoria.avisosLeidos.get(usuarioId) ?? []), ...ids]));
}

/** Preguntas de un curso sin las respuestas correctas (solo para las demostraciones de /estados). */
export async function preguntasPublicas(cursoId: number): Promise<{ curso: { id: number; slug: string; titulo: string }; preguntas: Pregunta[] } | null> {
  const curso = cursoPorId(cursoId);
  if (!curso) return null;
  return {
    curso: { id: curso.id, slug: curso.slug, titulo: curso.titulo },
    preguntas: curso.preguntas.map(({ numero, enunciado, opciones }) => ({ numero, enunciado, opciones })),
  };
}

// ─── Administrador (Fase 7) ────────────────────────────────────────
// En MySQL: consultas de solo lectura sobre usuarios, cursos, inscripciones y certificados,
// y UPDATE de certificados (estado, motivo, anulado_por, anulado_en) y de cursos (deshabilitado).

/** Motivos de anulación que ofrece el modal (admin-06). Queda registrado quién, cuándo y por qué. */
export const MOTIVOS_ANULACION = [
  'Datos del estudiante incorrectos',
  'Emitido por error',
  'Fraude o copia en la evaluación',
  'Solicitud del estudiante',
] as const;

/** Todos los cursos que existen (también los programados y los deshabilitados), sin los eliminados. */
function cursosDelAdmin(): { curso: Curso; publicado: CursoPublicado | null }[] {
  return [
    ...CATALOGO.map((curso) => ({ curso, publicado: null })),
    ...memoria.cursos.map((p) => ({ curso: desdePublicado(p), publicado: p })),
  ].filter(({ curso }) => !memoria.cursosEliminados.has(curso.id));
}

function cursoCualquiera(id: number): Curso | undefined {
  return cursosDelAdmin().find(({ curso }) => curso.id === id)?.curso;
}

/** Act. 20: lo del curso de prueba SAM no ensucia las listas ni las cifras del administrador. */
const deSam = (x: { cursoId: number }) => x.cursoId === ID_CURSO_SAM;

export interface CertificadoAdmin {
  codigo: string;
  /** Nombre confirmado al emitirlo (el que sale en el certificado). */
  estudiante: string;
  curso: string;
  emitidoEn: Date;
  estado: 'valido' | 'anulado';
  motivo: string | null;
  anuladoEn: Date | null;
  anuladoPor: string | null;
}

function aCertificadoAdmin(c: Certificado): CertificadoAdmin {
  return {
    codigo: c.codigo,
    estudiante: c.nombre,
    curso: cursoCualquiera(c.cursoId)?.titulo ?? 'Curso eliminado',
    emitidoEn: c.emitidoEn,
    estado: c.estado,
    motivo: c.motivo,
    anuladoEn: c.anuladoEn,
    anuladoPor: c.anuladoPor ? (memoria.usuarios.find((u) => u.id === c.anuladoPor)?.nombre ?? 'Administrador') : null,
  };
}

/** Certificados emitidos, del más reciente al más antiguo (admin-05). */
export async function listarCertificadosAdmin(): Promise<CertificadoAdmin[]> {
  return memoria.certificados
    .filter((c) => !deSam(c))
    .sort((a, b) => b.emitidoEn.getTime() - a.emitidoEn.getTime())
    .map(aCertificadoAdmin);
}

/**
 * Anula un certificado válido (admin-06 a admin-10). La verificación pública pasa a decir "Anulado".
 * `guardar: false` (simulación de /estados) responde igual pero no cambia nada.
 */
export async function anularCertificado(
  codigo: string,
  motivo: string,
  adminId: number,
  guardar = true,
): Promise<{ estado: 'ok'; certificado: CertificadoAdmin } | { estado: 'no-encontrado' } | { estado: 'ya-anulado'; certificado: CertificadoAdmin }> {
  const c = memoria.certificados.find((x) => x.codigo === codigo);
  if (!c) return { estado: 'no-encontrado' };
  if (c.estado === 'anulado') return { estado: 'ya-anulado', certificado: aCertificadoAdmin(c) };
  const anulado: Certificado = { ...c, estado: 'anulado', motivo, anuladoEn: new Date(), anuladoPor: adminId };
  if (guardar) Object.assign(c, anulado);
  return { estado: 'ok', certificado: aCertificadoAdmin(anulado) };
}

export type EstadoCursoAdmin = 'publicado' | 'programado' | 'deshabilitado';

export interface CursoAdmin {
  id: number;
  slug: string;
  titulo: string;
  categoria: Categoria;
  nivel: Nivel;
  instructor: string;
  totalClases: number;
  inscritos: number;
  certificados: number;
  estado: EstadoCursoAdmin;
  /** AAAA-MM-DD de publicación (solo los del administrador; los del catálogo de prueba ya están publicados). */
  fechaPublicacion: string | null;
  creadoPorAdmin: boolean;
}

function aCursoAdmin({ curso, publicado }: { curso: Curso; publicado: CursoPublicado | null }): CursoAdmin {
  const hoy = new Date().toISOString().slice(0, 10);
  const estado: EstadoCursoAdmin = memoria.cursosDeshabilitados.has(curso.id)
    ? 'deshabilitado'
    : publicado && publicado.fechaPublicacion > hoy
      ? 'programado'
      : 'publicado';
  return {
    id: curso.id,
    slug: curso.slug,
    titulo: curso.titulo,
    categoria: curso.categoria,
    nivel: curso.nivel,
    instructor: curso.instructor.nombre,
    totalClases: curso.totalClases,
    inscritos: memoria.inscripciones.filter((i) => i.cursoId === curso.id).length,
    certificados: memoria.certificados.filter((c) => c.cursoId === curso.id && c.estado === 'valido').length,
    estado,
    fechaPublicacion: publicado?.fechaPublicacion ?? null,
    creadoPorAdmin: publicado !== null,
  };
}

/** Lista de cursos del administrador: los más nuevos (del admin) primero. */
export async function listarCursosAdmin(): Promise<CursoAdmin[]> {
  return cursosDelAdmin().map(aCursoAdmin).sort((a, b) => Number(b.creadoPorAdmin) - Number(a.creadoPorAdmin) || b.id - a.id);
}

/**
 * Cambia el estado de un curso (CLAUDE.md §5.3: si tiene inscritos no se elimina, solo se deshabilita).
 *   deshabilitar → sale del catálogo; los inscritos lo siguen viendo
 *   habilitar    → vuelve al catálogo
 *   eliminar     → solo sin inscritos
 */
export async function cambiarEstadoCurso(
  id: number,
  accion: 'deshabilitar' | 'habilitar' | 'eliminar',
  guardar = true,
): Promise<{ estado: 'ok'; curso: CursoAdmin | null } | { estado: 'no-encontrado' } | { estado: 'tiene-inscritos'; inscritos: number }> {
  const item = cursosDelAdmin().find(({ curso }) => curso.id === id);
  if (!item) return { estado: 'no-encontrado' };
  const actual = aCursoAdmin(item);
  if (accion === 'eliminar') {
    if (actual.inscritos > 0) return { estado: 'tiene-inscritos', inscritos: actual.inscritos };
    if (guardar) memoria.cursosEliminados.add(id);
    return { estado: 'ok', curso: null };
  }
  if (!guardar) return { estado: 'ok', curso: { ...actual, estado: accion === 'deshabilitar' ? 'deshabilitado' : 'publicado' } };
  if (accion === 'deshabilitar') memoria.cursosDeshabilitados.add(id);
  else memoria.cursosDeshabilitados.delete(id);
  return { estado: 'ok', curso: aCursoAdmin(item) };
}

export interface UsuarioAdmin {
  id: number;
  nombre: string;
  correo: string;
  registradoEn: Date;
  cursos: number;
  aprobados: number;
  certificados: number;
  /** Último acceso a una clase (null si nunca entró a un curso). */
  ultimoAcceso: Date | null;
}

/** Estudiantes (con cuenta y de prueba), del más reciente al más antiguo. Sin contraseñas. */
export async function listarEstudiantesAdmin(): Promise<UsuarioAdmin[]> {
  const base = [
    ...memoria.usuarios.filter((u) => u.rol === 'estudiante').map((u) => ({ id: u.id, nombre: u.nombre, correo: u.correo, registradoEn: u.creadoEn })),
    ...estudiantesDemo.map((e) => ({ id: e.id, nombre: e.nombre, correo: e.correo, registradoEn: new Date(`${e.creadoEn}T15:00:00Z`) })),
  ];
  return base
    .map((u): UsuarioAdmin => {
      const suyas = memoria.inscripciones.filter((i) => i.usuarioId === u.id && !deSam(i));
      const accesos = suyas.map((i) => i.ultimoAcceso.getTime());
      return {
        ...u,
        cursos: suyas.length,
        aprobados: suyas.filter((i) => i.nota !== null).length,
        certificados: memoria.certificados.filter((c) => c.usuarioId === u.id && c.estado === 'valido' && !deSam(c)).length,
        ultimoAcceso: accesos.length ? new Date(Math.max(...accesos)) : null,
      };
    })
    .sort((a, b) => b.registradoEn.getTime() - a.registradoEn.getTime());
}

export interface ResumenAdmin {
  cursos: { publicados: number; programados: number; deshabilitados: number };
  estudiantes: number;
  inscripciones: number;
  certificados: { validos: number; anulados: number };
}

/** Cifras del Panel (y de la franja de resumen de cada pantalla del administrador). */
export async function resumenAdmin(): Promise<ResumenAdmin> {
  const cursos = cursosDelAdmin().map(aCursoAdmin);
  const contar = (e: EstadoCursoAdmin) => cursos.filter((c) => c.estado === e).length;
  return {
    cursos: { publicados: contar('publicado'), programados: contar('programado'), deshabilitados: contar('deshabilitado') },
    estudiantes: (await listarEstudiantesAdmin()).length,
    inscripciones: memoria.inscripciones.filter((i) => cursos.some((c) => c.id === i.cursoId)).length,
    certificados: {
      validos: memoria.certificados.filter((c) => c.estado === 'valido' && !deSam(c)).length,
      anulados: memoria.certificados.filter((c) => c.estado === 'anulado' && !deSam(c)).length,
    },
  };
}

// ─── Act. 20 · Escala SAM en flujos críticos ───────────────────────
// En MySQL: respuestas_sam (id, participante, flujo, valencia, activacion, control, paso_dificil,
// comentario, duracion_seg, aprobado, creado_en). Hoy en memoria: se pierde al reiniciar el servidor.

export type { FlujoSam };
/** Id del Curso de prueba SAM (las páginas lo usan para mostrar la tarjeta SAM solo en ese curso). */
export { ID_CURSO_SAM };

export interface RespuestaSam {
  id: number;
  participante: string;
  flujo: FlujoSam;
  valencia: number; // 1–9
  activacion: number; // 1–9
  control: number; // 1–9
  pasoDificil: string; // "A1"…"A5" o "B1"…"B5"
  comentario: string;
  duracionSeg: number;
  /** Solo flujo A: si aprobó la evaluación (null en el flujo B). */
  aprobado: boolean | null;
  fecha: Date;
}

export async function guardarRespuestaSam(datos: Omit<RespuestaSam, 'id' | 'fecha'>): Promise<RespuestaSam> {
  const respuesta: RespuestaSam = { ...datos, id: memoria.siguienteRespuestaSam++, fecha: new Date() };
  memoria.respuestasSam.push(respuesta);
  return respuesta;
}

/** Todas las respuestas, de la más antigua a la más nueva. */
export async function listarRespuestasSam(): Promise<RespuestaSam[]> {
  return [...memoria.respuestasSam];
}

/** Id de la última clase del curso de prueba SAM: ahí empieza el flujo A ("Ir a la evaluación"). */
export function claseInicioSam(): number {
  return clasesDe(CURSO_SAM).at(-1)!.id;
}

export interface EstadoPruebasSam {
  flujoA: { intentosUsados: number; aprobado: boolean; certificado: boolean; listo: boolean };
  cursosDePrueba: number;
  respuestas: number;
  siguienteParticipante: string;
}

export async function estadoPruebasSam(usuarioId = inscripcionSam.usuarioId): Promise<EstadoPruebasSam> {
  const intentos = intentosDe(usuarioId, ID_CURSO_SAM);
  const inscripcion = inscripcionDe(usuarioId, ID_CURSO_SAM);
  const certificado = memoria.certificados.some((c) => c.usuarioId === usuarioId && deSam(c));
  const aprobado = (inscripcion?.nota ?? 0) >= CURSO_SAM.evaluacion.notaMinima;
  const numeros = memoria.respuestasSam.map((r) => Number(r.participante.slice(1))).filter(Number.isFinite);
  return {
    flujoA: { intentosUsados: intentos.length, aprobado, certificado, listo: intentos.length === 0 && !certificado },
    cursosDePrueba: memoria.cursos.filter((c) => c.pruebaSam && !memoria.cursosEliminados.has(c.id)).length,
    respuestas: memoria.respuestasSam.length,
    siguienteParticipante: `P${Math.max(0, ...numeros) + 1}`,
  };
}

/**
 * Deja el flujo A como nuevo para otro participante: borra los intentos, la nota y el certificado del
 * curso de prueba SAM, vuelve a marcar sus clases como completas y devuelve el nombre de la cuenta de
 * prueba al original (por si alguien lo corrigió en "Confirma tu nombre"). Nada más cambia.
 */
export async function prepararFlujoSam(usuarioId = inscripcionSam.usuarioId): Promise<void> {
  memoria.intentosEvaluacion = memoria.intentosEvaluacion.filter((x) => !(x.usuarioId === usuarioId && deSam(x)));
  memoria.certificados = memoria.certificados.filter((c) => !(c.usuarioId === usuarioId && deSam(c)));
  memoria.inscripciones = memoria.inscripciones.filter((i) => !(i.usuarioId === usuarioId && deSam(i)));
  memoria.inscripciones.push(inscripcionSamNueva());
  const original = usuariosDemo.find((u) => u.id === usuarioId);
  const usuario = memoria.usuarios.find((u) => u.id === usuarioId);
  if (original && usuario) usuario.nombre = original.nombre;
}

/** Borra los cursos creados durante las pruebas SAM (flujo B) y lo que dependa de ellos. Devuelve cuántos. */
export async function borrarCursosDePruebaSam(): Promise<number> {
  const ids = new Set(memoria.cursos.filter((c) => c.pruebaSam).map((c) => c.id));
  memoria.cursos = memoria.cursos.filter((c) => !ids.has(c.id));
  memoria.inscripciones = memoria.inscripciones.filter((i) => !ids.has(i.cursoId));
  memoria.intentosEvaluacion = memoria.intentosEvaluacion.filter((x) => !ids.has(x.cursoId));
  memoria.certificados = memoria.certificados.filter((c) => !ids.has(c.cursoId));
  for (const id of ids) {
    memoria.cursosDeshabilitados.delete(id);
    memoria.cursosEliminados.delete(id);
  }
  return ids.size;
}
