// Act. 20 · Respuestas de la escala SAM (en memoria en repositorio.ts: no se pierden al cambiar de cuenta).
// GET  /api/actividad-20/respuestas  →  { respuestas: [...] }   (?simular=vacio | error en desarrollo)
// POST /api/actividad-20/respuestas  { participante, flujo, valencia, activacion, control, pasoDificil,
//                                       comentario?, duracionSeg, aprobado? }  →  201 { ok, id }
//   422 { error: 'validacion', mensaje } si falta o sobra algo. Con cualquier sesión (estudiante o admin).
import type { APIRoute } from 'astro';
import { guardarRespuestaSam, listarRespuestasSam } from '../../../lib/repositorio';
import { json, leerCuerpo, simulacionDe, texto } from '../../../lib/respuestas';
import {
  DIMENSIONES,
  LIMITE_COMENTARIO,
  esFlujo,
  esPasoDe,
  esPosicion,
  normalizarParticipante,
  validarParticipante,
} from '../../../lib/sam';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.usuario) return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  const respuestas = simular === 'vacio' ? [] : await listarRespuestasSam();
  return json({ respuestas: respuestas.map((r) => ({ ...r, fecha: r.fecha.toISOString() })) });
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!locals.usuario) {
    return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión otra vez y guarda la respuesta.' }, 401);
  }
  const c = await leerCuerpo(request);
  if (!c) return json({ error: 'validacion', mensaje: 'La solicitud no es válida.' }, 400);

  const participante = normalizarParticipante(texto(c.participante));
  const errorParticipante = validarParticipante(participante);
  if (errorParticipante) return json({ error: 'validacion', mensaje: errorParticipante }, 422);
  if (!esFlujo(c.flujo)) return json({ error: 'validacion', mensaje: 'Falta el flujo (A o B).' }, 422);
  for (const d of DIMENSIONES) {
    if (!esPosicion(c[d])) return json({ error: 'validacion', campo: d, mensaje: 'Elige una de las 9 posiciones en cada fila.' }, 422);
  }
  if (!esPasoDe(c.flujo, c.pasoDificil)) {
    return json({ error: 'validacion', campo: 'paso', mensaje: 'Elige el paso que más te costó.' }, 422);
  }
  const duracion = Number(c.duracionSeg);
  if (!Number.isFinite(duracion) || duracion < 0) return json({ error: 'validacion', mensaje: 'Falta la duración del flujo.' }, 422);

  // Solo desarrollo (/estados): responde ok sin guardar.
  if (simulacionDe(url)) return json({ ok: true, id: 0 }, 201);

  const r = await guardarRespuestaSam({
    participante,
    flujo: c.flujo,
    valencia: c.valencia as number,
    activacion: c.activacion as number,
    control: c.control as number,
    pasoDificil: c.pasoDificil,
    comentario: texto(c.comentario).trim().slice(0, LIMITE_COMENTARIO),
    duracionSeg: Math.min(Math.round(duracion), 24 * 3600),
    aprobado: c.flujo === 'A' && typeof c.aprobado === 'boolean' ? c.aprobado : null,
  });
  return json({ ok: true, id: r.id }, 201);
};
