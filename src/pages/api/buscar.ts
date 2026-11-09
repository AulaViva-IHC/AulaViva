// GET /api/buscar?q=texto  →  { sugerencias: [{ tipo: 'curso' | 'tema', texto, slug? }] }
// Máximo 3 sugerencias (Ley de Hick). El catálogo es público, no exige sesión.
import type { APIRoute } from 'astro';
import { buscarSugerencias } from '../../lib/repositorio';
import { json } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  return json({ sugerencias: await buscarSugerencias(q, 3) });
};
