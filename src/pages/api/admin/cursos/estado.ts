// POST /api/admin/cursos/estado  { id, accion: 'deshabilitar' | 'habilitar' | 'eliminar', confirmacion? }   (solo rol admin)
//   200 { ok, curso }        (curso: null si se eliminó)
//   404 no existe
//   409 { error: 'tiene-inscritos' }  → CLAUDE.md §5.3: con inscritos no se elimina, solo se deshabilita
//   422 eliminar sin escribir "ELIMINAR"
// Con ?simular=… (desarrollo) responde igual pero no cambia nada.
import type { APIRoute } from 'astro';
import { cambiarEstadoCurso } from '../../../../lib/repositorio';
import { json, leerCuerpo, simulacionDe, texto } from '../../../../lib/respuestas';
import { soloAdmin } from '../_admin';

const ACCIONES = ['deshabilitar', 'habilitar', 'eliminar'] as const;
type Accion = (typeof ACCIONES)[number];

export const POST: APIRoute = async ({ request, url, locals }) => {
  const sinPermiso = soloAdmin(locals.usuario);
  if (sinPermiso) return sinPermiso;
  const cuerpo = await leerCuerpo(request);
  const id = Number(cuerpo?.id);
  const accion = texto(cuerpo?.accion) as Accion;
  if (!Number.isInteger(id) || !ACCIONES.includes(accion)) return json({ error: 'accion', mensaje: 'Acción no válida.' }, 422);
  if (accion === 'eliminar' && texto(cuerpo?.confirmacion).trim() !== 'ELIMINAR') {
    return json({ error: 'validacion', mensaje: 'Escribe ELIMINAR para confirmar.' }, 422);
  }
  const resultado = await cambiarEstadoCurso(id, accion, !simulacionDe(url));
  if (resultado.estado === 'no-encontrado') return json({ error: 'no-encontrado', mensaje: 'Ese curso ya no existe.' }, 404);
  if (resultado.estado === 'tiene-inscritos') {
    return json({ error: 'tiene-inscritos', mensaje: 'Este curso ya tiene inscritos: solo se puede deshabilitar.', inscritos: resultado.inscritos }, 409);
  }
  return json({ ok: true, curso: resultado.curso });
};
