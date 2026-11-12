// GET /api/certificados/{codigo}/pdf  →  PDF A4 horizontal del certificado (pdf-lib + QR de qrcode).
// Solo para su dueño (con sesión). Cualquiera puede verificarlo con el código en /verificar.
import type { APIRoute } from 'astro';
import { certificadoPorCodigo } from '../../../../lib/repositorio';
import { pdfCertificado } from '../../../../lib/certificados';
import { normalizarCodigo } from '../../../../lib/codigo';
import { json } from '../../../../lib/respuestas';

export const GET: APIRoute = async ({ params, url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return json({ error: 'sin-sesion', mensaje: 'Inicia sesión para descargar tu certificado.' }, 401);
  const cert = await certificadoPorCodigo(normalizarCodigo(params.codigo ?? ''));
  if (!cert || cert.usuarioId !== usuario.id) {
    return json({ error: 'no-encontrado', mensaje: 'No encontramos ese certificado entre los tuyos.' }, 404);
  }
  const bytes = await pdfCertificado(cert, url.origin);
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificado-aulaviva-${cert.codigo}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
