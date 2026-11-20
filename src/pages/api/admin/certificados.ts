// GET  /api/admin/certificados[?limite=5]  →  { certificados: [...], motivos: [...] }      (solo rol admin)
// POST /api/admin/certificados  { codigo, motivo, confirmacion }  →  anula (admin-06 a admin-10)
//   200 { ok, certificado }
//   404 no existe · 409 ya estaba anulado
//   422 { error: 'validacion', errores: { motivo?, confirmacion? } }  (confirmacion debe ser igual al código)
// Queda registrado quién, cuándo y por qué. La verificación pública pasa a decir "Anulado".
// En desarrollo: GET ?simular=vacio | error; con ?simular=… el POST responde igual pero no cambia nada.
import type { APIRoute } from 'astro';
import { anularCertificado, listarCertificadosAdmin, MOTIVOS_ANULACION, type CertificadoAdmin } from '../../../lib/repositorio';
import { formatearFecha } from '../../../i18n';
import { json, leerCuerpo, simulacionDe, texto } from '../../../lib/respuestas';
import { soloAdmin } from './_admin';

function aJson(c: CertificadoAdmin) {
  return {
    ...c,
    emitidoEn: c.emitidoEn.toISOString(),
    emitido: formatearFecha(c.emitidoEn),
    anuladoEn: c.anuladoEn?.toISOString() ?? null,
    anulado: c.anuladoEn ? formatearFecha(c.anuladoEn) : null,
  };
}

export const GET: APIRoute = async ({ url, locals }) => {
  const sinPermiso = soloAdmin(locals.usuario);
  if (sinPermiso) return sinPermiso;
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  const limite = Number(url.searchParams.get('limite')) || 0;
  const todos = simular === 'vacio' ? [] : await listarCertificadosAdmin();
  return json({ certificados: (limite > 0 ? todos.slice(0, limite) : todos).map(aJson), motivos: MOTIVOS_ANULACION });
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  const sinPermiso = soloAdmin(locals.usuario);
  if (sinPermiso) return sinPermiso;
  const cuerpo = await leerCuerpo(request);
  const codigo = texto(cuerpo?.codigo).trim().toUpperCase();
  const motivo = texto(cuerpo?.motivo).trim();
  const confirmacion = texto(cuerpo?.confirmacion).trim().toUpperCase();

  const errores: Record<string, string> = {};
  if (!(MOTIVOS_ANULACION as readonly string[]).includes(motivo)) errores.motivo = 'Elige el motivo de la anulación.';
  if (!codigo || confirmacion !== codigo) errores.confirmacion = 'El código escrito no coincide.';
  if (Object.keys(errores).length) return json({ error: 'validacion', errores }, 422);

  const guardar = !simulacionDe(url); // en /estados no cambia nada
  const resultado = await anularCertificado(codigo, motivo, locals.usuario!.id, guardar);
  if (resultado.estado === 'no-encontrado') return json({ error: 'no-encontrado', mensaje: 'Ese certificado ya no existe.' }, 404);
  if (resultado.estado === 'ya-anulado') {
    return json({ error: 'ya-anulado', mensaje: 'Ese certificado ya estaba anulado.', certificado: aJson(resultado.certificado) }, 409);
  }
  return json({ ok: true, certificado: aJson(resultado.certificado) });
};
