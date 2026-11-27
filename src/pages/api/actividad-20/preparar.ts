// POST /api/actividad-20/preparar  { que: 'flujo-a' | 'cursos-b' }  →  { ok, borrados? }   (Act. 20, SOLO DESARROLLO)
//   flujo-a  → reinicia SOLO los intentos, la nota y el certificado del "Curso de prueba SAM"
//   cursos-b → borra los cursos publicados durante las pruebas SAM (marcados pruebaSam)
// Las respuestas SAM no se tocan. En producción responde 404.
import type { APIRoute } from 'astro';
import { borrarCursosDePruebaSam, prepararFlujoSam } from '../../../lib/repositorio';
import { json, leerCuerpo, simulacionDe } from '../../../lib/respuestas';

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!import.meta.env.DEV) return json({ error: 'no-encontrado' }, 404);
  if (!locals.usuario) return json({ error: 'sin-sesion', mensaje: 'Inicia sesión otra vez.' }, 401);
  const que = (await leerCuerpo(request))?.que;
  if (simulacionDe(url)) return json({ ok: true, borrados: 0 });
  if (que === 'flujo-a') {
    await prepararFlujoSam();
    return json({ ok: true });
  }
  if (que === 'cursos-b') return json({ ok: true, borrados: await borrarCursosDePruebaSam() });
  return json({ error: 'validacion', mensaje: 'No sabemos qué preparar.' }, 422);
};
