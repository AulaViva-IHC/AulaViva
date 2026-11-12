// GET /api/mis-cursos  →  { enCurso: MiCursoJSON[], completados: MiCursoJSON[] }   401 sin sesión.
// En desarrollo: ?simular=vacio responde sin cursos y ?simular=error con fallo.
import type { APIRoute } from 'astro';
import { misCursos, type MiCurso } from '../../lib/repositorio';
import { CATEGORIAS } from '../../lib/validacion-curso';
import { haceCuanto, json, simulacionDe } from '../../lib/respuestas';

const aJSON = (c: MiCurso) => ({
  slug: c.slug,
  titulo: c.titulo,
  categoria: CATEGORIAS.find((x) => x.id === c.categoria)?.texto ?? '',
  total: c.total,
  completadas: c.completadas,
  porcentaje: c.porcentaje,
  nota: c.nota,
  color: c.color,
  icono: c.icono,
  ultimaClase: c.ultimaClase,
  hace: haceCuanto(c.ultimoAcceso),
  // A dónde lleva el botón: repasar, rendir la evaluación (al 100 %) o la última clase vista.
  accion: c.aprobado
    ? { texto: 'Repasar', href: `/clase/${c.ultimaClase.id}` }
    : c.completadas >= c.total
      ? { texto: 'Rendir evaluación', href: `/evaluacion/${c.cursoId}` }
      : { texto: 'Continuar', href: `/clase/${c.ultimaClase.id}` },
});

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  if (simular === 'vacio') return json({ enCurso: [], completados: [] });
  const { enCurso, completados } = await misCursos(usuario.id);
  return json({ enCurso: enCurso.map(aJSON), completados: completados.map(aJSON) });
};
