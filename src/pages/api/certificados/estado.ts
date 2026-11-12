// GET /api/certificados/estado?curso=ID  →  { codigo: string | null, nombre }
// La pantalla Resultado lo pide aparte para saber si el certificado ya se emitió y con qué nombre
// se emitiría. Si falla, solo esa parte dice "No se pudo cargar esta parte" (parcial).
import type { APIRoute } from 'astro';
import { certificadosDe } from '../../../lib/repositorio';
import { json, simulacionDe } from '../../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  if (simulacionDe(url) === 'parcial') return json({ error: 'no-disponible' }, 503);
  const cursoId = Number(url.searchParams.get('curso'));
  const cert = (await certificadosDe(usuario.id)).find((c) => c.cursoId === cursoId && c.estado === 'valido');
  return json({ codigo: cert?.codigo ?? null, nombre: usuario.nombre });
};
