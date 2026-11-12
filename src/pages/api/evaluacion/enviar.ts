// POST /api/evaluacion/enviar  { intento }  →  { ok, nota, aprobado, destino: "/resultado/{curso}" }
// Envía el intento (las preguntas sin responder cuentan como incorrectas). No se envía dos veces: 409.
// Solo desarrollo: con ?simular y el intento de demostración (id 0) responde ok sin guardar nada.
import type { APIRoute } from 'astro';
import { enviarIntento } from '../../../lib/repositorio';
import { json, leerCuerpo, simulacionDe } from '../../../lib/respuestas';

export const POST: APIRoute = async ({ request, url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') {
    return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión otra vez; tus respuestas están guardadas.' }, 401);
  }
  const cuerpo = await leerCuerpo(request);
  const simular = simulacionDe(url);
  if (simular && Number(cuerpo?.intento) === 0) {
    return json({ ok: true, nota: 16, aprobado: true, destino: `/resultado/${Number(cuerpo?.curso) || 1}?simular=ideal` });
  }
  const r = await enviarIntento(usuario.id, Number(cuerpo?.intento));
  if (r.estado === 'no-encontrado') return json({ error: r.estado, mensaje: 'No encontramos tu intento. Recarga la página.' }, 404);
  if (r.estado !== 'ok') return json({ error: r.estado, mensaje: 'Esta evaluación ya se envió.' }, 409);
  return json({ ok: true, nota: r.nota, aprobado: r.aprobado, destino: `/resultado/${r.cursoId}` });
};
