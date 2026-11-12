// GET /api/certificado-listo  →  { listo: { curso, slug, nota } | null }   401 sin sesión.
// Aviso de Mis cursos "Ya terminaste… Tu certificado está listo". Se pide aparte:
// si falla, solo ese aviso dice "No se pudo cargar esta parte" + "Reconectar".
import type { APIRoute } from 'astro';
import { certificadoListo } from '../../lib/repositorio';
import { json, simulacionDe } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'parcial') return json({ error: 'no-disponible' }, 503);
  if (simular === 'vacio') return json({ listo: null });
  return json({ listo: await certificadoListo(usuario.id) });
};
