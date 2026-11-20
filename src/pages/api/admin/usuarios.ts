// GET /api/admin/usuarios  →  { usuarios: [{ id, nombre, correo, registrado, cursos, aprobados, certificados, ultimoAcceso }] }
// Solo rol admin. Nunca devuelve contraseñas. En desarrollo: ?simular=vacio | error.
import type { APIRoute } from 'astro';
import { listarEstudiantesAdmin } from '../../../lib/repositorio';
import { formatearFecha } from '../../../i18n';
import { haceCuanto, json, simulacionDe } from '../../../lib/respuestas';
import { soloAdmin } from './_admin';

export const GET: APIRoute = async ({ url, locals }) => {
  const sinPermiso = soloAdmin(locals.usuario);
  if (sinPermiso) return sinPermiso;
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  if (simular === 'vacio') return json({ usuarios: [] });
  const usuarios = await listarEstudiantesAdmin();
  return json({
    usuarios: usuarios.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      correo: u.correo,
      registrado: formatearFecha(u.registradoEn),
      cursos: u.cursos,
      aprobados: u.aprobados,
      certificados: u.certificados,
      ultimoAcceso: u.ultimoAcceso ? haceCuanto(u.ultimoAcceso) : null,
    })),
  });
};
