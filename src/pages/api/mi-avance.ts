// GET /api/mi-avance  →  { avance: { slug, porcentaje, aprobado }[] }   401 sin sesión.
// El catálogo con sesión lo pide aparte para marcar "Inscrito · 45 %" en cada tarjeta.
// Si falla, los cursos se siguen viendo (estado parcial con "Reconectar").
import type { APIRoute } from 'astro';
import { avanceDeEstudiante } from '../../lib/repositorio';
import { json, simulacionDe } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return json({ error: 'sin-sesion' }, 401);
  if (simulacionDe(url) === 'parcial') return json({ error: 'no-disponible' }, 503);
  const avance = await avanceDeEstudiante(usuario.id);
  return json({ avance: avance.map((a) => ({ slug: a.slug, porcentaje: a.porcentaje, aprobado: a.aprobado })) });
};
