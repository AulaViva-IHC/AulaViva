// GET /api/cursos/destacado  →  { curso: { slug, titulo, descripcion, qu: { titulo, descripcion } | null } | null }  (público)
// Act. 17: "qu" lleva el título y la descripción en quechua; el navegador elige según el idioma.
// La portada lo pide aparte del catálogo: si falla, solo el bloque del curso destacado
// muestra "No se pudo cargar esta parte" + "Reconectar" (estado parcial).
import type { APIRoute } from 'astro';
import { cursoDestacado } from '../../../lib/repositorio';
import { json, simulacionDe } from '../../../lib/respuestas';

export const GET: APIRoute = async ({ url }) => {
  if (simulacionDe(url) === 'parcial') return json({ error: 'no-disponible' }, 503);
  const curso = await cursoDestacado();
  return json({
    curso: curso && {
      slug: curso.slug,
      titulo: curso.titulo,
      descripcion: curso.descripcion,
      qu: curso.qu && { titulo: curso.qu.titulo, descripcion: curso.qu.descripcion },
    },
  });
};
