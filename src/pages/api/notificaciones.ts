// GET  /api/notificaciones  →  { avisos: [{ id, tipo, titulo, texto, enlace, fecha, leido }] }
// POST /api/notificaciones  { accion: "leidas" }  →  { ok }  (marca todos los avisos como leídos)
// Las entregas que vencen se piden aparte a /api/esta-semana: si eso falla, la página queda en parcial.
// En desarrollo: GET ?simular=vacio (sin avisos) y ?simular=error (fallo).
import type { APIRoute } from 'astro';
import { avisosDe, marcarAvisosLeidos } from '../../lib/repositorio';
import { haceCuanto, json, leerCuerpo, simulacionDe } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  if (simular === 'vacio') return json({ avisos: [] });
  const avisos = await avisosDe(usuario.id);
  return json({ avisos: avisos.map((a) => ({ ...a, fecha: haceCuanto(a.fecha) })) });
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión otra vez.' }, 401);
  const cuerpo = await leerCuerpo(request);
  if (cuerpo?.accion !== 'leidas') return json({ error: 'accion', mensaje: 'Acción no válida.' }, 422);
  if (!simulacionDe(url)) await marcarAvisosLeidos(usuario.id); // en /estados no cambia nada
  return json({ ok: true });
};
