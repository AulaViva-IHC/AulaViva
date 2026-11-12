// POST /api/progreso  { clase: id }  →  { ok, indice, siguiente, evaluacion }
// "Marcar como completada" de la Clase. Marcar dos veces no duplica nada.
//   401 sin sesión · 404 clase inexistente o no inscrito.
import type { APIRoute } from 'astro';
import { marcarCompletada } from '../../lib/repositorio';
import { json, leerCuerpo } from '../../lib/respuestas';

export const POST: APIRoute = async ({ request, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') {
    return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Vuelve a iniciar sesión; tu avance anterior está guardado.' }, 401);
  }
  const cuerpo = await leerCuerpo(request);
  const resultado = await marcarCompletada(usuario.id, Number(cuerpo?.clase));
  if (resultado.estado !== 'ok') {
    return json({ error: resultado.estado, mensaje: 'No encontramos esta clase en tus cursos. Vuelve a Mis cursos.' }, 404);
  }
  return json({
    ok: true,
    indice: resultado.indice,
    siguiente: resultado.siguiente,
    evaluacion: resultado.indice.evaluacion.habilitada ? `/evaluacion/${resultado.cursoId}` : null,
  });
};
