// GET /api/indice?curso=ID  →  IndiceCurso (módulos, clases completadas, % y si la evaluación está habilitada)
//   401 sin sesión · 404 no inscrito.
// La Clase lo pide aparte: si falla, solo el índice dice "No se pudo cargar esta parte" (parcial).
import type { APIRoute } from 'astro';
import { indiceDelCurso } from '../../lib/repositorio';
import { json, simulacionDe } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  if (simulacionDe(url) === 'parcial') return json({ error: 'no-disponible' }, 503);
  const indice = await indiceDelCurso(usuario.id, Number(url.searchParams.get('curso')));
  if (!indice) return json({ error: 'no-inscrito' }, 404);
  return json(indice);
};
