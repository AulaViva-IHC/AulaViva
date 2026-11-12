// GET /api/evaluacion/respuestas?intento=ID  →  { respuestas: (number|null)[] }
//   Las respuestas ya guardadas del intento (para retomarlo donde quedó).
// PUT /api/evaluacion/respuestas  { intento, pregunta (1–5), opcion (0–3) }  →  { ok }
//   Autoguardado al elegir cada opción ("Guardando…" → "Guardada").
//   401 sin sesión · 404 intento ajeno o inexistente · 409 ya enviado · 422 datos inválidos.
// Solo desarrollo: ?simular=parcial hace fallar el GET; con el intento de demostración (id 0)
// el GET devuelve 2 respondidas (como 07-evaluacion) y el PUT responde ok sin guardar.
import type { APIRoute } from 'astro';
import { guardarRespuesta, respuestasDeIntento } from '../../../lib/repositorio';
import { json, leerCuerpo, simulacionDe } from '../../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'parcial') return json({ error: 'no-disponible' }, 503);
  const intento = Number(url.searchParams.get('intento'));
  if (simular && intento === 0) return json({ respuestas: [0, 1, null, null, null] });
  const respuestas = await respuestasDeIntento(usuario.id, intento);
  if (!respuestas) return json({ error: 'no-encontrado' }, 404);
  return json({ respuestas });
};

const MENSAJES = {
  'no-encontrado': ['No encontramos tu intento. Recarga la página para retomarlo.', 404],
  enviado: ['Esta evaluación ya se envió; ya no se pueden cambiar las respuestas.', 409],
  invalida: ['Esa opción no es válida. Elige una de las opciones A, B, C o D.', 422],
} as const;

export const PUT: APIRoute = async ({ request, url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') {
    return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión otra vez; tus respuestas anteriores están guardadas.' }, 401);
  }
  const cuerpo = await leerCuerpo(request);
  if (simulacionDe(url) && Number(cuerpo?.intento) === 0) return json({ ok: true });
  const r = await guardarRespuesta(usuario.id, Number(cuerpo?.intento), Number(cuerpo?.pregunta), Number(cuerpo?.opcion));
  if (r === 'ok') return json({ ok: true });
  const [mensaje, status] = MENSAJES[r];
  return json({ error: r, mensaje }, status);
};
