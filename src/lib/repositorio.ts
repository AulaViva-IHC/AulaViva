// ÚNICO punto de acceso a los datos de AulaViva.
//
// Hoy: datos de prueba (usuarios-demo.ts y datos-demo.ts) y todo lo nuevo
// (usuarios registrados, sesiones, intentos, cursos publicados) en memoria.
// Se pierde al reiniciar el servidor.
// Mañana: estas mismas funciones harán consultas parametrizadas a MySQL.
// El resto del proyecto no cambia, por eso todas son async aunque ahora
// respondan al instante.

import { usuariosDemo, type Usuario, type Rol } from './usuarios-demo';
import { normalizarBusqueda } from './validacion';
import {
  catalogoDemo,
  inscripcionesDemo,
  instructoresDemo,
  tareasDemo,
  tareasEjemplo,
  temasDemo,
  type Categoria,
  type CursoCatalogo,
} from './datos-demo';

export type { Usuario, Rol } from './usuarios-demo';
export type { Categoria } from './datos-demo';

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

export type Nivel = 'basico' | 'intermedio' | 'avanzado';

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
}

// ─── Tipos que lee el Inicio del estudiante ────────────────────────

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

// ─── Memoria ───────────────────────────────────────────────────────

interface Memoria {
  usuarios: Usuario[];
  siguienteUsuario: number;
  sesiones: Map<string, Sesion>;
  intentos: IntentoLogin[];
  siguienteIntento: number;
  registrosRechazados: { ip: string; creadoEn: Date }[];
  cursos: CursoPublicado[];
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
const memoria = parcial as Memoria;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

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

// ─── Inicio del estudiante ─────────────────────────────────────────

const MAX_PASOS_RUTA = 6; // + "Evaluación" = 7 elementos (Ley de Miller)

function cursoPorId(id: number): CursoCatalogo | undefined {
  return catalogoDemo.find((c) => c.id === id);
}

export async function inicioDeEstudiante(usuarioId: number): Promise<ResumenInicio> {
  const inscripciones = inscripcionesDemo
    .filter((i) => i.usuarioId === usuarioId)
    .map((i) => {
      const total = i.modulos.reduce((s, m) => s + m.clases, 0);
      const completadas = i.modulos.reduce((s, m) => s + m.completadas, 0);
      return { ...i, total, completadas, porcentaje: Math.floor((completadas / total) * 100) };
    })
    .sort((a, b) => b.ultimoAcceso.getTime() - a.ultimoAcceso.getTime());

  if (inscripciones.length === 0) return { continuar: null, certificado: null, otros: [] };

  // Continúa: el curso que abrió por última vez.
  const actual = inscripciones[0];
  const cursoActual = cursoPorId(actual.cursoId)!;
  let enCursoMarcado = false;
  let ruta: { nombre: string; estado: EstadoPaso }[] = actual.modulos.map((m) => {
    let estado: EstadoPaso = 'pendiente';
    if (m.completadas >= m.clases) estado = 'completado';
    else if (!enCursoMarcado) {
      estado = 'en-curso';
      enCursoMarcado = true;
    }
    return { nombre: m.titulo, estado };
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
  const proximo = [...inscripciones]
    .filter((i) => i.porcentaje < 100)
    .sort((a, b) => b.porcentaje - a.porcentaje)[0];

  return {
    continuar: {
      cursoId: cursoActual.id,
      titulo: cursoActual.titulo,
      clase: { id: actual.claseActual.id, etiqueta: `Clase ${actual.claseActual.codigo}: ${actual.claseActual.titulo}` },
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
    otros: inscripciones.slice(1, 5).map((i) => {
      const curso = cursoPorId(i.cursoId)!;
      return { titulo: curso.titulo, slug: curso.slug, porcentaje: i.porcentaje };
    }),
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

/** Hasta `limite` sugerencias: primero cursos, luego temas. */
export async function buscarSugerencias(texto: string, limite = 3): Promise<Sugerencia[]> {
  const q = normalizarBusqueda(texto.trim());
  if (q.length < 2) return [];
  const cursos = [...catalogoDemo, ...memoria.cursos]
    .filter((c) => normalizarBusqueda(c.titulo).includes(q))
    .map((c): Sugerencia => ({ tipo: 'curso', texto: c.titulo, slug: c.slug }));
  const temas = temasDemo
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
  const usados = new Set([...catalogoDemo, ...memoria.cursos].map((c) => c.slug));
  let slug = base;
  for (let n = 2; usados.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export async function crearCurso(datos: CursoNuevo, creadoPor: number): Promise<CursoPublicado> {
  const id = Math.max(0, ...catalogoDemo.map((c) => c.id), ...memoria.cursos.map((c) => c.id)) + 1;
  const curso: CursoPublicado = { ...datos, id, slug: crearSlug(datos.titulo), creadoPor, creadoEn: new Date() };
  memoria.cursos.push(curso);
  return curso;
}
