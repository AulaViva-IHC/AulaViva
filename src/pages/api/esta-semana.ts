// GET /api/esta-semana  →  { tareas: [{ titulo, curso, venceEnDias }] }
// Con sesión de estudiante: sus entregas de los próximos 7 días.
// Sin sesión (panel del login y del registro): un ejemplo.
// Se carga aparte de lo demás: si falla, solo esa parte muestra el error (estado parcial).
// En desarrollo, ?simular=fallo (o parcial) responde con error para ver el estado parcial.
import type { APIRoute } from 'astro';
import { tareasDeLaSemana } from '../../lib/repositorio';
import { json } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const simular = url.searchParams.get('simular');
  if (import.meta.env.DEV && (simular === 'fallo' || simular === 'parcial')) {
    return json({ error: 'no-disponible' }, 503);
  }
  const usuario = locals.usuario;
  const tareas = await tareasDeLaSemana(usuario?.rol === 'estudiante' ? usuario.id : null);
  return json({ tareas });
};
