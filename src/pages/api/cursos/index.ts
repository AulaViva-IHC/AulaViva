// GET /api/cursos  →  { cursos: CursoResumen[] }  (público)
// Lo pide el catálogo ("/" y "/catalogo") desde el navegador; los filtros de categoría,
// nivel y búsqueda se aplican allí sobre esta lista (son pocos cursos).
// En desarrollo: ?simular=error responde con fallo (estado de error con "Reintentar").
import type { APIRoute } from 'astro';
import { listarCursos } from '../../../lib/repositorio';
import { json, simulacionDe } from '../../../lib/respuestas';

export const GET: APIRoute = async ({ url }) => {
  if (simulacionDe(url) === 'error') return json({ error: 'no-disponible' }, 503);
  return json({ cursos: await listarCursos() });
};
