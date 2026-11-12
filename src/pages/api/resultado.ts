// GET /api/resultado?curso=ID  →  { resultado: ResultadoEvaluacion | null, estado, curso, primerNombre }
//   resultado null = aún no rinde la evaluación (estado vacío de la pantalla Resultado).
// Solo desarrollo (/estados): ?simular=vacio (sin intentos), ?simular=error (fallo) y, si el
// estudiante de prueba aún no rinde ese curso, un resultado de demostración 16/20 (08-resultado)
// que no se guarda.
import type { APIRoute } from 'astro';
import { estadoEvaluacion, resultadoEvaluacion } from '../../lib/repositorio';
import { json, simulacionDe } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  const cursoId = Number(url.searchParams.get('curso'));
  const estado = await estadoEvaluacion(usuario.id, cursoId);
  if (!estado.curso || estado.estado === 'no-inscrito') return json({ error: 'no-encontrado' }, 404);
  let resultado = simular === 'vacio' ? null : await resultadoEvaluacion(usuario.id, cursoId);
  if (simular && simular !== 'vacio' && !resultado) {
    resultado = {
      curso: estado.curso,
      ultimo: { numero: 1, correctas: 4, total: 5, nota: 16, enviadoEn: new Date() },
      mejorNota: 16,
      aprobado: true,
      notaMinima: 14,
      intentosUsados: 1,
      intentosMax: 3,
      porcentajeContenido: 100,
      certificado: null,
    };
  }
  return json({
    resultado,
    estado: simular === 'vacio' ? 'disponible' : estado.estado,
    curso: estado.curso,
    primerNombre: usuario.nombre.split(' ')[0],
  });
};
