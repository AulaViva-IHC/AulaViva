// GET /api/admin/panel  →  { resumen: { cursos, estudiantes, inscripciones, certificados } }   (solo rol admin)
// Cifras del Panel y de la franja de resumen de Cursos, Usuarios y Certificados.
// En desarrollo: ?simular=vacio (todo en cero) y ?simular=error (fallo).
import type { APIRoute } from 'astro';
import { resumenAdmin } from '../../../lib/repositorio';
import { json, simulacionDe } from '../../../lib/respuestas';
import { soloAdmin } from './_admin';

export const GET: APIRoute = async ({ url, locals }) => {
  const sinPermiso = soloAdmin(locals.usuario);
  if (sinPermiso) return sinPermiso;
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  if (simular === 'vacio') {
    return json({
      resumen: {
        cursos: { publicados: 0, programados: 0, deshabilitados: 0 },
        estudiantes: 0,
        inscripciones: 0,
        certificados: { validos: 0, anulados: 0 },
      },
    });
  }
  return json({ resumen: await resumenAdmin() });
};
