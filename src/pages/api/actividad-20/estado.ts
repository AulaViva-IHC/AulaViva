// GET /api/actividad-20/estado  →  { flujoA, cursosDePrueba, respuestas, siguienteParticipante }   (Act. 20)
// Estado de los datos de prueba (si el flujo A está listo para otro participante, cuántos cursos de
// prueba hay) y el código sugerido para el siguiente participante. Se pide aparte: si falla, la
// página muestra el estado parcial con "Reconectar". ?simular=parcial | error lo hace fallar (desarrollo).
import type { APIRoute } from 'astro';
import { estadoPruebasSam } from '../../../lib/repositorio';
import { json, simulacionDe } from '../../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.usuario) return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'parcial' || simular === 'error') return json({ error: 'no-disponible' }, 503);
  return json({ ...(await estadoPruebasSam()), desarrollo: import.meta.env.DEV });
};
