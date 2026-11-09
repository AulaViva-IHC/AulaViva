// GET /api/inicio  →  { continuar, certificado, otros }  (ver ResumenInicio en repositorio.ts)
//   401 sin sesión de estudiante.
// Se pide desde el navegador para que el Inicio tenga estados reales:
// cargando (skeleton), error (Reintentar), vacío (sin cursos) y parcial ("Esta semana" aparte).
// En desarrollo: ?simular=vacio responde sin cursos y ?simular=error responde con fallo.
import type { APIRoute } from 'astro';
import { inicioDeEstudiante } from '../../lib/repositorio';
import { json } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);

  const simular = import.meta.env.DEV ? url.searchParams.get('simular') : null;
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  if (simular === 'vacio') return json({ continuar: null, certificado: null, otros: [] });

  return json(await inicioDeEstudiante(usuario.id));
};
