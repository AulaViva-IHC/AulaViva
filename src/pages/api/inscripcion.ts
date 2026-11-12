// Inscripción del estudiante en un curso (02-detalle).
//   GET  /api/inscripcion?curso=slug  →  { inscrito: false } | { inscrito: true, porcentaje, aprobado, continuar: { id, codigo, titulo } }
//   POST /api/inscripcion  { curso: slug }  →  201 { ok, destino: "/clase/{id}" }
//   401 sin sesión · 403 cuenta de administrador · 404 curso inexistente.
// Inscribirse dos veces no duplica nada: devuelve la misma inscripción.
// En desarrollo: GET ?simular=parcial responde con fallo (la tarjeta muestra "Reconectar").
import type { APIRoute } from 'astro';
import { avanceEnCurso, cursoPorSlug, inscribir } from '../../lib/repositorio';
import { json, leerCuerpo, simulacionDe, texto } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return json({ error: 'sin-sesion' }, 401);
  if (simulacionDe(url) === 'parcial') return json({ error: 'no-disponible' }, 503);
  const curso = await cursoPorSlug(url.searchParams.get('curso') ?? '');
  if (!curso) return json({ error: 'no-encontrado' }, 404);
  const avance = await avanceEnCurso(usuario.id, curso.id);
  if (!avance) return json({ inscrito: false });
  return json({
    inscrito: true,
    porcentaje: avance.porcentaje,
    aprobado: avance.aprobado,
    continuar: avance.ultimaClase,
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión para inscribirte.' }, 401);
  if (usuario.rol !== 'estudiante') {
    return json({ error: 'rol', mensaje: 'Las cuentas de administrador no se inscriben en cursos.' }, 403);
  }
  const cuerpo = await leerCuerpo(request);
  const curso = await cursoPorSlug(texto(cuerpo?.curso));
  if (!curso) return json({ error: 'no-encontrado', mensaje: 'Este curso ya no está disponible. Elige otro en el catálogo.' }, 404);
  const avance = await inscribir(usuario.id, curso.id);
  if (!avance) return json({ error: 'sin-clases', mensaje: 'Este curso aún no tiene clases publicadas.' }, 409);
  return json({ ok: true, destino: `/clase/${avance.ultimaClase.id}` }, 201);
};
