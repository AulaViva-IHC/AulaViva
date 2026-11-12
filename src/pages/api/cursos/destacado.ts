// GET /api/cursos/destacado  →  { curso: { slug, titulo, descripcion } | null }  (público)
// La portada lo pide aparte del catálogo: si falla, solo el bloque del curso destacado
// muestra "No se pudo cargar esta parte" + "Reconectar" (estado parcial).
import type { APIRoute } from 'astro';
import { cursoDestacado } from '../../../lib/repositorio';
import { json, simulacionDe } from '../../../lib/respuestas';

export const GET: APIRoute = async ({ url }) => {
  if (simulacionDe(url) === 'parcial') return json({ error: 'no-disponible' }, 503);
  const curso = await cursoDestacado();
  return json({ curso: curso && { slug: curso.slug, titulo: curso.titulo, descripcion: curso.descripcion } });
};
