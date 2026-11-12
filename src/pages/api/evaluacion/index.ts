// GET /api/evaluacion?curso=ID  →  { estado, resumen, intento }
//   estado "disponible": intento = { id, numero, intentosMax, notaMinima, curso, preguntas } (sin respuestas correctas)
//   otro estado ("bloqueada", "sin-intentos", "aprobada", "no-inscrito", "no-encontrada"): intento = null
// Retoma el intento sin enviar o abre uno nuevo. Las respuestas guardadas se piden aparte
// (/api/evaluacion/respuestas): si fallan, la pantalla queda en estado parcial.
//
// Solo desarrollo (/estados), con ?simular=…:
//   error → fallo · vacio → evaluación bloqueada (17 de 18 clases)
//   ideal / cargando / parcial → si el estudiante de prueba no puede rendir, un intento de
//   demostración (id 0) que NO se guarda: así /estados no cambia su avance real.
import type { APIRoute } from 'astro';
import { abrirIntento, preguntasPublicas } from '../../../lib/repositorio';
import { json, simulacionDe } from '../../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  const cursoId = Number(url.searchParams.get('curso'));
  const { resumen, intento } = await abrirIntento(usuario.id, cursoId);

  if (simular === 'vacio') {
    return json({ estado: 'bloqueada', resumen: { ...resumen, estado: 'bloqueada', completadas: 17, total: 18 }, intento: null });
  }
  if (simular && !intento) {
    const demo = await preguntasPublicas(cursoId);
    if (demo) {
      return json({
        estado: 'disponible',
        resumen: { ...resumen, estado: 'disponible' },
        intento: { id: 0, numero: 1, intentosMax: 3, notaMinima: 14, curso: demo.curso, preguntas: demo.preguntas },
      });
    }
  }
  if (!intento) return json({ estado: resumen.estado, resumen, intento: null });
  const { respuestas: _, ...sinRespuestas } = intento;
  return json({ estado: 'disponible', resumen, intento: sinRespuestas });
};
