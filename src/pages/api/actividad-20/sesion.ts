// POST /api/actividad-20/sesion  { flujo: 'A' | 'B' }  →  { ok, destino }   (Act. 20, SOLO DESARROLLO)
// Inicia sesión con la cuenta de prueba del flujo (A = estudiante Gonzalo, B = administrador)
// y dice dónde empieza la tarea:
//   A → la última clase del "Curso de prueba SAM" (ya completa: muestra "Ir a la evaluación")
//   B → /admin/cursos/nuevo
//   409 { error: 'no-preparado' } si el flujo A ya tiene intentos o certificado (falta "Preparar flujo A").
// En producción responde 404: nadie puede cambiar de cuenta sin contraseña.
import type { APIRoute } from 'astro';
import { buscarUsuarioPorId, claseInicioSam, estadoPruebasSam } from '../../../lib/repositorio';
import { cerrarSesion, iniciarSesion } from '../../../lib/sesiones';
import { json, leerCuerpo } from '../../../lib/respuestas';
import { esFlujo } from '../../../lib/sam';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!import.meta.env.DEV) return json({ error: 'no-encontrado' }, 404);
  if (!locals.usuario) return json({ error: 'sin-sesion', mensaje: 'Inicia sesión para empezar la prueba.' }, 401);
  const cuerpo = await leerCuerpo(request);
  const flujo = cuerpo?.flujo;
  if (!esFlujo(flujo)) return json({ error: 'validacion', mensaje: 'Elige el flujo A o el flujo B.' }, 422);

  if (flujo === 'A' && !(await estadoPruebasSam()).flujoA.listo) {
    return json(
      { error: 'no-preparado', mensaje: 'El flujo A ya se usó. Pulsa «Preparar flujo A para un nuevo participante» y vuelve a empezar.' },
      409,
    );
  }

  const usuario = await buscarUsuarioPorId(flujo === 'A' ? 1 : 2);
  if (!usuario) return json({ error: 'no-disponible', mensaje: 'No encontramos la cuenta de prueba.' }, 503);
  if (locals.usuario.id !== usuario.id) {
    await cerrarSesion(cookies);
    await iniciarSesion(cookies, usuario);
  }
  return json({ ok: true, destino: flujo === 'A' ? `/clase/${claseInicioSam()}` : '/admin/cursos/nuevo' });
};
