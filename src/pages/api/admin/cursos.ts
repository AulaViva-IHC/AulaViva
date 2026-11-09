// POST /api/admin/cursos  { curso: CursoBorrador }  →  JSON   (solo rol admin)
//   201 { ok, id, slug, titulo }
//   401 / 403 sin sesión o sin rol admin
//   422 { error: 'validacion', errores: { ruta: mensaje } }
// Vuelve a validar TODO con las mismas reglas del navegador (src/lib/validacion-curso.ts).
import type { APIRoute } from 'astro';
import { crearCurso, listarInstructores, type CursoNuevo } from '../../../lib/repositorio';
import {
  LIMITES,
  hoyEnLima,
  todosLosErrores,
  type CursoBorrador,
  type ModuloBorrador,
  type PreguntaBorrador,
} from '../../../lib/validacion-curso';
import { json, leerCuerpo } from '../../../lib/respuestas';

const txt = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const archivo = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max + 1) : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Convierte lo recibido en un borrador con tipos seguros (todo lo desconocido se descarta). */
function leerBorrador(entrada: unknown): CursoBorrador {
  const c = obj(entrada);
  const ev = obj(c.evaluacion);
  return {
    titulo: txt(c.titulo),
    descripcion: txt(c.descripcion),
    categoria: txt(c.categoria) as CursoBorrador['categoria'],
    nivel: txt(c.nivel) as CursoBorrador['nivel'],
    horas: txt(c.horas, 10),
    imagen: archivo(c.imagen),
    modulos: lista(c.modulos, LIMITES.modulos).map((m, i): ModuloBorrador => {
      const mm = obj(m);
      return {
        id: `m${i}`,
        titulo: txt(mm.titulo),
        clases: lista(mm.clases, LIMITES.clases).map((x, j) => {
          const cl = obj(x);
          return {
            id: `c${i}-${j}`,
            titulo: txt(cl.titulo),
            duracionMin: txt(cl.duracionMin, 10),
            video: archivo(cl.video),
            subtitulos: archivo(cl.subtitulos),
            documento: archivo(cl.documento),
          };
        }),
      };
    }),
    evaluacion: {
      notaMinima: txt(ev.notaMinima, 10),
      intentos: txt(ev.intentos, 10),
      tiempoMin: txt(ev.tiempoMin, 10),
      preguntas: lista(ev.preguntas, LIMITES.preguntas).map((p, i): PreguntaBorrador => {
        const pp = obj(p);
        const opciones = Array.isArray(pp.opciones) ? pp.opciones : [];
        return {
          id: `p${i}`,
          enunciado: txt(pp.enunciado),
          opciones: [0, 1, 2, 3].map((k) => txt(opciones[k])) as PreguntaBorrador['opciones'],
          correcta: typeof pp.correcta === 'number' && Number.isInteger(pp.correcta) ? pp.correcta : null,
        };
      }),
    },
    instructor: txt(c.instructor, 200),
    requisitos: txt(c.requisitos, 300),
    fechaPublicacion: txt(c.fechaPublicacion, 10),
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return json({ error: 'sin-sesion' }, 401);
  if (usuario.rol !== 'admin') return json({ error: 'sin-permiso' }, 403);

  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return json({ error: 'validacion', errores: { curso: 'La solicitud no es válida.' } }, 400);

  const b = leerBorrador(cuerpo.curso);
  const errores = todosLosErrores(b, hoyEnLima(), await listarInstructores());
  if (Object.keys(errores).length) return json({ error: 'validacion', errores }, 422);

  const curso: CursoNuevo = {
    titulo: b.titulo.trim(),
    descripcion: b.descripcion.trim(),
    categoria: b.categoria as CursoNuevo['categoria'],
    nivel: b.nivel,
    horas: Number(b.horas),
    imagen: b.imagen,
    modulos: b.modulos.map((m) => ({
      titulo: m.titulo.trim(),
      clases: m.clases.map((x) => ({
        titulo: x.titulo.trim(),
        duracionMin: Number(x.duracionMin),
        video: x.video,
        subtitulos: x.subtitulos,
        documento: x.documento,
      })),
    })),
    evaluacion: {
      notaMinima: Number(b.evaluacion.notaMinima),
      intentos: Number(b.evaluacion.intentos),
      tiempoMin: Number(b.evaluacion.tiempoMin),
      preguntas: b.evaluacion.preguntas.map((p) => ({
        enunciado: p.enunciado.trim(),
        opciones: p.opciones.map((o) => o.trim()),
        correcta: p.correcta!,
      })),
    },
    instructor: b.instructor.trim(),
    requisitos: b.requisitos.trim(),
    fechaPublicacion: b.fechaPublicacion,
  };

  const publicado = await crearCurso(curso, usuario.id);
  return json({ ok: true, id: publicado.id, slug: publicado.slug, titulo: publicado.titulo }, 201);
};
